-- Restore the user-keyed profile table.
--
-- Rolling back cannot keep residents that are not users: the restored key is
-- user_id, and a persona row has none. Those rows are deleted rather than left
-- to break the primary key. That is a real loss of a persona's loadout and
-- return point, and it is the honest consequence of rolling back past the
-- migration that made room for them -- the alternative is a rollback that
-- fails halfway and leaves the table without a key at all.

DELETE FROM omnirave_profiles
WHERE subject_kind <> 'account';

ALTER TABLE omnirave_profiles
    DROP CONSTRAINT IF EXISTS omnirave_profiles_account_has_user;

DROP INDEX IF EXISTS idx_omnirave_profiles_user_id;

ALTER TABLE omnirave_profiles
    DROP CONSTRAINT IF EXISTS omnirave_profiles_pkey;

-- Account rows always carried their user id, so this is restoring the old key
-- over the same values rather than reconstructing it.
UPDATE omnirave_profiles
SET user_id = subject_id
WHERE user_id IS NULL;

DELETE FROM omnirave_profiles
WHERE user_id IS NULL;

ALTER TABLE omnirave_profiles
    ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE omnirave_profiles
    ADD CONSTRAINT omnirave_profiles_pkey PRIMARY KEY (user_id);

ALTER TABLE omnirave_profiles
    DROP CONSTRAINT IF EXISTS omnirave_profiles_subject_kind_check;

ALTER TABLE omnirave_profiles
    DROP COLUMN IF EXISTS subject_id,
    DROP COLUMN IF EXISTS subject_kind;
