-- Bug reports submitted by users
CREATE TABLE IF NOT EXISTS bug_reports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    page_url TEXT NOT NULL,
    description TEXT NOT NULL,
    screenshot_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'investigating', 'fixed', 'wont_fix', 'duplicate')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Known bugs list (managed by admins)
CREATE TABLE IF NOT EXISTS known_bugs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating', 'in_progress', 'fixed', 'wont_fix')),
    severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    affected_pages TEXT[], -- Array of page paths/URLs affected
    fixed_in_version VARCHAR(50), -- e.g., "0.2.1"
    workaround TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fixed_at TIMESTAMPTZ
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON bug_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_known_bugs_status ON known_bugs(status);
CREATE INDEX IF NOT EXISTS idx_known_bugs_severity ON known_bugs(severity);
CREATE INDEX IF NOT EXISTS idx_known_bugs_created_at ON known_bugs(created_at DESC);
