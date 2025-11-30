import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { postsService } from '../services/postsService';
import { savedService } from '../services/savedService';
import type { CreatePostRequest } from '../types/posts';

export default function PostsPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hubName, setHubName] = useState('general');
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['posts', 'feed'],
    queryFn: () => postsService.getFeed(),
  });

  const savedPostsKey = ['saved-items', 'posts'] as const;
  const { data: savedPostsData } = useQuery({
    queryKey: savedPostsKey,
    queryFn: () => savedService.getSavedItems('posts'),
  });
  const savedPostIds = useMemo(
    () => new Set(savedPostsData?.saved_posts?.map((post) => post.id) ?? []),
    [savedPostsData]
  );

  const createPostMutation = useMutation({
    mutationFn: (newPost: CreatePostRequest) => postsService.createPost(newPost),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
      setIsCreating(false);
      setTitle('');
      setContent('');
      setHubName('general');
    },
  });

  const voteMutation = useMutation({
    mutationFn: ({ postId, value }: { postId: number; value: number }) =>
      postsService.votePost(postId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'] });
    },
  });

  const savePostMutation = useMutation({
    mutationFn: ({ postId, shouldSave }: { postId: number; shouldSave: boolean }) =>
      shouldSave ? savedService.savePost(postId) : savedService.unsavePost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedPostsKey });
    },
  });

  const handleToggleSave = (postId: number, currentlySaved: boolean) => {
    savePostMutation.mutate({ postId, shouldSave: !currentlySaved });
  };

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createPostMutation.mutate({
      title: title.trim(),
      content: content.trim() || undefined,
      hub_name: hubName,
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Posts</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Community posts and discussions
          </p>
        </div>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
        >
          {isCreating ? 'Cancel' : 'Create Post'}
        </button>
      </div>

      {/* Create Post Form */}
      {isCreating && (
        <form
          onSubmit={handleCreatePost}
          className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-md"
        >
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            Create New Post
          </h2>

          {createPostMutation.error && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">
              {createPostMutation.error instanceof Error
                ? createPostMutation.error.message
                : 'Failed to create post'}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                Hub
              </label>
              <select
                value={hubName}
                onChange={(e) => setHubName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              >
                <option value="general">general</option>
                <option value="technology">technology</option>
                <option value="discussion">discussion</option>
                <option value="news">news</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                placeholder="What's your post about?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-primary)]">
                Content (optional)
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                placeholder="Share your thoughts..."
              />
            </div>

            <button
              type="submit"
              disabled={createPostMutation.isPending}
              className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
            >
              {createPostMutation.isPending ? 'Creating...' : 'Submit Post'}
            </button>
          </div>
        </form>
      )}

      {/* Posts Feed */}
      {isLoading && (
        <div className="text-center text-[var(--color-text-secondary)]">Loading posts...</div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to load posts: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {data?.posts && (
        <div className="space-y-4">
          {data.posts.map((post) => (
            <article
              key={post.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex gap-4 p-4">
                {/* Vote Section */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => voteMutation.mutate({ postId: post.id, value: 1 })}
                    className="rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-primary)]"
                    aria-label="Upvote"
                  >
                    ▲
                  </button>
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {post.score}
                  </span>
                  <button
                    onClick={() => voteMutation.mutate({ postId: post.id, value: -1 })}
                    className="rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] hover:text-red-500"
                    aria-label="Downvote"
                  >
                    ▼
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                    <span className="rounded-full bg-[var(--color-surface-elevated)] px-2 py-1">
                      h/{post.hub_name}
                    </span>
                    <span>•</span>
                    <span>Posted by u/{post.author_username}</span>
                    <span>•</span>
                    <span>{new Date(post.created_at).toLocaleDateString()}</span>
                  </div>

                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                    {post.title}
                  </h2>

                  {post.content && (
                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                      {post.content}
                    </p>
                  )}

                  <div className="mt-3 flex gap-4 text-xs text-[var(--color-text-secondary)]">
                    <span>{post.comment_count} comments</span>
                    <button className="hover:text-[var(--color-primary)]">Share</button>
                    <button
                      onClick={() => handleToggleSave(post.id, savedPostIds.has(post.id))}
                      disabled={savePostMutation.isPending}
                      className={`hover:text-[var(--color-primary)] ${savedPostIds.has(post.id) ? 'text-[var(--color-primary)] font-semibold' : ''} disabled:opacity-50`}
                    >
                      {savedPostIds.has(post.id) ? 'Saved' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        // TODO: Implement report modal/form
                        // This would send a report to the moderators of the hub
                        console.log('Report post', post.id, 'to moderators of', post.hub_name);
                      }}
                      className="hover:text-red-500"
                    >
                      Report
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {data?.posts && data.posts.length === 0 && (
        <div className="text-center text-[var(--color-text-secondary)]">
          No posts yet. Be the first to create one!
        </div>
      )}
    </div>
  );
}
