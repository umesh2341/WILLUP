import { prisma } from "./src/prisma";

async function applyRLS() {
  console.log("Applying RLS to Ticket table...");
  
  await prisma.$executeRawUnsafe(`ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;`);
  
  try {
    await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "ticket_select_policy" ON "Ticket";`);
  } catch(e){}

  await prisma.$executeRawUnsafe(`
    CREATE POLICY "ticket_select_policy" ON "Ticket"
    FOR SELECT
    USING (
      "studentId" = auth.uid()::text
      OR
      EXISTS (
        SELECT 1 FROM "RoleAssignment" ra
        JOIN "Role" r ON r.id = ra."roleId"
        WHERE ra."userId" = auth.uid()::text AND r.name = "Ticket"."currentNodeKey"
      )
    );
  `);
  
  await prisma.$executeRawUnsafe(`GRANT SELECT ON "Ticket" TO authenticated, anon;`);
  console.log("RLS applied successfully.");
  await prisma.$disconnect();
}

applyRLS().catch(console.error);
