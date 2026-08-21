import { config } from "dotenv";
config();

import { processHostelMaintenanceRequest } from "./agents/hostelAgent";
import { PrismaClient, Domain, Scope, Severity, TicketStatus } from "@prisma/client";
import { prisma } from "./prisma";

async function runTests() {
  console.log("============================================================");
  console.log("  Testing Duplicate Detection (Hostel Agent)                ");
  console.log("============================================================\n");

  const testStudentId = "duplicate-test-student-123";

  try {
    // 1. Setup: Create a dummy user and an existing active ticket
    console.log("-- Setup: Creating existing ticket --");
    await prisma.user.upsert({
      where: { id: testStudentId },
      update: {},
      create: {
        id: testStudentId,
        username: "dupetest",
        displayName: "Duplicate Test User"
      }
    });

    const existingTicket = await prisma.ticket.create({
      data: {
        studentId: testStudentId,
        domain: Domain.HOSTEL_MAINTENANCE,
        scope: Scope.PERSONAL,
        severity: Severity.MEDIUM,
        status: TicketStatus.RECEIVED, // Active
        originalText: "My fan is broken in room 101, block C.",
        originalLang: "English",
        extractedData: {
          room: "101",
          block: "Block C",
          issueCategory: "electrical"
        }
      }
    });
    console.log(`Created ticket ${existingTicket.id} for Room 101, electrical issue.`);

    // 2. Run Agent: Submit near-identical request
    const input = "The ceiling fan in my room 101, Block C is not working. I think it is an electrical issue.";
    console.log(`\n-- Test: Submitting near-identical request --`);
    console.log(`Input: "${input}"`);
    
    const result = await processHostelMaintenanceRequest(testStudentId, input);
    
    console.log("\nOutput:");
    console.dir(result, { depth: null, colors: true });

    if (result.isDuplicate) {
      console.log("\n✅ SUCCESS: Duplicate correctly detected!");
    } else {
      console.log("\n❌ FAIL: Duplicate was NOT detected.");
    }

    // 3. Cleanup
    await prisma.ticket.delete({ where: { id: existingTicket.id } });
    await prisma.user.delete({ where: { id: testStudentId } });

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await prisma.$disconnect();
    console.log("\n============================================================");
    console.log("  Test Completed                                            ");
    console.log("============================================================");
  }
}

runTests();
