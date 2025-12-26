import type { PlatformPost } from '../types/posts';

/**
 * Generates the correct URL for a platform post.
 * - If the post has a target_subreddit, use Reddit-style URL: /r/{subreddit}/comments/{id}
 * - Otherwise, use platform URL: /posts/{id}
 */
export function getPostUrl(post: Pick<PlatformPost, 'id' | 'target_subreddit'>): string {
  if (post.target_subreddit) {
    // Use Reddit-style URL for posts crossposted to subreddits
    return `/r/${post.target_subreddit}/comments/${post.id}`;
  }
  // Use platform URL for hub-only posts
  return `/posts/${post.id}`;
}

/**
 * Generates the correct URL for a comment on a platform post.
 */
export function getPostCommentUrl(
  post: Pick<PlatformPost, 'id' | 'target_subreddit'>,
  commentId: number | string
): string {
  if (post.target_subreddit) {
    // Use Reddit-style URL for posts crossposted to subreddits
    return `/r/${post.target_subreddit}/comments/${post.id}/${commentId}`;
  }
  // Use platform URL for hub-only posts
  return `/posts/${post.id}/comments/${commentId}`;
}
