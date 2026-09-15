package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"testing"

	"github.com/omninudge/backend/internal/services/mocks"
	"github.com/omninudge/backend/internal/utils"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testLoginKey(fill byte) string {
	return base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{fill}, loginKeyBytes))
}

var testKDFSalt = base64.StdEncoding.EncodeToString([]byte("0123456789abcdef"))

func newLoginKeyAuth() *AuthService {
	return NewAuthService("01234567890123456789012345678901", "test", "")
}

func registerWithKey(t *testing.T, auth *AuthService, repo *mocks.UserRepository, name string) {
	t.Helper()
	_, _, err := auth.Register(context.Background(), repo, &RegisterRequest{
		Username: name, LoginKey: testLoginKey(7), KDFSalt: testKDFSalt, KDFIterations: MinKDFIterations,
		AcceptPrivacyPolicy: true, AcceptTerms: true,
	})
	require.NoError(t, err)
}

func registerWithPassword(t *testing.T, auth *AuthService, repo *mocks.UserRepository, name, password string) {
	t.Helper()
	_, _, err := auth.Register(context.Background(), repo, &RegisterRequest{
		Username: name, Password: password, AcceptPrivacyPolicy: true, AcceptTerms: true,
	})
	require.NoError(t, err)
}

func TestRegisterWithLoginKeyStartsOnSchemeTwo(t *testing.T) {
	ctx := context.Background()
	auth, repo := newLoginKeyAuth(), mocks.NewUserRepository()
	registerWithKey(t, auth, repo, "keyholder")

	stored, err := repo.GetByUsername(ctx, "keyholder")
	require.NoError(t, err)
	assert.Equal(t, 2, stored.AuthScheme)
	require.NotNil(t, stored.KDFSalt)
	assert.Equal(t, testKDFSalt, *stored.KDFSalt)
	require.NotNil(t, stored.KDFIterations)
	assert.Equal(t, MinKDFIterations, *stored.KDFIterations)
	assert.NotEqual(t, testLoginKey(7), stored.PasswordHash, "the login key is stored hashed")
}

func TestSchemeTwoSignsInOnlyWithItsLoginKey(t *testing.T) {
	ctx := context.Background()
	auth, repo := newLoginKeyAuth(), mocks.NewUserRepository()
	registerWithKey(t, auth, repo, "keyholder")

	_, _, err := auth.Login(ctx, repo, &LoginRequest{Username: "keyholder", LoginKey: testLoginKey(7)})
	assert.NoError(t, err, "the right login key signs in")

	for name, req := range map[string]*LoginRequest{
		"a wrong login key":         {Username: "keyholder", LoginKey: testLoginKey(8)},
		"a password":                {Username: "keyholder", Password: "whatever-password"},
		"a password beside the key": {Username: "keyholder", LoginKey: testLoginKey(7), Password: "whatever-password"},
		"nothing":                   {Username: "keyholder"},
	} {
		_, _, err := auth.Login(ctx, repo, req)
		assert.Error(t, err, name)
	}
}

func TestSchemeOneSignsInOnlyWithItsPassword(t *testing.T) {
	ctx := context.Background()
	auth, repo := newLoginKeyAuth(), mocks.NewUserRepository()
	registerWithPassword(t, auth, repo, "oldschool", "correct-horse")

	stored, err := repo.GetByUsername(ctx, "oldschool")
	require.NoError(t, err)
	assert.Equal(t, 1, stored.AuthScheme)

	_, _, err = auth.Login(ctx, repo, &LoginRequest{Username: "oldschool", Password: "correct-horse"})
	assert.NoError(t, err)
	_, _, err = auth.Login(ctx, repo, &LoginRequest{Username: "oldschool", LoginKey: testLoginKey(7)})
	assert.Error(t, err, "a scheme 1 account has no login key yet")
}

func TestMoveToLoginKeyNeedsThePasswordAndHappensOnce(t *testing.T) {
	ctx := context.Background()
	auth, repo := newLoginKeyAuth(), mocks.NewUserRepository()
	registerWithPassword(t, auth, repo, "mover", "correct-horse")
	user, err := repo.GetByUsername(ctx, "mover")
	require.NoError(t, err)

	move := &LoginKeyUpgradeRequest{CurrentPassword: "wrong-horse", LoginKey: testLoginKey(9), KDFSalt: testKDFSalt, KDFIterations: MinKDFIterations}
	assert.Error(t, auth.MoveToLoginKey(ctx, repo, user.ID, move), "the wrong password must not move the account")
	still, _ := repo.GetByID(ctx, user.ID)
	assert.Equal(t, 1, still.AuthScheme)

	require.NoError(t, repo.UpdateEncryptedPrivateKey(ctx, user.ID, "wrapped-by-password"))
	move.CurrentPassword = "correct-horse"
	move.EncryptedPrivateKey = "wrapped-by-wrap-key"
	require.NoError(t, auth.MoveToLoginKey(ctx, repo, user.ID, move))
	moved, _ := repo.GetByID(ctx, user.ID)
	require.NotNil(t, moved.EncryptedPrivateKey)
	assert.Equal(t, "wrapped-by-wrap-key", *moved.EncryptedPrivateKey, "the copy wrapped with the password must not outlive the move")

	_, _, err = auth.Login(ctx, repo, &LoginRequest{Username: "mover", Password: "correct-horse"})
	assert.Error(t, err, "after the move the password is no longer accepted")
	_, _, err = auth.Login(ctx, repo, &LoginRequest{Username: "mover", LoginKey: testLoginKey(9)})
	assert.NoError(t, err)

	assert.ErrorIs(t, auth.MoveToLoginKey(ctx, repo, user.ID, move), ErrAlreadyOnLoginKey)
}

func TestPreLoginDoesNotTellMissingAccountsFromLoginKeyAccounts(t *testing.T) {
	ctx := context.Background()
	auth, repo := newLoginKeyAuth(), mocks.NewUserRepository()
	registerWithKey(t, auth, repo, "keyholder")
	registerWithPassword(t, auth, repo, "oldschool", "correct-horse")

	real, err := auth.PreLogin(ctx, repo, "keyholder")
	require.NoError(t, err)
	assert.Equal(t, PreLoginResponse{Scheme: 2, KDFSalt: testKDFSalt, KDFIterations: MinKDFIterations}, *real)

	old, err := auth.PreLogin(ctx, repo, "oldschool")
	require.NoError(t, err)
	assert.Equal(t, PreLoginResponse{Scheme: 1}, *old)

	ghost, err := auth.PreLogin(ctx, repo, "nobody-here")
	require.NoError(t, err)
	assert.Equal(t, 2, ghost.Scheme)
	assert.Equal(t, MinKDFIterations, ghost.KDFIterations)
	salt, err := base64.StdEncoding.DecodeString(ghost.KDFSalt)
	require.NoError(t, err)
	assert.Len(t, salt, minKDFSaltBytes)

	again, _ := auth.PreLogin(ctx, repo, "nobody-here")
	assert.Equal(t, ghost.KDFSalt, again.KDFSalt, "the same missing name always gets the same salt")
	other, _ := auth.PreLogin(ctx, repo, "someone-else")
	assert.NotEqual(t, ghost.KDFSalt, other.KDFSalt, "different missing names get different salts")
}

func TestCheckAccountSecretAcceptsOnlyTheAccountsOwnKind(t *testing.T) {
	keyHash, err := utils.HashPassword(testLoginKey(5))
	require.NoError(t, err)
	passwordHash, err := utils.HashPassword("correct-horse")
	require.NoError(t, err)

	for name, tc := range map[string]struct {
		hash               string
		scheme             int
		password, loginKey string
		ok                 bool
	}{
		"scheme 2 with its key":            {keyHash, 2, "", testLoginKey(5), true},
		"scheme 2 with a wrong key":        {keyHash, 2, "", testLoginKey(6), false},
		"scheme 2 with a password":         {keyHash, 2, "correct-horse", "", false},
		"scheme 2 with the key and a word": {keyHash, 2, "correct-horse", testLoginKey(5), false},
		"scheme 1 with its password":       {passwordHash, 1, "correct-horse", "", true},
		"scheme 1 with a key":              {passwordHash, 1, "", testLoginKey(5), false},
		"scheme 1 with nothing":            {passwordHash, 1, "", "", false},
	} {
		err := CheckAccountSecret(tc.hash, tc.scheme, tc.password, tc.loginKey)
		if tc.ok {
			assert.NoError(t, err, name)
		} else {
			assert.ErrorIs(t, err, ErrWrongSecret, name)
		}
	}
}

func TestChangeLoginKeyNeedsTheCurrentKeyAndTheRewrappedCopy(t *testing.T) {
	ctx := context.Background()
	auth, repo := newLoginKeyAuth(), mocks.NewUserRepository()
	registerWithKey(t, auth, repo, "changer")
	user, _ := repo.GetByUsername(ctx, "changer")
	require.NoError(t, repo.UpdateEncryptedPrivateKey(ctx, user.ID, "copy-under-old-key"))
	versionBefore := user.TokenVersion

	change := func(current string, rounds int, copy string) error {
		return ChangeLoginKey(ctx, repo, user.ID, &LoginKeyChangeRequest{
			CurrentLoginKey: current, NewLoginKey: testLoginKey(8), KDFSalt: testKDFSalt, KDFIterations: rounds, EncryptedPrivateKey: copy,
		})
	}
	assert.ErrorIs(t, change(testLoginKey(6), MinKDFIterations, "copy-under-new-key"), ErrCurrentPasswordIncorrect)
	assert.ErrorIs(t, change(testLoginKey(7), MinKDFIterations, ""), ErrPrivateKeyNotRewrapped, "a change must not drop the key")
	assert.ErrorIs(t, change(testLoginKey(7), 1000, "copy-under-new-key"), ErrInvalidLoginKey)

	require.NoError(t, change(testLoginKey(7), MinKDFIterations, "copy-under-new-key"))
	changed, _ := repo.GetByID(ctx, user.ID)
	require.NotNil(t, changed.EncryptedPrivateKey)
	assert.Equal(t, "copy-under-new-key", *changed.EncryptedPrivateKey)
	assert.Greater(t, changed.TokenVersion, versionBefore, "other sessions end")

	_, _, err := auth.Login(ctx, repo, &LoginRequest{Username: "changer", LoginKey: testLoginKey(7)})
	assert.Error(t, err, "the old login key no longer signs in")
	_, _, err = auth.Login(ctx, repo, &LoginRequest{Username: "changer", LoginKey: testLoginKey(8)})
	assert.NoError(t, err)

	registerWithPassword(t, auth, repo, "stillpassword", "correct-horse")
	old, _ := repo.GetByUsername(ctx, "stillpassword")
	assert.ErrorIs(t, ChangeLoginKey(ctx, repo, old.ID, &LoginKeyChangeRequest{
		CurrentLoginKey: testLoginKey(1), NewLoginKey: testLoginKey(2), KDFSalt: testKDFSalt, KDFIterations: MinKDFIterations,
	}), ErrNotOnLoginKey)
}

func TestResetToLoginKeyClearsTheCopyItCanNoLongerOpen(t *testing.T) {
	ctx := context.Background()
	auth, repo := newLoginKeyAuth(), mocks.NewUserRepository()
	registerWithPassword(t, auth, repo, "forgetful", "correct-horse")
	user, _ := repo.GetByUsername(ctx, "forgetful")
	require.NoError(t, repo.UpdateEncryptedPrivateKey(ctx, user.ID, "copy-under-forgotten-password"))

	assert.ErrorIs(t, ResetToLoginKey(ctx, repo, user.ID, testLoginKey(4), testKDFSalt, 1000), ErrInvalidLoginKey)
	require.NoError(t, ResetToLoginKey(ctx, repo, user.ID, testLoginKey(4), testKDFSalt, MinKDFIterations))

	reset, _ := repo.GetByID(ctx, user.ID)
	assert.Equal(t, 2, reset.AuthScheme)
	assert.Nil(t, reset.EncryptedPrivateKey, "the copy wrapped by the forgotten password is cleared")
	_, _, err := auth.Login(ctx, repo, &LoginRequest{Username: "forgetful", Password: "correct-horse"})
	assert.Error(t, err)
	_, _, err = auth.Login(ctx, repo, &LoginRequest{Username: "forgetful", LoginKey: testLoginKey(4)})
	assert.NoError(t, err)
}

func TestRegisterRefusesBadLoginKeySettings(t *testing.T) {
	auth, repo := newLoginKeyAuth(), mocks.NewUserRepository()
	short := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, loginKeyBytes-1))
	tinySalt := base64.StdEncoding.EncodeToString([]byte("12345678"))
	for name, req := range map[string]RegisterRequest{
		"a 31-byte key":            {LoginKey: short, KDFSalt: testKDFSalt, KDFIterations: MinKDFIterations},
		"a key that is not base64": {LoginKey: "not base64!", KDFSalt: testKDFSalt, KDFIterations: MinKDFIterations},
		"an 8-byte salt":           {LoginKey: testLoginKey(1), KDFSalt: tinySalt, KDFIterations: MinKDFIterations},
		"too few rounds":           {LoginKey: testLoginKey(1), KDFSalt: testKDFSalt, KDFIterations: MinKDFIterations - 1},
		"too many rounds":          {LoginKey: testLoginKey(1), KDFSalt: testKDFSalt, KDFIterations: maxKDFIterations + 1},
		"a key and a password":     {LoginKey: testLoginKey(1), KDFSalt: testKDFSalt, KDFIterations: MinKDFIterations, Password: "also-a-password"},
	} {
		req.Username, req.AcceptPrivacyPolicy, req.AcceptTerms = "refused_user", true, true
		_, _, err := auth.Register(context.Background(), repo, &req)
		assert.Error(t, err, name)
	}
}
