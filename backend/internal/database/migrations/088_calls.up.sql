CREATE TABLE calls (
    id                  SERIAL          PRIMARY KEY,
    conversation_id     INTEGER         NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    caller_id           INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    callee_id           INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    call_type           VARCHAR(10)     NOT NULL DEFAULT 'voice' CHECK (call_type IN ('voice', 'video')),
    status              VARCHAR(20)     NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'active', 'ended', 'missed', 'rejected', 'failed')),
    started_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    answered_at         TIMESTAMPTZ,
    ended_at            TIMESTAMPTZ,
    duration_seconds    INTEGER,
    ended_by            INTEGER         REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_calls_conversation_id ON calls (conversation_id);
CREATE INDEX idx_calls_caller_id ON calls (caller_id);
CREATE INDEX idx_calls_callee_id ON calls (callee_id);
CREATE INDEX idx_calls_started_at ON calls (started_at DESC);
CREATE INDEX idx_calls_status ON calls (status) WHERE status IN ('ringing', 'active');

-- call_participants for future group call support
CREATE TABLE call_participants (
    id                  SERIAL          PRIMARY KEY,
    call_id             INTEGER         NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    user_id             INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    left_at             TIMESTAMPTZ,
    connection_quality  VARCHAR(20)     CHECK (connection_quality IN ('excellent', 'good', 'fair', 'poor')),
    UNIQUE (call_id, user_id)
);

CREATE INDEX idx_call_participants_call_id ON call_participants (call_id);
CREATE INDEX idx_call_participants_user_id ON call_participants (user_id);
