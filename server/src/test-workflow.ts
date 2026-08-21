import { config } from "dotenv";
config();

import { PrismaClient, Domain, Scope, Severity, TicketStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { assignToStage } from "./workflow/workflowEngine";

async function runTests() {
  console.log("============================================================");
  console.log("  Testing Workflow Engine                                   ");
  console.log("============================================================\n");

  const testStudentId = "test-student-wf-123";
  const testWardenId = "test-warden-wf-123";

  try {
    // 1. Setup Data
    console.log("-- Setup: Creating users and ticket --");
    await prisma.user.upsert({
      where: { id: testStudentId },
      update: {},
      create: { id: testStudentId, username: "wfstudent", displayName: "WF Student" }
    });

    const wardenUser = await prisma.user.upsert({
      where: { id: testWardenId },
      update: {},
      create: { id: testWardenId, username: "wfwarden", displayName: "WF Warden" }
    });

    // Make sure we have a Caretaker role since order 0 is Caretaker
    const caretakerRole = await prisma.role.findFirst({
      where: { name: "Caretaker", domain: Domain.HOSTEL_MAINTENANCE }
    });

    if (!caretakerRole) {
      throw new Error("Caretaker role not found. Did you run the seed script?");
    }

    // Assign wardenUser to Caretaker role (so they get the notification)
    await prisma.roleAssignment.upsert({
      where: { userId_roleId: { userId: testWardenId, roleId: caretakerRole.id } },
      update: {},
      create: { userId: testWardenId, roleId: caretakerRole.id }
    });

    // Create a new Ticket
    const ticket = await prisma.ticket.create({
      data: {
        studentId: testStudentId,
        domain: Domain.HOSTEL_MAINTENANCE,
        scope: Scope.COLLECTIVE,
        severity: Severity.LOW,
        status: TicketStatus.CLASSIFIED,
        originalText: "The fan in the hall is squeaky.",
        originalLang: "English",
        extractedData: {
          block: "Block A",
          issueCategory: "maintenance"
        }
      }
    });
    console.log(`Created ticket: ${ticket.id}`);

    // 2. Call assignToStage
    console.log(`\n-- Action: assignToStage(ticket, 0) --`);
    await assignToStage(ticket.id, 0);

    // 3. Verify
    const updatedTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    console.log(`\nTicket currentStageId: ${updatedTicket?.currentStageId}`);
    
    const notifications = await prisma.notification.findMany({ where: { ticketId: ticket.id } });
    console.log(`\nNotifications created (${notifications.length}):`);
    notifications.forEach(n => console.log(` - To User ${n.userId}: "${n.message}"`));

    const auditLogs = await prisma.auditLog.findMany({ where: { ticketId: ticket.id } });
    console.log(`\nAuditLog entries (${auditLogs.length}):`);
    auditLogs.forEach(l => console.log(` - Actor: ${l.actor}, Action: ${l.action}, Details:`, l.details));

    // 4. Cleanup
    await prisma.auditLog.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.notification.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.ticket.delete({ where: { id: ticket.id } });
    await prisma.roleAssignment.deleteMany({ where: { userId: testWardenId } });
    await prisma.user.deleteMany({ where: { id: { in: [testStudentId, testWardenId] } } });

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
