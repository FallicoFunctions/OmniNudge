package handlers

import "testing"

func TestCanViewerSeeProfile(t *testing.T) {
	tests := []struct {
		name              string
		profileUserID     int
		viewerID          int
		profileVisibility string
		viewerIsFriend    bool
		want              bool
	}{
		{
			name:              "owner can always view private profile",
			profileUserID:     10,
			viewerID:          10,
			profileVisibility: "private",
			want:              true,
		},
		{
			name:              "public profile visible to others",
			profileUserID:     10,
			viewerID:          11,
			profileVisibility: "public",
			want:              true,
		},
		{
			name:              "empty visibility defaults to public",
			profileUserID:     10,
			viewerID:          11,
			profileVisibility: "",
			want:              true,
		},
		{
			name:              "friends only visible to accepted friend",
			profileUserID:     10,
			viewerID:          11,
			profileVisibility: "friends_only",
			viewerIsFriend:    true,
			want:              true,
		},
		{
			name:              "friends only hidden from non-friend",
			profileUserID:     10,
			viewerID:          11,
			profileVisibility: "friends_only",
			viewerIsFriend:    false,
			want:              false,
		},
		{
			name:              "private hidden from non-owner",
			profileUserID:     10,
			viewerID:          11,
			profileVisibility: "private",
			want:              false,
		},
		{
			name:              "invalid value fails closed",
			profileUserID:     10,
			viewerID:          11,
			profileVisibility: "team_only",
			want:              false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := canViewerSeeProfile(tt.profileUserID, tt.viewerID, tt.profileVisibility, tt.viewerIsFriend)
			if got != tt.want {
				t.Fatalf("canViewerSeeProfile() = %v, want %v", got, tt.want)
			}
		})
	}
}
