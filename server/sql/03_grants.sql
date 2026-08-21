-- =============================================================================
-- 03_grants.sql
-- Grant minimal privileges to Supabase's anon and authenticated roles
-- so that supabase-js client queries can reach the public schema.
--
-- RLS policies still control WHICH rows each JWT can see.
-- Apply via: npx tsx sql/apply.ts  (or Supabase SQL editor)
-- =============================================================================

-- Allow both roles to use the public schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant per-table access. RLS policies narrow this further.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."User"              TO authenticated;
GRANT SELECT                          ON TABLE public."User"              TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."Ticket"            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."Approval"          TO authenticated;
GRANT SELECT, UPDATE                 ON TABLE public."Notification"       TO authenticated;

GRANT SELECT ON TABLE public."Role"               TO authenticated, anon;
GRANT SELECT ON TABLE public."RoleAssignment"     TO authenticated;
GRANT SELECT ON TABLE public."WorkflowDefinition" TO authenticated;
GRANT SELECT ON TABLE public."WorkflowStage"      TO authenticated;
GRANT SELECT ON TABLE public."CollectiveGroup"    TO authenticated;
GRANT SELECT ON TABLE public."AuditLog"           TO authenticated;
GRANT SELECT ON TABLE public."Document"           TO authenticated;
GRANT SELECT ON TABLE public."KnowledgeDocument"  TO authenticated, anon;
GRANT SELECT ON TABLE public."KnowledgeChunk"     TO authenticated, anon;
GRANT SELECT ON TABLE public."SeverityRule"       TO authenticated;

-- Admin-only tables (no direct client access)
-- KnowledgeDocument INSERT/UPDATE/DELETE done via service-role only
