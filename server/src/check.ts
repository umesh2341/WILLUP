import { prisma } from './prisma';

async function main() {
  const tickets = await prisma.ticket.findMany({
    where: { studentId: 'test-student-esc-123' },
    include: { auditLogs: true }
  });
  console.log("ESCALATION TICKETS:");
  console.log(JSON.stringify(tickets, null, 2));

  // Let's also check if there are any jobs in pg-boss
  // Note: we can't easily query pgboss.job via Prisma without raw queries, 
  // but we can just use raw query.
  try {
    const jobs = await prisma.$queryRaw`SELECT id, name, state, startAfter FROM pgboss.job WHERE name = 'escalation-check'`;
    console.log("PG-BOSS JOBS:");
    console.log(jobs);
  } catch(e) {
    console.log("No pgboss jobs table or query failed");
  }
}

main().finally(() => prisma.$disconnect());
