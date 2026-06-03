UPDATE omnirave_guest_sanctions
SET ip_hash = NULL
WHERE btrim(ip_hash) = '';

ALTER TABLE omnirave_guest_sanctions
  ALTER COLUMN ip_hash DROP NOT NULL;

ALTER TABLE omnirave_guest_sanctions
  ADD CONSTRAINT omnirave_guest_sanctions_ip_hash_nonempty
  CHECK (ip_hash IS NULL OR btrim(ip_hash) <> '');
