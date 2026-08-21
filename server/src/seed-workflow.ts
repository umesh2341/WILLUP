import { PrismaClient, Domain } from "@prisma/client";
import { prisma } from "./prisma";

async function main() {
  console.log("Seeding Workflow Chain for Hostel Maintenance...");

  // 1. Create Roles
  const caretaker = await prisma.role.upsert({
    where: { id: "role-caretaker" },
    update: { escalationMinutes: 60 }, // 1 hour (medium cadence)
    create: { id: "role-caretaker", name: "Caretaker", domain: Domain.HOSTEL_MAINTENANCE, order: 0, escalationMinutes: 60 }
  });

  const warden = await prisma.role.upsert({
    where: { id: "role-warden" },
    update: { escalationMinutes: 1440 }, // 24 hours (low cadence)
    create: { id: "role-warden", name: "Warden", domain: Domain.HOSTEL_MAINTENANCE, order: 1, escalationMinutes: 1440 }
  });

  const superintendent = await prisma.role.upsert({
    where: { id: "role-superintendent" },
    update: { escalationMinutes: 4320 }, // 3 days (end of chain, long timeout before marked stuck)
    create: { id: "role-superintendent", name: "Superintendent", domain: Domain.HOSTEL_MAINTENANCE, order: 2, escalationMinutes: 4320 }
  });

  // 2. Create Workflow Definition
  const wfDef = await prisma.workflowDefinition.upsert({
    where: { domain: Domain.HOSTEL_MAINTENANCE },
    update: {},
    create: {
      domain: Domain.HOSTEL_MAINTENANCE
    }
  });

  // 3. Create Workflow Stages (Clear existing stages to prevent duplication on multiple runs)
  await prisma.workflowStage.deleteMany({
    where: { workflowDefinitionId: wfDef.id }
  });

  await prisma.workflowStage.createMany({
    data: [
      { workflowDefinitionId: wfDef.id, roleId: caretaker.id, order: 0 },
      { workflowDefinitionId: wfDef.id, roleId: warden.id, order: 1, redirectIfSubjectIsRole: "Warden" },
      { workflowDefinitionId: wfDef.id, roleId: superintendent.id, order: 2 }
    ]
  });

  console.log("Workflow seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
