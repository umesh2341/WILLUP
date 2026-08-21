import { Domain, TicketStatus } from "@prisma/client";
import { prisma } from "../prisma";

const LOOKBACK_WINDOW_DAYS = 7;

export async function checkIsDuplicate(
  studentId: string,
  domain: Domain,
  extractedData: any
): Promise<boolean> {
  // 1. Direct Prisma DB query for open tickets from the same student, same domain, within lookback window
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - LOOKBACK_WINDOW_DAYS);

  const recentTickets = await prisma.ticket.findMany({
    where: {
      studentId: studentId,
      domain: domain,
      status: {
        notIn: [TicketStatus.RESOLVED, TicketStatus.REJECTED]
      },
      createdAt: {
        gte: lookbackDate
      }
    }
  });

  // Filter in-memory based on domain-specific extractedData overlap
  const isDuplicate = recentTickets.some(ticket => {
    const data = ticket.extractedData as any;
    if (!data) return false;

    switch (domain) {
      case Domain.HOSTEL_MAINTENANCE:
        return data.room === extractedData.room && data.issueCategory === extractedData.issueCategory;
      case Domain.CERTIFICATE:
        return data.certType === extractedData.certType;
      case Domain.LABORATORY:
        return data.labId === extractedData.labId && data.date === extractedData.date;
      case Domain.GRIEVANCE:
        return data.category === extractedData.category;
      default:
        return false;
    }
  });

  if (isDuplicate) {
    return true;
  }

  // 2. TODO: Fall back to embedding-similarity check if simple match misses
  // This will be implemented in Phase D (RAG/embeddings).
  // For now, return false.
  
  return false;
}
