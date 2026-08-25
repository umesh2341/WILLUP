import { pipeline, env } from "@huggingface/transformers";
import { prisma } from "../prisma";
import { Domain } from "@prisma/client";

// Disable local model cache downloading to a temp dir? No, default is fine.
// We just need to load the model.

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIM = 384; // all-MiniLM-L6-v2 output dimension

const CHUNK_CHARS = 2000;
const OVERLAP_CHARS = 300;

export interface IngestInput {
  title: string;
  domain?: Domain;
  sourceUrl?: string;
  content: string;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
  embeddingDimension: number;
}

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_CHARS, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = end - OVERLAP_CHARS;
  }
  return chunks.filter((c) => c.length > 0);
}

// Singleton for the feature extraction pipeline
let extractor: any = null;

export async function embedText(text: string): Promise<number[]> {
  if (!extractor) {
    console.log(`[ingest] Loading local embedding model: ${EMBEDDING_MODEL}...`);
    extractor = await pipeline("feature-extraction", EMBEDDING_MODEL, {
      // Use ONNX Runtime for faster CPU execution if available, but pure JS fallback works
    });
  }

  // Generate embedding
  const output = await extractor(text, { pooling: "mean", normalize: true });
  
  // output is a Tensor, output.data is a Float32Array
  const embedding = Array.from(output.data) as number[];

  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(`[ingest] Expected dim ${EMBEDDING_DIM}, got ${embedding.length}`);
  }
  return embedding;
}

export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  console.log(`[ingest] Starting ingestion: "${input.title}" (${input.content.length} chars)`);

  const doc = await prisma.knowledgeDocument.create({
    data: {
      title: input.title,
      domain: input.domain ?? null,
      sourceUrl: input.sourceUrl ?? null,
      content: input.content,
    },
  });

  const chunks = chunkText(input.content);
  console.log(`[ingest] Split into ${chunks.length} chunks`);

  let confirmedDimension = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkContent = chunks[i];
    console.log(`[ingest] Embedding chunk ${i + 1}/${chunks.length}...`);
    
    const embedding = await embedText(chunkContent);
    confirmedDimension = embedding.length;

    const vectorLiteral = `[${embedding.join(",")}]`;
    await prisma.$executeRaw`
      INSERT INTO "KnowledgeChunk" (id, "documentId", content, embedding)
      VALUES (gen_random_uuid(), ${doc.id}::uuid, ${chunkContent}, ${vectorLiteral}::vector)
    `;
  }

  console.log(`[ingest] Done. ${chunks.length} chunks written. Dimension: ${confirmedDimension}`);

  return {
    documentId: doc.id,
    chunkCount: chunks.length,
    embeddingDimension: confirmedDimension,
  };
}
