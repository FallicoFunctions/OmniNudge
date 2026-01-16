CREATE TABLE hub_wiki_pages (
    id SERIAL PRIMARY KEY,
    hub_id INTEGER NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text),
    updated_by INTEGER REFERENCES users(id)
);

CREATE UNIQUE INDEX idx_hub_wiki_pages_hub_slug ON hub_wiki_pages (hub_id, slug);
