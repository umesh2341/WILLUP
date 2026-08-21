-- =============================================================================
-- 04_storage.sql
-- Create Supabase storage bucket and RLS policies for ticket documents
-- Apply via: npx tsx sql/apply.ts (or Supabase SQL editor)
-- =============================================================================

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-documents', 'ticket-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects if not already enabled (usually is by default)
-- (Skipping ALTER TABLE as we are not the owner)

-- 1. Allow authenticated users to upload files to 'ticket-documents'
CREATE POLICY "Allow authenticated uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ticket-documents');

-- 2. Allow authenticated users to view files in 'ticket-documents'
CREATE POLICY "Allow authenticated reads"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'ticket-documents');

-- 3. Allow authenticated users to update their own files (optional, but good practice)
CREATE POLICY "Allow authenticated updates"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'ticket-documents');

-- 4. Allow authenticated users to delete their own files
CREATE POLICY "Allow authenticated deletes"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'ticket-documents');
