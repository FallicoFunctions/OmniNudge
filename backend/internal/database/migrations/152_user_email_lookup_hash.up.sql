-- Keyed blind index populated by the application after migrations. This keeps
-- randomized email ciphertext while allowing indexed equality lookups.
ALTER TABLE users
    ADD COLUMN email_lookup_hash VARCHAR(64);

CREATE UNIQUE INDEX idx_users_email_lookup_hash
    ON users(email_lookup_hash)
    WHERE email_lookup_hash IS NOT NULL AND deleted = FALSE;
