package service

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/omnigame/repository"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestAdmissionService_AdmitsPlatformPersonaAsPersonaSubject(t *testing.T) {
	authService := services.NewAuthService("dev-secret", "OmniGame/1.0", "")
	personas := repository.NewInMemoryPersonaRepository()
	personas.Add(repository.AdmissiblePersona{ID: 7, Name: "The Narrator"})

	admissions := NewAdmissionService(personas, repository.NewInMemoryProfileRepository(), authService)

	admission, err := admissions.AdmitPersona(context.Background(), 7)
	require.NoError(t, err)
	require.NotNil(t, admission)
	require.Equal(t, "persona-7", admission.PlayerID)
	require.Equal(t, "The Narrator", admission.PlayerName)
	require.NotEmpty(t, admission.WorldSessionToken)

	claims, err := authService.ValidateOmniRaveWorldJWTContext(context.Background(), admission.WorldSessionToken)
	require.NoError(t, err)
	require.Equal(t, "persona", string(claims.SubjectKind))
	// A persona carries no user id, and the explicit kind is what keeps that
	// from being read back as a guest.
	require.Nil(t, claims.UserID)
	require.Equal(t, "persona", claims.Mode)
	require.Equal(t, "The Narrator", claims.PlayerName)
}

func TestAdmissionService_RefusesPersonaThatIsNotAdmissible(t *testing.T) {
	authService := services.NewAuthService("dev-secret", "OmniGame/1.0", "")
	admissions := NewAdmissionService(
		repository.NewInMemoryPersonaRepository(),
		repository.NewInMemoryProfileRepository(),
		authService,
	)

	admission, err := admissions.AdmitPersona(context.Background(), 7)
	require.ErrorIs(t, err, ErrPersonaNotAdmissible)
	require.Nil(t, admission)
}
