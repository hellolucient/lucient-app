-- Update RLS policies for shared knowledge base
-- All authenticated users can read all documents (shared knowledge base)
-- Only admins can insert/update/delete documents

-- Drop the old SELECT policy that restricted users to their own documents
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;

-- Create new SELECT policy: All authenticated users can read all documents
CREATE POLICY "All authenticated users can view all documents" ON public.documents
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Drop the old INSERT policy
DROP POLICY IF EXISTS "Users can insert own documents" ON public.documents;

-- Create new INSERT policy: Only admins can insert documents
CREATE POLICY "Only admins can insert documents" ON public.documents
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.user_tier = 'admin'
        )
    );

-- Drop the old UPDATE policy
DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;

-- Create new UPDATE policy: Only admins can update documents
CREATE POLICY "Only admins can update documents" ON public.documents
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.user_tier = 'admin'
        )
    );

-- Drop the old DELETE policy
DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;

-- Create new DELETE policy: Only admins can delete documents
CREATE POLICY "Only admins can delete documents" ON public.documents
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.user_tier = 'admin'
        )
    );

