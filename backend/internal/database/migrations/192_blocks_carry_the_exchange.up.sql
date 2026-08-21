-- A block records her account of what happened. The review exists to judge
-- whether that account was fair, and it cannot do that from her side of it
-- alone -- it needs the messages she was reacting to.
--
-- Snapshotted rather than joined to the live conversation, for the same reason
-- omnichat_response_feedback stores its response: messages get edited, and
-- deleting the account cascades them away, so a join would show the reviewer
-- something other than what she saw, or nothing at all. The evidence has to
-- survive the thing it is evidence about.
--
-- Bounded to what she could see. Anything older than her context window
-- provably did not influence the decision, and anything less would have the
-- reviewer judging on a fragment -- missing the "I already said no" three turns
-- back that makes the block fair.
ALTER TABLE omnichat_persona_user_blocks
    ADD COLUMN IF NOT EXISTS transcript_snapshot JSONB;
