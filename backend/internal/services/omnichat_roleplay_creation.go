package services

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/omninudge/backend/internal/models"
)

//go:embed roleplay_choices.json
var roleplayChoicesJSON []byte

// The catalog is the only source of selectable character content. The browser
// receives it for rendering, and the server resolves IDs against the same data.
type RoleplayChoice struct {
	ID              string   `json:"id"`
	Label           string   `json:"label"`
	Description     string   `json:"description,omitempty"`
	AdultRestricted bool     `json:"adult_restricted,omitempty"`
	Opening         string   `json:"opening,omitempty"`
	Scene           string   `json:"scene,omitempty"`
	SettingKinds    []string `json:"setting_kinds,omitempty"`
	Relationships   []string `json:"relationships,omitempty"`
}

type RoleplayRole struct {
	ID              string   `json:"id"`
	Label           string   `json:"label"`
	AdultRestricted bool     `json:"adult_restricted,omitempty"`
	Goals           []string `json:"goals"`
	MinAge          int      `json:"min_age"`
	Genders         []string `json:"genders,omitempty"`
	SettingKinds    []string `json:"setting_kinds,omitempty"`
}

type RoleplayRoleGroup struct {
	ID              string         `json:"id"`
	Label           string         `json:"label"`
	AdultRestricted bool           `json:"adult_restricted,omitempty"`
	UserRoles       []string       `json:"user_roles"`
	Roles           []RoleplayRole `json:"roles"`
}

type RoleplayRegion struct {
	ID     string   `json:"id"`
	Label  string   `json:"label"`
	Kind   string   `json:"kind"`
	Venues []string `json:"venues"`
}

type RoleplayCatalog struct {
	RoleGroups     []RoleplayRoleGroup `json:"role_groups"`
	Goals          []RoleplayChoice    `json:"goals"`
	Regions        []RoleplayRegion    `json:"regions"`
	Venues         []RoleplayChoice    `json:"venues"`
	FirstNames     map[string][]string `json:"first_names"`
	LastNames      []string            `json:"last_names"`
	HairColors     []RoleplayChoice    `json:"hair_colors"`
	HairStyles     []RoleplayChoice    `json:"hair_styles"`
	EyeColors      []RoleplayChoice    `json:"eye_colors"`
	Builds         []RoleplayChoice    `json:"builds"`
	Wardrobes      []RoleplayChoice    `json:"wardrobes"`
	Traits         []RoleplayChoice    `json:"traits"`
	SpeechStyles   []RoleplayChoice    `json:"speech_styles"`
	Backstories    []RoleplayChoice    `json:"backstories"`
	UserRoles      []RoleplayChoice    `json:"user_roles"`
	Relationships  []RoleplayChoice    `json:"relationships"`
	OpeningBeats   []RoleplayChoice    `json:"opening_beats"`
	ResponseStyles []RoleplayChoice    `json:"response_styles"`
}

var curatedRoleplayCatalog = mustLoadRoleplayCatalog()

func RoleplayCreationCatalog() *RoleplayCatalog { return &curatedRoleplayCatalog }

func mustLoadRoleplayCatalog() RoleplayCatalog {
	var catalog RoleplayCatalog
	if err := json.Unmarshal(roleplayChoicesJSON, &catalog); err != nil {
		panic(fmt.Sprintf("invalid packaged roleplay catalog: %v", err))
	}
	for _, group := range catalog.RoleGroups {
		for _, userRoleID := range group.UserRoles {
			mustHaveChoice(catalog.UserRoles, userRoleID)
		}
		for _, role := range group.Roles {
			if role.MinAge < 18 || role.MinAge > 100 || len(role.Goals) == 0 {
				panic("invalid roleplay role: " + role.ID)
			}
			for _, goalID := range role.Goals {
				mustHaveChoice(catalog.Goals, goalID)
			}
		}
	}
	for _, region := range catalog.Regions {
		for _, venueID := range region.Venues {
			mustHaveChoice(catalog.Venues, venueID)
		}
	}
	for _, userRole := range catalog.UserRoles {
		for _, relationshipID := range userRole.Relationships {
			mustHaveChoice(catalog.Relationships, relationshipID)
		}
	}
	for _, beat := range catalog.OpeningBeats {
		if len(beat.SettingKinds) == 0 {
			panic("roleplay opening moment has no setting kinds: " + beat.ID)
		}
		for _, kind := range beat.SettingKinds {
			if kind != "real" && kind != "online" && kind != "fantasy" && kind != "scifi" {
				panic("unknown roleplay opening setting kind: " + kind)
			}
		}
	}
	return catalog
}

func mustHaveChoice(options []RoleplayChoice, id string) {
	for _, option := range options {
		if option.ID == id {
			return
		}
	}
	panic("unknown roleplay catalog reference: " + id)
}

// RoleplayCreationAnswers contains only catalog IDs and an age selection.
// No client-authored prompt, scene, biography, or media path is accepted.
type RoleplayCreationAnswers struct {
	RoleID         string `json:"role_id"`
	GoalID         string `json:"goal_id"`
	RegionID       string `json:"region_id"`
	VenueID        string `json:"venue_id"`
	Gender         string `json:"gender"`
	FirstName      string `json:"first_name"`
	LastName       string `json:"last_name"`
	Age            int    `json:"age"`
	RenderStyle    string `json:"render_style"`
	HairColorID    string `json:"hair_color_id"`
	HairStyleID    string `json:"hair_style_id"`
	EyeColorID     string `json:"eye_color_id"`
	BuildID        string `json:"build_id"`
	WardrobeID     string `json:"wardrobe_id"`
	PrimaryTraitID string `json:"primary_trait_id"`
	SecondTraitID  string `json:"second_trait_id"`
	SpeechStyleID  string `json:"speech_style_id"`
	BackstoryID    string `json:"backstory_id"`
	UserRoleID     string `json:"user_role_id"`
	RelationshipID string `json:"relationship_id"`
	OpeningBeatID  string `json:"opening_beat_id"`
	ResponseStyle  string `json:"response_style"`
	IsNSFW         bool   `json:"is_nsfw"`
}

const RoleplayCreatorMarker = "omnichat_roleplay_creator"

var ErrRoleplayCreationAnswers = errors.New("invalid roleplay creation answers")

func selectRole(catalog *RoleplayCatalog, id string) (*RoleplayRoleGroup, *RoleplayRole, error) {
	for groupIndex := range catalog.RoleGroups {
		group := &catalog.RoleGroups[groupIndex]
		for roleIndex := range group.Roles {
			role := &group.Roles[roleIndex]
			if role.ID == id {
				return group, role, nil
			}
		}
	}
	return nil, nil, fmt.Errorf("%w: choose a character role", ErrRoleplayCreationAnswers)
}

func selectChoice(options []RoleplayChoice, id, label string) (RoleplayChoice, error) {
	for _, option := range options {
		if option.ID == id {
			return option, nil
		}
	}
	return RoleplayChoice{}, fmt.Errorf("%w: choose a valid %s", ErrRoleplayCreationAnswers, label)
}

func selectedString(options []string, value string) bool {
	for _, option := range options {
		if option == value {
			return true
		}
	}
	return false
}

// BuildRoleplayPersona turns catalog choices into a complete, private card.
// The ordinary conversation prompt remains in force via {{original}}.
func BuildRoleplayPersona(a RoleplayCreationAnswers) (*models.BotPersona, error) {
	catalog := RoleplayCreationCatalog()
	group, role, err := selectRole(catalog, a.RoleID)
	if err != nil {
		return nil, err
	}
	if !selectedString(role.Goals, a.GoalID) {
		return nil, fmt.Errorf("%w: this goal does not fit the character role", ErrRoleplayCreationAnswers)
	}
	goal, err := selectChoice(catalog.Goals, a.GoalID, "goal")
	if err != nil {
		return nil, err
	}
	var region *RoleplayRegion
	for i := range catalog.Regions {
		if catalog.Regions[i].ID == a.RegionID {
			region = &catalog.Regions[i]
			break
		}
	}
	if region == nil || (region.Kind != "online" &&
		((len(role.SettingKinds) == 0 && region.Kind != "real") ||
			(len(role.SettingKinds) > 0 && !selectedString(role.SettingKinds, region.Kind)))) {
		return nil, fmt.Errorf("%w: choose a setting that fits the character", ErrRoleplayCreationAnswers)
	}
	if !selectedString(region.Venues, a.VenueID) {
		return nil, fmt.Errorf("%w: this place is not in the chosen setting", ErrRoleplayCreationAnswers)
	}
	venue, err := selectChoice(catalog.Venues, a.VenueID, "specific place")
	if err != nil {
		return nil, err
	}
	if a.Gender != "woman" && a.Gender != "man" {
		return nil, fmt.Errorf("%w: choose a gender", ErrRoleplayCreationAnswers)
	}
	if len(role.Genders) > 0 && !selectedString(role.Genders, a.Gender) {
		return nil, fmt.Errorf("%w: this role does not fit the selected gender", ErrRoleplayCreationAnswers)
	}
	if !selectedString(catalog.FirstNames[a.Gender], a.FirstName) || !selectedString(catalog.LastNames, a.LastName) {
		return nil, fmt.Errorf("%w: choose a name from the list", ErrRoleplayCreationAnswers)
	}
	if a.Age < role.MinAge || a.Age > 100 {
		return nil, fmt.Errorf("%w: choose an adult age that fits the role", ErrRoleplayCreationAnswers)
	}
	if a.RenderStyle != "realistic" && a.RenderStyle != "anime" {
		return nil, fmt.Errorf("%w: choose realistic or anime art", ErrRoleplayCreationAnswers)
	}
	hairColor, err := selectChoice(catalog.HairColors, a.HairColorID, "hair color")
	if err != nil {
		return nil, err
	}
	hairStyle, err := selectChoice(catalog.HairStyles, a.HairStyleID, "hair style")
	if err != nil {
		return nil, err
	}
	eyeColor, err := selectChoice(catalog.EyeColors, a.EyeColorID, "eye color")
	if err != nil {
		return nil, err
	}
	build, err := selectChoice(catalog.Builds, a.BuildID, "build")
	if err != nil {
		return nil, err
	}
	wardrobe, err := selectChoice(catalog.Wardrobes, a.WardrobeID, "wardrobe")
	if err != nil {
		return nil, err
	}
	primaryTrait, err := selectChoice(catalog.Traits, a.PrimaryTraitID, "first personality trait")
	if err != nil {
		return nil, err
	}
	secondTrait, err := selectChoice(catalog.Traits, a.SecondTraitID, "second personality trait")
	if err != nil {
		return nil, err
	}
	if primaryTrait.ID == secondTrait.ID {
		return nil, fmt.Errorf("%w: choose two different personality traits", ErrRoleplayCreationAnswers)
	}
	speech, err := selectChoice(catalog.SpeechStyles, a.SpeechStyleID, "speaking style")
	if err != nil {
		return nil, err
	}
	backstory, err := selectChoice(catalog.Backstories, a.BackstoryID, "backstory")
	if err != nil {
		return nil, err
	}
	if !selectedString(group.UserRoles, a.UserRoleID) {
		return nil, fmt.Errorf("%w: choose a role for yourself that fits the character", ErrRoleplayCreationAnswers)
	}
	userRole, err := selectChoice(catalog.UserRoles, a.UserRoleID, "your role")
	if err != nil {
		return nil, err
	}
	if !selectedString(userRole.Relationships, a.RelationshipID) {
		return nil, fmt.Errorf("%w: this relationship does not fit your role", ErrRoleplayCreationAnswers)
	}
	if a.IsNSFW && (group.AdultRestricted || role.AdultRestricted || goal.AdultRestricted || userRole.AdultRestricted) {
		return nil, fmt.Errorf("%w: 18+ is not available for school or family scenarios", ErrRoleplayCreationAnswers)
	}
	relationship, err := selectChoice(catalog.Relationships, a.RelationshipID, "relationship")
	if err != nil {
		return nil, err
	}
	beat, err := selectChoice(catalog.OpeningBeats, a.OpeningBeatID, "opening moment")
	if err != nil {
		return nil, err
	}
	if !selectedString(beat.SettingKinds, region.Kind) {
		return nil, fmt.Errorf("%w: this opening does not fit the setting", ErrRoleplayCreationAnswers)
	}
	if _, err := selectChoice(catalog.ResponseStyles, a.ResponseStyle, "response style"); err != nil {
		return nil, err
	}

	name := a.FirstName + " " + a.LastName
	genderPhrase := map[string]string{"woman": "woman", "man": "man"}[a.Gender]
	subject := map[string]string{"woman": "she", "man": "he"}[a.Gender]
	buildLabel := strings.ToLower(build.Label)
	buildArticle := "a"
	if strings.ContainsRune("aeiou", rune(buildLabel[0])) {
		buildArticle = "an"
	}
	appearance := fmt.Sprintf("An adult %s, age %d, with %s hair worn %s, %s eyes, and %s %s. %s.",
		genderPhrase, a.Age, strings.ToLower(hairColor.Label), strings.ToLower(hairStyle.Label),
		strings.ToLower(eyeColor.Label), buildArticle, buildLabel, wardrobe.Label)
	profile := models.OmniChatMediaIdentityProfile{
		Appearance: appearance, RenderStyle: a.RenderStyle, Subject: subject,
		Style: models.OmniAIStyleProfile{Note: wardrobe.Label},
	}
	extensions, err := json.Marshal(map[string]any{
		RoleplayCreatorMarker: true,
		"omnichat_media":      profile,
		"roleplay_choices_v2": a,
	})
	if err != nil {
		return nil, err
	}
	description := fmt.Sprintf("%s is a %d-year-old %s who is a %s. %s.", name, a.Age, genderPhrase, strings.ToLower(role.Label), backstory.Label)
	personality := fmt.Sprintf("%s and %s. Speaking style: %s. Current goal: %s.",
		primaryTrait.Label, strings.ToLower(secondTrait.Label), speech.Label, goal.Label)
	scenario := strings.Join([]string{
		"Setting: " + region.Label,
		"Specific place: " + venue.Label,
		"Character role: " + role.Label,
		"Current goal: " + goal.Label,
		"The user plays: " + userRole.Label,
		"Relationship: " + relationship.Label,
		"Opening moment: " + beat.Scene,
	}, "\n")
	firstMessage := openingFromChoices(beat.ID, name, venue.Scene, region.Label, goal.Opening)
	if region.Kind == "online" {
		firstMessage = onlineOpeningFromChoices(beat.ID, name, venue.Scene, goal.Opening)
	}
	if a.ResponseStyle == models.ResponseStyleProfileCharacterOnly {
		// The first message must obey the same dialogue-only choice as later replies.
		firstMessage = goal.Opening
	}
	systemPrompt := "{{original}}\nTreat the current roleplay scene and relationship as established facts. Follow direction from the user when it fits the scene and the character's agency. Never reset the scene because the conversation moves to voice or video. Use live call and camera state supplied by the call, rather than assuming physical co-location."
	if region.Kind == "online" {
		systemPrompt += "\nThe story begins as remote communication through " + strings.ToLower(venue.Label) + ". The character and user are not physically together. Do not assume shared surroundings or physical contact unless the user explicitly changes the scene. If they move to a live voice or video call, acknowledge that channel and its actual camera state."
	}
	return &models.BotPersona{
		Name: name, Description: &description, Category: models.PersonaCategoryRoleplay,
		Visibility: "private", SourceFormat: "native",
		SystemPrompt: systemPrompt,
		Personality:  personality, Scenario: scenario, FirstMessage: firstMessage,
		ResponseStyleProfile:    a.ResponseStyle,
		PostHistoryInstructions: "Maintain the established scene, relationship, and character voice across turns. Continue from the most recent conversation state instead of repeating the opening.",
		AlternateGreetings:      []string{}, CreatorNotes: "", Tags: []string{group.Label},
		CharacterVersion: "2.0", ExtensionsJSON: extensions, CharacterBookJSON: json.RawMessage(`{}`),
		GalleryURLs: []string{}, IsNSFW: a.IsNSFW,
	}, nil
}

func onlineOpeningFromChoices(beatID, name, venue, goalOpening string) string {
	var moment string
	switch beatID {
	case "planned_online_chat":
		moment = fmt.Sprintf("At the agreed time, %s sends a message in %s.", name, venue)
	case "unexpected_online_message":
		moment = fmt.Sprintf("%s sends you an unexpected message in %s.", name, venue)
	case "reconnecting_online":
		moment = fmt.Sprintf("%s picks up your earlier conversation in %s.", name, venue)
	default:
		moment = fmt.Sprintf("A new message from %s appears in %s.", name, venue)
	}
	return "*" + moment + "* \"" + goalOpening + "\""
}

func openingFromChoices(beatID, name, venue, region, goalOpening string) string {
	for _, article := range []string{"A ", "An ", "The "} {
		if strings.HasPrefix(region, article) {
			region = strings.ToLower(article[:1]) + region[1:]
			break
		}
	}
	var moment string
	switch beatID {
	case "chance_encounter":
		moment = fmt.Sprintf("You run into %s at %s in %s.", name, venue, region)
	case "busy_day":
		moment = fmt.Sprintf("At %s in %s, %s pauses in the middle of a busy day when you arrive.", venue, region, name)
	case "urgent_news":
		moment = fmt.Sprintf("At %s in %s, %s comes toward you with urgent news.", venue, region, name)
	case "quiet_moment":
		moment = fmt.Sprintf("At %s in %s, %s notices you during a rare quiet moment.", venue, region, name)
	case "first_assignment":
		moment = fmt.Sprintf("At %s in %s, %s meets you to begin working together.", venue, region, name)
	default:
		moment = fmt.Sprintf("At %s in %s, %s is waiting for your planned meeting.", venue, region, name)
	}
	return "*" + moment + "* \"" + goalOpening + "\""
}

// IsGeneratedRoleplay is true only for cards made by the guided creator.
func IsGeneratedRoleplay(persona *models.BotPersona) bool {
	if persona == nil || !models.PersonaPerformsAScene(persona) {
		return false
	}
	var marker struct {
		Enabled bool `json:"omnichat_roleplay_creator"`
	}
	return json.Unmarshal(persona.ExtensionsJSON, &marker) == nil && marker.Enabled
}
