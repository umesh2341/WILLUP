import { v4 as uuidv4 } from "uuid";
import { ingestDocument } from "./src/rag/ingest";
import { prisma } from "./src/prisma";
import { initQueue, boss } from "./src/queue";
import { startEscalationWorker } from "./src/workflow/escalationJob";

const API_URL = "http://localhost:5000";

async function fetchAPI(path: string, method: string, userId: string, body?: any) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": userId
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    let errText = await res.text();
    throw new Error(`API ${method} ${path} failed with ${res.status}: ${errText}`);
  }
  return res.json();
}

async function runSimulation() {
  console.log("=== STARTING END-TO-END SIMULATION ===\n");

  const results: Record<string, "PASS" | "FAIL"> = {};

  // 0. Setup
  await initQueue();
  await startEscalationWorker();

  const studentA = await prisma.user.upsert({ where: { username: "studentA_e2e" }, update: {}, create: { id: uuidv4(), username: "studentA_e2e", displayName: "Student A" } });
  const studentB = await prisma.user.upsert({ where: { username: "studentB_e2e" }, update: {}, create: { id: uuidv4(), username: "studentB_e2e", displayName: "Student B" } });
  const studentC = await prisma.user.upsert({ where: { username: "studentC_e2e" }, update: {}, create: { id: uuidv4(), username: "studentC_e2e", displayName: "Student C" } });
  const studentD = await prisma.user.upsert({ where: { username: "studentD_e2e" }, update: {}, create: { id: uuidv4(), username: "studentD_e2e", displayName: "Student D" } });
  const admin = await prisma.user.upsert({ where: { username: "admin_e2e" }, update: {}, create: { id: uuidv4(), username: "admin_e2e", displayName: "Admin" } });

  // Assign roles to Admin
  const roles = await prisma.role.findMany({ where: { name: { in: ["Caretaker", "Warden", "Superintendent", "System Admin"] } } });
  for (const r of roles) {
    const existing = await prisma.roleAssignment.findFirst({ where: { userId: admin.id, roleId: r.id } });
    if (!existing) await prisma.roleAssignment.create({ data: { id: uuidv4(), userId: admin.id, roleId: r.id } });
  }

  // Clear existing tickets to avoid duplicate detection across runs
  await prisma.auditLog.deleteMany({});
  await prisma.approval.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.roleAssignment.deleteMany({
    where: { user: { username: { in: ["studentA_e2e", "studentB_e2e", "studentC_e2e", "studentD_e2e"] } } }
  });

  // Reset Caretaker escalation timer to isolate scenarios
  await prisma.role.updateMany({
    where: { name: "Caretaker" },
    data: { escalationMinutes: 1 }
  });

  // === Scenario 1: Normal ticket through full approval chain ===
  try {
    console.log("--- Scenario 1: Normal ticket through full approval chain ---");
    console.log("1. Student A submits request...");
    const chatRes1 = await fetchAPI("/api/chat/message", "POST", studentA.id, { message: "My fan in room 205 is broken" });
    const ticketId1 = chatRes1.ticket.id;
    
    let t1 = await prisma.ticket.findUnique({ where: { id: ticketId1 }, include: { currentStage: { include: { role: true } } } });
    console.log(`Created ticket: ${t1!.id} | Domain: ${t1!.domain} | Severity: ${t1!.severity} | Stage: ${t1!.currentStage?.role.name}`);
    if (t1!.currentStage?.role.name !== "Caretaker") throw new Error("Expected Caretaker as first stage");

    console.log("3. Approve as Caretaker...");
    await fetchAPI(`/api/tickets/${ticketId1}/approve`, "POST", admin.id, { comment: "LGTM", stageId: t1!.currentStageId, metadata: {} });
    t1 = await prisma.ticket.findUnique({ where: { id: ticketId1 }, include: { currentStage: { include: { role: true } } } });
    console.log(`Ticket advanced to Stage: ${t1!.currentStage?.role.name}`);
    if (t1!.currentStage?.role.name !== "Warden") throw new Error("Expected Warden as second stage");

    console.log("4. Approve as Warden...");
    await fetchAPI(`/api/tickets/${ticketId1}/approve`, "POST", admin.id, { comment: "LGTM", stageId: t1!.currentStageId, metadata: {} });
    t1 = await prisma.ticket.findUnique({ where: { id: ticketId1 }, include: { currentStage: { include: { role: true } } } });
    console.log(`Ticket advanced to Stage: ${t1!.currentStage?.role.name}`);
    if (t1!.currentStage?.role.name !== "Superintendent") throw new Error("Expected Superintendent as third stage");

    console.log("5. Approve as Superintendent...");
    await fetchAPI(`/api/tickets/${ticketId1}/approve`, "POST", admin.id, { comment: "Resolved", stageId: t1!.currentStageId, metadata: {} });
    t1 = await prisma.ticket.findUnique({ where: { id: ticketId1 } });
    console.log(`Ticket status: ${t1!.status}`);
    if (t1!.status !== "RESOLVED") throw new Error("Expected RESOLVED status");

    console.log("6. Audit Log:");
    const logs = await prisma.auditLog.findMany({ where: { ticketId: ticketId1 }, orderBy: { createdAt: 'asc' } });
    for (const l of logs) console.log(` - ${l.action}: ${JSON.stringify(l.details)}`);
    
    results["Scenario 1"] = "PASS";
  } catch (e: any) {
    console.error("Scenario 1 failed:", e.message);
    results["Scenario 1"] = "FAIL";
  }

  // === Scenario 2: Critical severity bypass + collective grouping avoided ===
  try {
    console.log("\n--- Scenario 2: Critical severity bypass + collective grouping avoided ---");
    console.log("1. Submitting 3 low severity wifi issues...");
    const cr1 = await fetchAPI("/api/chat/message", "POST", studentB.id, { message: "small wifi issue in block B" });
    const cr2 = await fetchAPI("/api/chat/message", "POST", studentC.id, { message: "small wifi issue in block B" });
    const cr3 = await fetchAPI("/api/chat/message", "POST", studentD.id, { message: "small wifi issue in block B" });
    
    if (!cr1.ticket || !cr2.ticket || !cr3.ticket) {
      console.log("Responses:", cr1, cr2, cr3);
      throw new Error("One or more tickets failed to create");
    }

    console.log("2. Forcing collective dispatch...");
    // Let's set the created time back slightly so the collective job picks them up
    await prisma.ticket.updateMany({
      where: { id: { in: [cr1.ticket.id, cr2.ticket.id, cr3.ticket.id] } },
      data: { createdAt: new Date(Date.now() - 30 * 60000) } // 30 mins ago
    });
    
    await fetchAPI("/api/admin/collective/dispatch", "POST", admin.id, {});
    
    const tB = await prisma.ticket.findUnique({ where: { id: cr1.ticket.id } });
    const tC = await prisma.ticket.findUnique({ where: { id: cr2.ticket.id } });
    const tD = await prisma.ticket.findUnique({ where: { id: cr3.ticket.id } });
    console.log(`Ticket B group: ${tB!.collectiveGroupId}, Ticket C group: ${tC!.collectiveGroupId}`);
    if (!tB!.collectiveGroupId || tB!.collectiveGroupId !== tC!.collectiveGroupId || tC!.collectiveGroupId !== tD!.collectiveGroupId) {
       throw new Error("Tickets were not correctly grouped");
    }
    
    console.log("3. Submitting critical fire issue...");
    const crFire = await fetchAPI("/api/chat/message", "POST", studentA.id, { message: "there is a fire in the hostel kitchen" });
    const tFire = await prisma.ticket.findUnique({ where: { id: crFire.ticket.id } });
    console.log(`Fire Ticket: Severity=${tFire!.severity}, GroupID=${tFire!.collectiveGroupId}`);
    if (tFire!.severity !== "CRITICAL") throw new Error("Expected CRITICAL severity");
    if (tFire!.collectiveGroupId !== null) throw new Error("Expected null collectiveGroupId for CRITICAL");

    results["Scenario 2"] = "PASS";
  } catch (e: any) {
    console.error("Scenario 2 failed:", e.message);
    results["Scenario 2"] = "FAIL";
  }

  // === Scenario 3: Escalation when nobody approves ===
  try {
    console.log("\n--- Scenario 3: Escalation when nobody approves ---");
    console.log("1. Setting Caretaker escalation time to 0 and submitting ticket...");
    
    await prisma.role.updateMany({
      where: { name: "Caretaker" },
      data: { escalationMinutes: 0 }
    });

    const crEsc = await fetchAPI("/api/chat/message", "POST", studentA.id, { message: "another fan broken in room 300" });
    const ticketId3 = crEsc.ticket.id;
    let t3 = await prisma.ticket.findUnique({ where: { id: ticketId3 }, include: { currentStage: { include: { role: true } } } });
    console.log(`Created Ticket, Stage: ${t3!.currentStage?.role.name}`);
    
    console.log("2. Waiting 10s for escalation job to process...");
    await new Promise(r => setTimeout(r, 10000));
    
    t3 = await prisma.ticket.findUnique({ where: { id: ticketId3 }, include: { currentStage: { include: { role: true } } } });
    console.log(`Ticket Status: ${t3!.status}, Stage: ${t3!.currentStage?.role.name}`);
    if (t3!.status !== "ESCALATED") {
      console.error(`Scenario 3 failed: Expected status ESCALATED but got ${t3!.status}`);
      results["Scenario 3"] = "FAIL";
    } else {
      results["Scenario 3"] = "PASS";
    }
  } catch (e: any) {
    console.error("Scenario 3 failed:", e.message);
    results["Scenario 3"] = "FAIL";
  }

  // === Scenario 4: Duplicate detection ===
  try {
    console.log("\n--- Scenario 4: Duplicate detection ---");
    console.log("1. Submitting duplicate wifi issue...");
    const crDup = await fetchAPI("/api/chat/message", "POST", studentB.id, { message: "small wifi issue in block B" });
    console.log("Response:", crDup);
    if (!crDup.reply.includes("duplicate")) throw new Error("Expected duplicate response");
    if (crDup.ticket) throw new Error("Expected NO ticket to be created");
    
    results["Scenario 4"] = "PASS";
  } catch (e: any) {
    console.error("Scenario 4 failed:", e.message);
    results["Scenario 4"] = "FAIL";
  }

  // === Scenario 5: RAG "don't fabricate" guardrail ===
  try {
    console.log("\n--- Scenario 5: RAG don't fabricate guardrail ---");
    console.log("0. Ingesting knowledge document about late entry...");
    const existingDoc = await prisma.knowledgeDocument.findFirst({ where: { title: "Hostel Late Entry Rules" } });
    if (!existingDoc) {
      await ingestDocument({
        title: "Hostel Late Entry Rules",
        content: "The rules for late entry are as follows: Students returning after 10 PM must sign the late register. Returning after 12 AM requires a valid permission slip from the HOD."
      });
    }

    console.log("1. Asking covered question...");
    const q1 = await fetchAPI("/api/chat/message", "POST", studentA.id, { message: "What are the rules for late entry?" });
    console.log("Response 1:", q1.reply);
    if (q1.reply.includes("no verified policy found")) throw new Error("Expected grounded answer, got fallback");
    
    console.log("2. Asking completely unrelated question...");
    const q2 = await fetchAPI("/api/chat/message", "POST", studentA.id, { message: "what is the weather tomorrow?" });
    console.log("Response 2:", q2.reply);
    if (!q2.reply.includes("no verified policy found")) throw new Error("Expected fallback for unrelated question");
    if (q2.ticket) throw new Error("Expected NO ticket to be created for a question");

    results["Scenario 5"] = "PASS";
  } catch (e: any) {
    console.error("Scenario 5 failed:", e.message);
    results["Scenario 5"] = "FAIL";
  }

  // === Scenario 6: Admin layer ===
  try {
    console.log("\n--- Scenario 6: Admin layer ---");
    console.log("1. Search user...");
    const searchRes = await fetchAPI(`/api/admin/users/search?q=studentA_e2e`, "GET", admin.id);
    console.log("Search result length:", searchRes.users.length);

    console.log("2. Add role...");
    const wardenRole = roles.find(r => r.name === "Warden")!;
    await fetchAPI(`/api/admin/roles/${wardenRole.id}/members`, "POST", admin.id, { username: "studentC_e2e" });

    console.log("3. Confirm AuditLog...");
    const logs = await prisma.auditLog.findMany({ where: { action: "ADD_ROLE_MEMBER" } });
    console.log("Audit log found:", logs.length > 0);
    if (logs.length === 0) throw new Error("No audit log written for admin action");

    console.log("4. Plain student 403 test...");
    try {
      await fetchAPI(`/api/admin/users/search?q=foo`, "GET", studentA.id);
      throw new Error("Expected 403 error for student on admin route");
    } catch (e: any) {
      console.log("Student caught expected error:", e.message);
      if (!e.message.includes("403")) throw new Error("Expected 403 error for student on admin route");
    }

    results["Scenario 6"] = "PASS";
  } catch (e: any) {
    console.error("Scenario 6 failed:", e.message);
    results["Scenario 6"] = "FAIL";
  }

  console.log("\n=== FINAL RESULTS ===");
  for (const [scenario, result] of Object.entries(results)) {
    console.log(`${scenario}: ${result}`);
  }

  await prisma.$disconnect();
  await boss.stop();
}

runSimulation().catch(e => console.error(e));
