-- Make the rollback's assumption about account rows structural.
--
-- Migration 178 requires that an account row names a user, but nothing
-- requires that the user it names is the subject it is keyed on. So two
-- account rows could hold the same user_id under different subject_ids, both
-- perfectly legal, and the 178 rollback would then fail rebuilding
-- PRIMARY KEY (user_id) -- after it has already dropped the old key, leaving
-- the table with no key at all until somebody works out which row to delete.
--
-- Its down migration says as much: account rows always carried their user id,
-- so restoring the old key is restoring it over the same values rather than
-- reconstructing them. That sentence was true of every row that existed when
-- it was written and was not enforced anywhere. This writes it down where the
-- database can hold it, so it stays true of rows written afterwards.
--
-- 178 is left alone; it has been applied. A constraint that should have been
-- part of it is added as its own migration rather than edited into it.

ALTER TABLE omnirave_profiles
    DROP CONSTRAINT IF EXISTS omnirave_profiles_account_subject_is_user;
ALTER TABLE omnirave_profiles
    ADD CONSTRAINT omnirave_profiles_account_subject_is_user
        CHECK (subject_kind <> 'account' OR subject_id = user_id);
