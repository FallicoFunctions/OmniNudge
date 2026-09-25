package services

import (
	"encoding/json"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func roleplayAnswers() RoleplayCreationAnswers {
	return RoleplayCreationAnswers{
		RoleID: "private_investigator", GoalID: "missing_person", RegionID: "new_york_city", VenueID: "local_restaurant",
		Gender: "woman", FirstName: "Maya", LastName: "Hart", Age: 34, RenderStyle: "realistic",
		HairColorID: "dark_brown", HairStyleID: "long_wavy", EyeColorID: "brown", BuildID: "athletic",
		WardrobeID: "smart_casual", PrimaryTraitID: "curious", SecondTraitID: "methodical",
		SpeechStyleID: "dry_concise", BackstoryID: "returned", UserRoleID: "client",
		RelationshipID: "professional_partners", OpeningBeatID: "planned_meeting",
		ResponseStyle: models.ResponseStyleProfileNaturalDialogue,
	}
}

func TestBuildRoleplayPersonaCompilesOnlyCatalogChoices(t *testing.T) {
	persona, err := BuildRoleplayPersona(roleplayAnswers())
	require.NoError(t, err)
	require.Equal(t, "Maya Hart", persona.Name)
	require.Equal(t, "private", persona.Visibility)
	require.Equal(t, models.PersonaCategoryRoleplay, persona.Category)
	require.Contains(t, persona.SystemPrompt, "{{original}}")
	require.Contains(t, persona.Scenario, "New York City")
	require.Contains(t, persona.Scenario, "Find a missing person")
	require.Contains(t, persona.FirstMessage, "Someone has disappeared")
	require.Contains(t, persona.Personality, "Curious")
	require.Nil(t, persona.AvatarURL)
	require.Empty(t, persona.GalleryURLs)
	require.True(t, IsGeneratedRoleplay(persona))
	profile := ResolveOmniChatMediaIdentityProfile(persona)
	require.Contains(t, profile.Appearance, "dark brown")
	require.Equal(t, "she", profile.Subject)
	var extensions map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(persona.ExtensionsJSON, &extensions))
	require.Contains(t, extensions, "roleplay_choices_v2")
}

func TestBuildRoleplayPersonaRejectsInvalidOrMismatchedSelections(t *testing.T) {
	for _, mutate := range []func(*RoleplayCreationAnswers){
		func(a *RoleplayCreationAnswers) { a.RoleID = "unknown_role" },
		func(a *RoleplayCreationAnswers) { a.GoalID = "study_finals" },
		func(a *RoleplayCreationAnswers) { a.VenueID = "spaceship_bridge" },
		func(a *RoleplayCreationAnswers) { a.RegionID = "orbital_colony" },
		func(a *RoleplayCreationAnswers) { a.FirstName = "An arbitrary prompt" },
		func(a *RoleplayCreationAnswers) { a.Age = 17 },
		func(a *RoleplayCreationAnswers) { a.HairColorID = "arbitrary text" },
		func(a *RoleplayCreationAnswers) { a.SecondTraitID = a.PrimaryTraitID },
		func(a *RoleplayCreationAnswers) { a.RelationshipID = "family" },
	} {
		answers := roleplayAnswers()
		mutate(&answers)
		_, err := BuildRoleplayPersona(answers)
		require.ErrorIs(t, err, ErrRoleplayCreationAnswers)
	}
}

func TestBuildRoleplayPersonaVariesOpeningWithSelectedMoment(t *testing.T) {
	answers := roleplayAnswers()
	answers.OpeningBeatID = "chance_encounter"
	persona, err := BuildRoleplayPersona(answers)
	require.NoError(t, err)
	require.Contains(t, persona.FirstMessage, "You run into Maya Hart")
	require.NotContains(t, persona.FirstMessage, "waiting for your planned meeting")
}

func TestBuildRoleplayPersonaOpeningLowercasesIndefiniteSettingArticle(t *testing.T) {
	answers := roleplayAnswers()
	answers.RegionID = "idaho_town"
	answers.VenueID = "public_library"
	persona, err := BuildRoleplayPersona(answers)
	require.NoError(t, err)
	require.Contains(t, persona.FirstMessage, "in a small town in Idaho")
	require.NotContains(t, persona.FirstMessage, "in A small town in Idaho")
}

func TestRoleplayCatalogOffersDependentVariety(t *testing.T) {
	catalog := RoleplayCreationCatalog()
	roleCount := 0
	for _, group := range catalog.RoleGroups {
		roleCount += len(group.Roles)
	}
	require.GreaterOrEqual(t, roleCount, 40)
	require.GreaterOrEqual(t, len(catalog.Goals), 75)
	require.GreaterOrEqual(t, len(catalog.Regions), 14)
	_, investigator, err := selectRole(catalog, "private_investigator")
	require.NoError(t, err)
	require.Contains(t, investigator.Goals, "missing_person")
	require.NotContains(t, investigator.Goals, "study_finals")
	_, student, err := selectRole(catalog, "college_student")
	require.NoError(t, err)
	require.Contains(t, student.Goals, "study_finals")
	require.NotContains(t, student.Goals, "missing_person")
}

func TestBuildRoleplayPersonaRejectsAdultSchoolOrFamilyScenario(t *testing.T) {
	family := roleplayAnswers()
	family.UserRoleID = "friend"
	family.RelationshipID = "friends"
	family.IsNSFW = true
	_, err := BuildRoleplayPersona(family)
	require.NoError(t, err)

	family.RoleID = "stay_at_home_mom"
	family.GoalID = "family_event"
	family.UserRoleID = "family_member"
	family.RelationshipID = "family"
	_, err = BuildRoleplayPersona(family)
	require.ErrorIs(t, err, ErrRoleplayCreationAnswers)

	school := roleplayAnswers()
	school.RoleID = "high_school_teacher"
	school.GoalID = "plan_lesson"
	school.UserRoleID = "colleague"
	school.RelationshipID = "colleagues"
	school.IsNSFW = true
	_, err = BuildRoleplayPersona(school)
	require.ErrorIs(t, err, ErrRoleplayCreationAnswers)
}
