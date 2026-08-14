-- A withdrawal cannot carry an expiry.
--
-- 180 closed the action set in the database, and said why: an operator's typo
-- would otherwise write a sanction that no reader recognises and that
-- therefore silently does nothing. The same hazard survived one column over.
-- Nothing stopped ('withdrawn', expires_at = <a time>), and the most natural
-- way to write "withdraw this character, effective now" is exactly that:
--
--     INSERT INTO omnirave_persona_sanctions (persona_id, action, expires_at)
--     VALUES (7, 'withdrawn', now());
--
-- That row is inert the moment it lands. Admission tests expires_at > now(),
-- so a sanction that expired on arrival matches nothing and the character
-- stays admissible -- while the table shows a withdrawal that reads, to
-- anybody looking, as in force. A sanction nobody can see failing is worse
-- than no sanction at all, because it is the one nobody goes back to check.
--
-- Withdrawal is the indefinite case by nature: it is the platform saying this
-- character is finished, not that it is out until Tuesday. A suspension is the
-- one that names a time it lapses, and it keeps that ability untouched.

-- Any existing withdrawal with an expiry is one of these mistakes -- an
-- expired one has been doing nothing, and a future one was going to stop. The
-- action is the decision that was actually made; the expiry is the part that
-- did not mean what it looked like. Keep the decision, drop the expiry.
UPDATE omnirave_persona_sanctions
SET expires_at = NULL
WHERE action = 'withdrawn' AND expires_at IS NOT NULL;

ALTER TABLE omnirave_persona_sanctions
    DROP CONSTRAINT IF EXISTS omnirave_persona_sanctions_withdrawn_indefinite_check;
ALTER TABLE omnirave_persona_sanctions
    ADD CONSTRAINT omnirave_persona_sanctions_withdrawn_indefinite_check
        CHECK (action <> 'withdrawn' OR expires_at IS NULL);
