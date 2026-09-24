-- Older group key versions, wrapped by the inviter for the person invited, so
-- a group that shows its history is readable the moment the invite is
-- accepted. The server cannot make these copies itself; the inviter's device
-- holds the keys at the moment it sends the invite.
CREATE TABLE IF NOT EXISTS group_invite_key_copies (
    invite_id    INTEGER NOT NULL REFERENCES group_invites(id) ON DELETE CASCADE,
    key_version  INTEGER NOT NULL,
    wrapped_key  TEXT    NOT NULL,
    PRIMARY KEY (invite_id, key_version)
);
