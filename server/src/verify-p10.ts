import { config } from "dotenv";
config();
process.env.NODE_ENV = "test";

import app from "./index.js";
import { prisma } from "./prisma";
import { initQueue } from "./queue";
import { assignToStage } from "./workflow/workflowEngine";
import { Domain, Scope, Severity, TicketStatus } from "@prisma/client";

// ===================================================================
//  Prompt 10 verifier: DB chain query + assignToStage live run
// ===================================================================

async function run() {
  // --- Part 1: Query the seeded WorkflowDefinition chain for HOSTEL ---
  console.log("=== PROMPT 10.2: Seeded HOSTEL_MAINTENANCE workflow chain ===");
  const wfDef = await prisma.workflowDefinition.findUnique({
    where: { domain: Domain.HOSTEL_MAINTENANCE },
    include: { stages: { include: { role: true }, orderBy: { order: "asc" } } }
  });
  if (!wfDef) { console.log("⚠️  No workflow definition found for HOSTEL_MAINTENANCE"); }
  else {
    console.log(`WorkflowDefinition ID: ${wfDef.id}`);
    for (const s of wfDef.stages) {
      console.log(`  Stage ${s.order}: role="${s.role.name}", escalationMinutes=${s.role.escalationMinutes}, redirectIfSubjectIsRole=${s.redirectIfSubjectIsRole ?? "none"}`);
    }
  }

  // --- Part 2: Live assignToStage run ---
  console.log("\n=== PROMPT 10.3: Live assignToStage run ===");
  const boss = await initQueue();
  const PORT = 5003;
  const server = app.listen(PORT);

  const studentId = "verify-10-student";
  await prisma.user.upsert({
    where: { id: studentId }, update: {},
    create: { id: studentId, username: "verify10stu", displayName: "Verify10 Student" }
  });

  // Assign a role holder to get a notification
  const stage0 = wfDef?.stages.find(s => s.order === 0);
  const notifUserId = "verify-10-notif-user";
  if (stage0) {
    await prisma.user.upsert({
      where: { id: notifUserId }, update: {},
      create: { id: notifUserId, username: "verify10notif", displayName: "Verify10 Notif User" }
    });
    await prisma.roleAssignment.upsert({
      where: { userId_roleId: { userId: notifUserId, roleId: stage0.roleId } }, update: {},
      create: { userId: notifUserId, roleId: stage0.roleId }
    });
  }

  const ticket = await prisma.ticket.create({
    data: {
      studentId,
      domain: Domain.HOSTEL_MAINTENANCE,
      scope: Scope.PERSONAL, severity: Severity.LOW,
      status: TicketStatus.CLASSIFIED,
      originalText: "verification run", originalLang: "English",
      extractedData: {}
    }
  });

  await assignToStage(ticket.id, 0);

  const updated = await prisma.ticket.findUnique({ where: { id: ticket.id } });
  console.log(`ticket.currentStageId: ${updated?.currentStageId}`);
  console.log(`ticket.status: ${updated?.status}`);

  const notifs = await prisma.notification.findMany({ where: { ticketId: ticket.id } });
  console.log(`Notifications (${notifs.length}):`);
  notifs.forEach(n => console.log(`  recipient userId: ${n.userId}  msg: ${n.message.substring(0,60)}...`));

  const auditLogs = await prisma.auditLog.findMany({ where: { ticketId: ticket.id } });
  console.log(`AuditLog entries (${auditLogs.length}):`);
  auditLogs.forEach(l => console.log(`  actor: ${l.actor}  action: ${l.action}  details:`, l.details));

  // Cleanup
  await prisma.auditLog.deleteMany({ where: { ticketId: ticket.id } });
  await prisma.notification.deleteMany({ where: { ticketId: ticket.id } });
  await prisma.ticket.delete({ where: { id: ticket.id } });
  await prisma.roleAssignment.deleteMany({ where: { userId: notifUserId } });
  await prisma.user.deleteMany({ where: { id: { in: [studentId, notifUserId] } } });

  server.close();
  await boss.stop();
  await prisma.$disconnect();
  console.log("\nDone.");
}

run().catch(e => { console.error(e); process.exit(1); });
