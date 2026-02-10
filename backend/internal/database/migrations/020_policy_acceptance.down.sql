-- Remove policy acceptance tracking
ALTER TABLE users DROP COLUMN IF EXISTS privacy_policy_version;
ALTER TABLE users DROP COLUMN IF EXISTS terms_of_service_version;
ALTER TABLE users DROP COLUMN IF EXISTS privacy_accepted_at;
ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_at;

DROP TABLE IF EXISTS policy_acceptances;
