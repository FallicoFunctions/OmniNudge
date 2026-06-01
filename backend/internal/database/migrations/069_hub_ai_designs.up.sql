-- Hub AI-generated page designs created by the hub AI designer.
-- Each row stores one generated design; only one can be active per hub.
CREATE TABLE hub_ai_designs (
    id          SERIAL PRIMARY KEY,
    hub_id      INTEGER NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    prompt      TEXT    NOT NULL,
    html_content TEXT   NOT NULL,
    created_by  INTEGER NOT NULL REFERENCES users(id),
    is_active   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hub_ai_designs_hub_id ON hub_ai_designs(hub_id);
CREATE INDEX idx_hub_ai_designs_active ON hub_ai_designs(hub_id) WHERE is_active = true;
