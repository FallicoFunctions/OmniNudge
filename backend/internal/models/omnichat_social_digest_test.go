package models

import (
	"crypto/sha256"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestOmniChatSnapshotDigestChangesWithAttachmentIdentityAndPosition(t *testing.T) {
	createdAt := time.Date(2026, time.July, 20, 12, 0, 0, 0, time.UTC)
	firstAsset := uuid.New()
	secondAsset := uuid.New()
	digestFor := func(position int, assetID uuid.UUID) []byte {
		digest := sha256.New()
		writeOmniChatSnapshotMessageDigest(digest, 11, "assistant", "At the park.", createdAt)
		writeOmniChatSnapshotAttachmentDigestValue(digest, position, assetID)
		return digest.Sum(nil)
	}

	baseline := digestFor(0, firstAsset)
	require.NotEqual(t, baseline, digestFor(0, secondAsset))
	require.NotEqual(t, baseline, digestFor(1, firstAsset))
}
