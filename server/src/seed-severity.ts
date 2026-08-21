import { PrismaClient, Domain, Severity } from "@prisma/client";
import { prisma } from "./prisma";

async function main() {
  console.log("Seeding Severity Rules...");

  const rules = [
    {
      domain: Domain.HOSTEL_MAINTENANCE,
      keyword: "electrical",
      severity: Severity.MEDIUM,
      escalationCadenceMinutes: 60
    },
    {
      domain: Domain.HOSTEL_MAINTENANCE,
      keyword: "health-safety",
      severity: Severity.CRITICAL,
      escalationCadenceMinutes: 0
    },
    {
      domain: Domain.HOSTEL_MAINTENANCE,
      keyword: "wifi",
      severity: Severity.LOW,
      escalationCadenceMinutes: 1440
    },
    {
      domain: Domain.GRIEVANCE,
      keyword: "harassment",
      severity: Severity.CRITICAL,
      escalationCadenceMinutes: 0
    }
  ];

  for (const rule of rules) {
    // Upsert based on domain and keyword to avoid duplicates if run multiple times
    const existing = await prisma.severityRule.findFirst({
      where: { domain: rule.domain, keyword: rule.keyword }
    });

    if (existing) {
      await prisma.severityRule.update({
        where: { id: existing.id },
        data: rule
      });
      console.log(`Updated rule: ${rule.domain} - ${rule.keyword}`);
    } else {
      await prisma.severityRule.create({
        data: rule
      });
      console.log(`Created rule: ${rule.domain} - ${rule.keyword}`);
    }
  }

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
