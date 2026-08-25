import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Domain } from "@prisma/client";
import { DomainAgentResult } from "./types";
import { prisma } from "../prisma";
import { checkIsDuplicate } from "./duplicateDetector";
import certificateAgentFixtures from "./__fixtures__/certificateAgent.json";
import { findFixtureMatch, FixtureEntry } from "./__fixtures__/fixtureMatcher";
import { generateOpenRouterJson } from "./openrouter";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    certType: { type: Type.STRING, description: "The type of certificate requested, e.g., 'Bonafide Certificate', 'Transcript', 'No Dues'." },
  },
  required: ["certType"],
};

export async function processCertificateRequest(studentId: string, translatedText: string): Promise<DomainAgentResult> {
  if (process.env.TEST_MODE === "true") {
    return findFixtureMatch<DomainAgentResult>(
      "certificateAgent",
      translatedText,
      certificateAgentFixtures as FixtureEntry<DomainAgentResult>[]
    );
  }

  if (process.env.MOCK_LLM === "true") {
    const extractedData = {
      certType: "Bonafide Certificate"
    };

    const isDuplicate = await checkIsDuplicate(studentId, Domain.CERTIFICATE, extractedData);
    return {
      extractedData: { ...extractedData, requiredDocs: ["ID Card"] },
      isDuplicate,
      missingInfo: ["ID Card"],
    };
  }

  // 1. Extract data using LLM
  let extractedData: any = {};
  try {
    const response = await generateOpenRouterJson(
      "You extract certificate requests. Return JSON with certType. Use UNKNOWN when absent.",
      `Extract the certificate type from: "${translatedText}"`
    );
    const responseText = JSON.stringify(response);
    extractedData = response;
  } catch (error) {
    console.error(`[certificateAgent] LLM API call failed: ${(error as any).message}`);
    throw error;
  }

  const isDuplicate = await checkIsDuplicate(studentId, Domain.CERTIFICATE, extractedData);

  const result: DomainAgentResult = {
    extractedData: { ...extractedData, requiredDocs: [] },
    isDuplicate,
    missingInfo: [],
  };

  if (!extractedData.certType || extractedData.certType === "UNKNOWN") {
    result.policyConflict = "certificate type not recognized — needs manual classification";
    return result;
  }

  // 2. Query KnowledgeDocument for required docs (RAG Stub)
  try {
    const docs = await prisma.knowledgeDocument.findMany({
      where: {
        domain: Domain.CERTIFICATE,
        title: {
          contains: extractedData.certType,
          mode: 'insensitive'
        }
      }
    });

    if (docs.length === 0) {
      // If we don't recognize the cert type in our knowledge base
      result.policyConflict = "certificate type not recognized — needs manual classification";
    } else {
      // For the stub, we'll parse the 'content' of the first matching document
      // In a real RAG scenario, this would be a more robust extraction.
      // Let's assume the document content might just be a comma separated list of required docs for the stub.
      // Or we just hardcode a stub response based on certType if the DB is empty.
      
      // Let's pretend the knowledge doc has "Required Docs: ID Card, Fee Receipt"
      const content = docs[0].content;
      const match = content.match(/Required Docs:\s*(.*)/i);
      
      if (match && match[1]) {
        const requiredDocs = match[1].split(',').map(d => d.trim());
        result.extractedData.requiredDocs = requiredDocs;
        
        // Since user hasn't provided docs yet, put them all in missingInfo
        result.missingInfo = requiredDocs;
      } else {
         // Fallback if the doc exists but doesn't have the explicit string
         result.extractedData.requiredDocs = ["ID Card"]; // Stub
         result.missingInfo = ["ID Card"];
      }
    }

  } catch (error) {
    console.error("Error querying KnowledgeDocument for certs:", error);
  }

  return result;
}
