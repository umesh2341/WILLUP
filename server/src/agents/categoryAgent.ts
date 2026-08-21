import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { Domain } from "@prisma/client";
import dotenv from "dotenv";
import categoryAgentFixtures from "./__fixtures__/categoryAgent.json";
import { findFixtureMatch, FixtureEntry } from "./__fixtures__/fixtureMatcher";

dotenv.config();

export type ClassifiedDomain = Domain | "UNCLEAR";

/**
 * Input contract for Category Agent
 */
export interface CategoryAgentInput {
  /** English translated text from Chat AI */
  translatedText: string;
}

/**
 * Output contract for Category Agent
 */
export interface CategoryAgentOutput {
  /** Classified domain matching the Prisma enum or 'UNCLEAR' */
  domain: ClassifiedDomain;
  /** Classification confidence score between 0.0 and 1.0 */
  confidence: number;
  /** Brief rationale for the classification */
  reasoning?: string;
}

const CATEGORY_AGENT_SYSTEM_PROMPT = `You are the Category Classifier AI Agent for the WILLUP Institutional Service Platform.

Your task is to classify student service requests (provided in English) into one of four institutional domains or mark them as UNCLEAR:

DOMAINS:
1. "LABORATORY":
   - Issues involving lab equipment (oscilloscopes, microscopes, computers, 3D printers, chemical reagents), lab safety, lab maintenance, apparatus calibration, software licenses in labs, or workshop materials.
2. "CERTIFICATE":
   - Requests for official institutional documents: Bonafide certificates, transcripts, degree certificates, character certificates, migration certificates, grade sheets, NOCs, or medium of instruction letters.
3. "HOSTEL_MAINTENANCE":
   - Residential and hostel facility issues: Fan/light/AC electrical faults, water leaks/plumbing, broken furniture, room lock/carpentry issues, washroom cleaning, hostel mess, or corridor issues.
4. "GRIEVANCE":
   - Formal complaints: Ragging, harassment, grading/evaluation disputes, unfair treatment, faculty/staff misconduct, administrative delays, discrimination, or disciplinary appeals.
5. "UNCLEAR":
   - When the student message is too vague, ambiguous, incomplete, or lacks critical context to reliably determine which of the four domains it belongs to (e.g. "I have a problem", "Please help me urgently", "Something is not working", "Check my application").
   - DO NOT GUESS. If there is ambiguity between multiple domains or insufficient detail, classify as "UNCLEAR" so the student can be prompted for clarification.

Confidence Scoring Guidelines:
- 0.85 to 1.00: Unambiguous and explicitly fits domain keywords/context.
- 0.60 to 0.84: Likely belongs to domain with strong indicators.
- 0.00 to 0.50: Ambiguous or insufficient detail (Must use "UNCLEAR").

You MUST respond strictly with a valid JSON object matching this schema:
{
  "domain": "LABORATORY" | "CERTIFICATE" | "HOSTEL_MAINTENANCE" | "GRIEVANCE" | "UNCLEAR",
  "confidence": number,
  "reasoning": "string"
}`;

/**
 * Classifies translated student text into a specific institutional domain or UNCLEAR.
 *
 * @param input CategoryAgentInput containing translated English text
 * @returns Promise<CategoryAgentOutput>
 */
export async function categoryAgent(input: CategoryAgentInput): Promise<CategoryAgentOutput> {
  const { translatedText } = input;

  if (process.env.TEST_MODE === "true") {
    return findFixtureMatch<CategoryAgentOutput>(
      "categoryAgent",
      translatedText,
      categoryAgentFixtures as FixtureEntry<CategoryAgentOutput>[]
    );
  }

  if (process.env.MOCK_LLM === "true") {
    const lower = translatedText.toLowerCase();
    if (lower.includes("lab") || lower.includes("microscope")) {
      return { domain: Domain.LABORATORY, confidence: 0.9, reasoning: "Mock laboratory" };
    }
    if (lower.includes("bonafide") || lower.includes("certificate")) {
      return { domain: Domain.CERTIFICATE, confidence: 0.95, reasoning: "Mock certificate" };
    }
    if (lower.includes("hostel") || lower.includes("fan") || lower.includes("room") || lower.includes("wifi")) {
      return { domain: Domain.HOSTEL_MAINTENANCE, confidence: 0.92, reasoning: "Mock hostel" };
    }
    if (lower.includes("harass") || lower.includes("ragging")) {
      return { domain: Domain.GRIEVANCE, confidence: 0.9, reasoning: "Mock grievance" };
    }
    return { domain: "UNCLEAR", confidence: 0.3, reasoning: "Mock unclear" };
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const openaiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;

  if (!geminiKey && !openaiKey) {
    throw new Error("No active GEMINI_API_KEY or OPENAI_API_KEY found.");
  }

  const promptText = `Student Request (Translated to English):\n"""\n${translatedText}\n"""\n\nClassify the domain.`;

  // 1. Preferred: Google Gemini
  if (geminiKey && geminiKey.trim() !== "" && geminiKey !== "your_gemini_api_key_here") {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const modelName = process.env.GEMINI_MODEL || "gemini-3.6-flash";

      let responseText: string | undefined;
      let lastError: any;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: promptText,
            config: {
              systemInstruction: CATEGORY_AGENT_SYSTEM_PROMPT,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  domain: {
                    type: Type.STRING,
                    enum: ["LABORATORY", "CERTIFICATE", "HOSTEL_MAINTENANCE", "GRIEVANCE", "UNCLEAR"],
                  },
                  confidence: { type: Type.NUMBER },
                  reasoning: { type: Type.STRING },
                },
                required: ["domain", "confidence"],
              },
              temperature: 0.0,
            },
          });

          responseText = response.text;
          if (responseText) break;
        } catch (err: any) {
          lastError = err;
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, attempt * 600));
          }
        }
      }

      if (!responseText) {
        throw lastError || new Error("Empty response received from Gemini.");
      }

      const parsed = JSON.parse(responseText);
      return normalizeCategoryOutput(parsed);
    } catch (error: any) {
      if (!openaiKey) {
        console.warn(`[categoryAgent] Gemini failed (${error.message}), falling back to heuristic classification.`);
        return heuristicClassify(translatedText);
      }
    }
  }

  // 2. Secondary fallback: OpenAI
  if (openaiKey && openaiKey.trim() !== "" && openaiKey !== "your_openai_api_key_here") {
    try {
      const openai = new OpenAI({ apiKey: openaiKey });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: CATEGORY_AGENT_SYSTEM_PROMPT },
          { role: "user", content: promptText },
        ],
        response_format: { type: "json_object" },
        temperature: 0.0,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response received from OpenAI.");
      }

      const parsed = JSON.parse(content);
      return normalizeCategoryOutput(parsed);
    } catch (error: any) {
      console.error(`[categoryAgent:OpenAI] OpenAI API call failed: ${error.message}`);
      return heuristicClassify(translatedText);
    }
  }

  return heuristicClassify(translatedText);
}

function heuristicClassify(text: string): CategoryAgentOutput {
  const lower = text.toLowerCase();
  if (
    lower.includes("oscilloscope") ||
    lower.includes("lab") ||
    lower.includes("microscope") ||
    lower.includes("multimeter") ||
    lower.includes("apparatus") ||
    lower.includes("workbench") ||
    lower.includes("electronics")
  ) {
    return { domain: Domain.LABORATORY, confidence: 0.95, reasoning: "Heuristic keyword classification: Laboratory" };
  }
  if (
    lower.includes("hostel") ||
    lower.includes("room") ||
    lower.includes("fan") ||
    lower.includes("tap") ||
    lower.includes("plumbing") ||
    lower.includes("washroom") ||
    lower.includes("shower") ||
    lower.includes("water") ||
    lower.includes("bed") ||
    lower.includes("mess") ||
    lower.includes("warden") ||
    lower.includes("caretaker")
  ) {
    return { domain: Domain.HOSTEL_MAINTENANCE, confidence: 0.95, reasoning: "Heuristic keyword classification: Hostel Maintenance" };
  }
  if (
    lower.includes("certificate") ||
    lower.includes("bonafide") ||
    lower.includes("transcript") ||
    lower.includes("degree") ||
    lower.includes("marksheet") ||
    lower.includes("noc")
  ) {
    return { domain: Domain.CERTIFICATE, confidence: 0.95, reasoning: "Heuristic keyword classification: Certificate" };
  }
  return { domain: Domain.GRIEVANCE, confidence: 0.85, reasoning: "Institutional grievance default classification" };
}


/**
 * Validates and normalizes LLM classification outputs
 */
function normalizeCategoryOutput(parsed: any): CategoryAgentOutput {
  const validDomains: ClassifiedDomain[] = [
    Domain.LABORATORY,
    Domain.CERTIFICATE,
    Domain.HOSTEL_MAINTENANCE,
    Domain.GRIEVANCE,
    "UNCLEAR",
  ];

  const rawDomain = String(parsed.domain || "").toUpperCase();
  const domain: ClassifiedDomain = validDomains.includes(rawDomain as ClassifiedDomain)
    ? (rawDomain as ClassifiedDomain)
    : "UNCLEAR";

  const rawConfidence = Number(parsed.confidence);
  const confidence = !isNaN(rawConfidence) ? Math.min(Math.max(rawConfidence, 0), 1) : 0.5;

  return {
    domain,
    confidence,
    reasoning: parsed.reasoning || undefined,
  };
}


