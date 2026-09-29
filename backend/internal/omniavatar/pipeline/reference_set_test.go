package pipeline

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

const referenceJobID = "00000000-0000-4000-8000-000000000001"

func validReferenceSet() ReferenceSet {
	views := make([]ReferenceView, 0, len(requiredViewRoles))
	for index, role := range requiredViewRoles {
		views = append(views, ReferenceView{
			Role:            role,
			StorageKey:      fmt.Sprintf("omniavatar/jobs/%s/references/%s.webp", referenceJobID, role),
			SHA256:          strings.Repeat(fmt.Sprintf("%x", index+1), 64),
			MIMEType:        "image/webp",
			Width:           2048,
			Height:          2048,
			Pose:            "t_pose",
			Expression:      "neutral",
			FullBodyVisible: true,
		})
	}
	return ReferenceSet{
		JobID:                   referenceJobID,
		OwnerID:                 42,
		AuthorityImageKey:       "omniavatar/jobs/" + referenceJobID + "/authority/source.png",
		AuthorityImageSHA256:    strings.Repeat("a", 64),
		Views:                   views,
		ConsistencyReportKey:    "omniavatar/jobs/" + referenceJobID + "/references/consistency.json",
		ConsistencyReportSHA256: strings.Repeat("b", 64),
	}
}

func TestReferenceSetRejectsUnknownRoleAndDuplicateContent(t *testing.T) {
	set := validReferenceSet()
	set.Views = append(set.Views, ReferenceView{
		Role: "top", StorageKey: "omniavatar/jobs/" + referenceJobID + "/references/top.webp",
		SHA256: strings.Repeat("c", 64), MIMEType: "image/webp", Width: 2048, Height: 2048,
		Pose: "t_pose", Expression: "neutral", FullBodyVisible: true,
	})
	require.ErrorContains(t, set.ValidateForReconstruction(), "unknown")

	set = validReferenceSet()
	set.Views[1].SHA256 = set.Views[0].SHA256
	require.ErrorContains(t, set.ValidateForReconstruction(), "duplicate reference image")

	set = validReferenceSet()
	set.Views[1].StorageKey = set.Views[0].StorageKey
	require.ErrorContains(t, set.ValidateForReconstruction(), "duplicate reference storage")
}

func TestReferenceSetValidatesOptionalFaceClose(t *testing.T) {
	set := validReferenceSet()
	set.Views = append(set.Views, ReferenceView{
		Role:       ViewFaceClose,
		StorageKey: "omniavatar/jobs/" + referenceJobID + "/references/face.webp",
		SHA256:     strings.Repeat("c", 64), MIMEType: "image/webp", Width: 2048, Height: 2048,
		Pose: "head_neutral", Expression: "neutral", FullBodyVisible: false,
	})
	require.NoError(t, set.ValidateForReconstruction())
	set.Views[len(set.Views)-1].FullBodyVisible = true
	require.ErrorContains(t, set.ValidateForReconstruction(), "face close-up")
}

func TestReferenceSetRequiresOneConsistentSixViewTurnaround(t *testing.T) {
	require.NoError(t, validReferenceSet().ValidateForReconstruction())
}

func TestReferenceSetRejectsMissingViewAndActionPose(t *testing.T) {
	set := validReferenceSet()
	set.Views = set.Views[:len(set.Views)-1]
	require.Error(t, set.ValidateForReconstruction())

	set = validReferenceSet()
	set.Views[0].Pose = "walking"
	require.ErrorContains(t, set.ValidateForReconstruction(), "neutral T-pose")
}

func TestReferenceSetRejectsDuplicateRoleAndUnsafeKey(t *testing.T) {
	set := validReferenceSet()
	set.Views[1].Role = set.Views[0].Role
	require.ErrorContains(t, set.ValidateForReconstruction(), "duplicate")

	set = validReferenceSet()
	set.Views[0].StorageKey = "../../other-user/reference.png"
	require.Error(t, set.ValidateForReconstruction())
}

func TestReferenceSetRejectsWhitespacePaddedReportHash(t *testing.T) {
	set := validReferenceSet()
	set.ConsistencyReportSHA256 += " "
	require.ErrorContains(t, set.ValidateForReconstruction(), "consistency report SHA-256")
}

func TestReferenceSetRejectsMediaExtensionMismatches(t *testing.T) {
	set := validReferenceSet()
	set.Views[0].StorageKey = strings.TrimSuffix(set.Views[0].StorageKey, ".webp") + ".png"
	require.ErrorContains(t, set.ValidateForReconstruction(), "does not match media type")

	set = validReferenceSet()
	set.AuthorityImageKey = strings.TrimSuffix(set.AuthorityImageKey, ".png") + ".jpg"
	require.ErrorContains(t, set.ValidateForReconstruction(), ".png or .webp")

	set = validReferenceSet()
	set.ConsistencyReportKey = strings.TrimSuffix(set.ConsistencyReportKey, ".json") + ".bin"
	require.ErrorContains(t, set.ValidateForReconstruction(), "does not match media type")
}

func TestReferenceSetOrdersProviderInputsAndKeepsFaceCloseLast(t *testing.T) {
	set := validReferenceSet()
	set.Views = append([]ReferenceView{set.Views[4], set.Views[1], set.Views[5], set.Views[0], set.Views[3], set.Views[2]}, ReferenceView{
		Role: ViewFaceClose, StorageKey: "omniavatar/jobs/" + referenceJobID + "/references/face.webp",
		SHA256: strings.Repeat("9", 64), MIMEType: "image/webp", Width: 1024, Height: 1024,
		Pose: "head_neutral", Expression: "neutral", FullBodyVisible: false,
	})
	keys, err := set.OrderedReferenceKeys()
	require.NoError(t, err)
	require.Len(t, keys, 7)
	for index, role := range requiredViewRoles {
		require.Contains(t, keys[index], string(role))
	}
	require.Contains(t, keys[6], "face.webp")
}
