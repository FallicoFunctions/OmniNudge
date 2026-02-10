# Feature Flag Naming Conventions

## Format
Use snake_case for all feature flag keys.

Format: `<scope>_<feature>_<optional_modifier>`

## Examples

### Feature-based flags
- `group_messaging` - Enable group conversations
- `voice_calls` - Enable voice calling
- `video_calls` - Enable video calling
- `screen_sharing` - Enable screen sharing

### Infrastructure flags
- `content_moderation` - Enable automated content moderation
- `analytics` - Enable analytics tracking
- `push_notifications` - Enable push notifications

### UI/UX flags
- `new_feed_layout` - Enable new feed design
- `advanced_search` - Enable advanced search filters

## Scope Categories
- Feature names (e.g., `hub_polls`, `hub_wiki`)
- Infrastructure (e.g., `content_moderation`, `analytics`)
- UI/UX experiments (e.g., `new_feed_layout`)
- Performance (e.g., `lazy_loading`, `cdn_enabled`)

## Best Practices
1. Keep names descriptive but concise
2. Use boolean flags when possible (enabled/disabled)
3. Document the flag's purpose in the description field
4. Use metadata for additional configuration
5. Always provide a default value (typically `false` for new features)
