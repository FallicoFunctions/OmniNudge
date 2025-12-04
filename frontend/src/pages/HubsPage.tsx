import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { hubsService, type HubPostsResponse, type LocalSubredditPost } from '../services/hubsService';
import { subscriptionService } from '../services/subscriptionService';
import { useAuth } from '../contexts/AuthContext';
import { SubscribeButton } from '../components/common/SubscribeButton';

export default function HubsPage() {
  const navigate = useNavigate();
  const { hubname: routeHubname } = useParams<{ hubname?: string }>();
  const { user } = useAuth();
  const [hubname, setHubname] = useState(routeHubname ?? 'popular');
  const [sort, setSort] = useState<'hot' | 'new' | 'top' | 'rising'>('hot');

  // Check if user has hub subscriptions to determine default view
  const { data: userSubscriptions } = useQuery({
    queryKey: ['user-subscriptions', 'hubs'],
    queryFn: () => subscriptionService.getUserHubSubscriptions(),
    enabled: !!user && !routeHubname,
  });

  useEffect(() => {
    if (!routeHubname && userSubscriptions) {
      // If user has subscriptions, default to popular (filtered), otherwise all
      if (userSubscriptions.length > 0) {
        setHubname('popular');
        navigate('/hubs/h/popular', { replace: true });
      } else {
        setHubname('all');
        navigate('/hubs/h/all', { replace: true });
      }
    }
  }, [routeHubname, userSubscriptions, navigate]);

  useEffect(() => {
    if (routeHubname) {
      setHubname(routeHubname);
    }
  }, [routeHubname]);

  // Fetch posts based on current hub
  const { data, isLoading, error } = useQuery<HubPostsResponse>({
    queryKey: ['hub-posts', hubname, sort],
    queryFn: () => {
      if (hubname === 'popular') {
        return hubsService.getPopularFeed(sort);
      }
      if (hubname === 'all') {
        return hubsService.getAllFeed(sort);
      }
      return hubsService.getHubPosts(hubname, sort);
    },
    enabled: !!hubname && hubname !== '',
    staleTime: 1000 * 60 * 5,
  });

  // Check subscription status for specific hub
  const { data: subscriptionStatus } = useQuery({
    queryKey: ['hub-subscription', hubname],
    queryFn: () => subscriptionService.checkHubSubscription(hubname),
    enabled: !!user && hubname !== 'popular' && hubname !== 'all',
  });

  const handleSortChange = (newSort: 'hot' | 'new' | 'top' | 'rising') => {
    setSort(newSort);
  };

  const handleHubChange = (newHub: string) => {
    setHubname(newHub);
    if (newHub === 'popular' || newHub === 'all') {
      navigate(`/hubs/h/${newHub}`);
    } else {
      navigate(`/hubs/h/${newHub}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-red-600">Error loading posts</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {hubname === 'popular' && 'h/popular'}
            {hubname === 'all' && 'h/all'}
            {hubname !== 'popular' && hubname !== 'all' && `h/${hubname}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {user && hubname !== 'popular' && hubname !== 'all' && (
            <SubscribeButton
              type="hub"
              name={hubname}
              initialSubscribed={subscriptionStatus?.is_subscribed}
            />
          )}
          {user && (
            <button
              onClick={() => navigate('/posts/create', { state: { defaultHub: hubname } })}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create Post
            </button>
          )}
          {user && (
            <button
              onClick={() => navigate('/hubs/create')}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Create Hub
            </button>
          )}
        </div>
      </div>

      {/* Sort Controls */}
      <div className="mb-4 flex gap-2">
        {(['hot', 'new', 'top', 'rising'] as const).map((sortOption) => (
          <button
            key={sortOption}
            onClick={() => handleSortChange(sortOption)}
            className={`px-3 py-1 rounded ${
              sort === sortOption
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {sortOption.charAt(0).toUpperCase() + sortOption.slice(1)}
          </button>
        ))}
      </div>

      {/* Posts List */}
      <div className="space-y-4">
        {data?.posts && data.posts.length > 0 ? (
          data.posts.map((post: LocalSubredditPost) => (
            <div key={post.id} className="border rounded-lg p-4 bg-white shadow">
              <div className="flex items-start gap-3">
                {/* Thumbnail */}
                {post.thumbnail_url && (
                  <img
                    src={post.thumbnail_url}
                    alt=""
                    className="w-24 h-24 object-cover rounded"
                  />
                )}

                <div className="flex-1">
                  {/* Title */}
                  <Link
                    to={`/posts/${post.id}`}
                    className="text-xl font-semibold hover:text-blue-600"
                  >
                    {post.title}
                  </Link>

                  {/* Metadata */}
                  <div className="mt-2 text-sm text-gray-600">
                    <span>Posted by {post.author_username || 'Unknown'}</span>
                    {' • '}
                    <span>{post.score} points</span>
                    {' • '}
                    <span>{post.num_comments} comments</span>
                  </div>

                  {/* Body preview */}
                  {post.body && (
                    <p className="mt-2 text-gray-700 line-clamp-3">{post.body}</p>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 text-gray-500">
            No posts found in this hub
          </div>
        )}
      </div>
    </div>
  );
}
