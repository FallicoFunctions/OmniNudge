package models

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// A thumbnail is generated media, and this function is what the repository
// means by that. The thumbnail key was outside it -- the stem is "<job
// id>-thumb", not a bare uuid -- so the deletion guard, which refuses any path
// this rejects, could never accept one.
func TestAThumbnailIsGeneratedMedia(t *testing.T) {
	id := uuid.New()

	require.True(t, IsOmniChatGeneratedStoragePath("omnichat/generated/7/"+id.String()+".mp4-thumb.jpg"))
	require.True(t, IsOmniChatGeneratedStoragePathForOwner("omnichat/generated/7/"+id.String()+".mp4-thumb.jpg", 7))
	require.False(t, IsOmniChatGeneratedStoragePathForOwner("omnichat/generated/7/"+id.String()+".mp4-thumb.jpg", 8))
}

func TestThumbnailStorageKeyAcceptsWhatTheWorkerWrites(t *testing.T) {
	id := uuid.New()

	key, ok := OmniChatThumbnailStorageKey("/uploads/omnichat/generated/7/"+id.String()+".mp4-thumb.jpg", 7)

	require.True(t, ok)
	require.Equal(t, "omnichat/generated/7/"+id.String()+".mp4-thumb.jpg", key)
}

// The value comes out of a database row and addresses storage. The copy this
// replaced accepted a path with the wrong number of segments and a non-numeric
// owner, which is the drift a rule written twice always produces.
func TestThumbnailStorageKeyRefusesEverythingElse(t *testing.T) {
	id := uuid.New()
	for name, url := range map[string]string{
		"climbing out":             "/uploads/omnichat/generated/7/../../../etc/" + id.String() + ".mp4-thumb.jpg",
		"too few segments":         "/uploads/omnichat/generated/" + id.String() + ".mp4-thumb.jpg",
		"too many segments":        "/uploads/omnichat/generated/7/a/" + id.String() + ".mp4-thumb.jpg",
		"a non-numeric owner":      "/uploads/omnichat/generated/seven/" + id.String() + ".mp4-thumb.jpg",
		"another owner":            "/uploads/omnichat/generated/8/" + id.String() + ".mp4-thumb.jpg",
		"a doubled slash":          "/uploads/omnichat/generated//7/" + id.String() + ".mp4-thumb.jpg",
		"a backslash":              `/uploads/omnichat\generated/7/` + id.String() + ".mp4-thumb.jpg",
		"another prefix":           "/uploads/avatars/7/" + id.String() + ".mp4-thumb.jpg",
		"the asset itself":         "/uploads/omnichat/generated/7/" + id.String() + ".mp4",
		"not a thumbnail":          "/uploads/omnichat/generated/7/" + id.String() + ".jpg",
		"a stem that is not a job": "/uploads/omnichat/generated/7/not-a-uuid-thumb.jpg",
		"an absolute host":         "https://evil.test/x-thumb.jpg",
		"empty":                    "   ",
	} {
		t.Run(name, func(t *testing.T) {
			_, ok := OmniChatThumbnailStorageKey(url, 7)
			require.False(t, ok)
		})
	}
}

// The thumbnail's name comes from the asset's own key, not from the job id, so
// the writer and the reader cannot disagree about where it is -- and so the two
// assets of a two-phase job cannot collide.
func TestThumbnailKeyNamesTheWholeAssetFile(t *testing.T) {
	id := uuid.New()

	for source, want := range map[string]string{
		"omnichat/generated/7/" + id.String() + ".mp4":  "omnichat/generated/7/" + id.String() + ".mp4-thumb.jpg",
		"omnichat/generated/7/" + id.String() + ".png":  "omnichat/generated/7/" + id.String() + ".png-thumb.jpg",
		"omnichat/generated/41/" + id.String() + ".jpg": "omnichat/generated/41/" + id.String() + ".jpg-thumb.jpg",
	} {
		key, ok := OmniChatThumbnailKeyFor(source)
		require.True(t, ok, source)
		require.Equal(t, want, key)
	}
}

// A thumbnail has no thumbnail of its own, and nothing outside generated media
// gets one at all.
func TestThumbnailKeyRefusesWhatItShould(t *testing.T) {
	id := uuid.New()
	for _, source := range []string{
		"omnichat/generated/7/" + id.String() + ".mp4-thumb.jpg",
		"uploads/7/holiday.png",
		"omnichat/generated/7/../" + id.String() + ".png",
		"",
	} {
		_, ok := OmniChatThumbnailKeyFor(source)
		require.Falsef(t, ok, "%q must not get a thumbnail key", source)
	}
}

// A two-phase video job leaves two assets under one job id -- the still it
// rendered first and the clip it animated from it -- differing only by
// extension. A thumbnail named for the job alone was one object for two
// different pictures, the clip's silently overwriting the still's. Found by
// running the backfill against the real database, where the collision is
// visible in the output.
func TestTheStillAndTheClipOfOneJobGetDifferentThumbnails(t *testing.T) {
	id := uuid.New()

	still, ok := OmniChatThumbnailKeyFor("omnichat/generated/7/" + id.String() + ".png")
	require.True(t, ok)
	clip, ok := OmniChatThumbnailKeyFor("omnichat/generated/7/" + id.String() + ".mp4")
	require.True(t, ok)

	require.NotEqual(t, still, clip, "one job's two assets share a thumbnail")
	require.True(t, IsOmniChatGeneratedStoragePathForOwner(still, 7))
	require.True(t, IsOmniChatGeneratedStoragePathForOwner(clip, 7))
}
