import { config } from "dotenv";
config();

import { PrismaClient, Domain, Scope, Severity, TicketStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { assignToStage } from "./workflow/workflowEngine";
import { initQueue } from "./queue";
import { startEscalationWorker } from "./workflow/escalationJob";

async function runTests() {
  console.log("============================================================");
  console.log("  Testing Escalation Job                                    ");
  console.log("============================================================\n");

  const testStudentId = "test-student-esc-123";

  // 1. Initialize queue and worker
  const boss = await initQueue();
  await startEscalationWorker();

  try {
    console.log("-- Setup: Creating users, roles, and ticket --");
    await prisma.user.upsert({
      where: { id: testStudentId },
      update: {},
      create: { id: testStudentId, username: "escstudent", displayName: "ESC Student" }
    });

    // Create a fast-escalating role (0 minutes = instant)
    const lazyRole = await prisma.role.upsert({
      where: { id: "role-lazy-agent" },
      update: {},
      create: { id: "role-lazy-agent", name: "Lazy Agent", domain: Domain.GRIEVANCE, order: 0, escalationMinutes: 0 }
    });

    const fastRole = await prisma.role.upsert({
      where: { id: "role-fast-agent" },
      update: {},
      create: { id: "role-fast-agent", name: "Fast Agent", domain: Domain.GRIEVANCE, order: 1, escalationMinutes: 5 }
    });

    // Create workflow
    const wfDef = await prisma.workflowDefinition.upsert({
      where: { domain: Domain.GRIEVANCE },
      update: {},
      create: { domain: Domain.GRIEVANCE }
    });

    await prisma.workflowStage.deleteMany({ where: { workflowDefinitionId: wfDef.id } });
    await prisma.workflowStage.createMany({
      data: [
        { workflowDefinitionId: wfDef.id, roleId: lazyRole.id, order: 0 },
        { workflowDefinitionId: wfDef.id, roleId: fastRole.id, order: 1 }
      ]
    });

    // Create a new Ticket
    const ticket = await prisma.ticket.create({
      data: {
        studentId: testStudentId,
        domain: Domain.GRIEVANCE,
        scope: Scope.PERSONAL,
        severity: Severity.LOW,
        status: TicketStatus.CLASSIFIED,
        originalText: "I have a complaint.",
        originalLang: "English",
        extractedData: {
          category: "general"
        }
      }
    });
    console.log(`Created ticket: ${ticket.id}`);

    // 2. Trigger workflow assignment
    console.log(`\n-- Action: assignToStage(ticket, 0) --`);
    await assignToStage(ticket.id, 0);

    // 3. Wait a moment for pg-boss to run the scheduled job
    console.log("Waiting 6 seconds for pg-boss job to fire...");
    await new Promise(resolve => setTimeout(resolve, 6000));

    // 4. Verify
    const updatedTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    console.log(`\nTicket status: ${updatedTicket?.status}`);
    
    // It should have moved to the next stage (order 1), which means currentStageId points to the Fast Agent
    const nextStage = await prisma.workflowStage.findFirst({ where: { roleId: fastRole.id }});
    console.log(`Is ticket at next stage? ${updatedTicket?.currentStageId === nextStage?.id ? 'YES' : 'NO'}`);

    const auditLogs = await prisma.auditLog.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: 'asc' } });
    console.log(`\nAuditLog entries (${auditLogs.length}):`);
    auditLogs.forEach(l => console.log(` - Actor: ${l.actor}, Action: ${l.action}, Details:`, l.details));

    // 5. Cleanup
    await prisma.auditLog.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.notification.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.ticket.delete({ where: { id: ticket.id } });
    await prisma.user.deleteMany({ where: { id: testStudentId } });

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await boss.stop();
    await prisma.$disconnect();
    console.log("\n============================================================");
    console.log("  Test Completed                                            ");
    console.log("============================================================");
  }
}

runTests();
