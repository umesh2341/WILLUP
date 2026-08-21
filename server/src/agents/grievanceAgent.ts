import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Domain } from "@prisma/client";
import { DomainAgentResult } from "./types";
import { prisma } from "../prisma";
import { checkIsDuplicate } from "./duplicateDetector";
import grievanceAgentFixtures from "./__fixtures__/grievanceAgent.json";
import { findFixtureMatch, FixtureEntry } from "./__fixtures__/fixtureMatcher";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING, description: "The category of the grievance (e.g. harassment, academic, administrative)." },
    description: { type: Type.STRING, description: "A brief summary of the grievance description." },
    severity: { type: Type.STRING, enum: ["LOW", "MEDIUM", "CRITICAL"], description: "The severity of the grievance based on the provided rules." }
  },
  required: ["category", "description", "severity"],
};

export async function processGrievanceRequest(studentId: string, translatedText: string): Promise<DomainAgentResult> {
  if (process.env.TEST_MODE === "true") {
    return findFixtureMatch<DomainAgentResult>(
      "grievanceAgent",
      translatedText,
      grievanceAgentFixtures as FixtureEntry<DomainAgentResult>[]
    );
  }

  // 1. Fetch Severity Rules for context
  const rules = await prisma.severityRule.findMany({
    where: { domain: Domain.GRIEVANCE }
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

    const extractedData = {
      category: "general",
      description: "Mock grievance description"
    };

    const isDuplicate = await checkIsDuplicate(studentId, Domain.GRIEVANCE, extractedData);
    return {
      extractedData,
      severity: mockSeverity,
      isDuplicate,
      missingInfo: []
    };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const systemInstruction = `You are an AI assistant that classifies and extracts structured data from grievance reports.
  
Follow these specific rules:
1. Extraction: Extract the general category of the grievance and a brief description.
2. Severity: Determine severity (LOW/MEDIUM/CRITICAL) strictly using the following rules. If multiple rules apply, you MUST select the HIGHEST applicable severity (CRITICAL > MEDIUM > LOW). If no rule applies, use your best judgement based on urgency.

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
          console.log(`[grievanceAgent] Rate limited. Retrying in 5 seconds (Attempt ${attempt}/3)...`);
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
    console.error(`[grievanceAgent] LLM API call failed: ${(error as any).message}`);
    throw error;
  }

  const isDuplicate = await checkIsDuplicate(studentId, Domain.GRIEVANCE, extractedData);

  const result: DomainAgentResult = {
    extractedData: {
      category: extractedData.category,
      description: extractedData.description,
    },
    severity: extractedData.severity as "LOW" | "MEDIUM" | "CRITICAL",
    isDuplicate,
    missingInfo: [],
  };

  const missing = [];
  if (extractedData.category === "UNKNOWN" || !extractedData.category) missing.push("Grievance Category");
  if (missing.length > 0) {
    result.missingInfo = missing;
  }

  return result;
}
