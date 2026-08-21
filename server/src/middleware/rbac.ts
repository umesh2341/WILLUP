import { Request, Response, NextFunction } from "express";
import { prisma } from "../prisma";

export function requireRole(allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Query role assignments for the current user
      const assignments = await prisma.roleAssignment.findMany({
        where: { userId: user.id },
        include: { role: true },
      });

      const userRoles = assignments.map((a) => a.role.name);

      const hasRole = userRoles.some((roleName) => allowedRoles.includes(roleName));
      if (!hasRole) {
        return res.status(403).json({ error: "Forbidden: Insufficient permissions" });
      }

      next();
    } catch (error) {
      console.error("RBAC middleware error:", error);
      return res.status(500).json({ error: "Internal server error during authorization check" });
    }
  };
}
