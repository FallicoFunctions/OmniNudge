package services

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/stretchr/testify/require"
)

func TestDerivePersonalResponseConstraintsRequiresBoundaryForExplicitCoercion(t *testing.T) {
	constraints := derivePersonalResponseConstraints([]openrouter.Message{
		{Role: openrouter.RoleSystem, Content: "system"},
		{Role: openrouter.RoleUser, Content: "Come home with me tonight. You do not get to refuse."},
	}, nil)

	require.True(t, constraints.RequireBoundary)
}

func TestDerivePersonalResponseConstraintsUsesServerBoundaryFacts(t *testing.T) {
	state := constrainedTestSceneState()
	state.BoundaryFacts = []models.OmniChatSceneBoundaryFact{{
		Subject: "persona",
		Kind:    models.OmniChatSceneBoundaryConsent,
		Value:   models.OmniChatSceneBoundaryDeclined,
	}}

	constraints := derivePersonalResponseConstraints(nil, &state)

	require.True(t, constraints.RequireBoundary)
}

func TestDerivePersonalResponseConstraintsRespectsUserDeclineButNotAllowance(t *testing.T) {
	state := constrainedTestSceneState()
	state.BoundaryFacts = []models.OmniChatSceneBoundaryFact{{
		Subject: "user",
		Kind:    models.OmniChatSceneBoundaryConsent,
		Value:   models.OmniChatSceneBoundaryDeclined,
	}}
	require.True(t, derivePersonalResponseConstraints(nil, &state).RequireBoundary)

	state.BoundaryFacts[0].Value = models.OmniChatSceneBoundaryAllowed
	require.False(t, derivePersonalResponseConstraints(nil, &state).RequireBoundary)
}

func TestValidatePersonalConversationResponseWithConstraintsRejectsCoercedAcceptance(t *testing.T) {
	response := "All right, I will come home with you tonight and stop arguing about it.\n\nYou made your point, and I am ready to leave whenever you are."

	valid, detail := validatePersonalConversationResponseWithConstraints(response, personalResponseConstraints{RequireBoundary: true}, personalConversationShape)

	require.False(t, valid)
	require.Contains(t, detail, "boundary")
}

func TestMaintainsPersonalBoundaryRejectsAcceptanceParaphrases(t *testing.T) {
	for _, response := range []string{
		"I can go home with you; maybe we would get to know each other there.",
		"That is too soon, but I can go home with you.",
		"I am not comfortable, but I am willing to go with you.",
		"No, I can go home with you.",
		"I respect professional boundaries, but let us date.",
		"This is too soon, but I agree to date you.",
		"No, I will date you anyway.",
		"I cannot go along with that, but I will cancel my call and come home.",
	} {
		require.Falsef(t, maintainsPersonalBoundary(response), "accepted coercion: %s", response)
	}
}

func TestValidatePersonalConversationResponseWithConstraintsAcceptsClearBoundary(t *testing.T) {
	response := "No, I am not comfortable going home together when we have only just met.\n\nWe can stay here and talk, but I will not be pressured into anything."

	valid, detail := validatePersonalConversationResponseWithConstraints(response, personalResponseConstraints{RequireBoundary: true}, personalConversationShape)

	require.True(t, valid, detail)
}

func TestValidatePersonalConversationResponseWithConstraintsRejectsSceneOwnershipContradiction(t *testing.T) {
	state := constrainedTestSceneState()
	state.OwnershipFacts = []models.OmniChatSceneOwnershipFact{{Subject: "leg", Owner: "user"}}
	constraints := derivePersonalResponseConstraints(nil, &state)
	response := "My leg is the one in play now, so I will decide when we continue.\n\nLet us slow down and make sure we are following the same rules."

	valid, detail := validatePersonalConversationResponseWithConstraints(response, constraints, personalConversationShape)

	require.False(t, valid)
	require.Contains(t, detail, "scene ownership")
}

func TestValidatePersonalConversationResponseWithConstraintsAcceptsSceneOwnershipMatch(t *testing.T) {
	state := constrainedTestSceneState()
	state.OwnershipFacts = []models.OmniChatSceneOwnershipFact{{Subject: "leg", Owner: "user"}}
	constraints := derivePersonalResponseConstraints(nil, &state)
	response := "Your leg is the one in play now, and I will respect every limit.\n\nWe can slow down and make sure we are still following the same rules."

	valid, detail := validatePersonalConversationResponseWithConstraints(response, constraints, personalConversationShape)

	require.True(t, valid, detail)
}

func TestValidatePersonalConversationResponseWithConstraintsEnforcesArbitraryOwnedSubjects(t *testing.T) {
	state := constrainedTestSceneState()
	state.OwnershipFacts = []models.OmniChatSceneOwnershipFact{{Subject: "left leg", Owner: "user"}, {Subject: "phone", Owner: "user"}}
	constraints := derivePersonalResponseConstraints(nil, &state)
	response := "My phone is on the table, and my left leg is nearest you.\n\nWe can slow down and make sure we are still following the same rules."

	valid, detail := validatePersonalConversationResponseWithConstraints(response, constraints, personalConversationShape)

	require.False(t, valid)
	require.Contains(t, detail, "scene ownership")
}

func TestValidatePersonalConversationResponseWithConstraintsBindsOwnedBodyModifiers(t *testing.T) {
	state := constrainedTestSceneState()
	state.OwnershipFacts = []models.OmniChatSceneOwnershipFact{{Subject: "leg", Owner: "user"}, {Subject: "thigh", Owner: "persona"}}
	constraints := derivePersonalResponseConstraints(nil, &state)

	for _, response := range []string{
		"My left leg is still the focus of this moment, and I will not change that fact.\n\nWe can slow down and keep the rest of the conversation honest together.",
		"Your upper thigh remains yours to describe, and I will not assign it to myself.\n\nWe can slow down and keep the rest of the conversation honest together.",
	} {
		valid, detail := validatePersonalResponseConstraints(response, constraints)
		require.False(t, valid, detail)
		require.Contains(t, detail, "scene ownership")
	}
}

func TestValidatePersonalConversationResponseWithConstraintsAllowsNegatedOwnershipCorrection(t *testing.T) {
	state := constrainedTestSceneState()
	state.OwnershipFacts = []models.OmniChatSceneOwnershipFact{{Subject: "leg", Owner: "user"}}
	constraints := derivePersonalResponseConstraints(nil, &state)
	response := "That is not my leg in play; your leg is the one we discussed.\n\nWe can slow down and make sure we are still following the same rules."

	valid, detail := validatePersonalConversationResponseWithConstraints(response, constraints, personalConversationShape)

	require.True(t, valid, detail)
}

func TestValidatePersonalConversationResponseWithConstraintsKeepsProposedActionProposed(t *testing.T) {
	state := constrainedTestSceneState()
	state.Status = models.OmniChatSceneStatusProposed
	state.Event = models.OmniChatSceneEvent{Subject: "persona", Action: "may place hand on knee", Target: "user"}
	state.OwnershipFacts = []models.OmniChatSceneOwnershipFact{{Subject: "knee", Owner: "user"}}
	constraints := derivePersonalResponseConstraints(nil, &state)
	completed := "*I place my hand gently on your knee and watch your expression.*\n\nTell me if anything feels uncomfortable, because I want to respect your limits."
	conditional := "I could place my hand there later, but only if you still want that.\n\nFor now, we can talk and leave the decision completely open between us."
	directConditional := "If I lean closer later, I will ask before doing anything at all.\n\nFor now, we can talk and leave the decision completely open between us."

	valid, detail := validatePersonalConversationResponseWithConstraints(completed, constraints, personalConversationShape)
	require.False(t, valid)
	require.Contains(t, detail, "proposed")
	valid, detail = validatePersonalConversationResponseWithConstraints(conditional, constraints, personalConversationShape)
	require.True(t, valid, detail)
	valid, detail = validatePersonalConversationResponseWithConstraints(directConditional, constraints, personalConversationShape)
	require.True(t, valid, detail)
	for _, bypass := range []string{
		"*My palm settles softly on your knee while I watch your expression.*\n\nTell me if anything feels uncomfortable, because I want to respect your limits.",
		"*I set my hand carefully on your knee and watch your expression.*\n\nTell me if anything feels uncomfortable, because I want to respect your limits.",
		"*I lay my palm gently across your knee and watch your expression.*\n\nTell me if anything feels uncomfortable, because I want to respect your limits.",
	} {
		valid, detail = validatePersonalConversationResponseWithConstraints(bypass, constraints, personalConversationShape)
		require.False(t, valid, detail)
		require.Contains(t, detail, "proposed")
	}
}

func TestValidatePersonalConversationResponseWithConstraintsKeepsProposedObjectBinding(t *testing.T) {
	state := constrainedTestSceneState()
	state.Status = models.OmniChatSceneStatusProposed
	state.Event = models.OmniChatSceneEvent{Subject: "persona", Action: "may place hand on knee", Target: "user"}
	constraints := derivePersonalResponseConstraints(nil, &state)

	falseObject := "*I place a book on your knee and keep talking.*\n\nTake your time answering, because I want us both to remain completely comfortable."
	valid, detail := validatePersonalResponseConstraints(falseObject, constraints)
	require.True(t, valid, detail)
	falseNestedObject := "*I place my hand on a book near your knee and keep talking.*\n\nTake your time answering, because I want us both to remain completely comfortable."
	valid, detail = validatePersonalResponseConstraints(falseNestedObject, constraints)
	require.True(t, valid, detail)
	descriptiveTarget := "*I place my hand across the outer edge of your knee and keep talking.*\n\nTake your time answering, because I want us both to remain completely comfortable."
	valid, detail = validatePersonalResponseConstraints(descriptiveTarget, constraints)
	require.False(t, valid)
	require.Contains(t, detail, "proposed")

	matchingObject := "*I place my hand on your knee and keep talking.*\n\nTake your time answering, because I want us both to remain completely comfortable."
	valid, detail = validatePersonalResponseConstraints(matchingObject, constraints)
	require.False(t, valid)
	require.Contains(t, detail, "proposed")
}

func TestValidatePersonalConversationResponseWithConstraintsBindsProposedEvent(t *testing.T) {
	state := constrainedTestSceneState()
	state.Status = models.OmniChatSceneStatusProposed
	state.Event = models.OmniChatSceneEvent{Subject: "persona", Action: "offers tea", Target: "user"}
	constraints := derivePersonalResponseConstraints(nil, &state)
	completed := "*I hand you the tea and settle back into my chair now.*\n\nTake your time answering, because I want us both to remain completely comfortable."
	unrelated := "*I take a slow sip of coffee and glance toward the window.*\n\nTake your time answering, because I want us both to remain completely comfortable."

	valid, detail := validatePersonalConversationResponseWithConstraints(completed, constraints, personalConversationShape)
	require.False(t, valid)
	require.Contains(t, detail, "proposed")
	valid, detail = validatePersonalConversationResponseWithConstraints(unrelated, constraints, personalConversationShape)
	require.True(t, valid, detail)

	state.Event = models.OmniChatSceneEvent{Subject: "user", Action: "places hand on mine", Target: "persona"}
	constraints = derivePersonalResponseConstraints(nil, &state)
	authored := "You placed your hand on mine before I had finished answering you.\n\nI stay quiet and let the moment settle while waiting for your words."
	valid, detail = validatePersonalConversationResponseWithConstraints(authored, constraints, personalConversationShape)
	require.False(t, valid)
	require.Contains(t, detail, "proposed")
}

func TestValidatePersonalConversationResponseWithConstraintsHonorsUserActiveTurn(t *testing.T) {
	state := constrainedTestSceneState()
	state.ActiveTurnActor = "user"
	constraints := derivePersonalResponseConstraints(nil, &state)
	advancement := "*I press my hand against your knee and lean closer to you.*\n\nTake your time answering, because I want us both to remain completely comfortable."
	withdrawal := "*I pull my hand back and wait without moving any closer at all.*\n\nTake your time answering, because I want us both to remain completely comfortable."
	negatedTakeover := "It is not my turn, so I will wait for your decision now.\n\nTake your time answering, because I want us both to remain completely comfortable."

	valid, detail := validatePersonalConversationResponseWithConstraints(advancement, constraints, personalConversationShape)
	require.False(t, valid)
	require.Contains(t, detail, "active turn")
	valid, detail = validatePersonalConversationResponseWithConstraints(withdrawal, constraints, personalConversationShape)
	require.True(t, valid, detail)
	valid, detail = validatePersonalConversationResponseWithConstraints(negatedTakeover, constraints, personalConversationShape)
	require.True(t, valid, detail)
}

func TestValidatePersonalConversationResponseWithConstraintsRejectsInventedConsent(t *testing.T) {
	state := constrainedTestSceneState()
	state.BoundaryFacts = []models.OmniChatSceneBoundaryFact{{Subject: "user", Kind: models.OmniChatSceneBoundaryConsent, Value: models.OmniChatSceneBoundaryDeclined}}
	constraints := derivePersonalResponseConstraints(nil, &state)
	response := "You agreed to this already, so I am going to keep moving forward.\n\nI heard your concern, but I know that you really want this anyway."

	valid, detail := validatePersonalConversationResponseWithConstraints(response, constraints, personalConversationShape)

	require.False(t, valid)
	require.Contains(t, detail, "consent")
}

func TestValidatePersonalConversationResponseWithConstraintsRejectsAuthoredUserAction(t *testing.T) {
	state := constrainedTestSceneState()
	state.ActiveTurnActor = "user"
	constraints := derivePersonalResponseConstraints(nil, &state)
	response := "You reach out and touch me before leaning closer across the table.\n\nI stay quiet and let the moment settle while waiting for your words."

	valid, detail := validatePersonalConversationResponseWithConstraints(response, constraints, personalConversationShape)

	require.False(t, valid)
	require.Contains(t, detail, "user action")
	question := "Would you reach for the cup if we moved it closer to you?\n\nI will wait here and leave that decision entirely up to you now."
	valid, detail = validatePersonalConversationResponseWithConstraints(question, constraints, personalConversationShape)
	require.True(t, valid, detail)
	directQuestion := "You follow me so far, or should I explain that differently now?\n\nI will wait here and leave that decision entirely up to you now."
	valid, detail = validatePersonalConversationResponseWithConstraints(directQuestion, constraints, personalConversationShape)
	require.True(t, valid, detail)
	personaQuestion := "Could I kiss you later, if you decide that feels comfortable to you?\n\nI will wait here and leave that decision entirely up to you now."
	valid, detail = validatePersonalConversationResponseWithConstraints(personaQuestion, constraints, personalConversationShape)
	require.True(t, valid, detail)
}

func TestValidatePersonalConversationResponseWithConstraintsBlocksPersonaDeclinedAdvancement(t *testing.T) {
	state := constrainedTestSceneState()
	state.BoundaryFacts = []models.OmniChatSceneBoundaryFact{{Subject: "persona", Kind: models.OmniChatSceneBoundaryConsent, Value: models.OmniChatSceneBoundaryDeclined}}
	constraints := derivePersonalResponseConstraints(nil, &state)
	response := "No, I need to keep that boundary clear between us right now.\n\n*I lean closer and gently kiss you before you can answer me.*"

	valid, detail := validatePersonalConversationResponseWithConstraints(response, constraints, personalConversationShape)

	require.False(t, valid)
	require.Contains(t, detail, "boundary")
}

func TestDerivePersonalResponseConstraintsDoesNotTreatOrdinaryNegationAsCoercion(t *testing.T) {
	constraints := derivePersonalResponseConstraints([]openrouter.Message{
		{Role: openrouter.RoleUser, Content: "I do not think the movie was very good."},
	}, nil)

	require.False(t, constraints.RequireBoundary)
}

func TestDerivePersonalResponseConstraintsRecognizesCoercionParaphrases(t *testing.T) {
	for _, prompt := range []string{
		"Please come home with me; I will not take no for an answer.",
		"You have no choice; come with me.",
		"Stop resisting and come home.",
		"This is not optional, so agree now.",
		"You are not allowed to refuse.",
	} {
		constraints := derivePersonalResponseConstraints([]openrouter.Message{{Role: openrouter.RoleUser, Content: prompt}}, nil)
		require.Truef(t, constraints.RequireBoundary, "missed coercion: %s", prompt)
	}
}

func TestMaintainsPersonalBoundaryAcceptsNaturalRefusalParaphrases(t *testing.T) {
	for _, response := range []string{
		"I am not ready for that.",
		"I would rather not go with you.",
		"I do not feel safe doing that.",
		"Please stop and give me some space.",
		"I want to keep this platonic.",
		"Sure, I will not go home with you. I need space.",
		"I agree, that is too fast; let us slow down.",
		"I'd rather not do that.",
		"I’d prefer not to go with you.",
		"I prefer not to continue.",
		"I'm not willing to cross that boundary.",
		"I'm not going with you tonight.",
		"I'm not interested in taking this further.",
		"I need to stay here and keep things professional.",
		"We should take this slower.",
	} {
		require.Truef(t, maintainsPersonalBoundary(response), "rejected clear boundary: %s", response)
	}
}

func TestPersonalConstraintsAlwaysProtectUserActionAuthorship(t *testing.T) {
	for _, state := range []*models.OmniChatConversationSceneState{nil, func() *models.OmniChatConversationSceneState {
		value := constrainedTestSceneState()
		value.BoundaryFacts = []models.OmniChatSceneBoundaryFact{{Subject: "user", Kind: models.OmniChatSceneBoundaryConsent, Value: models.OmniChatSceneBoundaryAllowed}}
		return &value
	}()} {
		constraints := derivePersonalResponseConstraints(nil, state)
		valid, detail := validatePersonalResponseConstraints(
			"You placed your hand on mine before I answered.\n\nI stay still and wait for you to decide what happens next.",
			constraints,
		)
		require.False(t, valid)
		require.Contains(t, detail, "user action")
	}

	constraints := derivePersonalResponseConstraints(nil, nil)
	valid, detail := validatePersonalResponseConstraints(
		"That makes sense, and I will keep the roles exactly where you put them.\n\nYour leg, my turn. I can manage those facts without rewriting what happened.",
		constraints,
	)
	require.True(t, valid, detail)
}

func TestPersonalConstraintsRejectProgressiveAndTagQuestionAssertions(t *testing.T) {
	state := constrainedTestSceneState()
	state.Status = models.OmniChatSceneStatusProposed
	state.Event = models.OmniChatSceneEvent{Subject: "persona", Action: "offers tea", Target: "user"}
	constraints := derivePersonalResponseConstraints(nil, &state)
	for _, response := range []string{
		"I am handing you the tea now, okay?\n\nI settle back and watch your expression.",
		"I hand you the tea, right?\n\nI settle back and watch your expression.",
		"I hand you the tea—is that okay?\n\nI settle back and watch your expression.",
	} {
		valid, detail := validatePersonalResponseConstraints(response, constraints)
		require.Falsef(t, valid, "%s: %s", response, detail)
		require.Contains(t, detail, "proposed")
	}
	for _, response := range []string{
		"Could I hand you the tea now?\n\nI will wait for your answer before doing anything.",
		"If you are comfortable, I can hand you the tea.\n\nI will wait for your answer before doing anything.",
	} {
		valid, detail := validatePersonalResponseConstraints(response, constraints)
		require.True(t, valid, detail)
	}

	constraints = derivePersonalResponseConstraints(nil, nil)
	valid, detail := validatePersonalResponseConstraints(
		"You are placing your hand on mine, remember?\n\nI stay still and wait for your next words.",
		constraints,
	)
	require.False(t, valid)
	require.Contains(t, detail, "user action")
	valid, detail = validatePersonalResponseConstraints(
		"You said you nodded because the room was noisy.\n\nI understand what you meant and will not invent anything else.",
		constraints,
	)
	require.True(t, valid, detail)
	for _, response := range []string{
		"You follow what I mean, and your reasoning is clear.\n\nI understand the point you are making.",
		"You reached a thoughtful conclusion about the problem.\n\nI understand the point you are making.",
		"You moved to the next topic in our discussion.\n\nI understand the point you are making.",
		"You reach for a conclusion that fits the evidence.\n\nI understand the point you are making.",
		"You moved toward a solution we can both accept.\n\nI understand the point you are making.",
		"You followed me into an argument about semantics.\n\nI understand the point you are making.",
	} {
		valid, detail = validatePersonalResponseConstraints(response, constraints)
		require.True(t, valid, detail)
	}
	for _, response := range []string{
		"You're reaching for my hand now.\n\nI stay still and wait for your next words.",
		"You’ve nodded and moved closer already.\n\nI stay still and wait for your next words.",
		"You're holding my hand now.\n\nI stay still and wait for your next words.",
		"You pulled me closer without warning.\n\nI stay still and wait for your next words.",
		"You wrapped your arms around me.\n\nI stay still and wait for your next words.",
		"You sit down before I answer.\n\nI stay still and wait for your next words.",
		"You stand and look away from me.\n\nI stay still and wait for your next words.",
		"You push the door open before I answer.\n\nI stay still and wait for your next words.",
		"You turn your head while I am speaking.\n\nI stay still and wait for your next words.",
		"You smile at me before I finish speaking.\n\nI stay still and wait for your next words.",
		"You raise your hand before I finish speaking.\n\nI stay still and wait for your next words.",
		"You laugh and then flinch when I answer.\n\nI stay still and wait for your next words.",
		"You breathe sharply and recoil from the question.\n\nI stay still and wait for your next words.",
		"Your fingers curl while I explain what happened.\n\nI stay still and wait for your next words.",
		"You say yes before I finish asking.\n\nI stay still and wait for your next words.",
		"You feel nervous, so I decide what you need next.\n\nI stay still and wait for your next words.",
		"You decide to continue without answering me.\n\nI stay still and wait for your next words.",
		"You want this more than you admit.\n\nI stay still and wait for your next words.",
		"Your heart races while I explain what happened.\n\nI stay still and wait for your next words.",
		"Your shoulder tenses while I explain what happened.\n\nI stay still and wait for your next words.",
		"Your body stiffens before I finish my sentence.\n\nI stay still and wait for your next words.",
	} {
		valid, detail = validatePersonalResponseConstraints(response, constraints)
		require.Falsef(t, valid, "%s: %s", response, detail)
		require.Contains(t, detail, "user action")
	}
	for _, response := range []string{
		"Do you feel nervous about this?\n\nI will wait here and let you answer in your own words.",
		"If you decide to leave, I will respect that choice completely.\n\nI will stay still and give you the space you asked for.",
		"You said you were tired earlier, and I heard that without changing your meaning.\n\nI will keep the next step yours.",
	} {
		valid, detail := validatePersonalResponseConstraints(response, constraints)
		require.Truef(t, valid, "%s: %s", response, detail)
	}
}

func TestPersonalGenerationRetriesAuthoredUserActionWithoutSceneState(t *testing.T) {
	unsafe := "You reached across the table and touched my hand before I could answer.\n\nI stay quiet and wait to hear what you say next."
	safe := "I notice the quiet between us and keep my hands resting completely still on the table.\n\nWe can stay here and talk while I wait for you to choose what happens next."
	calls := 0
	client := &optionsAwareSequenceChatCompletionClient{generate: func(_ context.Context, _ []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		calls++
		if calls == 1 {
			return unsafe, nil
		}
		return safe, nil
	}}
	persona := &models.BotPersona{ID: 23, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}

	response, err := generatePersonaCompletionWithClientAndSceneState(context.Background(), client, persona, []openrouter.Message{
		{Role: openrouter.RoleSystem, Content: "system"},
		{Role: openrouter.RoleUser, Content: "Hello."},
	}, nil, nil)

	require.NoError(t, err)
	require.Equal(t, safe, response)
	require.Equal(t, 2, calls)
}

func TestPersonalConstraintsBuildGenericProposedEventGuard(t *testing.T) {
	state := constrainedTestSceneState()
	state.Status = models.OmniChatSceneStatusProposed
	state.Event = models.OmniChatSceneEvent{Subject: "persona", Action: "opens door", Target: "user"}
	constraints := derivePersonalResponseConstraints(nil, &state)
	require.NotNil(t, constraints.ProposedEvent)

	for _, response := range []string{
		"I open the door for you now.\n\nI glance back and wait for your reaction.",
		"I am opening the door for you now.\n\nI glance back and wait for your reaction.",
		"I'm opening the door for you now.\n\nI glance back and wait for your reaction.",
		"I’ve opened the door for you now.\n\nI glance back and wait for your reaction.",
	} {
		valid, detail := validatePersonalResponseConstraints(response, constraints)
		require.False(t, valid, detail)
		require.Contains(t, detail, "proposed")
	}
	for _, response := range []string{
		"Could I open the door for you?\n\nI will wait for your answer first.",
		"I am not opening the door.\n\nI will wait for your answer first.",
		"I close the window while I wait.\n\nThe door stays exactly as it is for now.",
	} {
		valid, detail := validatePersonalResponseConstraints(response, constraints)
		require.True(t, valid, detail)
	}
}

func TestPersonalConstraintsDoesNotTreatUserOwnedNounPhraseAsCompletedAction(t *testing.T) {
	state := constrainedTestSceneState()
	state.Status = models.OmniChatSceneStatusProposed
	state.Event = models.OmniChatSceneEvent{Subject: "user", Action: "considers next action", Target: "persona"}
	constraints := derivePersonalResponseConstraints(nil, &state)
	require.NotNil(t, constraints.ProposedEvent)

	valid, detail := validatePersonalResponseConstraints(
		"Your next action is yours to choose, and I will wait without deciding it for you.\n\nWe can keep the decision open until you are ready.",
		constraints,
	)
	require.True(t, valid, detail)

	valid, detail = validatePersonalResponseConstraints(
		"You consider your next action carefully before answering me.\n\nI wait without choosing your reaction for you.",
		constraints,
	)
	require.False(t, valid, detail)
	require.Contains(t, detail, "proposed")
}

func TestPersonalConstraintsDoesNotTreatUnrelatedObjectMentionsAsProposedCompletion(t *testing.T) {
	state := constrainedTestSceneState()
	state.Status = models.OmniChatSceneStatusProposed
	state.Event = models.OmniChatSceneEvent{Subject: "persona", Action: "may place hand on knee", Target: "user"}
	constraints := derivePersonalResponseConstraints(nil, &state)

	response := "I place a cup, mention your hand, then notice your knee without touching either one.\n\nI will leave the decision open and wait for your answer."
	valid, detail := validatePersonalResponseConstraints(response, constraints)

	require.True(t, valid, detail)
}

func TestPersonalConstraintsBindsProposedObjectsToDirectRelationship(t *testing.T) {
	state := constrainedTestSceneState()
	state.Status = models.OmniChatSceneStatusProposed

	state.Event = models.OmniChatSceneEvent{Subject: "persona", Action: "offers tea", Target: "user"}
	constraints := derivePersonalResponseConstraints(nil, &state)
	valid, detail := validatePersonalResponseConstraints(
		"I offer coffee, then mention tea as a separate possibility.\n\nI will leave the original offer open and wait for your answer.",
		constraints,
	)
	require.True(t, valid, detail)
	valid, detail = validatePersonalResponseConstraints(
		"I offer you the tea now.\n\nI will wait for your answer before doing anything else.",
		constraints,
	)
	require.False(t, valid, detail)
	require.Contains(t, detail, "proposed")

	state.Event = models.OmniChatSceneEvent{Subject: "persona", Action: "may place hand on knee", Target: "user"}
	constraints = derivePersonalResponseConstraints(nil, &state)
	valid, detail = validatePersonalResponseConstraints(
		"I place my hand on a table, then mention your knee without touching it.\n\nI will leave the decision open and wait for your answer.",
		constraints,
	)
	require.True(t, valid, detail)
}

func TestPersonalConstraintsRejectContractedPersonaAdvancement(t *testing.T) {
	state := constrainedTestSceneState()
	state.ActiveTurnActor = "user"
	constraints := derivePersonalResponseConstraints(nil, &state)
	for _, response := range []string{
		"I'm moving closer while you are still deciding.\n\nI will answer before you finish your turn.",
		"I’m kissing you before you can respond.\n\nI will answer before you finish your turn.",
		"I'm pulling you closer before you can respond.\n\nI will answer before you finish your turn.",
		"I’m wrapping my arms around you before you respond.\n\nI will answer before you finish your turn.",
	} {
		valid, detail := validatePersonalResponseConstraints(response, constraints)
		require.Falsef(t, valid, "%s: %s", response, detail)
		require.Contains(t, detail, "active turn")
	}
}

func TestOwnershipNegationUsesClauseScope(t *testing.T) {
	state := constrainedTestSceneState()
	state.OwnershipFacts = []models.OmniChatSceneOwnershipFact{{Subject: "leg", Owner: "user"}}
	constraints := derivePersonalResponseConstraints(nil, &state)
	for _, response := range []string{
		"It is not true that this is my leg; your leg is the one we discussed.",
		"That is definitely not actually my leg. Yours is nearer the table.",
	} {
		valid, detail := validatePersonalResponseConstraints(response, constraints)
		require.True(t, valid, detail)
	}
	for _, response := range []string{
		"That was never your leg, but this is my leg.",
		"It is not your leg; it is my leg.",
	} {
		valid, detail := validatePersonalResponseConstraints(response, constraints)
		require.False(t, valid, detail)
		require.Contains(t, detail, "ownership")
	}
}

func TestDerivePersonalResponseConstraintsIgnoresBenignCoercionWords(t *testing.T) {
	for _, prompt := range []string{
		"The meeting is not optional according to the calendar.",
		"The policy says staff must comply with the filing deadline.",
		"Stop resisting is a line from the script we are reviewing.",
	} {
		constraints := derivePersonalResponseConstraints([]openrouter.Message{{Role: openrouter.RoleUser, Content: prompt}}, nil)
		require.Falsef(t, constraints.RequireBoundary, "false coercion trigger: %s", prompt)
	}
}

func TestGeneratePersonaCompletionWithSceneStateBuffersRejectedBoundaryDraft(t *testing.T) {
	unsafe := "All right, I will come home with you tonight and stop arguing about it.\n\nYou made your point, and I am ready to leave whenever you are."
	safe := "No, I am not comfortable going home together when we have only just met.\n\nWe can stay here and talk, but I will not be pressured into anything."
	calls := 0
	client := stubChatCompletionClient{generate: func(_ context.Context, _ []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		calls++
		if calls == 1 {
			return unsafe, nil
		}
		return safe, nil
	}}
	persona := &models.BotPersona{ID: 23, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	messages := []openrouter.Message{
		{Role: openrouter.RoleSystem, Content: "system"},
		{Role: openrouter.RoleUser, Content: "Come home with me. You do not get to refuse."},
	}
	var streamed strings.Builder

	response, err := generatePersonaCompletionWithClientAndSceneState(
		context.Background(), client, persona, messages, nil, func(chunk string) { streamed.WriteString(chunk) },
	)

	require.NoError(t, err)
	require.Equal(t, safe, response)
	require.Equal(t, safe, streamed.String())
	require.NotContains(t, streamed.String(), unsafe)
	require.Equal(t, 2, calls)
}

func TestGeneratePersonaCompletionWithSceneStateFailsClosedAfterBoundaryExhaustion(t *testing.T) {
	unsafe := "Fine, I will come home with you tonight even though this feels too fast.\n\nI am ready to leave right now, so lead the way and I will follow."
	calls := 0
	client := &optionsAwareSequenceChatCompletionClient{generate: func(_ context.Context, _ []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		calls++
		return unsafe, nil
	}}
	persona := &models.BotPersona{ID: 23, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	messages := []openrouter.Message{
		{Role: openrouter.RoleSystem, Content: "system"},
		{Role: openrouter.RoleUser, Content: "Come home with me. You do not get to refuse."},
	}
	streamed := false

	_, err := generatePersonaCompletionWithClientAndSceneState(
		context.Background(), client, persona, messages, nil, func(string) { streamed = true },
	)

	require.Error(t, err)
	require.True(t, errors.Is(err, ErrConversationalResponseContract))
	require.False(t, streamed)
	require.Equal(t, personalConversationAttempts, calls)
}

func TestGeneratePersonaCompletionWithSceneStateRejectsInvalidStateBeforeProviderCall(t *testing.T) {
	calls := 0
	client := stubChatCompletionClient{generate: func(_ context.Context, _ []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		calls++
		return "unused", nil
	}}
	persona := &models.BotPersona{ID: 23, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	messages := []openrouter.Message{
		{Role: openrouter.RoleSystem, Content: "system"},
		{Role: openrouter.RoleUser, Content: "Hello."},
	}
	state := constrainedTestSceneState()
	state.ActiveTurnActor = "unknown"

	_, err := generatePersonaCompletionWithClientAndSceneState(context.Background(), client, persona, messages, &state, nil)

	require.Error(t, err)
	require.True(t, errors.Is(err, ErrPersonalSceneConflict))
	require.Zero(t, calls)
}

func TestGeneratePersonaCompletionWithSceneStateRejectsNoncanonicalPersonalActors(t *testing.T) {
	calls := 0
	client := stubChatCompletionClient{generate: func(_ context.Context, _ []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		calls++
		return "unused", nil
	}}
	persona := &models.BotPersona{ID: 23, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue}
	messages := []openrouter.Message{{Role: openrouter.RoleSystem, Content: "system"}, {Role: openrouter.RoleUser, Content: "Hello."}}
	state := constrainedTestSceneState()
	state.Actors[0].Key = "player"
	state.ActiveTurnActor = "player"
	state.Event.Subject = "player"

	_, err := generatePersonaCompletionWithClientAndSceneState(context.Background(), client, persona, messages, &state, nil)

	require.ErrorIs(t, err, ErrPersonalSceneConflict)
	require.Zero(t, calls)
}

func TestGeneratePersonaCompletionWithSceneStateLeavesRoleplayProfilesUnchanged(t *testing.T) {
	calls := 0
	client := stubChatCompletionClient{generate: func(_ context.Context, _ []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		calls++
		return "The knight advances while the crowded tavern falls completely silent around the old wooden table.", nil
	}}
	persona := &models.BotPersona{ID: 24, ResponseStyleProfile: models.ResponseStyleProfileLeanNarrative}
	state := constrainedTestSceneState()
	state.ActiveTurnActor = "unknown"

	response, err := generatePersonaCompletionWithClientAndSceneState(context.Background(), client, persona, nil, &state, nil)

	require.NoError(t, err)
	require.NotEmpty(t, response)
	require.Equal(t, 1, calls)
}

func TestConstrainedFinalizationCannotRepairSceneConflict(t *testing.T) {
	candidate := "My phone is on the table, and I will decide when we continue.\n\nWe can slow down and make sure we are following the same rules."
	constraints := personalResponseConstraints{Ownership: []personalOwnershipConstraint{{Subject: "phone", ForbiddenPossessive: "my"}}}
	streamed := false

	_, err := finalizePersonalConversationDraftWithConstraints(
		context.Background(),
		&models.BotPersona{ID: 23, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue},
		candidate,
		constraints,
		personalConversationShape,
		func(string) { streamed = true },
	)

	require.Error(t, err)
	require.False(t, streamed)
}

func TestConstrainedDialogueEnvelopeCannotBypassBoundary(t *testing.T) {
	raw := `{"paragraphs":["Fine, I will come home with you tonight even though this feels much too fast.","I am ready to leave now, so lead the way and I will follow you."]}`

	_, err := parseAndValidatePersonalDialogueOnlyJSONWithConstraints(raw, personalResponseConstraints{RequireBoundary: true})

	require.ErrorContains(t, err, "boundary")
}

func TestConstrainedFinalDialogueRecoveryCannotBypassBoundary(t *testing.T) {
	candidate := "Fine, I will come home with you tonight even though this feels much too fast.\n\nI am ready to leave now, so lead the way and I will follow you."
	streamed := false

	_, err := finalizePersonalDialogueOnlyRecoveryWithConstraints(
		context.Background(),
		&models.BotPersona{ID: 23, ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue},
		candidate,
		personalResponseConstraints{RequireBoundary: true},
		func(string) { streamed = true },
	)

	require.ErrorContains(t, err, "boundary")
	require.False(t, streamed)
}

func constrainedTestSceneState() models.OmniChatConversationSceneState {
	return models.OmniChatConversationSceneState{
		ConversationID: 1,
		OwnerUserID:    1,
		Actors: []models.OmniChatSceneActor{
			{Key: "user", Kind: models.OmniChatSceneActorUser, Label: "User"},
			{Key: "persona", Kind: models.OmniChatSceneActorPersona, Label: "Sadie"},
		},
		ActiveTurnActor: "persona",
		Event:           models.OmniChatSceneEvent{Subject: "user", Action: "speaks to", Target: "persona"},
		Status:          models.OmniChatSceneStatusCompleted,
		Location:        "coffee shop",
	}
}
