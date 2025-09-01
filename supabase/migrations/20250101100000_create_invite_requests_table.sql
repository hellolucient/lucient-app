-- Create invite_requests table
CREATE TABLE IF NOT EXISTS invite_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_invite_requests_email ON invite_requests(email);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_invite_requests_status ON invite_requests(status);

-- Create index on created_at for ordering
CREATE INDEX IF NOT EXISTS idx_invite_requests_created_at ON invite_requests(created_at);

-- Add RLS (Row Level Security) policies
ALTER TABLE invite_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read all invite requests
CREATE POLICY "Admins can read all invite requests" ON invite_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.user_tier = 'admin'
        )
    );

-- Policy: Anyone can insert invite requests (for the public form)
CREATE POLICY "Anyone can insert invite requests" ON invite_requests
    FOR INSERT WITH CHECK (true);

-- Policy: Only admins can update invite requests
CREATE POLICY "Admins can update invite requests" ON invite_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.user_tier = 'admin'
        )
    );

-- Policy: Only admins can delete invite requests
CREATE POLICY "Admins can delete invite requests" ON invite_requests
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.user_tier = 'admin'
        )
    );
