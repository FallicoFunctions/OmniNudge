CREATE TABLE IF NOT EXISTS omnirave_profiles (
  user_id BIGINT PRIMARY KEY,
  loadout JSONB NOT NULL DEFAULT '{}'::jsonb,
  return_point JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS omnirave_guest_sanctions (
  id BIGSERIAL PRIMARY KEY,
  bootstrap_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
