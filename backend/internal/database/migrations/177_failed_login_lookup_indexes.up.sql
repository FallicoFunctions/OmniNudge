-- Indexes for the account lockout checks.
--
-- Every login runs four queries against this table: the identifier count and
-- the IP count in IsLocked, and on success the two matching deletes in Reset
-- and ResetIP. All four filter on one column plus the 15 minute window, and
-- until now nothing indexed ip_address at all.
--
-- Measured on 200k rows spread over the 24 hour retention, roughly what a site
-- under credential stuffing holds:
--
--	identifier count   0.38 ms, 14 buffers
--	IP count          21.80 ms, 1174 buffers, 2050 rows read then discarded
--
-- The IP count had no usable index, so it scanned every row inside the window
-- and filtered them out. That cost grows with the number of attempts in the
-- window, which is to say it degrades exactly when an attack is underway and
-- the check matters most. With the composite below both drop to about 0.1 ms
-- and 3 buffers, served as index only scans.
--
-- The columns are ordered with the equality first and the range second, which
-- is what lets one index satisfy both halves of the predicate.
CREATE INDEX IF NOT EXISTS idx_failed_login_ip_time
    ON failed_login_attempts (ip_address, attempted_at);

CREATE INDEX IF NOT EXISTS idx_failed_login_identifier_time
    ON failed_login_attempts (identifier, attempted_at);

-- Superseded by the composite above: every query filtering on identifier also
-- filters on the window, and a composite with identifier leading serves the
-- bare lookup just as well. Dropping it removes an index this table has to
-- maintain on a path that inserts a row per failed login.
DROP INDEX IF EXISTS idx_failed_login_identifier;

-- idx_failed_login_attempted_at stays. The cleanup job purges by age alone
-- (WHERE attempted_at < ...), and neither composite can serve that.
