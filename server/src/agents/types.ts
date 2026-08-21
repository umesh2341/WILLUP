import { Domain } from "@prisma/client";

export interface DomainAgentResult {
  extractedData: Record<string, any>;
  scope?: "PERSONAL" | "COLLECTIVE";
  severity?: "LOW" | "MEDIUM" | "CRITICAL" | "NA";
  isDuplicate: boolean;
  missingInfo?: string[];
  policyConflict?: string;
}
