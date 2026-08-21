import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { ingestDocument } from "../rag/ingest";
import { Domain } from "@prisma/client";
import { prisma } from "../prisma";

const router = Router();

async function writeKnowledgeAuditLog(actorId: string, action: string, details: any) {
  try {
    let sysTicket = await prisma.ticket.findFirst({ where: { originalText: "SYSTEM_AUDIT" } });
    if (!sysTicket) {
      sysTicket = await prisma.ticket.create({
        data: {
          originalText: "SYSTEM_AUDIT",
          originalLang: "English",
          scope: "PERSONAL",
          severity: "NA",
          domain: "GRIEVANCE",
          studentId: actorId,
          status: "RESOLVED",
          extractedData: {}
        }
      });
    }

    return await prisma.auditLog.create({
      data: {
        ticketId: sysTicket.id,
        actor: actorId,
        action,
        details
      }
    });
  } catch (err) {
    console.warn("[KnowledgeAudit] Could not write audit log:", err);
  }
}

/**
 * POST /api/knowledge and POST /api/knowledge/ingest
 * Ingests an institutional document into the RAG knowledge base.
 */
const handleIngest = async (req: Request, res: Response) => {
  const { title, content, domain, sourceUrl } = req.body;

  if (!title || typeof title !== "string" || title.trim() === "") {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (!content || typeof content !== "string" || content.trim() === "") {
    res.status(400).json({ error: "content is required" });
    return;
  }

  // Validate optional domain enum
  if (domain && !Object.values(Domain).includes(domain)) {
    res.status(400).json({
      error: `Invalid domain. Must be one of: ${Object.values(Domain).join(", ")}`,
    });
    return;
  }

  try {
    const result = await ingestDocument({
      title: title.trim(),
      content: content.trim(),
      domain: domain ?? undefined,
      sourceUrl: sourceUrl ?? undefined,
    });

    if (req.user?.id) {
      await writeKnowledgeAuditLog(req.user.id, "INGEST_KNOWLEDGE_DOC", {
        documentId: result.documentId,
        title: title.trim(),
        domain: domain ?? "ALL",
        chunkCount: result.chunkCount
      });
    }

    res.status(201).json({
      message: "Document ingested successfully",
      documentId: result.documentId,
      chunkCount: result.chunkCount,
      embeddingDimension: result.embeddingDimension,
    });
  } catch (err: any) {
    console.error("[POST /api/knowledge] Ingestion error:", err);
    res.status(500).json({ error: err.message || "Ingestion failed" });
  }
};

router.post("/", requireAuth, handleIngest);
router.post("/ingest", requireAuth, handleIngest);

// GET /api/knowledge and GET /api/knowledge/documents — list ingested documents
const handleList = async (_req: Request, res: Response) => {
  try {
    const docs = await prisma.knowledgeDocument.findMany({
      orderBy: { createdAt: "desc" }
    });
    res.json({ documents: docs });
  } catch (error: any) {
    res.status(500).json({ error: "Internal server error" });
  }
};

router.get("/", requireAuth, handleList);
router.get("/documents", requireAuth, handleList);

export default router;

