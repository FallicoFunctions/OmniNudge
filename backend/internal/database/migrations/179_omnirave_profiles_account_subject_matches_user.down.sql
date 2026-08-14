-- Drop the constraint. No rows change: it only ever refused writes, so
-- everything that exists already satisfies it.

ALTER TABLE omnirave_profiles
    DROP CONSTRAINT IF EXISTS omnirave_profiles_account_subject_is_user;
