import dotenv from "dotenv";
dotenv.config();

import { prisma } from "./prisma";
import { v4 as uuidv4 } from "uuid";

const API_URL = "http://localhost:5000";

function assertDefined(label: string, val: any) {
  if (val === undefined || val === null) {
    console.error(`  ❌ FAIL: ${label} is null/undefined`);
  } else {
    console.log(`  ✅ PASS: ${label} =`, val);
  }
}

async function testE2E() {
  console.log("=== E2E Workflow Test — Prompt 16 Verification ===\n");

  // ── Setup: upsert a deterministic test user ──────────────────────────────
  let user = await prisma.user.findUnique({ where: { username: "student_test_e2e" } });
  if (!user) {
    user = await prisma.user.create({
      data: { id: uuidv4(), username: "student_test_e2e", displayName: "Student Test E2E" }
    });
  }
  console.log("Test user:", user.username, "(id:", user.id + ")");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-test-user-id": user.id   // test bypass — no Supabase JWT needed
  };

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: HOSTEL_MAINTENANCE report → creates Ticket + enters workflow
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── Test 1: POST /api/chat/message (HOSTEL REPORT) ──");
    const chatRes = await fetch(`${API_URL}/api/chat/message`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: "My fan in room 101 is completely broken and making loud noises" })
    });
    if (!chatRes.ok) throw new Error(`Chat API failed [${chatRes.status}]: ${await chatRes.text()}`);
    const chatData = await chatRes.json() as any;

    console.log("  Full response:", JSON.stringify(chatData, null, 2));
    assertDefined("reply", chatData.reply);
    assertDefined("ticket.id", chatData.ticket?.id);
    assertDefined("ticket.domain", chatData.ticket?.domain);
    assertDefined("ticket.status", chatData.ticket?.status);

    const ticketId = chatData.ticket?.id;

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: GET /api/tickets/:id — ticket details + audit log
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n── Test 2: GET /api/tickets/${ticketId} ──`);
    const ticketRes = await fetch(`${API_URL}/api/tickets/${ticketId}`, { headers });
    if (!ticketRes.ok) {
      const text = await ticketRes.text();
      throw new Error(`Tickets API failed [${ticketRes.status}]: ${text}`);
    }
    const ticketData = await ticketRes.json() as any;

    console.log("  Ticket status:", ticketData.ticket?.status);
    console.log("  Current stage:", ticketData.ticket?.currentStage?.role?.name ?? "none (no workflow configured)");
    console.log("  Audit logs count:", ticketData.ticket?.auditLogs?.length ?? 0);
    assertDefined("ticket.domain", ticketData.ticket?.domain);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: GET /api/tickets?filter=mine — student's own tickets
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── Test 3: GET /api/tickets?filter=mine ──");
    const mineRes = await fetch(`${API_URL}/api/tickets?filter=mine`, { headers });
    if (!mineRes.ok) throw new Error(`Mine API failed [${mineRes.status}]: ${await mineRes.text()}`);
    const mineData = await mineRes.json() as any;
    console.log("  Ticket count for student:", mineData.tickets?.length);
    assertDefined("tickets array", mineData.tickets);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Duplicate detection
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── Test 4: Duplicate detection ──");
    const dupRes = await fetch(`${API_URL}/api/chat/message`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: "Fan in room 101 is broken" })
    });
    const dupData = await dupRes.json() as any;
    console.log("  Full duplicate response:", JSON.stringify(dupData));
    const isDupDetected = dupData.reply?.includes("duplicate") || dupData.ticket === undefined;
    console.log(isDupDetected ? "  ✅ Duplicate correctly intercepted" : "  ❌ Duplicate NOT intercepted — new ticket created");

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: RAG / QUESTION routing
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── Test 5: RAG routing (QUESTION intent) ──");
    const ragRes = await fetch(`${API_URL}/api/chat/message`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: "What is the policy for hostel room allocation?" })
    });
    const ragData = await ragRes.json() as any;
    console.log("  Full RAG response:", JSON.stringify(ragData));
    const isRAGRoute = ragData.isQuestion === true;
    console.log(isRAGRoute ? "  ✅ Correctly routed to RAG (isQuestion=true)" : "  ⚠️  Not routed to RAG (may be UNCLEAR or REPORT intent)");

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Admin routes — GET /api/admin/roles
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── Test 6: GET /api/admin/roles (admin auth required) ──");
    const adminRes = await fetch(`${API_URL}/api/admin/roles`, { headers });
    console.log("  Admin roles response status:", adminRes.status);
    if (adminRes.status === 403) {
      console.log("  ✅ Admin gate correctly blocked student user (403 Forbidden)");
    } else if (adminRes.ok) {
      const adminData = await adminRes.json() as any;
      console.log("  ⚠️  Admin allowed — test user has admin role. Roles count:", adminData.roles?.length);
    } else {
      console.log("  Response:", await adminRes.text());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 7: Knowledge list
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n── Test 7: GET /api/knowledge ──");
    const kbRes = await fetch(`${API_URL}/api/knowledge`, { headers });
    if (kbRes.ok) {
      const kbData = await kbRes.json() as any;
      console.log("  ✅ Knowledge docs count:", kbData.documents?.length);
    } else {
      console.log("  ❌ Failed:", kbRes.status, await kbRes.text());
    }

    console.log("\n=== All E2E Tests Completed ===");

  } catch (err: any) {
    if (err?.cause?.code === "ECONNREFUSED") {
      console.error("❌ Server not running at", API_URL, "— start it with: npx tsx src/index.ts");
    } else {
      console.error("❌ Test failed:", err);
    }
  } finally {
    await prisma.$disconnect();
  }
}

testE2E();
