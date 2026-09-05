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

	require.True(t, IsOmniChatGeneratedStoragePath("omnichat/generated/7/"+id.String()+"-thumb.jpg"))
	require.True(t, IsOmniChatGeneratedStoragePathForOwner("omnichat/generated/7/"+id.String()+"-thumb.jpg", 7))
	require.False(t, IsOmniChatGeneratedStoragePathForOwner("omnichat/generated/7/"+id.String()+"-thumb.jpg", 8))
}

func TestThumbnailStorageKeyAcceptsWhatTheWorkerWrites(t *testing.T) {
	id := uuid.New()

	key, ok := OmniChatThumbnailStorageKey("/uploads/omnichat/generated/7/"+id.String()+"-thumb.jpg", 7)

	require.True(t, ok)
	require.Equal(t, "omnichat/generated/7/"+id.String()+"-thumb.jpg", key)
}

// The value comes out of a database row and addresses storage. The copy this
// replaced accepted a path with the wrong number of segments and a non-numeric
// owner, which is the drift a rule written twice always produces.
func TestThumbnailStorageKeyRefusesEverythingElse(t *testing.T) {
	id := uuid.New()
	for name, url := range map[string]string{
		"climbing out":             "/uploads/omnichat/generated/7/../../../etc/" + id.String() + "-thumb.jpg",
		"too few segments":         "/uploads/omnichat/generated/" + id.String() + "-thumb.jpg",
		"too many segments":        "/uploads/omnichat/generated/7/a/" + id.String() + "-thumb.jpg",
		"a non-numeric owner":      "/uploads/omnichat/generated/seven/" + id.String() + "-thumb.jpg",
		"another owner":            "/uploads/omnichat/generated/8/" + id.String() + "-thumb.jpg",
		"a doubled slash":          "/uploads/omnichat/generated//7/" + id.String() + "-thumb.jpg",
		"a backslash":              `/uploads/omnichat\generated/7/` + id.String() + "-thumb.jpg",
		"another prefix":           "/uploads/avatars/7/" + id.String() + "-thumb.jpg",
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
