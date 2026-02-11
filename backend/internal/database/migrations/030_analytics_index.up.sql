-- Add GIN index for analytics properties to speed up feature flag monitoring
CREATE INDEX IF NOT EXISTS idx_analytics_events_properties_gin ON analytics_events USING GIN (properties);
CREATE INDEX IF NOT EXISTS idx_analytics_events_active_flags ON analytics_events USING GIN ((properties->'active_flags'));
