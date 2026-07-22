-- One-time removal of legacy bearer secrets that may have been stored in
-- plaintext before repositories switched to SHA-256 digests. Users can request
-- fresh verification/reset messages through the normal flows.
DELETE FROM email_verifications
WHERE token !~ '^[0-9a-f]{64}$';

UPDATE password_resets
SET used_at = COALESCE(used_at, NOW())
WHERE token !~ '^[0-9a-f]{64}$';
