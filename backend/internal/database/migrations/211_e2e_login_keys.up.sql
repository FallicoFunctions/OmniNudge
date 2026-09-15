-- The app turns the password into two keys: a login key it sends, and a key
-- that unwraps the user's private key and never leaves the device. With
-- auth_scheme 2 the server stores only a hash of the login key, so nothing it
-- holds opens the private key. auth_scheme 1 is the old flow, where the server
-- receives the password itself; accounts move off it at their next sign-in.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS auth_scheme SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS kdf_salt TEXT,
    ADD COLUMN IF NOT EXISTS kdf_iterations INTEGER,
    ADD COLUMN IF NOT EXISTS recovery_wrapped_private_key TEXT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_scheme_check;
ALTER TABLE users ADD CONSTRAINT users_auth_scheme_check CHECK (
    auth_scheme = 1
    OR (auth_scheme = 2 AND kdf_salt IS NOT NULL AND kdf_iterations >= 600000)
);
