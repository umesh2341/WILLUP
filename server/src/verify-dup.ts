import { config } from "dotenv";
config();
import { prisma } from "./prisma";
import { processHostelMaintenanceRequest } from "./agents/hostelAgent";
import { Domain, TicketStatus, Scope, Severity } from "@prisma/client";

async function run() {
  const studentA = "dup-test-student-A";
  const studentB = "dup-test-student-B";

  // Pre-clean
  await prisma.auditLog.deleteMany({ where: { ticket: { studentId: { in: [studentA, studentB] } } } });
  await prisma.ticket.deleteMany({ where: { studentId: { in: [studentA, studentB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [studentA, studentB] } } });

  await prisma.user.create({ data: { id: studentA, username: "dup_stud_a", displayName: "Dup Student A" } });
  await prisma.user.create({ data: { id: studentB, username: "dup_stud_b", displayName: "Dup Student B" } });

  // Seed an existing open ticket for Student A
  await prisma.ticket.create({
    data: {
      studentId: studentA,
      domain: Domain.HOSTEL_MAINTENANCE,
      scope: Scope.COLLECTIVE,
      severity: Severity.MEDIUM,
      status: TicketStatus.IN_WORKFLOW,
      originalText: "The ceiling fan in room 101, Block C is not working.",
      originalLang: "English",
      extractedData: { room: "101", block: "C", issueCategory: "electrical" }
    }
  });

  console.log("=== TEST 1: Same student, same details => expect isDuplicate: true ===");
  const r1 = await processHostelMaintenanceRequest(studentA,
    "The fan in my room 101, Block C has stopped working, it's an electrical issue."
  );
  console.log("isDuplicate:", r1.isDuplicate, "(Expected: true)");
  console.log("extractedData:", r1.extractedData);

  console.log("\n=== TEST 2: Different student, same details => expect isDuplicate: false ===");
  const r2 = await processHostelMaintenanceRequest(studentB,
    "The fan in room 101, Block C has stopped working, it's an electrical issue."
  );
  console.log("isDuplicate:", r2.isDuplicate, "(Expected: false)");
  console.log("extractedData:", r2.extractedData);

  // Cleanup
  await prisma.ticket.deleteMany({ where: { studentId: { in: [studentA, studentB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [studentA, studentB] } } });
  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
