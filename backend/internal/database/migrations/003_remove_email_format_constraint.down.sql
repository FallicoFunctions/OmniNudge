-- Re-add email_format check constraint (note: this will fail if there are encrypted emails in the database)
ALTER TABLE users ADD CONSTRAINT email_format
CHECK (email IS NULL OR email::text ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text);
