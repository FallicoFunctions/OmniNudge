export interface LocalCommentBase {
  id: number;
  username: string;
  content: string;
  created_at: string;
  parent_comment_id: number | null;
  score: number;
  user_vote?: number;
  inbox_replies_disabled?: boolean;
}
