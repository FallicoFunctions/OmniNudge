ALTER TABLE omnirave_guest_sanctions
  DROP CONSTRAINT IF EXISTS omnirave_guest_sanctions_ip_hash_nonempty;

UPDATE omnirave_guest_sanctions
SET ip_hash = ''
WHERE ip_hash IS NULL;

ALTER TABLE omnirave_guest_sanctions
  ALTER COLUMN ip_hash SET NOT NULL;
