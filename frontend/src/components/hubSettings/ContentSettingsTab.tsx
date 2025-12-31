import { useState } from 'react';
import type { HubSettings, UpdateHubSettingsRequest } from '../../types/hubSettings';

interface Props {
  settings: HubSettings;
  onSave: (data: UpdateHubSettingsRequest) => void;
}

export default function ContentSettingsTab({ settings, onSave }: Props) {
  const [allowTextPosts, setAllowTextPosts] = useState(settings.allow_text_posts);
  const [allowLinkPosts, setAllowLinkPosts] = useState(settings.allow_link_posts);
  const [allowImagePosts, setAllowImagePosts] = useState(settings.allow_image_posts);
  const [allowVideoPosts, setAllowVideoPosts] = useState(settings.allow_video_posts);
  const [allowPollPosts, setAllowPollPosts] = useState(settings.allow_poll_posts);
  const [allowMediaInComments, setAllowMediaInComments] = useState(
    settings.allow_media_in_comments
  );
  const [requirePostFlair, setRequirePostFlair] = useState(settings.require_post_flair);
  const [allowSpoilers, setAllowSpoilers] = useState(settings.allow_spoilers);
  const [showThumbnails, setShowThumbnails] = useState(settings.show_thumbnails);
  const [enableWiki, setEnableWiki] = useState(settings.enable_wiki);

  const handleSave = () => {
    onSave({
      ...settings,
      allow_text_posts: allowTextPosts,
      allow_link_posts: allowLinkPosts,
      allow_image_posts: allowImagePosts,
      allow_video_posts: allowVideoPosts,
      allow_poll_posts: allowPollPosts,
      allow_media_in_comments: allowMediaInComments,
      require_post_flair: requirePostFlair,
      allow_spoilers: allowSpoilers,
      show_thumbnails: showThumbnails,
      enable_wiki: enableWiki,
    });
  };

  const hasChanges =
    allowTextPosts !== settings.allow_text_posts ||
    allowLinkPosts !== settings.allow_link_posts ||
    allowImagePosts !== settings.allow_image_posts ||
    allowVideoPosts !== settings.allow_video_posts ||
    allowPollPosts !== settings.allow_poll_posts ||
    allowMediaInComments !== settings.allow_media_in_comments ||
    requirePostFlair !== settings.require_post_flair ||
    allowSpoilers !== settings.allow_spoilers ||
    showThumbnails !== settings.show_thumbnails ||
    enableWiki !== settings.enable_wiki;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-4">
          Content & Post Settings
        </h2>
        <p className="text-[var(--color-text-secondary)] mb-6">
          Control what types of content can be posted in your hub
        </p>
      </div>

      {/* Allowed Post Types */}
      <div>
        <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-3">
          Allowed Post Types
        </h3>
        <div className="space-y-3">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={allowTextPosts}
              onChange={(e) => setAllowTextPosts(e.target.checked)}
              className="mr-3 h-4 w-4"
            />
            <span className="text-[var(--color-text-primary)]">Text Posts</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={allowLinkPosts}
              onChange={(e) => setAllowLinkPosts(e.target.checked)}
              className="mr-3 h-4 w-4"
            />
            <span className="text-[var(--color-text-primary)]">Link Posts</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={allowImagePosts}
              onChange={(e) => setAllowImagePosts(e.target.checked)}
              className="mr-3 h-4 w-4"
            />
            <span className="text-[var(--color-text-primary)]">Image Posts</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={allowVideoPosts}
              onChange={(e) => setAllowVideoPosts(e.target.checked)}
              className="mr-3 h-4 w-4"
            />
            <span className="text-[var(--color-text-primary)]">Video Posts</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={allowPollPosts}
              onChange={(e) => setAllowPollPosts(e.target.checked)}
              className="mr-3 h-4 w-4"
            />
            <span className="text-[var(--color-text-primary)]">Poll Posts</span>
          </label>
        </div>
      </div>

      {/* Media & Content Options */}
      <div className="border-t border-[var(--color-border)] pt-6">
        <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-3">
          Media & Content Options
        </h3>
        <div className="space-y-3">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={allowMediaInComments}
              onChange={(e) => setAllowMediaInComments(e.target.checked)}
              className="mr-3 h-4 w-4"
            />
            <div>
              <span className="text-[var(--color-text-primary)]">Allow media in comments</span>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Let users post images and videos in comments
              </p>
            </div>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={showThumbnails}
              onChange={(e) => setShowThumbnails(e.target.checked)}
              className="mr-3 h-4 w-4"
            />
            <div>
              <span className="text-[var(--color-text-primary)]">Show thumbnails</span>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Display thumbnail previews for link and media posts
              </p>
            </div>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={allowSpoilers}
              onChange={(e) => setAllowSpoilers(e.target.checked)}
              className="mr-3 h-4 w-4"
            />
            <div>
              <span className="text-[var(--color-text-primary)]">Allow spoiler tags</span>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Enable spoiler tagging for posts and comments
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Post Requirements */}
      <div className="border-t border-[var(--color-border)] pt-6">
        <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-3">
          Post Requirements
        </h3>
        <div className="space-y-3">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={requirePostFlair}
              onChange={(e) => setRequirePostFlair(e.target.checked)}
              className="mr-3 h-4 w-4"
            />
            <div>
              <span className="text-[var(--color-text-primary)]">Require post flair</span>
              <p className="text-xs text-[var(--color-text-secondary)]">
                All posts must have a flair before being published
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Features */}
      <div className="border-t border-[var(--color-border)] pt-6">
        <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-3">Features</h3>
        <div className="space-y-3">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={enableWiki}
              onChange={(e) => setEnableWiki(e.target.checked)}
              className="mr-3 h-4 w-4"
            />
            <div>
              <span className="text-[var(--color-text-primary)]">Enable wiki</span>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Allow creation and editing of hub wiki pages
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-[var(--color-border)]">
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="px-6 py-2 rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
