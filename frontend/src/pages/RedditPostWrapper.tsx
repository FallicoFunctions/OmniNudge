import { useParams } from 'react-router-dom';
import RedditPostPage from './RedditPostPage';
import PostDetailPage from './PostDetailPage';

/**
 * Wrapper component that routes to the appropriate post detail page
 * based on whether the post ID is numeric (platform post) or alphanumeric (Reddit post)
 */
export default function RedditPostWrapper() {
  const { postId } = useParams<{ postId: string }>();

  // Platform posts have numeric IDs, Reddit posts have alphanumeric IDs
  const isPlatformPost = postId ? /^\d+$/.test(postId) : false;

  // Render the appropriate page component
  return isPlatformPost ? <PostDetailPage /> : <RedditPostPage />;
}
