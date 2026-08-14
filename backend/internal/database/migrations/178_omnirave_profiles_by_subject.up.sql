-- Key an OmniRave profile on a resident rather than on a user.
--
-- omnirave_profiles has user_id BIGINT PRIMARY KEY, so every row must name a
-- user. A persona has no user id, which means the table cannot hold one at all:
-- there is nowhere to put a persona's loadout, last venue or return point.
--
-- The existing rows are account residents. A persona resident is the same shape
-- with a different subject, so the key becomes (subject_kind, subject_id) and
-- the old key becomes one case of it.
--
-- This expands rather than replaces. user_id stays, still carrying the same
-- values for account rows, so every query written against it keeps working and
-- this migration cannot break a running deployment. Removing it is a later,
-- separate step once nothing reads it.

ALTER TABLE omnirave_profiles
    ADD COLUMN IF NOT EXISTS subject_kind TEXT NOT NULL DEFAULT 'account',
    ADD COLUMN IF NOT EXISTS subject_id BIGINT;

-- Every row that exists today is an account resident keyed by its user.
UPDATE omnirave_profiles
SET subject_id = user_id
WHERE subject_id IS NULL;

ALTER TABLE omnirave_profiles
    ALTER COLUMN subject_id SET NOT NULL;

-- The same three kinds the identity layer knows. A kind outside this set is
-- refused by the database rather than trusted from a caller.
ALTER TABLE omnirave_profiles
    DROP CONSTRAINT IF EXISTS omnirave_profiles_subject_kind_check;
ALTER TABLE omnirave_profiles
    ADD CONSTRAINT omnirave_profiles_subject_kind_check
        CHECK (subject_kind IN ('account', 'guest', 'persona'));

-- Make room for subjects that are not users. Dropping the primary key is what
-- lets user_id be null on a persona row; the new key below is what keeps every
-- resident unique, so the table is never without one.
ALTER TABLE omnirave_profiles
    DROP CONSTRAINT IF EXISTS omnirave_profiles_pkey;

ALTER TABLE omnirave_profiles
    ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE omnirave_profiles
    ADD CONSTRAINT omnirave_profiles_pkey PRIMARY KEY (subject_kind, subject_id);

-- An account resident still has to name its user. Without this, dropping the
-- NOT NULL above would quietly permit an account profile belonging to nobody,
-- which is the sort of row that is only discovered when something reads it.
ALTER TABLE omnirave_profiles
    DROP CONSTRAINT IF EXISTS omnirave_profiles_account_has_user;
ALTER TABLE omnirave_profiles
    ADD CONSTRAINT omnirave_profiles_account_has_user
        CHECK (subject_kind <> 'account' OR user_id IS NOT NULL);

-- Reads keyed on user_id are still served by an index rather than a scan, now
-- that the primary key no longer covers that column on its own.
CREATE INDEX IF NOT EXISTS idx_omnirave_profiles_user_id
    ON omnirave_profiles (user_id)
    WHERE user_id IS NOT NULL;
