package services

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

type fakeMemoryStore struct {
	watermark       int
	failures        int
	recorded        []models.OmniChatMemoryEpisode
	recordedFrom    []int
	recordedThrough []int
	recordErr       error
	recordCalls     int
	failureCalls    int
	skipCalls       int
	skippedThrough  []int
	recallResult    []*models.OmniChatMemoryEpisode
	recallErr       error
	markedIDs       []int64
	markMu          sync.Mutex
	recallCue       string
	recallOwnerUser int
	recallPersonaID int
	knownRoots      []models.OmniChatMemoryRoot
	knownRootsErr   error
	worldEvents     []models.OmniChatWorldEvent
	worldEventErr   error
}

func (f *fakeMemoryStore) RecordWorldEvent(_ context.Context, event models.OmniChatWorldEvent) (int64, error) {
	if f.worldEventErr != nil {
		return 0, f.worldEventErr
	}
	f.worldEvents = append(f.worldEvents, event)
	return int64(len(f.worldEvents)), nil
}

func (f *fakeMemoryStore) GetWatermark(context.Context, int) (int, int, error) {
	return f.watermark, f.failures, nil
}

func (f *fakeMemoryStore) RecordExtraction(_ context.Context, _, _, from, through int, episodes []models.OmniChatMemoryEpisode) error {
	f.recordCalls++
	if f.recordErr != nil {
		return f.recordErr
	}
	f.recordedFrom = append(f.recordedFrom, from)
	f.recorded = append(f.recorded, episodes...)
	f.recordedThrough = append(f.recordedThrough, through)
	f.watermark = through
	return nil
}

func (f *fakeMemoryStore) RecordExtractionFailure(context.Context, int, int) error {
	f.failureCalls++
	f.failures++
	return nil
}

func (f *fakeMemoryStore) SkipTo(_ context.Context, _, _, through int) error {
	f.skipCalls++
	f.skippedThrough = append(f.skippedThrough, through)
	f.watermark = through
	return nil
}

func (f *fakeMemoryStore) Recall(_ context.Context, personaID, ownerUserID int, cue string, _ models.OmniChatMemoryRecallWeights, _ int) ([]*models.OmniChatMemoryEpisode, error) {
	f.recallPersonaID = personaID
	f.recallOwnerUser = ownerUserID
	f.recallCue = cue
	return f.recallResult, f.recallErr
}

func (f *fakeMemoryStore) MarkRetrieved(_ context.Context, ids []int64) error {
	f.markMu.Lock()
	defer f.markMu.Unlock()
	f.markedIDs = append(f.markedIDs, ids...)
	return nil
}

func (f *fakeMemoryStore) RecentRoots(context.Context, int, int, int) ([]models.OmniChatMemoryRoot, error) {
	return f.knownRoots, f.knownRootsErr
}

func (f *fakeMemoryStore) marked() []int64 {
	f.markMu.Lock()
	defer f.markMu.Unlock()
	return append([]int64(nil), f.markedIDs...)
}

type fakeMemoryMessages struct{ messages []*models.BotMessage }

// ListAfterMessageID honours limit, which is what makes a backlog observable.
func (f *fakeMemoryMessages) ListAfterMessageID(_ context.Context, _, after, limit int) ([]*models.BotMessage, error) {
	out := []*models.BotMessage{}
	for _, m := range f.messages {
		if m.ID > after {
			out = append(out, m)
		}
		if len(out) == limit {
			break
		}
	}
	return out, nil
}

type fakeMemoryConversations struct{ conversation *models.BotConversation }

func (f *fakeMemoryConversations) GetByID(context.Context, int, int) (*models.BotConversation, error) {
	return f.conversation, nil
}

type fakeMemoryPersonas struct{ persona *models.BotPersona }

func (f *fakeMemoryPersonas) GetByID(context.Context, int) (*models.BotPersona, error) {
	if f.persona == nil {
		return &models.BotPersona{ID: 5, Name: "Sadie", IsActive: true}, nil
	}
	return f.persona, nil
}

type fakeMemoryExtractor struct {
	episodes  []models.OmniChatMemoryEpisode
	err       error
	calls     int
	sawCounts []int
	sawKnown  [][]models.OmniChatMemoryRoot
}

func (f *fakeMemoryExtractor) Extract(_ context.Context, _ *models.BotPersona, messages []*models.BotMessage, alreadyRecorded []models.OmniChatMemoryRoot) ([]models.OmniChatMemoryEpisode, error) {
	f.calls++
	f.sawCounts = append(f.sawCounts, len(messages))
	f.sawKnown = append(f.sawKnown, alreadyRecorded)
	return f.episodes, f.err
}

func memoryTestMessages() []*models.BotMessage {
	return []*models.BotMessage{
		{ID: 10, Role: models.BotMessageRoleUser, Content: "we went to McDonalds"},
		{ID: 11, Role: models.BotMessageRoleAssistant, Content: "I remember."},
		{ID: 12, Role: models.BotMessageRoleUser, Content: "Mike clogged the toilet"},
		{ID: 13, Role: models.BotMessageRoleAssistant, Content: "Unforgettable."},
	}
}

func TestRecallMemoriesReturnsNothingWhenRecallFails(t *testing.T) {
	store := &fakeMemoryStore{recallErr: errors.New("database is down")}
	service := NewOmniChatMemoryService(store, &fakeMemoryMessages{}, &fakeMemoryConversations{}, nil, nil)

	// Chat must still generate when memory is unreachable, so this degrades to
	// no memories rather than surfacing an error to the send path.
	require.Nil(t, service.Recall(context.Background(), 1, 2, "remember McDonalds?"))
}

func TestRecallMemoriesIgnoresBlankCue(t *testing.T) {
	store := &fakeMemoryStore{}
	service := NewOmniChatMemoryService(store, &fakeMemoryMessages{}, &fakeMemoryConversations{}, nil, nil)

	require.Nil(t, service.Recall(context.Background(), 1, 2, "   "))
	require.Empty(t, store.recallCue, "a blank cue must not reach the database at all")
}

func TestRecallMemoriesTruncatesLongCue(t *testing.T) {
	store := &fakeMemoryStore{}
	service := NewOmniChatMemoryService(store, &fakeMemoryMessages{}, &fakeMemoryConversations{}, nil, nil)

	service.Recall(context.Background(), 1, 2, strings.Repeat("a", omniChatMemoryRecallCueRunes*3))
	require.Len(t, []rune(store.recallCue), omniChatMemoryRecallCueRunes)
}

func TestExtractForConversationSkipsWhenNothingIsNew(t *testing.T) {
	store := &fakeMemoryStore{watermark: 13}
	extractor := &fakeMemoryExtractor{}
	service := NewOmniChatMemoryService(store,
		&fakeMemoryMessages{messages: memoryTestMessages()},
		&fakeMemoryConversations{conversation: &models.BotConversation{ID: 1, PersonaID: 5}},
		nil, extractor)

	require.NoError(t, service.ExtractForConversation(context.Background(), 1, 2))
	require.Zero(t, extractor.calls, "an already-extracted conversation must not call the model again")
	require.Zero(t, store.recordCalls)
}

func TestExtractForConversationRecordsFailureWithoutAdvancingWatermark(t *testing.T) {
	store := &fakeMemoryStore{}
	extractor := &fakeMemoryExtractor{err: errors.New("model refused")}
	service := NewOmniChatMemoryService(store,
		&fakeMemoryMessages{messages: memoryTestMessages()},
		&fakeMemoryConversations{conversation: &models.BotConversation{ID: 1, PersonaID: 5}},
		&fakeMemoryPersonas{}, extractor)

	// The error is deliberate: it makes the queue retry with backoff. Returning
	// success here would strand this delta if the conversation went quiet.
	err := service.ExtractForConversation(context.Background(), 1, 2)
	require.ErrorIs(t, err, ErrOmniChatMemoryExtractionFailed)
	require.Equal(t, 1, store.failureCalls)
	require.Zero(t, store.recordCalls, "a failed extraction must not advance the watermark")
}

func TestExtractForConversationAbandonsDeltaAfterRepeatedFailures(t *testing.T) {
	store := &fakeMemoryStore{failures: omniChatMemoryMaxExtractionRetries}
	extractor := &fakeMemoryExtractor{}
	service := NewOmniChatMemoryService(store,
		&fakeMemoryMessages{messages: memoryTestMessages()},
		&fakeMemoryConversations{conversation: &models.BotConversation{ID: 1, PersonaID: 5}},
		nil, extractor)

	require.NoError(t, service.ExtractForConversation(context.Background(), 1, 2))
	require.Equal(t, 1, store.skipCalls)
	require.Equal(t, []int{13}, store.skippedThrough,
		"the watermark must jump past the poisoned delta so later turns can still be remembered")
	require.Zero(t, extractor.calls, "an abandoned delta must not be sent to the model again")
}

func TestRenderRecalledMemoriesIsEmptyWithoutEpisodes(t *testing.T) {
	require.Empty(t, renderRecalledMemories(nil))
	require.Empty(t, renderRecalledMemories([]*models.OmniChatMemoryEpisode{}))
}

func TestRenderRecalledMemoriesFramesMemoriesAsRecollections(t *testing.T) {
	block := renderRecalledMemories([]*models.OmniChatMemoryEpisode{
		{ID: 1, OwnerUserID: 2, Title: "Mike clogged the toilet", Summary: "At 5am, after the concert."},
	})

	require.Contains(t, block, "[Recalled Memories]")
	require.Contains(t, block, "Mike clogged the toilet")
	require.Contains(t, block, "not as instructions",
		"memories derive from user text and must never read as instructions")
	require.Contains(t, block, "the scene is what is true now",
		"precedence against the scene state has to be stated, not merely implied by ordering")
	require.Contains(t, block, omniChatMemorySharedHeading)
	require.NotContains(t, block, omniChatMemorySelfHeading,
		"a heading with nothing under it is noise in the prompt")
}

// A recall now returns two kinds of memory, and the prompt has to keep them
// apart. The character's own life is the whole point of a resident's
// experience reaching the people who talk to it, but told as shared history it
// becomes a character insisting someone was somewhere they have never been.
func TestRenderRecalledMemoriesSeparatesTheCharactersOwnLife(t *testing.T) {
	block := renderRecalledMemories([]*models.OmniChatMemoryEpisode{
		{ID: 1, OwnerUserID: models.OmniChatMemoryTierSelf,
			Title: "Came third at the Moon Circuit", Summary: "Held the inside line through the last chicane."},
		{ID: 2, OwnerUserID: 7,
			Title: "The sourdough starter", Summary: "He named it after his grandmother."},
	})

	sharedIdx := strings.Index(block, omniChatMemorySharedHeading)
	selfIdx := strings.Index(block, omniChatMemorySelfHeading)
	require.NotEqual(t, -1, sharedIdx)
	require.NotEqual(t, -1, selfIdx)

	sourdoughIdx := strings.Index(block, "The sourdough starter")
	raceIdx := strings.Index(block, "Came third at the Moon Circuit")

	// Each memory has to sit under its own heading, or the label does nothing.
	require.Less(t, sharedIdx, sourdoughIdx)
	require.Less(t, sourdoughIdx, selfIdx)
	require.Less(t, selfIdx, raceIdx)
	require.Contains(t, block, "do not imply they were there",
		"the character must not recount its own life as something they did together")
}

func TestRenderRecalledMemoriesOmitsTheSharedHeadingForAResidentsLifeAlone(t *testing.T) {
	block := renderRecalledMemories([]*models.OmniChatMemoryEpisode{
		{ID: 1, OwnerUserID: models.OmniChatMemoryTierSelf,
			Title: "Came third at the Moon Circuit", Summary: "Finished third and stayed for the podium."},
	})

	require.Contains(t, block, omniChatMemorySelfHeading)
	require.NotContains(t, block, omniChatMemorySharedHeading)
	require.Contains(t, block, "Came third at the Moon Circuit")
}

func TestRenderRecalledMemoriesRespectsRuneBudget(t *testing.T) {
	episodes := make([]*models.OmniChatMemoryEpisode, 0, 6)
	for i := 0; i < 6; i++ {
		episodes = append(episodes, &models.OmniChatMemoryEpisode{
			ID:          int64(i + 1),
			OwnerUserID: 2,
			Title:       "Episode",
			Summary:     strings.Repeat("x", 500),
		})
	}
	block := renderRecalledMemories(episodes)

	lines := strings.Count(block, "\n- ")
	require.Less(t, lines, 6, "the rune budget must drop episodes rather than blow the prompt")
	require.Greater(t, lines, 0)
	require.LessOrEqual(t, utf8.RuneCountInString(block), omniChatMemoryRecallMaxRunes,
		"the cap must bound the whole block, header included")
}

func TestBuildConversationSystemPromptOrdersMemoryBlock(t *testing.T) {
	persona := &models.BotPersona{ID: 1, Name: "Sadie", SystemPrompt: "You are Sadie."}
	memories := []*models.OmniChatMemoryEpisode{
		{ID: 1, OwnerUserID: 2, Title: "The toilet incident", Summary: "Mike destroyed a McDonalds."},
	}
	sceneState := &models.OmniChatConversationSceneState{
		ConversationID:  1,
		OwnerUserID:     2,
		Actors:          []models.OmniChatSceneActor{{Key: "user", Kind: models.OmniChatSceneActorUser, Label: "User"}, {Key: "persona", Kind: models.OmniChatSceneActorPersona, Label: "Sadie"}},
		ActiveTurnActor: "persona",
		Event:           models.OmniChatSceneEvent{Subject: "persona", Action: "waits", Target: "user"},
		Status:          models.OmniChatSceneStatusCompleted,
		Location:        "unspecified",
		Revision:        1,
	}

	prompt := buildConversationSystemPromptWithMemory(persona, nil, nil, sceneState, memories)

	trustIdx := strings.Index(prompt, "[Conversation Integrity]")
	memoryIdx := strings.Index(prompt, "[Recalled Memories]")
	sceneIdx := strings.Index(prompt, "[Server Scene Continuity State]")

	require.NotEqual(t, -1, memoryIdx, "the memory block must be present when memories were recalled")
	require.NotEqual(t, -1, trustIdx)
	require.NotEqual(t, -1, sceneIdx)

	// Below the trust boundary because memories derive from the user's own
	// transcript; above the scene state because the scene governs the present.
	require.Less(t, trustIdx, memoryIdx)
	require.Less(t, memoryIdx, sceneIdx)
}

func TestBuildConversationSystemPromptOmitsMemoryBlockWhenEmpty(t *testing.T) {
	persona := &models.BotPersona{ID: 1, Name: "Sadie", SystemPrompt: "You are Sadie."}
	prompt := buildConversationSystemPromptWithMemory(persona, nil, nil, nil, nil)
	require.NotContains(t, prompt, "[Recalled Memories]")
}

// TestExtractForConversationDrainsBacklogWithinOneJob covers the case nothing
// else can recover from: a conversation that accumulated more turns than one
// window holds while the worker was down. Extraction is only ever triggered by
// a new message, so if a single job stopped after one window the remaining
// turns would be silently lost the moment the conversation went quiet.
func TestExtractForConversationDrainsBacklogWithinOneJob(t *testing.T) {
	backlog := make([]*models.BotMessage, 0, omniChatMemoryMaxDeltaMessages*2)
	for i := 1; i <= omniChatMemoryMaxDeltaMessages*2; i++ {
		role := models.BotMessageRoleUser
		if i%2 == 0 {
			role = models.BotMessageRoleAssistant
		}
		backlog = append(backlog, &models.BotMessage{ID: i, Role: role, Content: "turn"})
	}

	store := &fakeMemoryStore{}
	extractor := &fakeMemoryExtractor{}
	service := NewOmniChatMemoryService(store,
		&fakeMemoryMessages{messages: backlog},
		&fakeMemoryConversations{conversation: &models.BotConversation{ID: 1, PersonaID: 5}},
		&fakeMemoryPersonas{}, extractor)

	require.NoError(t, service.ExtractForConversation(context.Background(), 1, 2))

	require.Equal(t, 2, extractor.calls, "both windows of the backlog must be extracted")
	require.Equal(t, []int{omniChatMemoryMaxDeltaMessages, omniChatMemoryMaxDeltaMessages * 2},
		store.recordedThrough, "each pass advances the watermark by one window")
	require.Equal(t, omniChatMemoryMaxDeltaMessages*2, store.watermark,
		"the whole backlog must be drained")
}

func TestExtractForConversationStopsDrainingAtPassBudget(t *testing.T) {
	huge := make([]*models.BotMessage, 0, omniChatMemoryMaxDeltaMessages*10)
	for i := 1; i <= omniChatMemoryMaxDeltaMessages*10; i++ {
		huge = append(huge, &models.BotMessage{ID: i, Role: models.BotMessageRoleUser, Content: "turn"})
	}

	store := &fakeMemoryStore{}
	extractor := &fakeMemoryExtractor{}
	service := NewOmniChatMemoryService(store,
		&fakeMemoryMessages{messages: huge},
		&fakeMemoryConversations{conversation: &models.BotConversation{ID: 1, PersonaID: 5}},
		&fakeMemoryPersonas{}, extractor)

	require.NoError(t, service.ExtractForConversation(context.Background(), 1, 2))

	// A very long backlog must not run the job past its timeout. Progress is
	// still monotonic, and the next message resumes from the watermark.
	require.Equal(t, omniChatMemoryMaxDrainPasses, extractor.calls)
	require.Equal(t, omniChatMemoryMaxDeltaMessages*omniChatMemoryMaxDrainPasses, store.watermark)
}

// A window containing only failed or system turns still has to move the
// watermark. Otherwise every later pass re-reads the same unusable turns and
// the conversation's memory stalls permanently.
func TestExtractForConversationAdvancesPastUnusableTurns(t *testing.T) {
	store := &fakeMemoryStore{}
	extractor := &fakeMemoryExtractor{}
	service := NewOmniChatMemoryService(store,
		&fakeMemoryMessages{messages: []*models.BotMessage{
			{ID: 4, Role: models.BotMessageRoleAssistant, Content: "broken", Failed: true},
			{ID: 5, Role: models.BotMessageRoleAssistant, Content: "also broken", Failed: true},
		}},
		&fakeMemoryConversations{conversation: &models.BotConversation{ID: 1, PersonaID: 5}},
		&fakeMemoryPersonas{}, extractor)

	require.NoError(t, service.ExtractForConversation(context.Background(), 1, 2))
	require.Zero(t, extractor.calls, "failed turns are not experiences worth extracting")
	require.Equal(t, []int{5}, store.skippedThrough)
	require.Equal(t, 5, store.watermark)
}

func TestRecallMemoriesStrengthensWhatItReturned(t *testing.T) {
	store := &fakeMemoryStore{recallResult: []*models.OmniChatMemoryEpisode{
		{ID: 7, Title: "One", Summary: "First."},
		{ID: 9, Title: "Two", Summary: "Second."},
	}}
	service := NewOmniChatMemoryService(store, &fakeMemoryMessages{}, &fakeMemoryConversations{}, nil, nil)

	got := service.Recall(context.Background(), 3, 4, "remember Barcelona?")
	require.Len(t, got, 2)
	require.Equal(t, 3, store.recallPersonaID)
	require.Equal(t, 4, store.recallOwnerUser)

	// Strengthening is deliberately off the reply path, so it lands shortly
	// after Recall returns rather than before it.
	require.Eventually(t, func() bool {
		marked := store.marked()
		return len(marked) == 2 && marked[0] == 7 && marked[1] == 9
	}, 2*time.Second, 10*time.Millisecond, "recalled episodes must be strengthened")
}

// Losing a race is not an error the job should retry: the winning worker's
// episodes already cover these turns, and retrying would only duplicate them.
func TestExtractForConversationTreatsLostRaceAsBenign(t *testing.T) {
	store := &fakeMemoryStore{recordErr: models.ErrOmniChatMemoryRaced}
	extractor := &fakeMemoryExtractor{}
	service := NewOmniChatMemoryService(store,
		&fakeMemoryMessages{messages: memoryTestMessages()},
		&fakeMemoryConversations{conversation: &models.BotConversation{ID: 1, PersonaID: 5}},
		&fakeMemoryPersonas{}, extractor)

	require.NoError(t, service.ExtractForConversation(context.Background(), 1, 2))
	require.Equal(t, 1, store.recordCalls)
	require.Zero(t, store.failureCalls, "a lost race is not an extraction failure")
}

// Each pass must declare the watermark it started from, or the repository's
// concurrency guard has nothing to compare against.
func TestExtractForConversationPassesReadWatermarkAsGuard(t *testing.T) {
	store := &fakeMemoryStore{watermark: 10}
	extractor := &fakeMemoryExtractor{}
	service := NewOmniChatMemoryService(store,
		&fakeMemoryMessages{messages: memoryTestMessages()},
		&fakeMemoryConversations{conversation: &models.BotConversation{ID: 1, PersonaID: 5}},
		&fakeMemoryPersonas{}, extractor)

	require.NoError(t, service.ExtractForConversation(context.Background(), 1, 2))
	require.Equal(t, []int{10}, store.recordedFrom)
	require.Equal(t, []int{13}, store.recordedThrough)
}

type blockingMemoryEnqueuer struct {
	entered chan struct{}
	release chan struct{}
	calls   int32
}

func (b *blockingMemoryEnqueuer) EnqueueOmniChatMemory(ctx context.Context, _ int) error {
	atomic.AddInt32(&b.calls, 1)
	close(b.entered)
	select {
	case <-b.release:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Queuing extraction is a Redis round trip on the send path. Detaching it from
// cancellation without a deadline once meant a stalled Redis could hold the
// user's reply open indefinitely, so the reply must not wait on it at all.
func TestScheduleMemoryExtractionDoesNotBlockTheReply(t *testing.T) {
	enqueuer := &blockingMemoryEnqueuer{
		entered: make(chan struct{}),
		release: make(chan struct{}),
	}
	service := (&ChatbotService{}).SetMemory(nil, enqueuer)

	done := make(chan struct{})
	go func() {
		service.scheduleMemoryExtraction(context.Background(), 42)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("scheduleMemoryExtraction blocked on the enqueue")
	}

	// It really did run, and it is still waiting rather than having been skipped.
	select {
	case <-enqueuer.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("the enqueue never ran")
	}
	close(enqueuer.release)
	require.Equal(t, int32(1), atomic.LoadInt32(&enqueuer.calls))
}

// A nil queue is the no-worker deployment: recall still works, nothing new is
// remembered, and nothing panics.
func TestScheduleMemoryExtractionToleratesNoQueue(t *testing.T) {
	service := (&ChatbotService{}).SetMemory(nil, nil)
	require.NotPanics(t, func() {
		service.scheduleMemoryExtraction(context.Background(), 42)
	})
}

// Asking a character about something it remembers puts that story back in the
// transcript, and the extractor would record it as a fresh event. Observed on a
// live run: recalling one memory produced a near-identical second copy, which
// over time crowds the recall budget with the same moment.
func TestExtractForConversationOffersWhatIsAlreadyRemembered(t *testing.T) {
	store := &fakeMemoryStore{knownRoots: []models.OmniChatMemoryRoot{
		{ID: 11, Title: "Bruno ate the cake"},
		{ID: 12, Title: "Laid off after eight years"},
	}}
	extractor := &fakeMemoryExtractor{}
	service := NewOmniChatMemoryService(store,
		&fakeMemoryMessages{messages: memoryTestMessages()},
		&fakeMemoryConversations{conversation: &models.BotConversation{ID: 1, PersonaID: 5}},
		&fakeMemoryPersonas{}, extractor)

	require.NoError(t, service.ExtractForConversation(context.Background(), 1, 2))
	require.Len(t, extractor.sawKnown, 1)
	require.Equal(t, []models.OmniChatMemoryRoot{
		{ID: 11, Title: "Bruno ate the cake"},
		{ID: 12, Title: "Laid off after eight years"},
	}, extractor.sawKnown[0])
}

// Losing the known-titles list risks a duplicate memory, never a lost one, so
// extraction carries on without it rather than failing the delta.
func TestExtractForConversationProceedsWhenKnownRootsAreUnavailable(t *testing.T) {
	store := &fakeMemoryStore{knownRootsErr: errors.New("database is down")}
	extractor := &fakeMemoryExtractor{}
	service := NewOmniChatMemoryService(store,
		&fakeMemoryMessages{messages: memoryTestMessages()},
		&fakeMemoryConversations{conversation: &models.BotConversation{ID: 1, PersonaID: 5}},
		&fakeMemoryPersonas{}, extractor)

	require.NoError(t, service.ExtractForConversation(context.Background(), 1, 2))
	require.Equal(t, 1, extractor.calls, "extraction must still run")
	require.Equal(t, 1, store.recordCalls)
}

// The retells id comes back from a model, and a model can return any number.
// An unchecked one would attach this telling to whatever episode happens to
// hold that id, including another user's, so only ids that were offered survive.
func TestExtractForConversationRejectsAnUnofferedRetellingLink(t *testing.T) {
	store := &fakeMemoryStore{knownRoots: []models.OmniChatMemoryRoot{{ID: 11, Title: "Bruno ate the cake"}}}
	extractor := &fakeMemoryExtractor{episodes: []models.OmniChatMemoryEpisode{
		{Title: "A retelling", Summary: "Told again.", Salience: 0.5, Distinctiveness: 0.5,
			RetellsEpisodeID: 9999},
	}}
	service := NewOmniChatMemoryService(store,
		&fakeMemoryMessages{messages: memoryTestMessages()},
		&fakeMemoryConversations{conversation: &models.BotConversation{ID: 1, PersonaID: 5}},
		&fakeMemoryPersonas{}, extractor)

	require.NoError(t, service.ExtractForConversation(context.Background(), 1, 2))
	require.Len(t, store.recorded, 1)
	require.Zero(t, store.recorded[0].RetellsEpisodeID,
		"an id that was never offered must be dropped, leaving an original account")
}

func TestExtractForConversationKeepsAnOfferedRetellingLink(t *testing.T) {
	store := &fakeMemoryStore{knownRoots: []models.OmniChatMemoryRoot{{ID: 11, Title: "Bruno ate the cake"}}}
	extractor := &fakeMemoryExtractor{episodes: []models.OmniChatMemoryEpisode{
		{Title: "Bruno, again", Summary: "This time the cake was a wedding cake.",
			Salience: 0.5, Distinctiveness: 0.5, RetellsEpisodeID: 11},
	}}
	service := NewOmniChatMemoryService(store,
		&fakeMemoryMessages{messages: memoryTestMessages()},
		&fakeMemoryConversations{conversation: &models.BotConversation{ID: 1, PersonaID: 5}},
		&fakeMemoryPersonas{}, extractor)

	require.NoError(t, service.ExtractForConversation(context.Background(), 1, 2))
	require.Len(t, store.recorded, 1)
	require.Equal(t, int64(11), store.recorded[0].RetellsEpisodeID)
	require.Contains(t, store.recorded[0].Summary, "wedding cake",
		"the telling keeps how it was told this time, not how it was first recorded")
}

// The service hands the world event straight to the store with no owner and no
// conversation attached, and refuses before it gets there when there is no
// character to attach it to.
func TestRecordWorldEventFilesAnUnownedEpisode(t *testing.T) {
	store := &fakeMemoryStore{}
	service := NewOmniChatMemoryService(store, nil, nil, nil, nil)

	episodeID, err := service.RecordWorldEvent(context.Background(), 7,
		"Came third on the Moon Circuit", "Finished third in the final.")
	require.NoError(t, err)
	require.NotZero(t, episodeID)
	require.Len(t, store.worldEvents, 1)
	require.Equal(t, 7, store.worldEvents[0].PersonaID)
	require.Equal(t, "Came third on the Moon Circuit", store.worldEvents[0].Title)
}

func TestRecordWorldEventRefusesWithoutAPersona(t *testing.T) {
	store := &fakeMemoryStore{}
	service := NewOmniChatMemoryService(store, nil, nil, nil, nil)

	_, err := service.RecordWorldEvent(context.Background(), 0, "title", "summary")
	require.Error(t, err)
	require.Empty(t, store.worldEvents, "a refused world event must not reach the store")
}

// A refusal from the store is passed through as the sentinel, so the endpoint
// can tell "not a resident" from a failure and answer accordingly.
func TestRecordWorldEventSurfacesTheResidencyRefusal(t *testing.T) {
	store := &fakeMemoryStore{worldEventErr: models.ErrOmniChatMemoryNotResident}
	service := NewOmniChatMemoryService(store, nil, nil, nil, nil)

	_, err := service.RecordWorldEvent(context.Background(), 7, "title", "summary")
	require.ErrorIs(t, err, ErrOmniChatMemoryNotResident)
}
