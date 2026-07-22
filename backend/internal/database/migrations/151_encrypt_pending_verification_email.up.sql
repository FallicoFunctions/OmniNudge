ALTER TABLE email_verifications
    ADD COLUMN email_encrypted BOOLEAN NOT NULL DEFAULT FALSE;
