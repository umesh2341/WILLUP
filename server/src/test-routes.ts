import { config } from "dotenv";
config();

process.env.NODE_ENV = 'test';

import app from "./index.js";
import { prisma } from "./prisma";
import { initQueue } from "./queue";
import { assignToStage } from "./workflow/workflowEngine";
import { Domain, Scope, Severity, TicketStatus, ApprovalDecision } from "@prisma/client";

async function runTests() {
  console.log("============================================================");
  console.log("  Testing Tickets Approve/Reject Routes                     ");
  console.log("============================================================\n");

  // 1. Start Server & Queue
  const boss = await initQueue();
  const PORT = 5001;
  const server = app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);
  });

  const testStudentId = "test-student-r";
  const testCaretakerId = "test-caretaker-r";
  const testWardenId = "test-warden-r";
  const testOtherId = "test-other-r";

  try {
    // 2. Setup Data (Clean up stale test data first)
    console.log("-- Setup: Cleaning up stale test data --");
    const testUserIds = [testStudentId, testCaretakerId, testWardenId, testOtherId];
    await prisma.auditLog.deleteMany({ where: { ticket: { studentId: { in: testUserIds } } } });
    await prisma.approval.deleteMany({ where: { ticket: { studentId: { in: testUserIds } } } });
    await prisma.notification.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.ticket.deleteMany({ where: { studentId: { in: testUserIds } } });
    await prisma.roleAssignment.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });

    console.log("-- Setup: Creating users, roles, and stages --");
    await prisma.user.upsert({
      where: { id: testStudentId },
      update: {},
      create: { id: testStudentId, username: "student_r", displayName: "Student R" }
    });

    await prisma.user.upsert({
      where: { id: testCaretakerId },
      update: {},
      create: { id: testCaretakerId, username: "caretaker_r", displayName: "Caretaker R" }
    });

    await prisma.user.upsert({
      where: { id: testWardenId },
      update: {},
      create: { id: testWardenId, username: "warden_r", displayName: "Warden R" }
    });

    await prisma.user.upsert({
      where: { id: testOtherId },
      update: {},
      create: { id: testOtherId, username: "other_r", displayName: "Other R" }
    });

    const cRole = await prisma.role.upsert({
      where: { id: "role-c-r" },
      update: {},
      create: { id: "role-c-r", name: "Caretaker R", domain: Domain.GRIEVANCE, order: 0, escalationMinutes: 10 }
    });

    const wRole = await prisma.role.upsert({
      where: { id: "role-w-r" },
      update: {},
      create: { id: "role-w-r", name: "Warden R", domain: Domain.GRIEVANCE, order: 1, escalationMinutes: 10 }
    });

    // Assign caretaker
    await prisma.roleAssignment.upsert({
      where: { userId_roleId: { userId: testCaretakerId, roleId: cRole.id } },
      update: {},
      create: { userId: testCaretakerId, roleId: cRole.id }
    });

    // Create workflow
    const wfDef = await prisma.workflowDefinition.upsert({
      where: { domain: Domain.GRIEVANCE },
      update: {},
      create: { domain: Domain.GRIEVANCE }
    });

    await prisma.workflowStage.deleteMany({ where: { workflowDefinitionId: wfDef.id } });
    const stages = await prisma.workflowStage.createMany({
      data: [
        { workflowDefinitionId: wfDef.id, roleId: cRole.id, order: 0 },
        { workflowDefinitionId: wfDef.id, roleId: wRole.id, order: 1 }
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
        originalText: "There is an issue to review.",
        originalLang: "English",
        extractedData: {}
      }
    });
    console.log(`Created ticket: ${ticket.id}`);

    // Assign ticket to stage 0 (which starts the escalation timer job)
    console.log("\n-- Action: Routing ticket to Stage 0 (Caretaker) --");
    await assignToStage(ticket.id, 0);

    // Verify escalation job was scheduled in pgboss
    const activeJobsBefore = await prisma.$queryRaw<any[]>`
      SELECT id, name, state FROM pgboss.job 
      WHERE name = 'escalation-check' 
        AND (data->>'ticketId') = ${ticket.id} 
        AND state = 'created'
    `;
    console.log(`Escalation jobs scheduled in pg-boss: ${activeJobsBefore.length}`);

    // 3. Test Unauthorized User (x-test-user-id: test-other-r) -> Expected: 403 Forbidden
    console.log("\n-- Action: POST /approve (As Other User - test-other-r) --");
    const badRes = await fetch(`http://localhost:${PORT}/api/tickets/${ticket.id}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": testOtherId
      },
      body: JSON.stringify({ comment: "Looks ok" })
    });
    console.log(`Status: ${badRes.status} (Expected: 403)`);
    if (badRes.status !== 403) {
      throw new Error(`Expected status 403, got ${badRes.status}`);
    }

    // 4. Test Authorized User (x-test-user-id: test-caretaker-r) -> Expected: 200 Success
    console.log("\n-- Action: POST /approve (As Authorized Caretaker - test-caretaker-r) --");
    const goodRes = await fetch(`http://localhost:${PORT}/api/tickets/${ticket.id}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": testCaretakerId
      },
      body: JSON.stringify({ comment: "Approved by Caretaker!" })
    });
    const goodBody = await goodRes.json();
    console.log(`Status: ${goodRes.status} (Expected: 200)`);
    console.log("Response:", goodBody);
    if (goodRes.status !== 200) {
      throw new Error(`Expected status 200, got ${goodRes.status}`);
    }

    // 5. Verify Database State
    const updatedTicket = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: { currentStage: { include: { role: true } } }
    });

    console.log(`\n-- Verification --`);
    console.log(`Ticket Status: ${updatedTicket?.status} (Expected: IN_WORKFLOW)`);
    console.log(`Advanced to Stage Role: ${updatedTicket?.currentStage?.role.name} (Expected: Warden R)`);

    const approvals = await prisma.approval.findMany({ where: { ticketId: ticket.id } });
    console.log(`Approvals count: ${approvals.length} (Expected: 1)`);
    if (approvals.length > 0) {
      console.log(`Approval Decision: ${approvals[0].decision} (Expected: APPROVED)`);
      console.log(`Snapshot Role: ${approvals[0].roleNameAtApproval} (Expected: Caretaker R)`);
    }

    const auditLogs = await prisma.auditLog.findMany({ where: { ticketId: ticket.id } });
    console.log(`AuditLogs count: ${auditLogs.length} (Expected: 2 -> 1 for ROUTED, 1 for APPROVED)`);
    auditLogs.forEach(l => console.log(` - Actor: ${l.actor}, Action: ${l.action}, Details:`, l.details));

    // Verify escalation job for stage 0 was cancelled, and stage 1 was created
    const testStages = await prisma.workflowStage.findMany({
      where: { workflowDefinitionId: wfDef.id },
      orderBy: { order: "asc" }
    });
    const stage0Id = testStages[0].id;
    const stage1Id = testStages[1].id;

    const activeJobsAfterStage0 = await prisma.$queryRaw<any[]>`
      SELECT id, name, state FROM pgboss.job 
      WHERE name = 'escalation-check' 
        AND (data->>'ticketId') = ${ticket.id} 
        AND (data->>'stageId') = ${stage0Id}
        AND state = 'cancelled'
    `;
    console.log(`Stage 0 job status cancelled: ${activeJobsAfterStage0.length > 0 ? 'YES' : 'NO'} (Expected: YES)`);

    const activeJobsAfterStage1 = await prisma.$queryRaw<any[]>`
      SELECT id, name, state FROM pgboss.job 
      WHERE name = 'escalation-check' 
        AND (data->>'ticketId') = ${ticket.id} 
        AND (data->>'stageId') = ${stage1Id}
        AND state = 'created'
    `;
    console.log(`Stage 1 job status active: ${activeJobsAfterStage1.length > 0 ? 'YES' : 'NO'} (Expected: YES)`);

    // Assign warden for final approval test
    await prisma.roleAssignment.upsert({
      where: { userId_roleId: { userId: testWardenId, roleId: wRole.id } },
      update: {},
      create: { userId: testWardenId, roleId: wRole.id }
    });

    console.log("\n-- Action: POST /approve (As Final Stage Warden - test-warden-r) --");
    const finalRes = await fetch(`http://localhost:${PORT}/api/tickets/${ticket.id}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": testWardenId
      },
      body: JSON.stringify({ comment: "Final approval by Warden!" })
    });
    console.log(`Status: ${finalRes.status} (Expected: 200)`);
    if (finalRes.status !== 200) {
      throw new Error(`Expected status 200, got ${finalRes.status}`);
    }

    const resolvedTicket = await prisma.ticket.findUnique({
      where: { id: ticket.id }
    });
    console.log(`Ticket Status after final approval: ${resolvedTicket?.status} (Expected: RESOLVED)`);

    const studentNotifs = await prisma.notification.findMany({ where: { userId: testStudentId, ticketId: ticket.id } });
    console.log(`Student Notifications count: ${studentNotifs.length} (Expected: 1)`);
    if (studentNotifs.length > 0) {
      console.log(`Student Notification Message: "${studentNotifs[0].message}"`);
    }

    // Clean up
    console.log("\n-- Cleanup --");
    await prisma.auditLog.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.approval.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.notification.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.ticket.delete({ where: { id: ticket.id } });
    await prisma.roleAssignment.deleteMany({ where: { userId: testCaretakerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [testStudentId, testCaretakerId, testWardenId, testOtherId] } }
    });

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    server.close();
    await boss.stop();
    await prisma.$disconnect();
    console.log("\n============================================================");
    console.log("  Test Completed                                            ");
    console.log("============================================================");
  }
}

runTests();
