DROP TRIGGER IF EXISTS trg_omnichat_publication_share_counts ON omnichat_publication_shares;
DROP TRIGGER IF EXISTS trg_omnichat_publication_comment_counts ON omnichat_publication_comments;
DROP TRIGGER IF EXISTS trg_omnichat_publication_reaction_counts ON omnichat_publication_reactions;
DROP FUNCTION IF EXISTS update_omnichat_publication_share_counts();
DROP FUNCTION IF EXISTS update_omnichat_publication_comment_counts();
DROP FUNCTION IF EXISTS update_omnichat_publication_reaction_counts();

ALTER TABLE bot_conversations DROP COLUMN IF EXISTS remixed_from_publication_id;

DROP TABLE IF EXISTS omnichat_publication_reports;
DROP TABLE IF EXISTS omnichat_follows;
DROP TABLE IF EXISTS omnichat_publication_bookmarks;
DROP TABLE IF EXISTS omnichat_publication_shares;
DROP TABLE IF EXISTS omnichat_publication_reactions;
DROP TABLE IF EXISTS omnichat_publication_comments;
DROP TABLE IF EXISTS omnichat_publications;
DROP TABLE IF EXISTS omnichat_chat_snapshot_attachments;
DROP TABLE IF EXISTS omnichat_chat_snapshot_messages;
DROP TABLE IF EXISTS omnichat_chat_snapshots;
