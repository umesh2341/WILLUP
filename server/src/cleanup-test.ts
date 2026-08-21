import dotenv from "dotenv";
dotenv.config();
import { prisma } from "./prisma";

(async () => {
  const user = await prisma.user.findUnique({ where: { username: "student_test_e2e" } });
  if (!user) { console.log("No user found"); await prisma.$disconnect(); return; }
  
  const tickets = await prisma.ticket.findMany({ where: { studentId: user.id }, select: { id: true } });
  for (const t of tickets) {
    await prisma.auditLog.deleteMany({ where: { ticketId: t.id } });
    await prisma.approval.deleteMany({ where: { ticketId: t.id } });
    await prisma.document.deleteMany({ where: { ticketId: t.id } });
  }
  const deleted = await prisma.ticket.deleteMany({ where: { studentId: user.id } });
  console.log("Deleted", deleted.count, "test tickets");
  await prisma.$disconnect();
})();
