import { config } from "dotenv";
config(); // Load environment variables from .env

import { processLaboratoryRequest } from "./agents/laboratoryAgent";
import { processCertificateRequest } from "./agents/certificateAgent";
import { Domain } from "@prisma/client";
import { prisma } from "./prisma";

async function runTests() {
  console.log("============================================================");
  console.log("  Testing Domain Agents (Laboratory & Certificate)          ");
  console.log("============================================================\n");

  try {
    // ---- Test 1: Laboratory Agent (Success) ----
    const labInput1 = "I need to book the Physics Lab 101 on 2026-10-15 for the 10:00 AM - 12:00 PM slot for my final year project.";
    console.log(`-- TEST 1: Laboratory Booking (No Conflict) --`);
    console.log(`Input: "${labInput1}"`);
    const labResult1 = await processLaboratoryRequest("test-student", labInput1);
    console.log("Output:");
    console.dir(labResult1, { depth: null, colors: true });
    console.log("");

    // ---- Test 2: Laboratory Agent (Conflict Setup + Conflict Check) ----
    console.log(`-- TEST 2: Laboratory Booking (Conflict Check) --`);
    // First, let's create a fake conflicting ticket in the DB
    const conflictingTicket = await prisma.ticket.create({
      data: {
        domain: Domain.LABORATORY,
        scope: "PERSONAL",
        severity: "NA",
        originalText: "dummy",
        originalLang: "English",
        extractedData: {
          labId: "Physics Lab 101",
          date: "2026-10-15",
          timeSlot: "10:00 AM - 12:00 PM",
          purpose: "dummy purpose"
        },
        student: {
          connectOrCreate: {
            where: { id: "test-user-id" },
            create: {
              id: "test-user-id",
              username: "testuser",
              displayName: "Test User"
            }
          }
        }
      }
    });

    const labInput2 = "Book Physics Lab 101 on 2026-10-15 for the 10:00 AM - 12:00 PM slot please.";
    console.log(`Input (Should Conflict): "${labInput2}"`);
    const labResult2 = await processLaboratoryRequest("test-student", labInput2);
    console.log("Output:");
    console.dir(labResult2, { depth: null, colors: true });
    console.log("");

    // Clean up the dummy ticket
    await prisma.ticket.delete({ where: { id: conflictingTicket.id } });


    // ---- Test 3: Certificate Agent (Recognized) ----
    console.log(`-- TEST 3: Certificate Request (Recognized with RAG Stub) --`);
    
    // Create a mock knowledge document for Bonafide Certificate
    const doc = await prisma.knowledgeDocument.create({
      data: {
        title: "Bonafide Certificate Requirements",
        domain: Domain.CERTIFICATE,
        content: "Required Docs: ID Card, Fee Receipt, Application Form"
      }
    });

    const certInput1 = "I want to apply for a Bonafide Certificate.";
    console.log(`Input: "${certInput1}"`);
    const certResult1 = await processCertificateRequest("test-student", certInput1);
    console.log("Output:");
    console.dir(certResult1, { depth: null, colors: true });
    console.log("");

    // Clean up doc
    await prisma.knowledgeDocument.delete({ where: { id: doc.id } });


    // ---- Test 4: Certificate Agent (Unrecognized) ----
    console.log(`-- TEST 4: Certificate Request (Unrecognized) --`);
    const certInput2 = "I need a Super Secret Alien Passport.";
    console.log(`Input: "${certInput2}"`);
    const certResult2 = await processCertificateRequest("test-student", certInput2);
    console.log("Output:");
    console.dir(certResult2, { depth: null, colors: true });
    console.log("");

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await prisma.$disconnect();
    console.log("============================================================");
    console.log("  Tests Completed                                           ");
    console.log("============================================================");
  }
}

runTests();
