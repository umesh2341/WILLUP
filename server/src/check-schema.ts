import { config } from "dotenv";
config();
import { prisma } from "./prisma";

async function main() {
  // Check live column type for KnowledgeChunk.embedding
  const cols: any[] = await prisma.$queryRaw`
    SELECT column_name, udt_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'KnowledgeChunk'
    ORDER BY ordinal_position
  `;
  console.log("=== KnowledgeChunk columns (live DB) ===");
  cols.forEach((c) => console.log(JSON.stringify(c)));

  // Check atttypmod to confirm dimension=384
  const dim: any[] = await prisma.$queryRaw`
    SELECT attname, atttypmod 
    FROM pg_attribute 
    WHERE attrelid = '"KnowledgeChunk"'::regclass 
      AND attname = 'embedding'
  `;
  console.log("\n=== pg_attribute for embedding column ===");
  dim.forEach((d) => console.log(JSON.stringify(d)));
  // Note: For pgvector, atttypmod IS the dimension directly (no offset)
  const typmod = dim[0]?.atttypmod;
  console.log(`\natttypmod = ${typmod}  =>  vector dimension = ${typmod} (should be 384)`);

  await prisma.$disconnect();
}

main().catch(console.error);
