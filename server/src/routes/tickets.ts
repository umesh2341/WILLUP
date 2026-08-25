import { Router, Request, Response } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabase";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";
import { assignToStage } from "../workflow/workflowEngine";
import { processCollectiveDispatches } from "../workflow/collectiveDispatchJob";
import { ApprovalDecision, TicketStatus, Domain } from "@prisma/client";


const router = Router();

// Rejection behavior configuration per domain
const domainRejectionBehavior: Record<Domain, "REJECTED" | "AWAITING_INFO"> = {
  LABORATORY: "REJECTED",
  CERTIFICATE: "AWAITING_INFO",
  HOSTEL_MAINTENANCE: "REJECTED",
  GRIEVANCE: "REJECTED"
};

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.mimetype === "image/jpeg") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and JPEG files are allowed"));
    }
  }
});

// Get user's tickets or pending tickets
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { filter } = req.query;
  const userId = req.user!.id;

  try {
    if (filter === "mine") {
      const tickets = await prisma.ticket.findMany({
        where: { studentId: userId },
        include: { 
          currentStage: { include: { role: true } },
          collectiveGroup: { include: { tickets: true } }
        },
        orderBy: { createdAt: "desc" }
      });
      return res.json({ tickets });
    } else if (filter === "pending") {
      // Find RoleAssignments for this user
      const assignments = await prisma.roleAssignment.findMany({
        where: { userId },
        include: { role: true }
      });
      const roleIds = assignments.map(a => a.roleId);
      const isAdmin = assignments.some(({ role }) =>
        ["system admin", "superadmin", "administrator"].includes(role.name.toLowerCase())
      );

      if (roleIds.length === 0 && !isAdmin) {
        return res.json({ tickets: [] });
      }

      // Fetch tickets pending at these roles
      const tickets = await prisma.ticket.findMany({
        where: {
          status: { in: [TicketStatus.IN_WORKFLOW, TicketStatus.ESCALATED] },
          ...(isAdmin
            ? {}
            : { currentStage: { roleId: { in: roleIds } } })
        },
        include: { 
          currentStage: { include: { role: true } },
          collectiveGroup: { include: { tickets: true } }
        },
        orderBy: { createdAt: "asc" }
      });
      return res.json({ tickets });
    } else if (filter === "resolved") {
      // Find RoleAssignments for this user
      const assignments = await prisma.roleAssignment.findMany({
        where: { userId },
        include: { role: true },
      });

      const isStaffOrAdmin = assignments.length > 0;

      // Staff can view resolved tickets across the institution/domains; students view their own
      const whereClause = isStaffOrAdmin
        ? { status: { in: [TicketStatus.RESOLVED, TicketStatus.REJECTED] } }
        : { studentId: userId, status: { in: [TicketStatus.RESOLVED, TicketStatus.REJECTED] } };

      const tickets = await prisma.ticket.findMany({
        where: whereClause,
        include: { 
          currentStage: { include: { role: true } },
          collectiveGroup: { include: { tickets: true } }
        },
        orderBy: { updatedAt: "desc" }
      });
      return res.json({ tickets });
    }

    return res.status(400).json({ error: "Invalid filter. Use ?filter=mine, ?filter=pending, or ?filter=resolved" });
  } catch (error: any) {
    console.error("Error fetching tickets:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// List collective groups
router.get("/collective-groups", requireAuth, async (req: Request, res: Response) => {
  try {
    const groups = await prisma.collectiveGroup.findMany({
      include: {
        tickets: {
          include: {
            currentStage: { include: { role: true } }
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { windowStart: "desc" }
    });
    return res.json({ groups });
  } catch (error: any) {
    console.error("Error listing collective groups:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get collective group details
router.get("/collective-groups/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const group = await prisma.collectiveGroup.findUnique({
      where: { id: req.params.id },
      include: {
        tickets: {
          include: {
            currentStage: { include: { role: true } }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });
    if (!group) {
      return res.status(404).json({ error: "Collective group not found" });
    }
    return res.json({ group });
  } catch (error: any) {
    console.error("Error fetching collective group:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Dispatch closed collective groups
router.post("/collective/dispatch", requireAuth, async (req: Request, res: Response) => {
  try {
    const dispatched = await processCollectiveDispatches();
    return res.json({ success: true, count: dispatched.length, dispatched });
  } catch (error: any) {
    console.error("Error dispatching collective groups:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});





// Get single ticket details
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        auditLogs: { orderBy: { createdAt: "asc" } },
        currentStage: { include: { role: true } },
        collectiveGroup: { include: { tickets: true } }
      }
    });
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    return res.json({ ticket });
  } catch (error: any) {
    console.error("Error fetching ticket:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});


// Upload document for a ticket
router.post("/:id/documents", requireAuth, upload.single("document"), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No document provided or invalid file type" });
  }

  const ticketId = req.params.id;

  try {
    // 1. Verify ticket exists and belongs to user (or user has permission)
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (ticket.studentId !== req.user!.id) return res.status(403).json({ error: "Forbidden" });

    // 2. Upload to Supabase Storage
    const fileExt = file.mimetype === "application/pdf" ? "pdf" : "jpg";
    const filePath = `${ticketId}/${uuidv4()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from("ticket-documents")
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) {
      throw error;
    }

    const { data: publicUrlData } = supabase.storage
      .from("ticket-documents")
      .getPublicUrl(filePath);

    // 3. Save to DB
    const doc = await prisma.document.create({
      data: {
        ticketId,
        fileName: file.originalname || "document",
        fileUrl: publicUrlData.publicUrl
      }
    });

    return res.json({ document: doc });
  } catch (error: any) {
    console.error("Error uploading document:", error);
    return res.status(500).json({ error: "Internal server error during upload" });
  }
});

// POST /api/tickets/:id/approve
router.post("/:id/approve", requireAuth, async (req: Request, res: Response) => {
  const ticketId = req.params.id;
  const userId = req.user!.id;
  const { comment, stageId } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { 
        currentStage: { include: { role: true } }
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    if (ticket.status !== TicketStatus.IN_WORKFLOW && ticket.status !== TicketStatus.ESCALATED) {
      return res.status(400).json({ error: "Ticket is not in active workflow" });
    }

    if (!ticket.currentStageId || !ticket.currentStage) {
      return res.status(400).json({ error: "Ticket has no active stage" });
    }

    if (stageId && ticket.currentStageId !== stageId) {
      return res.status(409).json({ error: "Conflict: Ticket is no longer at the specified stage" });
    }

    const currentStage = ticket.currentStage;

    // Admins may approve any active stage; other staff must hold the stage role.
    const assignments = await prisma.roleAssignment.findMany({
      where: {
        userId: userId
      },
      include: { role: true }
    });
    const isAdmin = assignments.some(({ role }) =>
      ["system admin", "superadmin", "administrator"].includes(role.name.toLowerCase())
    );
    const roleAssignment = isAdmin
      ? assignments[0]
      : assignments.find(assignment => assignment.roleId === currentStage.roleId);

    if (!roleAssignment) {
      return res.status(403).json({ error: "Forbidden: Insufficient permissions for this stage" });
    }

    // 2. Create an Approval row
    const approval = await prisma.approval.create({
      data: {
        ticketId: ticketId,
        stageId: currentStage.id,
        approvedById: userId,
        roleNameAtApproval: currentStage.role.name,
        decision: ApprovalDecision.APPROVED,
        comment: comment || null
      }
    });

    // 3. Cancel the pending escalation job for this ticket/stage
    await prisma.$executeRawUnsafe(`
      UPDATE pgboss.job
      SET state = 'cancelled'
      WHERE name = 'escalation-check'
        AND (data->>'ticketId') = $1
        AND (data->>'stageId') = $2
        AND state IN ('created', 'retry', 'active')
    `, ticketId, currentStage.id);

    console.log(`[Workflow] Cancelled pending escalation jobs for ticket ${ticketId} at stage ${currentStage.id}`);

    // Fetch the workflow definition to check if there are more stages
    const wfDef = await prisma.workflowDefinition.findUnique({
      where: { domain: ticket.domain },
      include: {
        stages: {
          orderBy: { order: "asc" }
        }
      }
    });

    if (!wfDef) {
      return res.status(500).json({ error: "Workflow definition not found for this domain" });
    }

    // 4. Write an AuditLog entry for APPROVAL first to maintain correct chronological order
    await prisma.auditLog.create({
      data: {
        ticketId: ticketId,
        actor: userId,
        action: "APPROVED",
        details: { stageId: currentStage.id, stageName: currentStage.role.name, comment }
      }
    });

    const currentOrder = currentStage.order;
    const nextStage = wfDef.stages.find(s => s.order === currentOrder + 1);

    if (nextStage) {
      // 5. If more stages remain, assign to the next stage
      await assignToStage(ticketId, currentOrder + 1);
    } else {
      // No more stages -> Ticket is RESOLVED
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: TicketStatus.RESOLVED,
          currentStageId: null,
          lastAction: "APPROVED"
        }
      });

      // Insert a Notification for the student
      await prisma.notification.create({
        data: {
          userId: ticket.studentId,
          ticketId: ticketId,
          message: `Your ticket has been fully approved and resolved.`
        }
      });
    }

    return res.json({ message: "Ticket approved successfully" });

  } catch (error: any) {
    console.error("Error approving ticket:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tickets/:id/reject
router.post("/:id/reject", requireAuth, async (req: Request, res: Response) => {
  const ticketId = req.params.id;
  const userId = req.user!.id;
  const { comment, stageId } = req.body;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { 
        currentStage: { include: { role: true } }
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    if (ticket.status !== TicketStatus.IN_WORKFLOW && ticket.status !== TicketStatus.ESCALATED) {
      return res.status(400).json({ error: "Ticket is not in active workflow" });
    }

    if (!ticket.currentStageId || !ticket.currentStage) {
      return res.status(400).json({ error: "Ticket has no active stage" });
    }

    if (stageId && ticket.currentStageId !== stageId) {
      return res.status(409).json({ error: "Conflict: Ticket is no longer at the specified stage" });
    }

    const currentStage = ticket.currentStage;

    // 1. Verify the calling user's RoleAssignment matches the ticket's currentStage.roleId
    const roleAssignment = await prisma.roleAssignment.findFirst({
      where: {
        userId: userId,
        roleId: currentStage.roleId
      }
    });

    if (!roleAssignment) {
      return res.status(403).json({ error: "Forbidden: Insufficient permissions for this stage" });
    }

    // 2. Create an Approval row (with decision = REJECTED)
    await prisma.approval.create({
      data: {
        ticketId: ticketId,
        stageId: currentStage.id,
        approvedById: userId,
        roleNameAtApproval: currentStage.role.name,
        decision: ApprovalDecision.REJECTED,
        comment: comment || null
      }
    });

    // 3. Cancel the pending escalation job
    await prisma.$executeRawUnsafe(`
      UPDATE pgboss.job
      SET state = 'cancelled'
      WHERE name = 'escalation-check'
        AND (data->>'ticketId') = $1
        AND (data->>'stageId') = $2
        AND state IN ('created', 'retry', 'active')
    `, ticketId, currentStage.id);

    // 4. Handle rejection destination (REJECTED vs AWAITING_INFO)
    const rejectionBehavior = domainRejectionBehavior[ticket.domain] || "REJECTED";

    if (rejectionBehavior === "AWAITING_INFO") {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: TicketStatus.AWAITING_INFO,
          currentStageId: null,
          lastAction: "REJECTED_AWAITING_INFO"
        }
      });

      await prisma.notification.create({
        data: {
          userId: ticket.studentId,
          ticketId: ticketId,
          message: `Your ticket has been sent back for clarification. Comment: ${comment || "No comment provided"}`
        }
      });
    } else {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: TicketStatus.REJECTED,
          currentStageId: null,
          lastAction: "REJECTED"
        }
      });

      await prisma.notification.create({
        data: {
          userId: ticket.studentId,
          ticketId: ticketId,
          message: `Your ticket has been rejected. Comment: ${comment || "No comment provided"}`
        }
      });
    }

    // 5. Write an AuditLog entry
    await prisma.auditLog.create({
      data: {
        ticketId: ticketId,
        actor: userId,
        action: "REJECTED",
        details: { stageId: currentStage.id, stageName: currentStage.role.name, behaviorApplied: rejectionBehavior, comment }
      }
    });

    return res.json({ message: `Ticket rejected and marked as ${rejectionBehavior}` });

  } catch (error: any) {
    console.error("Error rejecting ticket:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
