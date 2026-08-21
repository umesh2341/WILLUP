import { config } from "dotenv";
config(); // Load environment variables from .env

import { processHostelMaintenanceRequest } from "./agents/hostelAgent";
import { processGrievanceRequest } from "./agents/grievanceAgent";
import { prisma } from "./prisma";

async function runTests() {
  console.log("============================================================");
  console.log("  Testing Domain Agents (Hostel & Grievance)                ");
  console.log("============================================================\n");

  try {
    // ---- Test 1: Hostel Maintenance (Personal / Medium) ----
    const hostelInput1 = "My laptop charger is sparking and causing a short circuit in room 402, Block B.";
    console.log(`-- TEST 1: Hostel Maintenance (Personal / Electrical -> MEDIUM expected but actually depends on LLM, rule says electrical=MEDIUM) --`);
    console.log(`Input: "${hostelInput1}"`);
    const hostelResult1 = await processHostelMaintenanceRequest("test-student", hostelInput1);
    console.log("Output:");
    console.dir(hostelResult1, { depth: null, colors: true });
    console.log("");

    // ---- Test 2: Hostel Maintenance (Collective / Critical) ----
    const hostelInput2 = "The main hallway on the 3rd floor of Block A has exposed live wires hanging from the ceiling. It is a major health-safety hazard.";
    console.log(`-- TEST 2: Hostel Maintenance (Collective / Health-Safety -> CRITICAL expected) --`);
    console.log(`Input: "${hostelInput2}"`);
    const hostelResult2 = await processHostelMaintenanceRequest("test-student", hostelInput2);
    console.log("Output:");
    console.dir(hostelResult2, { depth: null, colors: true });
    console.log("");

    // ---- Test 3: Grievance (Critical) ----
    const grievanceInput1 = "I am being subjected to continuous harassment by a senior student in the cafeteria.";
    console.log(`-- TEST 3: Grievance (Harassment -> CRITICAL expected) --`);
    console.log(`Input: "${grievanceInput1}"`);
    const grievanceResult1 = await processGrievanceRequest("test-student", grievanceInput1);
    console.log("Output:");
    console.dir(grievanceResult1, { depth: null, colors: true });
    console.log("");

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await prisma.$disconnect();
    console.log("============================================================");
    console.log("  Tests Completed                                           ");
    console.log("============================================================");
  }
}

runTests();
