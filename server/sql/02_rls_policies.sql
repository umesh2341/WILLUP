-- =============================================================================
-- 02_rls_policies.sql
-- Row-Level Security policies for Ticket, Approval, Notification
--
-- Apply via: Supabase SQL editor OR psql against DIRECT_URL
-- Separate from Prisma migrations because policies reference auth.uid()
-- which only exists in Supabase's auth schema, not in Prisma's shadow DB.
-- Re-running this file is safe: DROP POLICY IF EXISTS handles idempotency.
-- =============================================================================

-- ---------- Ticket ----------

ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_ticket_policy ON "Ticket";
CREATE POLICY select_ticket_policy ON "Ticket"
FOR SELECT USING (
  "studentId" = auth.uid()::text
  OR EXISTS (
    SELECT 1
    FROM "WorkflowStage" ws
    JOIN "RoleAssignment" ra ON ra."roleId" = ws."roleId"
    WHERE ws.id = "Ticket"."currentStageId"
      AND ra."userId" = auth.uid()::text
  )
);

DROP POLICY IF EXISTS insert_ticket_policy ON "Ticket";
CREATE POLICY insert_ticket_policy ON "Ticket"
FOR INSERT WITH CHECK ("studentId" = auth.uid()::text);

DROP POLICY IF EXISTS update_ticket_policy ON "Ticket";
CREATE POLICY update_ticket_policy ON "Ticket"
FOR UPDATE USING ("studentId" = auth.uid()::text);

DROP POLICY IF EXISTS delete_ticket_policy ON "Ticket";
CREATE POLICY delete_ticket_policy ON "Ticket"
FOR DELETE USING ("studentId" = auth.uid()::text);

-- ---------- Approval ----------

ALTER TABLE "Approval" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_approval_policy ON "Approval";
CREATE POLICY select_approval_policy ON "Approval"
FOR SELECT USING (
  "approvedById" = auth.uid()::text
  OR EXISTS (
    SELECT 1 FROM "Ticket" t
    WHERE t.id = "Approval"."ticketId"
      AND (
        t."studentId" = auth.uid()::text
        OR EXISTS (
          SELECT 1 FROM "WorkflowStage" ws
          JOIN "RoleAssignment" ra ON ra."roleId" = ws."roleId"
          WHERE ws.id = t."currentStageId"
            AND ra."userId" = auth.uid()::text
        )
      )
  )
);

DROP POLICY IF EXISTS insert_approval_policy ON "Approval";
CREATE POLICY insert_approval_policy ON "Approval"
FOR INSERT WITH CHECK ("approvedById" = auth.uid()::text);

DROP POLICY IF EXISTS update_approval_policy ON "Approval";
CREATE POLICY update_approval_policy ON "Approval"
FOR UPDATE USING ("approvedById" = auth.uid()::text);

-- ---------- Notification ----------

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_notification_policy ON "Notification";
CREATE POLICY select_notification_policy ON "Notification"
FOR SELECT USING ("userId" = auth.uid()::text);

DROP POLICY IF EXISTS update_notification_policy ON "Notification";
CREATE POLICY update_notification_policy ON "Notification"
FOR UPDATE USING ("userId" = auth.uid()::text);
