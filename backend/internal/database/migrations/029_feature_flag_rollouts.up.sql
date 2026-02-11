ALTER TABLE feature_flags ADD COLUMN auto_rollback BOOLEAN DEFAULT FALSE;
ALTER TABLE feature_flags ADD COLUMN rollback JSONB;
