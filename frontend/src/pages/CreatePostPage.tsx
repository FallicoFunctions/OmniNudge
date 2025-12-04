import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { postsService } from '../services/postsService';
import { subscriptionService } from '../services/subscriptionService';
import type { CreatePostRequest } from '../types/posts';

export default function CreatePostPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'link' | 'text'>('link');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [destination, setDestination] = useState<'profile' | 'hub' | 'subreddit'>('hub');
  const [selectedHubId, setSelectedHubId] = useState<number | undefined>();
  const [selectedSubreddit, setSelectedSubreddit] = useState<string | undefined>();
  const [sendRepliesToInbox, setSendRepliesToInbox] = useState(true);

  // Get user's hub subscriptions
  const { data: hubSubscriptions } = useQuery({
    queryKey: ['user-subscriptions', 'hubs'],
    queryFn: () => subscriptionService.getUserHubSubscriptions(),
  });

  // Get user's subreddit subscriptions
  const { data: subredditSubscriptions } = useQuery({
    queryKey: ['user-subscriptions', 'subreddits'],
    queryFn: () => subscriptionService.getUserSubredditSubscriptions(),
  });

  // Pre-fill destination from location state
  useEffect(() => {
    const state = location.state as { defaultHub?: string; defaultSubreddit?: string } | null;
    if (state?.defaultHub && hubSubscriptions) {
      const hub = hubSubscriptions.find((h) => h.hub_id);
      if (hub) {
        setDestination('hub');
        setSelectedHubId(hub.hub_id);
      }
    } else if (state?.defaultSubreddit) {
      setDestination('subreddit');
      setSelectedSubreddit(state.defaultSubreddit);
    }
  }, [location.state, hubSubscriptions]);

  const createPostMutation = useMutation({
    mutationFn: (data: CreatePostRequest) => postsService.createPost(data),
    onSuccess: (post) => {
      navigate(`/posts/${post.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('Title is required');
      return;
    }

    if (destination === 'profile') {
      alert('Profile posting is not yet implemented');
      return;
    }

    if (destination === 'hub' && !selectedHubId) {
      alert('Please select a hub');
      return;
    }

    if (destination === 'subreddit' && !selectedSubreddit) {
      alert('Please select a subreddit');
      return;
    }

    const data: CreatePostRequest = {
      title,
      body: body || undefined,
      media_url: activeTab === 'link' ? mediaUrl || undefined : undefined,
      hub_id: destination === 'hub' ? selectedHubId : undefined,
      target_subreddit: destination === 'subreddit' ? selectedSubreddit : undefined,
      send_replies_to_inbox: sendRepliesToInbox,
      post_type: activeTab,
    };

    createPostMutation.mutate(data);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Create a Post</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => setActiveTab('link')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'link'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Link
        </button>
        <button
          onClick={() => setActiveTab('text')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'text'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Text
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter post title"
            required
            maxLength={300}
          />
        </div>

        {/* Link Tab Content */}
        {activeTab === 'link' && (
          <div>
            <label className="block text-sm font-medium mb-2">URL or Media</label>
            <input
              type="url"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com"
            />
            <p className="mt-1 text-sm text-gray-500">
              Enter a URL or upload an image/video
            </p>
          </div>
        )}

        {/* Text Tab Content */}
        {activeTab === 'text' && (
          <div>
            <label className="block text-sm font-medium mb-2">
              Body (optional, Markdown supported)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={10}
              placeholder="Enter post body (Markdown supported)"
            />
          </div>
        )}

        {/* Destination Selector */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Choose where to post <span className="text-red-500">*</span>
          </label>

          <div className="space-y-3">
            {/* Profile option (disabled for now) */}
            <label className="flex items-center opacity-50 cursor-not-allowed">
              <input
                type="radio"
                name="destination"
                value="profile"
                checked={destination === 'profile'}
                onChange={() => setDestination('profile')}
                className="mr-2"
                disabled
              />
              <span>Your profile (coming soon)</span>
            </label>

            {/* Hub/Subreddit option */}
            <label className="flex items-center">
              <input
                type="radio"
                name="destination"
                value="hub"
                checked={destination === 'hub' || destination === 'subreddit'}
                onChange={() => setDestination('hub')}
                className="mr-2"
              />
              <span>A hub or subreddit</span>
            </label>

            {(destination === 'hub' || destination === 'subreddit') && (
              <div className="ml-6 space-y-2">
                {/* Hub/Subreddit tabs */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDestination('hub')}
                    className={`px-3 py-1 text-sm rounded ${
                      destination === 'hub'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    Hubs
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestination('subreddit')}
                    className={`px-3 py-1 text-sm rounded ${
                      destination === 'subreddit'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    Subreddits
                  </button>
                </div>

                {/* Hub selector */}
                {destination === 'hub' && (
                  <select
                    value={selectedHubId || ''}
                    onChange={(e) => setSelectedHubId(Number(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select a hub...</option>
                    {hubSubscriptions?.map((sub) => (
                      <option key={sub.id} value={sub.hub_id}>
                        h/{sub.hub_id}
                      </option>
                    ))}
                  </select>
                )}

                {/* Subreddit selector */}
                {destination === 'subreddit' && (
                  <select
                    value={selectedSubreddit || ''}
                    onChange={(e) => setSelectedSubreddit(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select a subreddit...</option>
                    {subredditSubscriptions?.map((sub) => (
                      <option key={sub.id} value={sub.subreddit_name}>
                        r/{sub.subreddit_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Send Replies to Inbox */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={sendRepliesToInbox}
              onChange={(e) => setSendRepliesToInbox(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Send replies to my inbox</span>
          </label>
        </div>

        {/* Submit */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={createPostMutation.isPending}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {createPostMutation.isPending ? 'Creating...' : 'Create Post'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>

        {createPostMutation.isError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">
              Error: {(createPostMutation.error as Error).message}
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
