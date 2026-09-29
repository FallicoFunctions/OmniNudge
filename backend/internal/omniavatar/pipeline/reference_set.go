package pipeline

import (
	"errors"
	"fmt"
)

type ViewRole string

const (
	ViewFront             ViewRole = "front"
	ViewBack              ViewRole = "back"
	ViewLeftProfile       ViewRole = "left_profile"
	ViewRightProfile      ViewRole = "right_profile"
	ViewFrontThreeQuarter ViewRole = "front_three_quarter"
	ViewRearThreeQuarter  ViewRole = "rear_three_quarter"
	ViewFaceClose         ViewRole = "face_close"
)

var requiredViewRoles = []ViewRole{
	ViewFront,
	ViewBack,
	ViewLeftProfile,
	ViewRightProfile,
	ViewFrontThreeQuarter,
	ViewRearThreeQuarter,
}

var allowedViewRoles = map[ViewRole]struct{}{
	ViewFront: {}, ViewBack: {}, ViewLeftProfile: {}, ViewRightProfile: {},
	ViewFrontThreeQuarter: {}, ViewRearThreeQuarter: {}, ViewFaceClose: {},
}

type ReferenceView struct {
	Role            ViewRole `json:"role"`
	StorageKey      string   `json:"storageKey"`
	SHA256          string   `json:"sha256"`
	MIMEType        string   `json:"mimeType"`
	Width           int      `json:"width"`
	Height          int      `json:"height"`
	Pose            string   `json:"pose"`
	Expression      string   `json:"expression"`
	FullBodyVisible bool     `json:"fullBodyVisible"`
}

type ReferenceSet struct {
	JobID                   string          `json:"jobId"`
	OwnerID                 int             `json:"ownerId"`
	AuthorityImageKey       string          `json:"authorityImageKey"`
	AuthorityImageSHA256    string          `json:"authorityImageSha256"`
	Views                   []ReferenceView `json:"views"`
	ConsistencyReportKey    string          `json:"consistencyReportKey"`
	ConsistencyReportSHA256 string          `json:"consistencyReportSha256"`
}

func (s ReferenceSet) ValidateForReconstruction() error {
	if err := validateCanonicalUUID("job", s.JobID); err != nil {
		return err
	}
	if s.OwnerID <= 0 {
		return errors.New("owner ID is required")
	}
	if err := validateNormalizedReferenceKey("authority image", s.AuthorityImageKey, s.JobID); err != nil {
		return err
	}
	if !sha256Pattern.MatchString(s.AuthorityImageSHA256) {
		return errors.New("authority image SHA-256 must be 64 lowercase hexadecimal characters")
	}
	if len(s.Views) < len(requiredViewRoles) || len(s.Views) > len(requiredViewRoles)+1 {
		return fmt.Errorf("reference set must contain %d required views and at most one face close-up", len(requiredViewRoles))
	}

	seen := make(map[ViewRole]struct{}, len(s.Views))
	seenKeys := map[string]struct{}{s.AuthorityImageKey: {}}
	seenHashes := make(map[string]struct{}, len(s.Views))
	for _, view := range s.Views {
		if _, allowed := allowedViewRoles[view.Role]; !allowed {
			return fmt.Errorf("unknown reference view role %q", view.Role)
		}
		if _, duplicate := seen[view.Role]; duplicate {
			return fmt.Errorf("duplicate reference view role %q", view.Role)
		}
		seen[view.Role] = struct{}{}
		if err := validateJobStorageKey("reference view", view.StorageKey, s.JobID); err != nil {
			return err
		}
		if _, duplicate := seenKeys[view.StorageKey]; duplicate {
			return fmt.Errorf("duplicate reference storage key %q", view.StorageKey)
		}
		seenKeys[view.StorageKey] = struct{}{}
		if !sha256Pattern.MatchString(view.SHA256) {
			return fmt.Errorf("view %q has an invalid SHA-256", view.Role)
		}
		if _, duplicate := seenHashes[view.SHA256]; duplicate {
			return fmt.Errorf("duplicate reference image SHA-256 for view %q", view.Role)
		}
		seenHashes[view.SHA256] = struct{}{}
		if view.MIMEType != "image/png" && view.MIMEType != "image/webp" {
			return fmt.Errorf("view %q must be PNG or WebP", view.Role)
		}
		if err := validateMediaExtension(view.StorageKey, view.MIMEType); err != nil {
			return fmt.Errorf("view %q %w", view.Role, err)
		}
		if view.Width < 1024 || view.Height < 1024 || view.Width > 4096 || view.Height > 4096 {
			return fmt.Errorf("view %q dimensions must be within 1024..4096 pixels", view.Role)
		}
		if view.Role == ViewFaceClose {
			if view.Pose != "head_neutral" || view.Expression != "neutral" || view.FullBodyVisible {
				return errors.New("face close-up must use head_neutral pose, neutral expression, and not claim full-body visibility")
			}
		} else {
			if view.Pose != "t_pose" || view.Expression != "neutral" || !view.FullBodyVisible {
				return fmt.Errorf("view %q must show a full-body neutral T-pose", view.Role)
			}
		}
	}
	for _, role := range requiredViewRoles {
		if _, ok := seen[role]; !ok {
			return fmt.Errorf("required reference view %q is missing", role)
		}
	}
	if err := validateJobStorageKey("consistency report", s.ConsistencyReportKey, s.JobID); err != nil {
		return err
	}
	if err := validateMediaExtension(s.ConsistencyReportKey, "application/json"); err != nil {
		return fmt.Errorf("consistency report %w", err)
	}
	if _, duplicate := seenKeys[s.ConsistencyReportKey]; duplicate {
		return errors.New("consistency report storage key duplicates an image key")
	}
	if !sha256Pattern.MatchString(s.ConsistencyReportSHA256) {
		return errors.New("consistency report SHA-256 must be 64 lowercase hexadecimal characters")
	}
	return nil
}

// OrderedReferenceKeys returns provider inputs in the canonical role order.
// Callers must validate the set first; returning a fresh slice prevents a
// provider adapter from mutating persisted reference metadata.
func (s ReferenceSet) OrderedReferenceKeys() ([]string, error) {
	if err := s.ValidateForReconstruction(); err != nil {
		return nil, err
	}
	byRole := make(map[ViewRole]string, len(s.Views))
	for _, view := range s.Views {
		byRole[view.Role] = view.StorageKey
	}
	keys := make([]string, 0, len(s.Views))
	for _, role := range requiredViewRoles {
		keys = append(keys, byRole[role])
	}
	if key, ok := byRole[ViewFaceClose]; ok {
		keys = append(keys, key)
	}
	return keys, nil
}
