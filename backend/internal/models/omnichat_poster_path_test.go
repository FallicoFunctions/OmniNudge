package models

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// A poster is generated media, and this function is what the repository means
// by that. The poster key was outside it -- the stem is "<job id>-poster", not
// a bare uuid -- so the deletion guard, which refuses any path this rejects,
// could never accept one.
func TestAPosterIsGeneratedMedia(t *testing.T) {
	id := uuid.New()

	require.True(t, IsOmniChatGeneratedStoragePath("omnichat/generated/7/"+id.String()+"-poster.jpg"))
	require.True(t, IsOmniChatGeneratedStoragePathForOwner("omnichat/generated/7/"+id.String()+"-poster.jpg", 7))
	require.False(t, IsOmniChatGeneratedStoragePathForOwner("omnichat/generated/7/"+id.String()+"-poster.jpg", 8))
}

func TestPosterStorageKeyAcceptsWhatTheWorkerWrites(t *testing.T) {
	id := uuid.New()

	key, ok := OmniChatPosterStorageKey("/uploads/omnichat/generated/7/"+id.String()+"-poster.jpg", 7)

	require.True(t, ok)
	require.Equal(t, "omnichat/generated/7/"+id.String()+"-poster.jpg", key)
}

// The value comes out of a database row and addresses storage. The copy this
// replaced accepted a path with the wrong number of segments and a non-numeric
// owner, which is the drift a rule written twice always produces.
func TestPosterStorageKeyRefusesEverythingElse(t *testing.T) {
	id := uuid.New()
	for name, url := range map[string]string{
		"climbing out":             "/uploads/omnichat/generated/7/../../../etc/" + id.String() + "-poster.jpg",
		"too few segments":         "/uploads/omnichat/generated/" + id.String() + "-poster.jpg",
		"too many segments":        "/uploads/omnichat/generated/7/a/" + id.String() + "-poster.jpg",
		"a non-numeric owner":      "/uploads/omnichat/generated/seven/" + id.String() + "-poster.jpg",
		"another owner":            "/uploads/omnichat/generated/8/" + id.String() + "-poster.jpg",
		"a doubled slash":          "/uploads/omnichat/generated//7/" + id.String() + "-poster.jpg",
		"a backslash":              `/uploads/omnichat\generated/7/` + id.String() + "-poster.jpg",
		"another prefix":           "/uploads/avatars/7/" + id.String() + "-poster.jpg",
		"the clip itself":          "/uploads/omnichat/generated/7/" + id.String() + ".mp4",
		"not a poster":             "/uploads/omnichat/generated/7/" + id.String() + ".jpg",
		"a stem that is not a job": "/uploads/omnichat/generated/7/not-a-uuid-poster.jpg",
		"an absolute host":         "https://evil.test/x-poster.jpg",
		"empty":                    "   ",
	} {
		t.Run(name, func(t *testing.T) {
			_, ok := OmniChatPosterStorageKey(url, 7)
			require.False(t, ok)
		})
	}
}
