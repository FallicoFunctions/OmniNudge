-- Migration 013: Add hub topic filters (deny keywords)

CREATE TABLE IF NOT EXISTS hub_topic_filters (
    hub_id INTEGER PRIMARY KEY REFERENCES hubs(id) ON DELETE CASCADE,
    deny_keywords TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_hub_topic_filters_hub_id ON hub_topic_filters(hub_id);
