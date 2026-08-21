import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { prisma } from "../prisma";
import { embedText } from "./ingest"; // Exact same embedding model/config

const COSINE_DISTANCE_THRESHOLD = 0.6; // If distance >= 0.6, reject as out-of-domain
const TOP_K = 5; // Top chunks to fetch

export interface RetrieveInput {
  question: string;
}

export interface RetrieveOutput {
  answer: string;
  isFallback: boolean;
  scores: Array<{ chunkId: string; distance: number; content: string }>;
}

const RAG_SYSTEM_PROMPT = `You are the strict Policy Answering AI for the WILLUP Institutional Service Platform.
You will be provided with context from official institutional policy documents.

Your strict rules:
1. Answer the user's question ONLY using the provided context.
2. Do NOT use outside knowledge. If the context does not fully answer the question, state that explicitly.
3. You MUST cite the source of your information by including the document title in your response.
4. Keep the answer clear, helpful, and concise.`;

export async function ragRetrieve(input: RetrieveInput): Promise<RetrieveOutput> {
  const { question } = input;
  console.log(`[ragRetrieve] Generating embedding for question: "${question}"`);

  // 1. Embed the incoming question using the EXACT SAME model as ingest.ts
  const questionEmbedding = await embedText(question);
  const vectorLiteral = `[${questionEmbedding.join(",")}]`;

  // 2. Run cosine similarity search using pgvector's <=> operator
  // <=> computes cosine distance. Lower is better (0 = identical, 2 = opposite).
  const rows: any[] = await prisma.$queryRaw`
    SELECT 
      c.id, 
      c.content, 
      d.title as "docTitle", 
      (c.embedding <=> ${vectorLiteral}::vector) as distance
    FROM "KnowledgeChunk" c
    JOIN "KnowledgeDocument" d ON c."documentId" = d.id
    ORDER BY distance ASC
    LIMIT ${TOP_K}
  `;

  const scores = rows.map((r) => ({
    chunkId: r.id,
    distance: r.distance,
    content: r.content.substring(0, 50) + "...",
  }));

  console.log(`[ragRetrieve] Found ${rows.length} candidate chunks`);

  // 3. Apply a similarity-score threshold check IN CODE
  if (rows.length === 0 || rows[0].distance >= COSINE_DISTANCE_THRESHOLD) {
    console.warn(
      `[ragRetrieve] Threshold rejected. Best distance: ${
        rows.length > 0 ? rows[0].distance.toFixed(4) : "N/A"
      } (Threshold: < ${COSINE_DISTANCE_THRESHOLD})`
    );
    return {
      answer: "no verified policy found, this needs human review",
      isFallback: true,
      scores,
    };
  }

  console.log(
    `[ragRetrieve] Passed threshold. Best distance: ${rows[0].distance.toFixed(4)}`
  );

  // 4. Pass chunks to the LLM
  let contextText = "=== OFFICIAL INSTITUTIONAL CONTEXT ===\n";
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // only include chunks that pass a slightly looser threshold to avoid injecting noise
    if (row.distance < COSINE_DISTANCE_THRESHOLD + 0.1) {
      contextText += `\n--- Document: ${row.docTitle} ---\n${row.content}\n`;
    }
  }
  contextText += "\n=======================================\n";

  const prompt = `${contextText}\nUser Question: ${question}\n\nPlease answer the question based ONLY on the context above. Cite the document title.`;

  // Generate answer
  const answer = await generateLLMAnswer(prompt);

  return {
    answer,
    isFallback: false,
    scores,
  };
}

async function generateLLMAnswer(prompt: string): Promise<string> {
  if (process.env.MOCK_LLM === "true") {
    return "Mock RAG Answer: based on the provided context.";
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const openaiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;

  if (geminiKey && geminiKey.trim() !== "" && geminiKey !== "your_gemini_api_key_here") {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const modelName = process.env.GEMINI_MODEL || "gemini-3.6-flash";
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: RAG_SYSTEM_PROMPT,
          temperature: 0.1, // low temp for grounding
        },
      });
      if (response.text) return response.text;
    } catch (err: any) {
      console.warn(`[ragRetrieve] Gemini failed: ${err.message}. Trying fallback...`);
    }
  }

  if (openaiKey && openaiKey.trim() !== "" && openaiKey !== "your_llm_api_key_here") {
    try {
      const openai = new OpenAI({
        apiKey: openaiKey,
        baseURL: process.env.LLM_BASE_URL || undefined,
      });
      const modelName = process.env.LLM_MODEL || "gpt-4o-mini";
      const response = await openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: "system", content: RAG_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      });
      const content = response.choices[0]?.message?.content;
      if (content) return content;
    } catch (err: any) {
      console.warn(`[ragRetrieve] OpenAI failed: ${err.message}.`);
    }
  }

  return "[Fallback] The LLM could not be reached, but context was found:\n" + prompt.substring(0, 300) + "...";
}
