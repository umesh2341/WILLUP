import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../prisma";

const router = Router();

// GET /api/users/me — fetch current authenticated user profile & role assignments
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roleAssignments: {
          include: {
            role: true
          }
        }
      }
    });

    if (!user) {
      return res.json({
        user: { id: userId },
        roles: [],
        roleAssignments: []
      });
    }

    const roles = user.roleAssignments.map(ra => ra.role);
    return res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
      roles,
      roleAssignments: user.roleAssignments
    });
  } catch (err: any) {
    console.error("Error fetching user profile:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
