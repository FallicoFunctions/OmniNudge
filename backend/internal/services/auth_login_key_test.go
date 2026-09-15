package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"strings"
	"testing"

	"github.com/omninudge/backend/internal/models"
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

func TestKeyBackupReturnsTheSettingsAndBothCopies(t *testing.T) {
	ctx := context.Background()
	auth, repo := newLoginKeyAuth(), mocks.NewUserRepository()
	registerWithKey(t, auth, repo, "backedup")
	user, _ := repo.GetByUsername(ctx, "backedup")
	require.NoError(t, repo.UpdateEncryptedPrivateKey(ctx, user.ID, "copy-under-wrap-key"))
	require.NoError(t, repo.UpdateRecoveryWrappedPrivateKey(ctx, user.ID, "copy-under-phrase"))

	backup, err := GetKeyBackup(ctx, repo, user.ID)
	require.NoError(t, err)
	assert.Equal(t, KeyBackup{AuthScheme: 2, HasPassword: true, KDFSalt: testKDFSalt, KDFIterations: MinKDFIterations,
		EncryptedPrivateKey: "copy-under-wrap-key", RecoveryWrappedPrivateKey: "copy-under-phrase"}, *backup)

	oauthOnly := &models.User{Username: "oauthbackup", PasswordHash: ""}
	require.NoError(t, repo.Create(ctx, oauthOnly))
	backup, err = GetKeyBackup(ctx, repo, oauthOnly.ID)
	require.NoError(t, err)
	assert.Equal(t, KeyBackup{AuthScheme: oauthOnly.AuthScheme, HasPassword: false}, *backup,
		"an account with no password says so, so the app offers no password step")
}

func TestStorePrivateKeyCopyNeedsTheAccountsSecret(t *testing.T) {
	ctx := context.Background()
	auth, repo := newLoginKeyAuth(), mocks.NewUserRepository()
	registerWithKey(t, auth, repo, "copykeeper")
	user, _ := repo.GetByUsername(ctx, "copykeeper")
	registerWithPassword(t, auth, repo, "oldscheme", "correct-horse")
	oldScheme, _ := repo.GetByUsername(ctx, "oldscheme")

	store := func(userID int, password, key, copy string) error {
		return StorePrivateKeyCopy(ctx, repo, userID, &PrivateKeyCopyRequest{Password: password, LoginKey: key, EncryptedPrivateKey: copy})
	}
	assert.ErrorIs(t, store(user.ID, "", "", "swapped-copy"), ErrCurrentPasswordIncorrect, "a session alone cannot swap the copy")
	assert.ErrorIs(t, store(user.ID, "", testLoginKey(6), "swapped-copy"), ErrCurrentPasswordIncorrect)
	assert.ErrorIs(t, store(user.ID, "some-password", "", "swapped-copy"), ErrCurrentPasswordIncorrect)
	assert.ErrorIs(t, store(oldScheme.ID, "wrong-horse", "", "swapped-copy"), ErrCurrentPasswordIncorrect)
	assert.ErrorIs(t, store(user.ID, "", testLoginKey(7), ""), ErrInvalidPrivateKeyCopy)
	assert.ErrorIs(t, store(user.ID, "", testLoginKey(7), strings.Repeat("x", maxWrappedCopyBytes+1)), ErrInvalidPrivateKeyCopy)
	unchanged, _ := repo.GetByID(ctx, user.ID)
	assert.Nil(t, unchanged.EncryptedPrivateKey, "no refused request wrote a copy")

	require.NoError(t, store(user.ID, "", testLoginKey(7), "copy-under-wrap-key"))
	stored, _ := repo.GetByID(ctx, user.ID)
	require.NotNil(t, stored.EncryptedPrivateKey)
	assert.Equal(t, "copy-under-wrap-key", *stored.EncryptedPrivateKey)
	require.NoError(t, store(oldScheme.ID, "correct-horse", "", "copy-under-password"))

	oauthOnly := &models.User{Username: "oauthcopy", PasswordHash: ""}
	require.NoError(t, repo.Create(ctx, oauthOnly))
	require.NoError(t, store(oauthOnly.ID, "", "", "copy-under-app-password"), "no password, so the session is the proof")
}

func TestStorePublicKeyNeedsTheAccountsSecret(t *testing.T) {
	ctx := context.Background()
	auth, repo := newLoginKeyAuth(), mocks.NewUserRepository()
	registerWithKey(t, auth, repo, "keypublisher")
	user, _ := repo.GetByUsername(ctx, "keypublisher")

	publish := func(userID int, key, publicKey string) error {
		return StorePublicKey(ctx, repo, userID, &PublicKeyRequest{LoginKey: key, PublicKey: publicKey})
	}
	assert.ErrorIs(t, publish(user.ID, "", "attackers-public-key"), ErrCurrentPasswordIncorrect, "a session alone cannot swap the key others encrypt to")
	assert.ErrorIs(t, publish(user.ID, testLoginKey(6), "attackers-public-key"), ErrCurrentPasswordIncorrect)
	assert.ErrorIs(t, publish(user.ID, testLoginKey(7), ""), ErrInvalidPublicKey)
	assert.ErrorIs(t, publish(user.ID, testLoginKey(7), strings.Repeat("x", maxWrappedCopyBytes+1)), ErrInvalidPublicKey)
	unchanged, _ := repo.GetByID(ctx, user.ID)
	assert.Nil(t, unchanged.PublicKey, "no refused request published a key")

	require.NoError(t, publish(user.ID, testLoginKey(7), "own-public-key"))
	stored, _ := repo.GetByID(ctx, user.ID)
	require.NotNil(t, stored.PublicKey)
	assert.Equal(t, "own-public-key", *stored.PublicKey)

	oauthOnly := &models.User{Username: "oauthpublisher", PasswordHash: ""}
	require.NoError(t, repo.Create(ctx, oauthOnly))
	require.NoError(t, publish(oauthOnly.ID, "", "own-public-key"), "no password, so the session is the proof")
}

func TestStoreRecoveryKeyNeedsTheAccountsSecret(t *testing.T) {
	ctx := context.Background()
	auth, repo := newLoginKeyAuth(), mocks.NewUserRepository()
	registerWithKey(t, auth, repo, "phrasekeeper")
	user, _ := repo.GetByUsername(ctx, "phrasekeeper")

	store := func(password, key, copy string) error {
		return StoreRecoveryKey(ctx, repo, user.ID, &RecoveryKeyRequest{Password: password, LoginKey: key, RecoveryWrappedPrivateKey: copy})
	}
	assert.ErrorIs(t, store("", "", "copy-under-phrase"), ErrCurrentPasswordIncorrect, "a session alone cannot replace the phrase")
	assert.ErrorIs(t, store("", testLoginKey(6), "copy-under-phrase"), ErrCurrentPasswordIncorrect)
	assert.ErrorIs(t, store("some-password", "", "copy-under-phrase"), ErrCurrentPasswordIncorrect, "a login key account never proves itself with a password")
	assert.ErrorIs(t, store("", testLoginKey(7), ""), ErrInvalidRecoveryCopy)
	assert.ErrorIs(t, store("", testLoginKey(7), strings.Repeat("x", maxWrappedCopyBytes+1)), ErrInvalidRecoveryCopy)

	require.NoError(t, store("", testLoginKey(7), "copy-under-phrase"))
	stored, _ := repo.GetByID(ctx, user.ID)
	require.NotNil(t, stored.RecoveryWrappedPrivateKey)
	assert.Equal(t, "copy-under-phrase", *stored.RecoveryWrappedPrivateKey)
}

func TestStoreRecoveryKeyForAnAccountWithNoPasswordNeedsOnlyTheSession(t *testing.T) {
	ctx := context.Background()
	repo := mocks.NewUserRepository()
	oauthOnly := &models.User{Username: "oauthonly", PasswordHash: ""}
	require.NoError(t, repo.Create(ctx, oauthOnly))

	require.NoError(t, StoreRecoveryKey(ctx, repo, oauthOnly.ID, &RecoveryKeyRequest{RecoveryWrappedPrivateKey: "copy-under-phrase"}))
	stored, _ := repo.GetByID(ctx, oauthOnly.ID)
	require.NotNil(t, stored.RecoveryWrappedPrivateKey)
}

func TestSetAppPasswordOnlyOnAnAccountWithoutOne(t *testing.T) {
	ctx := context.Background()
	auth, repo := newLoginKeyAuth(), mocks.NewUserRepository()
	oauthOnly := &models.User{Username: "googleuser", PasswordHash: ""}
	require.NoError(t, repo.Create(ctx, oauthOnly))

	set := func(userID int, rounds int, copy string) error {
		return SetAppPassword(ctx, repo, userID, &AppPasswordRequest{LoginKey: testLoginKey(3), KDFSalt: testKDFSalt, KDFIterations: rounds, EncryptedPrivateKey: copy})
	}
	assert.ErrorIs(t, set(oauthOnly.ID, 1000, "copy-under-app-password"), ErrInvalidLoginKey)
	assert.ErrorIs(t, set(oauthOnly.ID, MinKDFIterations, ""), ErrPrivateKeyNotRewrapped)

	require.NoError(t, set(oauthOnly.ID, MinKDFIterations, "copy-under-app-password"))
	stored, _ := repo.GetByID(ctx, oauthOnly.ID)
	assert.Equal(t, 2, stored.AuthScheme)
	require.NotNil(t, stored.EncryptedPrivateKey)
	assert.Equal(t, "copy-under-app-password", *stored.EncryptedPrivateKey)
	_, _, err := auth.Login(ctx, repo, &LoginRequest{Username: "googleuser", LoginKey: testLoginKey(3)})
	assert.NoError(t, err, "the app password is also a way to sign in")

	assert.ErrorIs(t, set(oauthOnly.ID, MinKDFIterations, "another-copy"), ErrAccountHasPassword, "once set, change-password applies")
	registerWithPassword(t, auth, repo, "haspassword", "correct-horse")
	withPassword, _ := repo.GetByUsername(ctx, "haspassword")
	assert.ErrorIs(t, set(withPassword.ID, MinKDFIterations, "copy"), ErrAccountHasPassword)
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
