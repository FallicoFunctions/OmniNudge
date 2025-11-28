-- Drop triggers
DROP TRIGGER IF EXISTS comment_vote_activity_trigger ON comment_votes;
DROP TRIGGER IF EXISTS post_vote_activity_trigger ON post_votes;

-- Drop trigger functions
DROP FUNCTION IF EXISTS record_comment_vote_activity();
DROP FUNCTION IF EXISTS record_post_vote_activity();

-- Drop vote_activity table
DROP TABLE IF EXISTS vote_activity CASCADE;
