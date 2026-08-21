import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { prisma } from "../prisma";
import { Domain, GroupStatus } from "@prisma/client";
import { assignGroupToStage } from "../workflow/workflowEngine";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const router = Router();

// Apply requireRole middleware to ALL routes in this router
// Only System Admin, HOD, SUPERADMIN, Admin or Administrator can access admin APIs.
router.use(requireAuth, requireRole(["System Admin", "HOD", "SUPERADMIN", "Admin", "Administrator"]));

router.get("/dashboard", (req: Request, res: Response) => {
  res.json({ message: "Admin dashboard active" });
});

// Helper to write admin audit log
async function writeAdminAuditLog(actorId: string, action: string, details: any) {
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
    console.warn("[AdminAudit] Could not write audit log:", err);
  }
}

// GET /api/admin/roles — list roles per domain with current members
router.get("/roles", async (req: Request, res: Response) => {
  try {
    const roles = await prisma.role.findMany({
      include: {
        assignments: {
          include: { user: true }
        }
      },
      orderBy: [{ domain: 'asc' }, { order: 'asc' }]
    });
    res.json({ roles });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});


// GET /api/admin/users/search?q= — ILIKE/prefix search against username or display name
router.get("/users/search", async (req: Request, res: Response) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string') {
    return res.json({ users: [] });
  }

  try {
    let users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } }
        ]
      },
      select: { id: true, username: true, displayName: true, roleAssignments: { include: { role: true } } }
    });

    // Also search Supabase auth users to sync any un-synced test or newly registered accounts
    try {
      const { data: supaUsers } = await adminSupabase.auth.admin.listUsers();
      if (supaUsers?.users) {
        for (const su of supaUsers.users) {
          const email = su.email || '';
          const username = email.split('@')[0] || su.id;
          const fullName = (su.user_metadata?.full_name as string) || (su.user_metadata?.name as string) || username;
          if (email.toLowerCase().includes(q.toLowerCase()) || username.toLowerCase().includes(q.toLowerCase()) || fullName.toLowerCase().includes(q.toLowerCase())) {
            // Upsert into Prisma User
            const upserted = await prisma.user.upsert({
              where: { id: su.id },
              update: {},
              create: {
                id: su.id,
                username,
                displayName: fullName
              },
              select: { id: true, username: true, displayName: true, roleAssignments: { include: { role: true } } }
            });
            if (!users.some(u => u.id === upserted.id)) {
              users.push(upserted as any);
            }
          }
        }
      }
    } catch (supaErr) {
      console.warn("[AdminSearch] Supabase admin search skipped:", supaErr);
    }

    res.json({ users });
  } catch (error) {
    console.error("Admin user search error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/roles/:id/members — add user to role by userId or username
router.post("/roles/:id/members", async (req: Request, res: Response) => {
  const roleId = req.params.id;
  let { userId, username } = req.body;

  try {
    let user: any = null;
    if (userId) {
      user = await prisma.user.findUnique({ where: { id: userId } });
    }
    if (!user && username) {
      user = await prisma.user.findUnique({ where: { username } });
    }
    if (!user && userId) {
      try {
        const { data: supaUser } = await adminSupabase.auth.admin.getUserById(userId);
        if (supaUser?.user) {
          const email = supaUser.user.email || '';
          const uName = username || email.split('@')[0] || supaUser.user.id;
          const fullName = supaUser.user.user_metadata?.full_name || uName;
          user = await prisma.user.upsert({
            where: { id: userId },
            update: {},
            create: { id: userId, username: uName, displayName: fullName }
          });
        }
      } catch {}
    }

    if (!user) return res.status(404).json({ error: "User not found" });

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return res.status(404).json({ error: "Role not found" });

    const assignment = await prisma.roleAssignment.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleId } },
      update: {},
      create: { userId: user.id, roleId: roleId },
      include: { user: true, role: true }
    });

    await writeAdminAuditLog(req.user!.id, "ADD_ROLE_MEMBER", {
      userId: user.id,
      username: user.username,
      roleId: role.id,
      roleName: role.name,
      domain: role.domain
    });

    res.json({ assignment });
  } catch (error: any) {
    console.error("Admin member add error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/roles/:id/members/:userId
router.delete("/roles/:id/members/:userId", async (req: Request, res: Response) => {
  const roleId = req.params.id;
  const userId = req.params.userId;

  try {
    await prisma.roleAssignment.deleteMany({
      where: {
        userId,
        roleId
      }
    });

    await writeAdminAuditLog(req.user!.id, "REMOVE_ROLE_MEMBER", {
      userId,
      roleId
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Admin delete member error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/admin/roles/:id — update role escalation time or ordering
router.patch("/roles/:id", async (req: Request, res: Response) => {
  const { escalationMinutes, order, name } = req.body;
  try {
    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: {
        ...(escalationMinutes !== undefined ? { escalationMinutes: Number(escalationMinutes) } : {}),
        ...(order !== undefined ? { order: Number(order) } : {}),
        ...(name ? { name } : {})
      }
    });

    await writeAdminAuditLog(req.user!.id, "UPDATE_ROLE_CONFIG", {
      roleId: role.id,
      roleName: role.name,
      domain: role.domain,
      escalationMinutes,
      order
    });

    res.json({ role });
  } catch (error) {
    console.error("Admin update role error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/workflows — view workflow stage ordering + escalation timers
router.get("/workflows", async (req: Request, res: Response) => {
  try {
    const workflows = await prisma.workflowDefinition.findMany({
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: { 
            role: {
              include: {
                assignments: {
                  include: { user: true }
                }
              }
            }
          }
        }
      }
    });
    res.json({ workflows });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/severity-rules — list severity rules
router.get("/severity-rules", async (req: Request, res: Response) => {
  try {
    const rules = await prisma.severityRule.findMany({
      orderBy: [{ domain: 'asc' }, { keyword: 'asc' }]
    });
    res.json({ rules });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/severity-rules — configure keyword→tier mapping
router.post("/severity-rules", async (req: Request, res: Response) => {
  const { domain, keyword, tier, severity, escalationCadenceMinutes } = req.body;
  const targetSeverity = severity || tier;
  
  if (!domain || !keyword || !targetSeverity) {
    return res.status(400).json({ error: "Missing required fields: domain, keyword, severity/tier" });
  }

  try {
    let rule = await prisma.severityRule.findFirst({
      where: { domain, keyword }
    });
    if (rule) {
      rule = await prisma.severityRule.update({
        where: { id: rule.id },
        data: { 
          severity: targetSeverity,
          ...(escalationCadenceMinutes !== undefined ? { escalationCadenceMinutes: Number(escalationCadenceMinutes) } : {})
        }
      });
    } else {
      rule = await prisma.severityRule.create({
        data: { 
          domain, 
          keyword, 
          severity: targetSeverity, 
          escalationCadenceMinutes: escalationCadenceMinutes ? Number(escalationCadenceMinutes) : 60 
        }
      });
    }

    await writeAdminAuditLog(req.user!.id, "UPDATE_SEVERITY_RULE", {
      domain,
      keyword,
      severity: targetSeverity,
      escalationCadenceMinutes
    });

    res.json({ rule });
  } catch (error) {
    console.error("Admin severity rule error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/severity-rules/:id — delete severity rule
router.delete("/severity-rules/:id", async (req: Request, res: Response) => {
  try {
    const rule = await prisma.severityRule.delete({
      where: { id: req.params.id }
    });

    await writeAdminAuditLog(req.user!.id, "DELETE_SEVERITY_RULE", {
      ruleId: rule.id,
      domain: rule.domain,
      keyword: rule.keyword
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Admin delete severity rule error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/audit — view system admin audit logs
router.get("/audit", async (req: Request, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/admin/audit/:ticketId — full audit trail for a ticket
router.get("/audit/:ticketId", async (req: Request, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { ticketId: req.params.ticketId },
      orderBy: { createdAt: 'asc' }
    });
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

