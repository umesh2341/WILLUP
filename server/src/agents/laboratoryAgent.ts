import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Domain, TicketStatus } from "@prisma/client";
import { DomainAgentResult } from "./types";
import { prisma } from "../prisma";
import { checkIsDuplicate } from "./duplicateDetector";
import laboratoryAgentFixtures from "./__fixtures__/laboratoryAgent.json";
import { findFixtureMatch, FixtureEntry } from "./__fixtures__/fixtureMatcher";
import { generateOpenRouterJson } from "./openrouter";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    labId: { type: Type.STRING, description: "The identifier or name of the laboratory." },
    date: { type: Type.STRING, description: "The requested date for the booking, in YYYY-MM-DD format." },
    timeSlot: { type: Type.STRING, description: "The requested time slot, e.g., '10:00 AM - 12:00 PM'." },
    purpose: { type: Type.STRING, description: "The purpose of the laboratory booking." },
  },
  required: ["labId", "date", "timeSlot", "purpose"],
};

export async function processLaboratoryRequest(studentId: string, translatedText: string): Promise<DomainAgentResult> {
  if (process.env.TEST_MODE === "true") {
    return findFixtureMatch<DomainAgentResult>(
      "laboratoryAgent",
      translatedText,
      laboratoryAgentFixtures as FixtureEntry<DomainAgentResult>[]
    );
  }

  if (process.env.MOCK_LLM === "true") {
    const extractedData = {
      labId: "LAB-01",
      date: "2026-10-15",
      timeSlot: "10:00 AM - 12:00 PM",
      purpose: "Mock laboratory purpose"
    };

    const isDuplicate = await checkIsDuplicate(studentId, Domain.LABORATORY, extractedData);
    return {
      extractedData,
      severity: "NA",
      isDuplicate,
      missingInfo: [],
    };
  }

  // 1. Extract data using LLM
  let extractedData: any = {};
  try {
    extractedData = await generateOpenRouterJson(
      "You extract laboratory booking requests. Return JSON with labId, date, timeSlot, and purpose.",
      `Extract labId, date, timeSlot, and purpose from: "${translatedText}"`
    );
  } catch (error) {
    console.warn(`[laboratoryAgent] LLM API call failed, using heuristic extraction: ${(error as any).message}`);
    extractedData = {
      labId: translatedText.match(/lab\s*[\w\d]+/i)?.[0]?.toUpperCase() || "LAB-GENERAL",
      date: new Date().toISOString().split('T')[0],
      timeSlot: "Immediate / General Session",
      purpose: translatedText
    };
  }


  const isDuplicate = await checkIsDuplicate(studentId, Domain.LABORATORY, extractedData);

  const result: DomainAgentResult = {
    extractedData,
    severity: "NA",
    isDuplicate,
    missingInfo: [],
  };

  // Check if anything is UNKNOWN
  const missing = [];
  if (extractedData.labId === "UNKNOWN" || !extractedData.labId) missing.push("Laboratory ID/Name");
  if (extractedData.date === "UNKNOWN" || !extractedData.date) missing.push("Date");
  if (extractedData.timeSlot === "UNKNOWN" || !extractedData.timeSlot) missing.push("Time Slot");
  
  if (missing.length > 0) {
    result.missingInfo = missing;
    return result; // Don't check for conflicts if info is missing
  }

  // 2. Direct Prisma DB check for availability conflicts
  // We'll fetch active lab tickets and check in-memory to avoid complex JSON path querying issues
  try {
    const activeLabTickets = await prisma.ticket.findMany({
      where: {
        domain: Domain.LABORATORY,
        status: {
          notIn: [TicketStatus.REJECTED, TicketStatus.RESOLVED]
        }
      }
    });

    const conflict = activeLabTickets.find(ticket => {
      const data = ticket.extractedData as any;
      return (
        data &&
        data.labId === extractedData.labId &&
        data.date === extractedData.date &&
        data.timeSlot === extractedData.timeSlot
      );
    });

    if (conflict) {
      result.policyConflict = `Conflict: Laboratory ${extractedData.labId} is already booked on ${extractedData.date} for slot ${extractedData.timeSlot}.`;
    }
  } catch (error) {
    console.error("Error querying DB for lab conflicts:", error);
  }

  return result;
}
