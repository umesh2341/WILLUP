import { config } from "dotenv";
config();
import { prisma } from "./prisma";
import { chunkText } from "./rag/ingest";

const SAMPLE_CONTENT = `WILLUP Institution — Certificate Request Policy (Version 2.1)
SECTION 1: ELIGIBILITY
A student may request an official certificate from the institution under the following conditions:
(a) The student is currently enrolled in the current academic semester.
(b) The student is not under any active disciplinary suspension or rustication order.
(c) All outstanding dues (tuition fees, library fines, hostel charges, laboratory breakage fees) are cleared prior to issuance.
(d) The request must be submitted through the official WILLUP Institutional Service Platform (WISP) portal.

SECTION 2: TYPES OF CERTIFICATES
The institution currently issues the following certificate types:
1. Bonafide Certificate — Confirms active enrolment status.
2. Provisional Certificate — Issued after course completion pending final degree award.
3. Migration Certificate — Required for transfer to another institution.
4. Character Certificate — Affirms student conduct during the period of study.
5. Transcript — Official academic record of all semesters.

SECTION 3: APPLICATION PROCEDURE
(a) Students must log in to the WISP portal using their official institutional credentials.
(b) Navigate to "My Services" → "Certificate Requests" → Select the certificate type.
(c) Fill in the online form providing purpose, urgency level, and any additional notes.
(d) Upload any supporting documents if required by the specific certificate type (e.g., offer letter for Bonafide, transfer order for Migration).
(e) The following documents are universally required for all requests:
  - Valid student ID card (photocopy and original for in-person verification)
  - Completed online application form submitted via WISP
  - Applicable processing fee payment receipt
(f) After submission, an acknowledgment reference number will be generated. Retain this for follow-up queries.

SECTION 4: PROCESSING TIMELINE
Standard processing time: 2 working days from the date of verified application submission.
Expedited processing (urgent): 1 working day, applicable for visa applications, job offers, or similar exigent circumstances. An additional fee as per the Fee Schedule applies. Supporting document for urgency must be attached.`;

async function main() {
  const chunks = chunkText(SAMPLE_CONTENT);
  console.log("=== CHUNK BOUNDARY VERIFICATION ===");
  console.log(`Total content length : ${SAMPLE_CONTENT.length} chars`);
  console.log(`CHUNK_CHARS constant : 2000 chars (~500 tokens @ 4 chars/token)`);
  console.log(`OVERLAP_CHARS constant: 300 chars (~75 tokens)`);
  console.log(`Number of chunks     : ${chunks.length}\n`);

  chunks.forEach((chunk, i) => {
    console.log(`--- Chunk ${i + 1} ---`);
    console.log(`  Length : ${chunk.length} chars`);
    console.log(`  Start  : "${chunk.substring(0, 80).replace(/\n/g, "\\n")}..."`);
    console.log(`  End    : "...${chunk.substring(chunk.length - 80).replace(/\n/g, "\\n")}"`);
  });

  // Verify overlap: check that end of chunk N matches start of chunk N+1
  if (chunks.length >= 2) {
    const overlapZone = chunks[0].substring(chunks[0].length - 300);
    const chunk2Start = chunks[1].substring(0, 300);
    const overlaps = chunks[1].startsWith(overlapZone.trim().substring(0, 50));
    console.log(`\nOverlap check (last 50 chars of chunk 1 appear in chunk 2 start): ${overlaps ? "YES ✅" : "NO ❌"}`);
    console.log(`  End of chunk 1: "${overlapZone.substring(overlapZone.length - 60).replace(/\n/g, "\\n")}"`);
    console.log(`  Start of chunk 2: "${chunk2Start.substring(0, 60).replace(/\n/g, "\\n")}"`);
  }

  // Also confirm live DB chunks match
  const dbChunks: any[] = await prisma.$queryRaw`
    SELECT kc.content, length(kc.content) as clen
    FROM "KnowledgeChunk" kc
    JOIN "KnowledgeDocument" kd ON kc."documentId" = kd.id
    WHERE kd.title = 'Certificate Request Policy — WILLUP Institution'
    ORDER BY kc.id
  `;
  console.log(`\n=== LIVE DB Chunk Sizes ===`);
  dbChunks.forEach((c, i) => {
    console.log(`  DB Chunk ${i + 1}: ${c.clen} chars, preview: "${c.content.substring(0, 60).replace(/\n/g, "\\n")}..."`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
