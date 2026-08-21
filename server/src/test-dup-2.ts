import { config } from "dotenv";
config();
import { prisma } from "./prisma";
import { checkIsDuplicate } from "./agents/duplicateDetector";
import { Domain } from "@prisma/client";

async function run() {
  const s1 = "student-dup-1";
  const s2 = "student-dup-2";

  await prisma.user.upsert({ where: { id: s1 }, update: {}, create: { id: s1, username: s1, displayName: s1 }});
  await prisma.user.upsert({ where: { id: s2 }, update: {}, create: { id: s2, username: s2, displayName: s2 }});

  // Clean up
  await prisma.ticket.deleteMany({ where: { studentId: { in: [s1, s2] } } });

  // Create base ticket for s1
  await prisma.ticket.create({
    data: {
      studentId: s1,
      domain: Domain.HOSTEL_MAINTENANCE,
      scope: "PERSONAL",
      severity: "LOW",
      originalText: "My fan is broken",
      originalLang: "en",
      extractedData: { room: "101", issueCategory: "Electrical" }
    }
  });

  // Check duplicate for s1 (same student, same room/category) -> should be true
  const dupS1 = await checkIsDuplicate(s1, Domain.HOSTEL_MAINTENANCE, { room: "101", issueCategory: "Electrical" });
  console.log(`Same Student Duplicate Check: ${dupS1} (Expected: true)`);

  // Check duplicate for s2 (different student, same room/category) -> should be false
  const dupS2 = await checkIsDuplicate(s2, Domain.HOSTEL_MAINTENANCE, { room: "101", issueCategory: "Electrical" });
  console.log(`Different Student Duplicate Check: ${dupS2} (Expected: false)`);
}

run().catch(console.error);
