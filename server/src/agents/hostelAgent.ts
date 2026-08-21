import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Domain, Severity } from "@prisma/client";
import { DomainAgentResult } from "./types";
import { prisma } from "../prisma";
import { checkIsDuplicate } from "./duplicateDetector";
import hostelAgentFixtures from "./__fixtures__/hostelAgent.json";
import { findFixtureMatch, FixtureEntry } from "./__fixtures__/fixtureMatcher";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    room: { type: Type.STRING, description: "The room number mentioned, if any." },
    block: { type: Type.STRING, description: "The hostel block mentioned, if any." },
    issueCategory: { type: Type.STRING, description: "The category of the issue (e.g. electrical, plumbing, wifi)." },
    scope: { type: Type.STRING, enum: ["PERSONAL", "COLLECTIVE"], description: "Whether the issue affects only personal property (PERSONAL) or shared infrastructure (COLLECTIVE)." },
    severity: { type: Type.STRING, enum: ["LOW", "MEDIUM", "CRITICAL"], description: "The severity of the issue based on the provided rules." }
  },
  required: ["room", "block", "issueCategory", "scope", "severity"],
};

export async function processHostelMaintenanceRequest(studentId: string, translatedText: string): Promise<DomainAgentResult> {
  if (process.env.TEST_MODE === "true") {
    return findFixtureMatch<DomainAgentResult>(
      "hostelAgent",
      translatedText,
      hostelAgentFixtures as FixtureEntry<DomainAgentResult>[]
    );
  }

  // 1. Fetch Severity Rules for context
  const rules = await prisma.severityRule.findMany({
    where: { domain: Domain.HOSTEL_MAINTENANCE }
  });
  
  const rulesContext = rules.map(r => `- Keyword: "${r.keyword}" => Severity: ${r.severity}`).join('\n');

  if (process.env.MOCK_LLM === "true") {
    const severityValues: Record<string, number> = { "LOW": 1, "MEDIUM": 2, "CRITICAL": 3 };
    let mockSeverity: "LOW" | "MEDIUM" | "CRITICAL" = "LOW";
    let maxSeverityVal = 0;

    for (const rule of rules) {
      if (translatedText.toLowerCase().includes(rule.keyword.toLowerCase())) {
        const val = severityValues[rule.severity] || 0;
        if (val > maxSeverityVal) {
          maxSeverityVal = val;
          mockSeverity = rule.severity as "LOW" | "MEDIUM" | "CRITICAL";
        }
      }
    }
    
    let scope: "PERSONAL" | "COLLECTIVE" = "PERSONAL";
    if (translatedText.toLowerCase().includes("wifi")) scope = "COLLECTIVE";
    if (mockSeverity === "CRITICAL") scope = "PERSONAL";

    const extractedData = {
      room: translatedText.includes("room 205") ? "205" : "101",
      block: translatedText.includes("block B") ? "B" : "UNKNOWN",
      issueCategory: translatedText.includes("fire") ? "safety" : "electrical",
      mockSource: translatedText
    };

    const isDuplicate = await checkIsDuplicate(studentId, Domain.HOSTEL_MAINTENANCE, extractedData);
    return {
      extractedData,
      scope,
      severity: mockSeverity,
      isDuplicate,
      missingInfo: []
    };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const systemInstruction = `You are an AI assistant that classifies and extracts structured data from hostel maintenance requests.
  
Follow these specific rules:
1. Extraction: Extract the room, block, and general issueCategory. If unknown, output "UNKNOWN".
2. Scope: Determine if the issue is PERSONAL or COLLECTIVE.
   - PERSONAL: affects only the user's personal items (e.g., "my laptop charger"). Even if electrical, personal items stay PERSONAL.
   - COLLECTIVE: affects shared infrastructure (e.g., "room fan", "hallway light", "wifi").
3. Severity: Determine severity (LOW/MEDIUM/CRITICAL) strictly using the following rules. If multiple rules apply, you MUST select the HIGHEST applicable severity (CRITICAL > MEDIUM > LOW). If the issueCategory loosely matches a rule's keyword, apply that severity. If no rule applies, use your best judgement among LOW, MEDIUM, CRITICAL.

Available Severity Rules:
${rulesContext}`;

  let extractedData: any = {};
  try {
    let responseText = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: MODEL,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Request: "${translatedText}"`
                }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            systemInstruction: systemInstruction,
          }
        });
        
        if (response.text) {
          responseText = response.text;
          break; // success
        } else {
          throw new Error("No response text from Gemini");
        }
      } catch (err: any) {
        if (attempt === 3) throw err;
        if (err?.status === 429) {
          console.log(`[hostelAgent] Rate limited. Retrying in 5 seconds (Attempt ${attempt}/3)...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          throw err;
        }
      }
    }

    if (responseText) {
      extractedData = JSON.parse(responseText);
    }
  } catch (error) {
    console.error(`[hostelAgent] LLM API call failed: ${(error as any).message}`);
    throw error;
  }

  const isDuplicate = await checkIsDuplicate(studentId, Domain.HOSTEL_MAINTENANCE, extractedData);

  const result: DomainAgentResult = {
    extractedData: {
      room: extractedData.room,
      block: extractedData.block,
      issueCategory: extractedData.issueCategory,
    },
    scope: extractedData.scope as "PERSONAL" | "COLLECTIVE",
    severity: extractedData.severity as "LOW" | "MEDIUM" | "CRITICAL",
    isDuplicate,
    missingInfo: [],
  };

  const missing = [];
  if (extractedData.room === "UNKNOWN" || !extractedData.room) missing.push("Room Number");
  if (extractedData.block === "UNKNOWN" || !extractedData.block) missing.push("Hostel Block");
  if (missing.length > 0) {
    result.missingInfo = missing;
  }

  // CRITICAL SEVERITY BYPASS:
  // Any CRITICAL ticket must be routed directly to WorkflowEngine.assignToStage as an individual ticket,
  // bypassing the CollectiveGroup logic entirely. Forcing scope to PERSONAL ensures downstream routers do not group it.
  if (result.severity === "CRITICAL") {
    result.scope = "PERSONAL";
  }

  return result;
}
