import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import dotenv from "dotenv";
import chatAgentFixtures from "./__fixtures__/chatAgent.json";
import { findFixtureMatch, FixtureEntry } from "./__fixtures__/fixtureMatcher";

dotenv.config();

/**
 * Message in conversation history
 */
export interface ChatHistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Input contract for Chat Agent
 */
export interface ChatAgentInput {
  /** Raw message from the student in any language */
  message: string;
  /** Optional previous messages in the clarification loop / ticket context */
  history?: ChatHistoryMessage[];
  /** Optional flag indicating that Category AI evaluated the issue as UNCLEAR */
  isCategoryUnclear?: boolean;
  /** Optional context / missing information note from Category AI */
  unclearReason?: string;
}

/**
 * Output contract for Chat Agent
 */
export interface ChatAgentOutput {
  /** The message translated to English for internal classification & workflow processing */
  translatedText: string;
  /** The detected natural language (e.g. "Hindi", "Spanish", "English", "Tamil", "French") */
  detectedLanguage: string;
  /** Whether the message is a follow-up to an ongoing clarification loop or previous context */
  isFollowUp: boolean;
  /** Clarifying question generated in the student's native language if needed/requested */
  clarifyingQuestion?: string;
  /** Whether the student's message is reporting an issue (REPORT) or asking a policy question (QUESTION) */
  intent: "REPORT" | "QUESTION";
}

const CHAT_AGENT_SYSTEM_PROMPT = `You are the front-line Student Intake & Communication AI Agent for the WILLUP Institutional Service Platform.

Your primary responsibilities:
1. LANGUAGE DETECTION: Accurately identify the student's input language (e.g., "English", "Hindi", "Spanish", "French", "German", "Tamil", "Telugu", "Bengali", "Chinese", "Arabic", "Portuguese", etc.).
2. TRANSLATION: Translate the message into standard, clear English ("translatedText") for downstream Category and Domain Agents. Preserve all technical terms, room numbers, laboratory equipment names, certificate types, dates, and emotional context. If the input is already in English, provide the cleaned English text.
3. FOLLOW-UP DETECTION: Analyze the conversation history (if provided) to determine if this message is a follow-up or reply ("isFollowUp": true) to an existing clarification loop, or a new distinct complaint ("isFollowUp": false).
4. CLARIFICATION QUESTION (When isCategoryUnclear = true or details are missing): Formulate a polite, empathetic, and concise clarifying question in the STUDENT'S DETECTED LANGUAGE ("clarifyingQuestion") asking for the missing specific details required for institutional processing (e.g., hostel room number, course code, lab name, certificate ID, specific grievance details). If no clarification is requested and the text is clear, set "clarifyingQuestion" to null.
5. INTENT DETECTION: Determine if the message is a "REPORT" (reporting an issue, complaint, or requesting a physical service like fixing a fan or issuing a certificate) or a "QUESTION" (asking for information about policies, procedures, rules, or general knowledge).

You MUST respond strictly with a valid JSON object matching this schema:
{
  "detectedLanguage": "string",
  "translatedText": "string",
  "isFollowUp": boolean,
  "clarifyingQuestion": "string | null",
  "intent": "REPORT" | "QUESTION"
}`;

/**
 * Executes the Chat Agent LLM pipeline using Google Gemini (or OpenAI fallback).
 *
 * @param input ChatAgentInput containing student message, history, and category clarity status
 * @returns Promise<ChatAgentOutput>
 */
export async function chatAgent(input: ChatAgentInput): Promise<ChatAgentOutput> {
  const { message, history = [], isCategoryUnclear = false, unclearReason } = input;

  if (process.env.TEST_MODE === "true") {
    return findFixtureMatch<ChatAgentOutput>(
      "chatAgent",
      message,
      chatAgentFixtures as FixtureEntry<ChatAgentOutput>[],
      {
        isCategoryUnclear,
        hasHistory: Boolean(history && history.length > 0),
      }
    );
  }

  if (process.env.MOCK_LLM === "true") {
    let intent: "REPORT" | "QUESTION" = "REPORT";
    if (/policy|how to|what is|procedure|rules/i.test(message)) {
      intent = "QUESTION";
    }
    return {
      translatedText: message,
      detectedLanguage: "English",
      isFollowUp: history && history.length > 0,
      clarifyingQuestion: isCategoryUnclear ? "Could you please provide more specific details?" : undefined,
      intent
    };
  }

  const geminiKey = process.env.USE_GEMINI === "true"
    ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    : undefined;
  const openaiKey = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;

  if (!geminiKey && !openaiKey) {
    throw new Error("No active OPENROUTER_API_KEY found.");
  }

  // Build the user content string
  let promptText = "";
  if (history && history.length > 0) {
    promptText += "=== Conversation History ===\n";
    for (const h of history) {
      promptText += `[${h.role.toUpperCase()}]: ${h.content}\n`;
    }
    promptText += "============================\n\n";
  }

  promptText += `Student Message:\n"""\n${message}\n"""`;

  if (isCategoryUnclear) {
    promptText += `\n\n[NOTICE]: The institutional Category AI evaluated this ticket or inquiry as UNCLEAR.`;
    if (unclearReason) {
      promptText += ` Reason / Missing details needed: ${unclearReason}`;
    }
    promptText += `\nPlease generate an appropriate, concise clarifying question in the student's detected language in the "clarifyingQuestion" field.`;
  }

  // 1. Preferred: Google Gemini (Free tier with @google/genai)
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
              systemInstruction: CHAT_AGENT_SYSTEM_PROMPT,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  detectedLanguage: { type: Type.STRING },
                  translatedText: { type: Type.STRING },
                  isFollowUp: { type: Type.BOOLEAN },
                  clarifyingQuestion: { type: Type.STRING, nullable: true },
                  intent: { type: Type.STRING, enum: ["REPORT", "QUESTION"] },
                },
                required: ["detectedLanguage", "translatedText", "isFollowUp", "intent"],
              },
              temperature: 0.1,
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
      return {
        translatedText: parsed.translatedText || message,
        detectedLanguage: parsed.detectedLanguage || "English",
        isFollowUp: Boolean(parsed.isFollowUp),
        clarifyingQuestion: parsed.clarifyingQuestion || undefined,
        intent: parsed.intent === "QUESTION" ? "QUESTION" : "REPORT",
      };
    } catch (error: any) {
      console.warn(`[chatAgent:Gemini] Gemini failed: ${error.message}, using heuristic fallback.`);
      if (!openaiKey) {
        let intent: "REPORT" | "QUESTION" = "REPORT";
        if (/policy|how to|what is|procedure|rules|timing|when/i.test(message)) {
          intent = "QUESTION";
        }
        return {
          translatedText: message,
          detectedLanguage: "English",
          isFollowUp: Boolean(history && history.length > 0),
          clarifyingQuestion: isCategoryUnclear ? "Could you please provide more specific details?" : undefined,
          intent
        };
      }
    }
  }


  // 2. Secondary fallback: OpenAI (if configured)
  if (openaiKey && openaiKey.trim() !== "" && openaiKey !== "your_llm_api_key_here") {
    try {
      const openai = new OpenAI({
        apiKey: openaiKey,
        baseURL: process.env.OPENROUTER_BASE_URL || process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
          "X-Title": "WILLUP",
        },
      });
      const modelName = process.env.OPENROUTER_MODEL || process.env.LLM_MODEL || "openai/gpt-4o-mini";

      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: CHAT_AGENT_SYSTEM_PROMPT },
      ];

      if (history && history.length > 0) {
        for (const h of history) {
          messages.push({
            role: h.role === "system" ? "system" : h.role === "assistant" ? "assistant" : "user",
            content: h.content,
          });
        }
      }

      messages.push({ role: "user", content: promptText });

      const response = await openai.chat.completions.create({
        model: modelName,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response received from OpenAI.");
      }

      let parsed: Partial<ChatAgentOutput>;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        console.warn(`[chatAgent:OpenAI] Provider returned non-JSON content; using safe report fallback: ${content.slice(0, 120)}`);
        return {
          translatedText: message,
          detectedLanguage: "English",
          isFollowUp: Boolean(history && history.length > 0),
          clarifyingQuestion: isCategoryUnclear ? "Could you please provide more specific details?" : undefined,
          intent: "REPORT",
        };
      }
      return {
        translatedText: parsed.translatedText || message,
        detectedLanguage: parsed.detectedLanguage || "English",
        isFollowUp: Boolean(parsed.isFollowUp),
        clarifyingQuestion: parsed.clarifyingQuestion || undefined,
        intent: parsed.intent === "QUESTION" ? "QUESTION" : "REPORT",
      };
    } catch (error: any) {
      console.error(`[chatAgent:OpenAI] OpenAI API call failed: ${error.message}`);
      throw error;
    }
  }

  throw new Error("LLM API call failed or no valid keys configured.");
}

/**
 * Dedicated helper to generate a clarifying question when Category AI returns UNCLEAR
 */
export async function askClarifyingQuestion(params: {
  originalMessage: string;
  detectedLanguage?: string;
  reason?: string;
  history?: ChatHistoryMessage[];
}): Promise<string> {
  const result = await chatAgent({
    message: params.originalMessage,
    history: params.history,
    isCategoryUnclear: true,
    unclearReason: params.reason,
  });

  return (
    result.clarifyingQuestion ||
    "Could you please provide more specific details regarding your request so we can assist you properly?"
  );
}


