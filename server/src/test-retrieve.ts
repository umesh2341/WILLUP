import { config } from "dotenv";
config();

import { ragRetrieve } from "./rag/retrieve";

async function run() {
  console.log("=============================================================");
  console.log("  RAG Retrieval Pipeline Test (§7.2-7.4)                   ");
  console.log("=============================================================\n");

  // Case 1: In-domain question
  console.log("-------------------------------------------------------------");
  console.log("CASE 1: In-domain question (should be answered with citation)");
  console.log("-------------------------------------------------------------");
  const q1 = "What is the procedure for getting a bonafide certificate?";
  console.log(`Question: "${q1}"`);
  
  const res1 = await ragRetrieve({ question: q1 });
  console.log("\n[Result 1]");
  console.log(`Fallback triggered: ${res1.isFallback}`);
  console.log(`Answer:\n${res1.answer}\n`);
  
  console.log("Similarity Scores:");
  res1.scores.forEach((s, i) => {
    console.log(`  #${i + 1} (dist: ${s.distance.toFixed(4)}): ${s.content.replace(/\n/g, " ")}`);
  });

  // Case 2: Out-of-domain question
  console.log("\n-------------------------------------------------------------");
  console.log("CASE 2: Out-of-domain question (should hit threshold rejection)");
  console.log("-------------------------------------------------------------");
  const q2 = "What is the recipe for making a good chocolate cake?";
  console.log(`Question: "${q2}"`);
  
  const res2 = await ragRetrieve({ question: q2 });
  console.log("\n[Result 2]");
  console.log(`Fallback triggered: ${res2.isFallback} (Expected: true)`);
  console.log(`Answer:\n${res2.answer}\n`);
  
  console.log("Similarity Scores:");
  res2.scores.forEach((s, i) => {
    console.log(`  #${i + 1} (dist: ${s.distance.toFixed(4)}): ${s.content.replace(/\n/g, " ")}`);
  });

  console.log("\n=============================================================");
  const passed = 
    !res1.isFallback && 
    res1.answer.toLowerCase().includes("certificate request policy") &&
    res2.isFallback && 
    res2.answer === "no verified policy found, this needs human review";

  console.log(`  RESULT: ${passed ? "PASS ✅" : "FAIL ❌"}`);
  console.log("=============================================================\n");

  process.exit(passed ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
