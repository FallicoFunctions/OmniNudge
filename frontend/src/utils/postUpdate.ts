import type { UpdatePostRequest } from '../types/posts';

type PostUpdateSource = {
  media_url?: string | null;
  media_type?: string | null;
  thumbnail_url?: string | null;
  tags?: string[] | null;
};

type PostUpdateInput = {
  title: string;
  body: string;
};

export function buildPostUpdateRequest(
  post: PostUpdateSource,
  updates: PostUpdateInput
): UpdatePostRequest {
  const trimmedTitle = updates.title.trim();
  const trimmedBody = updates.body.trim();

  return {
    title: trimmedTitle,
    body: trimmedBody ? updates.body : undefined,
    tags: post.tags ?? undefined,
    media_url: post.media_url ?? undefined,
    media_type: post.media_type ?? undefined,
    thumbnail_url: post.thumbnail_url ?? undefined,
  };
}
