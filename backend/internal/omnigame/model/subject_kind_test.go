package model

import "testing"

// Identity must never be concluded from a nil field. These pin the half of that
// rule that lives in the model: derivation exists only so call sites written
// before the field keep working, and it is deliberately incapable of producing
// a persona.
func TestPlayerIdentity_ResolvedKind(t *testing.T) {
	userID := 42

	for _, tc := range []struct {
		name     string
		identity PlayerIdentity
		want     SubjectKind
	}{
		{
			name:     "a stated kind is used as given",
			identity: PlayerIdentity{Kind: SubjectKindPersona},
			want:     SubjectKindPersona,
		},
		{
			name:     "a stated kind wins over what the fields imply",
			identity: PlayerIdentity{UserID: &userID, Kind: SubjectKindPersona},
			want:     SubjectKindPersona,
		},
		{
			name:     "an unstated kind with a user id is an account",
			identity: PlayerIdentity{UserID: &userID},
			want:     SubjectKindAccount,
		},
		{
			name:     "an unstated kind with no user id is a guest",
			identity: PlayerIdentity{},
			want:     SubjectKindGuest,
		},
		{
			name:     "a kind this build does not know is not trusted",
			identity: PlayerIdentity{UserID: &userID, Kind: SubjectKind("resident")},
			want:     SubjectKindAccount,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.identity.ResolvedKind(); got != tc.want {
				t.Fatalf("ResolvedKind() = %q, want %q", got, tc.want)
			}
		})
	}
}

// The point of the previous test's last two cases, stated on its own because it
// is the invariant rather than an example: nothing infers a persona. A persona
// is only ever a persona because whoever admitted it said so.
func TestPlayerIdentity_ResolvedKind_NeverInfersPersona(t *testing.T) {
	userID := 7
	for _, identity := range []PlayerIdentity{
		{},
		{UserID: &userID},
		{Username: "someone"},
		{Kind: SubjectKind("")},
		{Kind: SubjectKind("unknown-to-this-build")},
	} {
		if got := identity.ResolvedKind(); got == SubjectKindPersona {
			t.Fatalf("derived a persona from %+v; a persona must be stated, never concluded", identity)
		}
	}
}

func TestSubjectKind_Valid(t *testing.T) {
	valid := []SubjectKind{SubjectKindAccount, SubjectKindGuest, SubjectKindPersona}
	for _, k := range valid {
		if !k.Valid() {
			t.Fatalf("%q should be valid", k)
		}
	}

	// Empty is not valid on purpose. Callers distinguish "absent, so fill it in
	// the way this subject was always read" from "present but meaningless, so
	// refuse", and folding those together is what would let an unknown kind
	// through as a default.
	invalid := []SubjectKind{"", "Account", "ACCOUNT", "resident", "persona ", "admin"}
	for _, k := range invalid {
		if k.Valid() {
			t.Fatalf("%q should not be valid", k)
		}
	}
}
