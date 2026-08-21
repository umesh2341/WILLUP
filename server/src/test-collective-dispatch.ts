import { config } from "dotenv";
config();
process.env.NODE_ENV = "test";

import { prisma } from "./prisma";
import { initQueue, boss } from "./queue";
import { assignToStage } from "./workflow/workflowEngine";
import { processHostelMaintenanceRequest } from "./agents/hostelAgent";
import { startCollectiveDispatchWorker } from "./workflow/collectiveDispatchJob";
import { Domain, Scope, Severity, TicketStatus, GroupStatus } from "@prisma/client";

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Simulated final ticket routing function based on DomainAgentResult
async function routeTicket(studentId: string, text: string) {
  console.log(`\n--- Processing ticket for ${studentId}: "${text}" ---`);
  
  // Mock the LLM to avoid API key issues in test
  let result = {
    scope: "COLLECTIVE" as "PERSONAL" | "COLLECTIVE",
    severity: "LOW" as "LOW" | "MEDIUM" | "CRITICAL",
    extractedData: { issueCategory: "Electrical", room: "Block C Hallway" },
    isDuplicate: false
  };

  if (text.includes("sparks") || text.includes("fire")) {
    result.severity = "CRITICAL";
  }

  // Simulate hostelAgent.ts bypass logic manually here for the mock, 
  // or call the actual bypass logic. Since we modified hostelAgent.ts to do this, 
  // let's mirror it in our mock so the test acts accurately.
  if (result.severity === "CRITICAL") {
    result.scope = "PERSONAL";
  }

  console.log(`Agent Result -> Scope: ${result.scope}, Severity: ${result.severity}`);

  const ticket = await prisma.ticket.create({
    data: {
      studentId,
      domain: Domain.HOSTEL_MAINTENANCE,
      scope: result.scope || Scope.PERSONAL,
      severity: result.severity || Severity.LOW,
      status: TicketStatus.CLASSIFIED,
      originalText: text,
      originalLang: "English",
      extractedData: result.extractedData || {}
    }
  });

  if (result.scope === "COLLECTIVE") {
    const category = result.extractedData?.issueCategory || "General";
    
    // Find or create group
    let group = await prisma.collectiveGroup.findFirst({
      where: {
        domain: Domain.HOSTEL_MAINTENANCE,
        category: category,
        status: GroupStatus.COLLECTING
      }
    });

    if (!group) {
      group = await prisma.collectiveGroup.create({
        data: {
          domain: Domain.HOSTEL_MAINTENANCE,
          category: category,
          windowEndsAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hr future
        }
      });
      console.log(`Created NEW CollectiveGroup ${group.id} for category '${category}'`);
    } else {
      console.log(`Found existing CollectiveGroup ${group.id} for category '${category}'`);
    }

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        collectiveGroupId: group.id,
        status: TicketStatus.QUEUED_COLLECTIVE
      }
    });
    console.log(`Ticket ${ticket.id} queued in collective group.`);
  } else {
    // PERSONAL (or Critical Bypass)
    console.log(`Ticket ${ticket.id} routed as INDIVIDUAL (assignToStage).`);
    await assignToStage(ticket.id, 0);
  }

  return ticket;
}

async function run() {
  await initQueue();
  // We'll start the worker later, or let it run in background.
  // Actually, we'll just run it manually to have deterministic output.
  
  const student1 = "col-student-1";
  const student2 = "col-student-2";
  const student3 = "col-student-3";
  const student4 = "col-student-4";
  
  const students = [student1, student2, student3, student4];
  
  for (const sid of students) {
    await prisma.user.upsert({
      where: { id: sid }, update: {},
      create: { id: sid, username: sid, displayName: `Student ${sid}` }
    });
  }

  // Pre-cleanup
  await prisma.auditLog.deleteMany({ where: { ticket: { studentId: { in: students } } } });
  await prisma.notification.deleteMany({ where: { user: { id: { in: students } } } });
  await prisma.approval.deleteMany({ where: { ticket: { studentId: { in: students } } } });
  await prisma.ticket.deleteMany({ where: { studentId: { in: students } } });
  await prisma.collectiveGroup.deleteMany({ where: { status: { in: [GroupStatus.COLLECTING, GroupStatus.DISPATCHED] } } });

  console.log("=== Part 1: CRITICAL Severity Bypass ===");
  const critTicket = await routeTicket(student1, "My room 101 fan fell on my bed and sparks are flying, it is a severe fire hazard!");
  
  const critCheck = await prisma.ticket.findUnique({ where: { id: critTicket.id } });
  console.log(`\nCRITICAL Ticket Check:`);
  console.log(`- Scope: ${critCheck?.scope} (Expected: PERSONAL)`);
  console.log(`- Status: ${critCheck?.status} (Expected: IN_WORKFLOW)`);
  console.log(`- Collective Group: ${critCheck?.collectiveGroupId ? critCheck.collectiveGroupId : 'null'} (Expected: null)`);

  console.log("\n=== Part 2: Collective Grouping (Non-Critical) ===");
  await routeTicket(student1, "The hallway light in block C is flickering.");
  await routeTicket(student2, "Hallway lights on the 3rd floor of block C are out.");
  await routeTicket(student3, "No light in block C hallway.");

  let groups = await prisma.collectiveGroup.findMany({ include: { tickets: true } });
  console.log(`\nCollective Groups count: ${groups.length}`);
  if (groups.length > 0) {
    console.log(`Group 0 Ticket Count: ${groups[0].tickets.length} (Expected: 3)`);
    
    // Force window into the past
    console.log(`Forcing windowEndsAt into the past...`);
    await prisma.collectiveGroup.update({
      where: { id: groups[0].id },
      data: { windowEndsAt: new Date(Date.now() - 10000) }
    });
  }

  console.log("\n=== Part 3: Running Collective Dispatch Job ===");
  await startCollectiveDispatchWorker();
  
  // Force an immediate run
  await boss.send('collective-dispatch', {});
  console.log("Triggered immediate dispatch job. Waiting for processing...");
  await delay(10000);

  // Re-fetch groups and tickets
  const afterGroups = await prisma.collectiveGroup.findMany({ include: { tickets: true } });
  if (afterGroups.length > 0) {
    const group = afterGroups[0];
    console.log(`Group Status: ${group.status} (Expected: DISPATCHED)`);
    console.log(`Group Summary:`, group.summary);

    console.log("\nChecking member tickets:");
    let sharedStageId = null;
    let allShareStage = true;
    for (const t of group.tickets) {
      console.log(`  Ticket ${t.id} -> Status: ${t.status}, currentStageId: ${t.currentStageId}`);
      if (!sharedStageId) sharedStageId = t.currentStageId;
      if (t.currentStageId !== sharedStageId) allShareStage = false;
    }
    console.log(`All tickets reference SAME stage progression: ${allShareStage ? 'YES ✅' : 'NO ❌'}`);
  }

  const notifs = await prisma.notification.findMany({ where: { userId: { in: students } } });
  console.log(`\nNotifications generated (${notifs.length}):`);
  for (const n of notifs) {
    console.log(`  To User: ${n.userId}, Message: "${n.message}"`);
  }

  await boss.stop();
  await prisma.$disconnect();
  console.log("\nDone.");
}

run().catch(e => { console.error(e); process.exit(1); });
