-- Remove email_format check constraint
-- This constraint was checking encrypted email values against a plaintext email regex,
-- which always fails. Email validation should happen in application code before encryption.
ALTER TABLE users DROP CONSTRAINT IF EXISTS email_format;
