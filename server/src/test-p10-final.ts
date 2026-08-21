import { config } from "dotenv";
config();
import { prisma } from "./prisma";
import { assignToStage } from "./workflow/workflowEngine";
import { Domain, Scope, Severity, TicketStatus } from "@prisma/client";

import { initQueue, boss } from "./queue";

async function run() {
  await initQueue();
  const domain = Domain.HOSTEL_MAINTENANCE;

  // 1. Query the live DB and print the full seeded chain
  const wfDef = await prisma.workflowDefinition.findUnique({
    where: { domain },
    include: { stages: { orderBy: { order: 'asc' }, include: { role: true } } }
  });

  console.log(`\n=== Workflow Chain for ${domain} ===`);
  if (wfDef) {
    for (const stage of wfDef.stages) {
      console.log(`Order ${stage.order}: ${stage.role.name} (Role ID: ${stage.roleId}) - Escalation: ${stage.role.escalationMinutes} mins`);
    }
  }

  // 2. Run assignToStage on a test ticket
  console.log(`\n=== Running assignToStage ===`);
  const student = await prisma.user.upsert({
    where: { id: "wf-test-student" }, update: {}, create: { id: "wf-test-student", username: "wf-test-student", displayName: "Student" }
  });

  let ticket = await prisma.ticket.create({
    data: {
      studentId: student.id,
      domain,
      scope: Scope.PERSONAL,
      severity: Severity.LOW,
      originalText: "Test Workflow",
      originalLang: "en",
      extractedData: {}
    }
  });

  console.log(`Created test ticket ${ticket.id}`);

  // Assign to stage 0
  await assignToStage(ticket.id, 0);

  // Check state
  ticket = await prisma.ticket.findUnique({ where: { id: ticket.id } }) as any;
  console.log(`\nNew currentStageId: ${ticket.currentStageId}`);

  const notifs = await prisma.notification.findMany({ where: { ticketId: ticket.id } });
  console.log(`\nNotifications created (${notifs.length}):`);
  for (const n of notifs) {
    console.log(`- User: ${n.userId}, Msg: ${n.message}`);
  }

  const audits = await prisma.auditLog.findMany({ where: { ticketId: ticket.id } });
  console.log(`\nAuditLog Entries:`);
  for (const a of audits) {
    console.log(`- Actor: ${a.actor}, Action: ${a.action}, Details: ${JSON.stringify(a.details)}`);
  }
  
  await boss.stop();
  await prisma.$disconnect();
}

run().catch(console.error);
