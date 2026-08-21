import { prisma } from './prisma';

async function main() {
  const jobs = await prisma.$queryRaw`SELECT id, name, state, data FROM pgboss.job WHERE name = 'escalation-check'`;
  console.log("ALL JOBS:");
  console.log(JSON.stringify(jobs, null, 2));
}

main().finally(() => prisma.$disconnect());
