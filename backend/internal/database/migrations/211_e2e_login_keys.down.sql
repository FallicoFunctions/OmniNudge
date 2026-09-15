ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_scheme_check;
ALTER TABLE users
    DROP COLUMN IF EXISTS recovery_wrapped_private_key,
    DROP COLUMN IF EXISTS kdf_iterations,
    DROP COLUMN IF EXISTS kdf_salt,
    DROP COLUMN IF EXISTS auth_scheme;
