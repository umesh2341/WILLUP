/**
 * seed.ts — Seeds Roles, WorkflowDefinitions, WorkflowStages, SeverityRules,
 *           and a test admin user needed for the full Prompt 16 verification.
 *
 * Run: npx tsx src/seed.ts
 */
import dotenv from "dotenv";
dotenv.config();
import { prisma } from "./prisma";
import { v4 as uuidv4 } from "uuid";
import { Domain } from "@prisma/client";

async function main() {
  console.log("=== Seeding database ===\n");

  // ── 1. Roles ──────────────────────────────────────────────────────────────
  const roleDefs = [
    { name: "Caretaker",          domain: Domain.HOSTEL_MAINTENANCE, order: 1 },
    { name: "Warden",             domain: Domain.HOSTEL_MAINTENANCE, order: 2 },
    { name: "Superintendent",     domain: Domain.HOSTEL_MAINTENANCE, order: 3 },
    { name: "Maintenance Staff",  domain: Domain.HOSTEL_MAINTENANCE, order: 4 },
    { name: "HOD",                domain: Domain.LABORATORY,         order: 2 },
    { name: "Lab Technician",     domain: Domain.LABORATORY,         order: 1 },
    { name: "Registrar",          domain: Domain.CERTIFICATE,        order: 1 },
    { name: "Dean Students",      domain: Domain.GRIEVANCE,          order: 1 },
    { name: "System Admin",       domain: Domain.GRIEVANCE,          order: 0 },
  ];

  const roleMap: Record<string, string> = {};

  for (const r of roleDefs) {
    const existing = await prisma.role.findFirst({ where: { name: r.name, domain: r.domain } });
    if (existing) {
      roleMap[r.name] = existing.id;
      console.log(`  Role already exists: ${r.name} (${existing.id})`);
    } else {
      const created = await prisma.role.create({ data: { id: uuidv4(), ...r } });
      roleMap[r.name] = created.id;
      console.log(`  Created role: ${r.name} → ${created.id}`);
    }
  }

  // ── 2. WorkflowDefinitions + Stages ───────────────────────────────────────
  const workflows = [
    {
      domain: Domain.HOSTEL_MAINTENANCE,
      stages: [
        { order: 0, role: "Caretaker",          escalationMinutes: 1 },
        { order: 1, role: "Warden",             escalationMinutes: 60 },
        { order: 2, role: "Superintendent",     escalationMinutes: 120 },
      ]
    },
    {
      domain: Domain.LABORATORY,
      stages: [
        { order: 0, role: "Lab Technician",     escalationMinutes: 60 },
        { order: 1, role: "HOD",                escalationMinutes: 240 },
      ]
    },
    {
      domain: Domain.CERTIFICATE,
      stages: [
        { order: 0, role: "Registrar",          escalationMinutes: 120 },
      ]
    },
    {
      domain: Domain.GRIEVANCE,
      stages: [
        { order: 0, role: "Dean Students",      escalationMinutes: 60 },
      ]
    },
  ];

  for (const wf of workflows) {
    let wfDef = await prisma.workflowDefinition.findUnique({ where: { domain: wf.domain } });
    if (!wfDef) {
      wfDef = await prisma.workflowDefinition.create({ data: { id: uuidv4(), domain: wf.domain } });
      console.log(`  Created WorkflowDefinition for ${wf.domain}`);
    } else {
      console.log(`  WorkflowDefinition already exists for ${wf.domain}`);
      // Clear existing stages for clean re-seed
      await prisma.workflowStage.deleteMany({ where: { workflowDefinitionId: wfDef.id } });
    }

    for (const stage of wf.stages) {
      const roleId = roleMap[stage.role];
      if (!roleId) { console.warn(`    ⚠ Role "${stage.role}" not found in roleMap — skipping`); continue; }

      const existing = await prisma.workflowStage.findFirst({
        where: { workflowDefinitionId: wfDef.id, order: stage.order }
      });
      if (!existing) {
        await prisma.workflowStage.create({
          data: {
            id: uuidv4(),
            workflowDefinitionId: wfDef.id,
            roleId,
            order: stage.order
          }
        });
        console.log(`    Created stage ${stage.order}: ${stage.role}`);
      } else {
        console.log(`    Stage ${stage.order} already exists`);
      }
    }
  }

  // ── 3. SeverityRules ──────────────────────────────────────────────────────
  const severityRules = [
    { domain: Domain.HOSTEL_MAINTENANCE, keyword: "flood",    tier: 3, severity: "CRITICAL" },
    { domain: Domain.HOSTEL_MAINTENANCE, keyword: "fire",     tier: 3, severity: "CRITICAL" },
    { domain: Domain.HOSTEL_MAINTENANCE, keyword: "broken",   tier: 2, severity: "MEDIUM" },
    { domain: Domain.HOSTEL_MAINTENANCE, keyword: "fan",      tier: 1, severity: "LOW" },
    { domain: Domain.GRIEVANCE,          keyword: "ragging",  tier: 3, severity: "CRITICAL" },
    { domain: Domain.GRIEVANCE,          keyword: "harass",   tier: 3, severity: "CRITICAL" },
  ];

  for (const rule of severityRules) {
    try {
      const existing = await prisma.severityRule.findFirst({
        where: { domain: rule.domain, keyword: rule.keyword }
      });
      if (!existing) {
        await prisma.severityRule.create({
          data: { id: uuidv4(), domain: rule.domain, keyword: rule.keyword, severity: rule.severity as any, escalationCadenceMinutes: 60 }
        });
        console.log(`  Created SeverityRule: [${rule.domain}] ${rule.keyword}`);
      } else {
        console.log(`  SeverityRule already exists: [${rule.domain}] ${rule.keyword}`);
      }
    } catch (e: any) {
      console.warn(`  SeverityRule create skipped: ${e.message?.slice(0, 80)}`);
    }
  }

  // ── 4. Admin user + RoleAssignment ────────────────────────────────────────
  const adminUsername = "admin_test_e2e";
  let admin = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (!admin) {
    admin = await prisma.user.create({
      data: { id: uuidv4(), username: adminUsername, displayName: "Test Admin" }
    });
    console.log(`\n  Created admin user: ${admin.username} (${admin.id})`);
  } else {
    console.log(`\n  Admin user already exists: ${admin.username} (${admin.id})`);
  }

  // Assign admin the System Admin + Warden roles
  for (const roleName of ["System Admin", "Warden"]) {
    const roleId = roleMap[roleName];
    if (!roleId) continue;
    const existing = await prisma.roleAssignment.findFirst({ where: { userId: admin.id, roleId } });
    if (!existing) {
      await prisma.roleAssignment.create({ data: { id: uuidv4(), userId: admin.id, roleId } });
      console.log(`  Assigned ${roleName} to admin_test_e2e`);
    } else {
      console.log(`  Admin already has role: ${roleName}`);
    }
  }

  console.log("\n=== Seed complete ===");
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
