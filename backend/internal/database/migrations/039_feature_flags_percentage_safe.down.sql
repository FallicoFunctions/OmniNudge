-- No-op rollback: this migration backfills schema safety for existing installs.
-- Intentionally does not drop percentage to avoid destructive rollback behavior.
SELECT 1;
