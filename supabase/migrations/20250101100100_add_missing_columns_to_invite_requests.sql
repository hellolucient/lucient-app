-- Add missing columns to invite_requests table
ALTER TABLE invite_requests 
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Add constraints
ALTER TABLE invite_requests 
ALTER COLUMN first_name SET NOT NULL,
ALTER COLUMN last_name SET NOT NULL,
ALTER COLUMN email SET NOT NULL,
ALTER COLUMN status SET NOT NULL;

-- Add unique constraint on email
ALTER TABLE invite_requests 
ADD CONSTRAINT invite_requests_email_unique UNIQUE (email);

-- Add check constraint on status
ALTER TABLE invite_requests 
ADD CONSTRAINT invite_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected'));

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_invite_requests_email ON invite_requests(email);
CREATE INDEX IF NOT EXISTS idx_invite_requests_status ON invite_requests(status);
CREATE INDEX IF NOT EXISTS idx_invite_requests_created_at ON invite_requests(created_at);
