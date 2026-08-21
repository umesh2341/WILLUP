import dotenv from "dotenv";
dotenv.config();
import { prisma } from "./prisma";

(async () => {
  const wf = await prisma.workflowDefinition.findMany({ include: { stages: { include: { role: true } } } });
  console.log("Workflows:", JSON.stringify(wf, null, 2));
  const roles = await prisma.role.findMany();
  console.log("Roles:", JSON.stringify(roles, null, 2));
  await prisma.$disconnect();
})();
