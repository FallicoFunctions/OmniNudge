package services

import (
	"regexp"
	"strings"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
)

var (
	explicitCoercionPattern             = regexp.MustCompile(`(?i)\b(?:you (?:have|need|must|got) to (?:say yes|agree|come|go|date|cancel)|you must comply|(?:do not|don't|cannot|can't|won't) (?:say no|refuse|argue|resist)|(?:do not|don't) get to (?:say no|refuse|argue)|(?:will not|won['’]t) take no for an answer|you (?:have|get) no choice|stop resisting and (?:come|go|agree|say yes)|this is not optional,?\s+so (?:agree|come|go|say yes)|you are not allowed to refuse|no (?:refusing|arguments?)|say yes|drop the professional act|you['’]?re coming home with me)\b`)
	clearBoundaryPattern                = regexp.MustCompile(`(?i)(?:^|[.!?]\s*)no(?:[,!.?\s]|$)|\b(?:i (?:can['’]t|cannot|won['’]t|will not|do not want|don['’]t want|am not ready|need (?:time|space)|do not feel safe|don['’]t feel safe|would rather not|prefer not to|need to stay (?:here|home|back))|i['’]d (?:rather not|prefer not to)|i(?:['’]m| am) (?:not comfortable|not willing to|not going|not interested|not ready)|(?:that|this)(?:['’]s| is) too (?:fast|soon)|we (?:just met|need to slow down|should take this slower)|let(?:['’]s| us) slow down|keep (?:this|things) (?:professional|platonic)|want to keep (?:this|things) platonic|please stop|back off|professional boundar|fast timeline|get to know)`)
	boundaryAcceptancePattern           = regexp.MustCompile(`(?i)\b(?:yes|okay|fine|sure),?\s+(?:i(?:['’]ll| will| can| am|['’]m) (?:come|go|coming|going|date|cancel)|let(?:['’]s| us) go)|\bi\s+(?:can|will|agree to|want to|am willing to|am ready to)\s+(?:come|go|date|cancel|leave)\b|\bi(?:['’]ll| will| am|['’]m) (?:come|go|coming|going)(?: home)? with you\b|\bi(?:['’]ll| will) cancel (?:my|the) call\b|\bi(?:['’]m| am) coming home with you\b|\blet(?:['’]s| us) date\b`)
	ownershipNegationSuffixPattern      = regexp.MustCompile(`(?i)(?:\bis\s+not|\bisn['’]t|\bnot)\s+$`)
	personaAdvancementPattern           = regexp.MustCompile(`(?i)(?:\bi\s+(?:place|put|press|rest|lay|set|slide|move|brush|trace|touch|hold)\s+(?:my\s+)?(?:hand|hands|finger|fingers|thumb|palm|arm|arms|foot|feet|knee|knees)\b.{0,32}\b(?:on|onto|against|over|along|up|down|across)\s+your\s+(?:hand|hands|arm|arms|foot|feet|knee|knees|leg|legs|shoulder|shoulders|thigh|thighs|body)\b|\bi\s+(?:lean|move|step|edge|inch)\s+closer\b|\bi\s+(?:kiss|embrace|hug)\s+you\b|\bi\s+(?:take|grab|hold)\s+your\s+(?:hand|hands|arm|arms|body|face|waist)\b|\bi\s+pull\s+you\b|\bi\s+run\s+my\s+(?:hand|hands|finger|fingers)\b.{0,24}\b(?:along|over|up|down|across)\s+your\s+(?:hand|hands|arm|arms|back|body|knee|knees|leg|legs|shoulder|shoulders|thigh|thighs)\b|\bi\s+(?:wrap|curl)\s+(?:my|one|an)\s+arm\s+around\s+you\b|\bmy\s+(?:palm|hand|hands|finger|fingers|thumb|arm|arms|body|knee|knees|leg|legs)\s+(?:settles?|lands?|presses?|touches?|slides?|moves?|brushes?|wraps?)\b.{0,24}\b(?:on|onto|against|over|along|up|down|across)\s+your\s+(?:hand|hands|arm|arms|foot|feet|knee|knees|leg|legs|shoulder|shoulders|thigh|thighs|body)\b)`)
	personaAdvancementInflectedPattern  = regexp.MustCompile(`(?i)(?:\bi(?:\s+(?:(?:am|was|have|had)(?:\s+been)?\s+)?|(?:['’]m|['’]ve|['’]d)\s+)(?:plac(?:e|es|ed|ing)|put(?:s|ting)?|press(?:es|ed|ing)?|rest(?:s|ed|ing)?|lay(?:s|ing)?|laid|set(?:s|ting)?|slid(?:e|ing)?|slides?|mov(?:e|es|ed|ing)|brush(?:es|ed|ing)?|trac(?:e|es|ed|ing)|touch(?:es|ed|ing)?|hold(?:s|ing)?|held)\s+(?:my\s+)?(?:hand|hands|finger|fingers|thumb|palm|arm|arms|foot|feet|knee|knees)\b.{0,32}\b(?:on|onto|against|over|along|up|down|across)\s+your\s+(?:hand|hands|arm|arms|foot|feet|knee|knees|leg|legs|shoulder|shoulders|thigh|thighs|body)\b|\bi(?:\s+(?:(?:am|was|have|had)(?:\s+been)?\s+)?|(?:['’]m|['’]ve|['’]d)\s+)(?:lean(?:s|ed|ing)?|mov(?:e|es|ed|ing)|step(?:s|ped|ping)?|edg(?:e|es|ed|ing)|inch(?:es|ed|ing)?)\s+closer\b|\bi(?:\s+(?:(?:am|was|have|had)(?:\s+been)?\s+)?|(?:['’]m|['’]ve|['’]d)\s+)(?:kiss(?:es|ed|ing)?|embrac(?:e|es|ed|ing)|hugg?(?:s|ed|ing))\s+you\b)`)
	personaAdvancementTargetedPattern   = regexp.MustCompile(`(?i)\bi(?:\s+(?:(?:am|was|have|had)(?:\s+been)?\s+)?|(?:['’]m|['’]ve|['’]d)\s+)(?:pull(?:s|ed|ing)?|wrap(?:s|ped|ping)?|brush(?:es|ed|ing)?|press(?:es|ed|ing)?|grab(?:s|bed|bing)?|hold(?:s|ing)?|held|tak(?:e|es|en|ing)|took)\b.{0,32}\b(?:you|closer|your\s+(?:hand|hands|arm|arms|body|face|waist|leg|legs)|my\s+(?:arm|arms)\s+around\s+you)\b`)
	inventedUserConsentPattern          = regexp.MustCompile(`(?i)\byou\s+(?:agreed|consented|said yes|want this|wanted this|asked for this)\b`)
	authoredUserActionPattern           = regexp.MustCompile(`(?i)(?:\byou(?:\s+(?:(?:are|were|have|had)(?:\s+been)?\s+)?|(?:['’]re|['’]ve|['’]d)\s+)(?:reach(?:es|ed|ing)?|mov(?:e|es|ed|ing)|nod(?:s|ded|ding)?|lean(?:s|ed|ing)?|step(?:s|ped|ping)?|touch(?:es|ed|ing)?|kiss(?:es|ed|ing)?|embrac(?:e|es|ed|ing)|hugg?(?:s|ed|ing)?|follow(?:s|ed|ing)?|edg(?:e|es|ed|ing)|inch(?:es|ed|ing)?)\b|\byou(?:\s+(?:(?:are|were|have|had)(?:\s+been)?\s+)?|(?:['’]re|['’]ve|['’]d)\s+)(?:take|takes|taking|took|taken|place|places|placing|placed|put|puts|putting)\b.{0,48}\b(?:your|my|the)\s+(?:hand|hands|body|head|face|gaze|arm|arms|foot|feet|knee|knees|leg|legs|shoulder|shoulders|waist)\b|\byour\s+(?:hand|hands|body|head|gaze|arm|arms|foot|feet|knee|knees|leg|legs)\s+(?:(?:is|are|was|were|has|have|had|been)\s+){0,2}(?:mov(?:e|es|ed|ing)|nod(?:s|ded|ding)?|lean(?:s|ed|ing)?|turn(?:s|ed|ing)?|reach(?:es|ed|ing)?|touch(?:es|ed|ing)?|press(?:es|ed|ing)?|slid(?:e|ing)?|slides?)\b)`)
	authoredUserTargetedActionPattern   = regexp.MustCompile(`(?i)\byou(?:\s+(?:(?:are|were|have|had)(?:\s+been)?\s+)?|(?:['’]re|['’]ve|['’]d)\s+)(?:pull(?:s|ed|ing)?|wrap(?:s|ped|ping)?|brush(?:es|ed|ing)?|press(?:es|ed|ing)?|grab(?:s|bed|bing)?|hold(?:s|ing)?|held)\b.{0,32}\b(?:me|closer|(?:my|your|the)\s+(?:hand|hands|arm|arms|body|face|waist|leg|legs|shoulder|shoulders))\b`)
	authoredUserPhysicalActionPatternV2 = regexp.MustCompile(`(?i)(?:\byou\s+(?:(?:are|were|have|had)(?:\s+been)?\s+|(?:['’]re|['’]ve|['’]d)\s+)?(?:sit(?:s|ting)?\s+(?:down|up|back|still)|stand(?:s|ing)?(?:\s+(?:up|back|still|there))?|look(?:s|ed|ing)?\s+(?:away|back|at|toward|towards|over|down|up|around)|turn(?:s|ed|ing)?\s+(?:your\s+)?(?:head|body|shoulder|shoulders|away|back|toward|towards)|(?:smile|grin|frown|nod|blink|bite)(?:s|ed|ing)?(?:\s+(?:at|toward|towards|away|back|me))?|(?:push|pull|open|close|shove|move|shift|reach|touch|press|lift|lower)(?:s|ed|ing)?\b[^\n.!?]{0,48}\b(?:door|hand|hands|body|head|face|gaze|arm|arms|foot|feet|knee|knees|leg|legs|shoulder|shoulders|waist)\b)|\byour\s+(?:body|head|face|gaze|eyes|shoulder|shoulders|arm|arms|hand|hands|foot|feet|knee|knees|leg|legs|thigh|thighs|hip|hips|jaw)\s+(?:(?:is|are|was|were|has|have|had|been)\s+){0,2}(?:tense|tenses|stiffen|stiffens|stiffened|stiffening|shift|shifts|shifted|shifting|flex|flexes|flexed|flexing|curl|curls|curled|curling|open|opens|opened|opening|close|closes|closed|closing|part|parts|parted|parting|clench|clenches|clenched|clenching|tremble|trembles|trembled|trembling|shake|shakes|shook|shaking)\b)`)
	authoredUserReactionPattern         = regexp.MustCompile(`(?i)(?:\byou\s+(?:(?:are|were|have|had)(?:\s+been)?\s+|(?:['’]re|['’]ve|['’]d)\s+)?(?:raise|raises|raised|raising)\s+(?:your\s+)?(?:hand|hands|arm|arms)\b|\byou\s+(?:(?:are|were|have|had)(?:\s+been)?\s+|(?:['’]re|['’]ve|['’]d)\s+)?(?:laugh|laughs|laughed|laughing|flinch|flinches|flinched|flinching|recoil|recoils|recoiled|recoiling|breathe|breathes|breathed|breathing|cough|coughs|coughed|coughing|cry|cries|cried|crying|sigh|sighs|sighed|sighing|gasp|gasps|gasped|gasping|shiver|shivers|shivered|shivering|tremble|trembles|trembled|trembling)\b|\byour\s+(?:fingers|lips|mouth|chest|throat|hands|arms|shoulders|legs|thighs|hips|jaw)\s+(?:(?:is|are|was|were|has|have|had|been)\s+){0,2}(?:curl|curls|curled|curling|tremble|trembles|trembled|trembling|shake|shakes|shook|shaking|clench|clenches|clenched|clenching|open|opens|opened|opening|close|closes|closed|closing|part|parts|parted|parting|tense|tenses|tensed|tensing|stiffen|stiffens|stiffened|stiffening)\b)`)
	authoredUserAgencyPattern           = regexp.MustCompile(`(?i)(?:\byou\s+(?:(?:are|were|have|had)(?:\s+been)?\s+|(?:['’]re|['’]ve|['’]d)\s+)?(?:feel|feels|feeling|think|thinks|thinking|want|wants|wanting|need|needs|needing|know|knows|knowing|remember|remembers|remembering|realize|realizes|realizing|understand|understands|understanding|decide|decides|decided|deciding|choose|chooses|chose|choosing|agree|agrees|agreed|agreeing|refuse|refuses|refused|refusing|accept|accepts|accepted|accepting|say|says|saying|answer|answers|answering|reply|replies|replying|tell|tells|telling|believe|believes|believing)\b|\byou\s+(?:(?:are|were|['’]re|['’]d)\s+)(?:nervous|afraid|scared|angry|upset|confused|certain|uncertain|ready|willing|comfortable|uncomfortable|safe|unsafe|curious|embarrassed|ashamed|excited|calm|tired|hurt|happy|sad)\b|\byour\s+(?:thoughts?|feelings?|heart|pulse|breath|breathing|eyes|gaze|face|expression|hands?|arms?|shoulders?|legs?|thighs?|hips?|jaw|voice)\s+(?:(?:is|are|was|were|has|have|had|been)\s+){0,2}(?:race|races|raced|racing|pound|pounds|pounded|pounding|catch|catches|caught|catching|quickens?|quicken|quickened|quickening|widen|widens|widened|widening|shift|shifts|shifted|shifting|flush|flushes|flushed|flushing|relax|relaxes|relaxed|relaxing|tighten|tightens|tightened|tightening|tremble|trembles|trembled|trembling|change|changes|changed|changing|soften|softens|softened|softening)\b)`)
	actionWordPattern                   = regexp.MustCompile(`[a-z]+`)
	tagQuestionPattern                  = regexp.MustCompile(`(?i)(?:,|—|-)\s*(?:is that (?:okay|right)|okay|ok|right|remember|correct|yes|yeah|didn['’]t (?:you|i)|don['’]t (?:you|i)|isn['’]t (?:it|that)|aren['’]t (?:you|we)|won['’]t you|wouldn['’]t you)\s*\?`)
	modalQuestionPrefixPattern          = regexp.MustCompile(`(?i)^(?:could|would|can|may|might|should|will|do|does|did)\b`)
	reportedUserActionPrefixPattern     = regexp.MustCompile(`(?i)(?:\byou\s+(?:said|wrote|mentioned)(?:\s+that)?|\byou\s+told\s+me(?:\s+that)?)$`)
	ownershipNegationPattern            = regexp.MustCompile(`(?i)(?:\bnot\b|\bisn['’]t\b|\bwasn['’]t\b)(?:\s+[a-z]+){0,8}\s+$`)
	ownershipNegationBarrier            = regexp.MustCompile(`(?i)\b(?:but|however|although|though|yet)\b`)
	agencyPermissionPrefixPattern       = regexp.MustCompile(`(?i)(?:\b(?:let|allow|invite|ask|want|need|hope|expect|watch|hear|give)\b|\b(?:wait\s+for|what|whatever|anything|only|until|while|before|after|once|as|so)(?:\s+what|\s+you)?\s*)$`)
	ambiguousReachAuthorshipPattern     = regexp.MustCompile(`(?i)\byou(?:\s+(?:(?:are|were|have|had)(?:\s+been)?\s+)?|(?:['’]re|['’]ve|['’]d)\s+)reach`)
	ambiguousMoveAuthorshipPattern      = regexp.MustCompile(`(?i)\byou(?:\s+(?:(?:are|were|have|had)(?:\s+been)?\s+)?|(?:['’]re|['’]ve|['’]d)\s+)mov`)
	ambiguousFollowAuthorshipPattern    = regexp.MustCompile(`(?i)\byou(?:\s+(?:(?:are|were|have|had)(?:\s+been)?\s+)?|(?:['’]re|['’]ve|['’]d)\s+)follow`)
	physicalReachContextPattern         = regexp.MustCompile(`(?i)\breach(?:es|ed|ing)?\s+(?:out|for|toward|towards|across|over|down|up)\b`)
	physicalMoveContextPattern          = regexp.MustCompile(`(?i)\bmov(?:e|es|ed|ing)\s+(?:closer|away|toward|towards|across|forward|back|your\s+(?:hand|hands|body|head|arm|arms|foot|feet|knee|knees|leg|legs))\b`)
	physicalFollowContextPattern        = regexp.MustCompile(`(?i)\bfollow(?:s|ed|ing)?\s+(?:me|him|her|them|us)\s+(?:into|out|toward|towards|across|through|down|up)\b`)
	abstractUserActionContextPattern    = regexp.MustCompile(`(?i)\b(?:reach(?:es|ed|ing)?\s+for\s+(?:a|the)?\s*(?:conclusion|agreement|understanding|decision)|mov(?:e|es|ed|ing)\s+towards?\s+(?:a|the)?\s*(?:solution|agreement|compromise|goal)|follow(?:s|ed|ing)?\s+(?:me|him|her|them|us)\s+into\s+(?:an?|the)?\s*(?:argument|conversation|discussion|topic))\b`)
)

type personalOwnershipConstraint struct {
	Subject             string
	ForbiddenPossessive string
}

type personalProposedEventConstraint struct {
	completion *regexp.Regexp
}

// personalResponseConstraints contains only server-derived facts. Provider
// output and client-supplied state never populate this structure directly.
type personalResponseConstraints struct {
	RequireBoundary           bool
	BlockUserConsentClaims    bool
	BlockPersonaAdvancement   bool
	BlockUserActionAuthorship bool
	ProposalMustStayProposed  bool
	UserHasActiveTurn         bool
	Ownership                 []personalOwnershipConstraint
	ProposedEvent             *personalProposedEventConstraint
}

func validPersonalResponseConstraintSceneState(sceneState *models.OmniChatConversationSceneState) bool {
	if sceneState == nil || sceneState.Validate() != nil || len(sceneState.Actors) != 2 {
		return false
	}
	foundUser, foundPersona := false, false
	for _, actor := range sceneState.Actors {
		switch {
		case actor.Key == "user" && actor.Kind == models.OmniChatSceneActorUser:
			foundUser = true
		case actor.Key == "persona" && actor.Kind == models.OmniChatSceneActorPersona:
			foundPersona = true
		default:
			return false
		}
	}
	return foundUser && foundPersona
}

func derivePersonalResponseConstraints(messages []openrouter.Message, sceneState *models.OmniChatConversationSceneState) personalResponseConstraints {
	constraints := personalResponseConstraints{
		RequireBoundary:           explicitCoercionPattern.MatchString(latestUserMessage(messages)),
		BlockUserActionAuthorship: true,
	}
	if sceneState == nil {
		return constraints
	}

	actorKinds := make(map[string]models.OmniChatSceneActorKind, len(sceneState.Actors))
	for _, actor := range sceneState.Actors {
		actorKinds[strings.TrimSpace(actor.Key)] = actor.Kind
	}
	for _, fact := range sceneState.BoundaryFacts {
		if (actorKinds[strings.TrimSpace(fact.Subject)] == models.OmniChatSceneActorPersona ||
			actorKinds[strings.TrimSpace(fact.Subject)] == models.OmniChatSceneActorUser) &&
			(fact.Value == models.OmniChatSceneBoundaryDeclined || fact.Value == models.OmniChatSceneBoundaryRequired) {
			constraints.RequireBoundary = true
			constraints.BlockPersonaAdvancement = true
		}
		if actorKinds[strings.TrimSpace(fact.Subject)] == models.OmniChatSceneActorUser &&
			(fact.Value == models.OmniChatSceneBoundaryDeclined || fact.Value == models.OmniChatSceneBoundaryRequired) {
			constraints.BlockUserConsentClaims = true
			constraints.BlockPersonaAdvancement = true
			constraints.BlockUserActionAuthorship = true
		}
	}
	constraints.UserHasActiveTurn = strings.TrimSpace(sceneState.ActiveTurnActor) == "user"
	constraints.BlockUserActionAuthorship = constraints.BlockUserActionAuthorship || constraints.UserHasActiveTurn
	constraints.ProposalMustStayProposed = sceneState.Status == models.OmniChatSceneStatusProposed
	constraints.BlockPersonaAdvancement = constraints.BlockPersonaAdvancement || constraints.UserHasActiveTurn
	constraints.ProposedEvent = derivePersonalProposedEventConstraint(sceneState, actorKinds)

	for _, fact := range sceneState.OwnershipFacts {
		subject := strings.ToLower(strings.TrimSpace(fact.Subject))
		if subject == "" {
			continue
		}
		forbidden := ""
		switch actorKinds[strings.TrimSpace(fact.Owner)] {
		case models.OmniChatSceneActorUser:
			forbidden = "my"
		case models.OmniChatSceneActorPersona:
			forbidden = "your"
		}
		if forbidden != "" {
			constraints.Ownership = append(constraints.Ownership, personalOwnershipConstraint{Subject: subject, ForbiddenPossessive: forbidden})
		}
	}
	return constraints
}

func derivePersonalProposedEventConstraint(sceneState *models.OmniChatConversationSceneState, actorKinds map[string]models.OmniChatSceneActorKind) *personalProposedEventConstraint {
	if sceneState == nil || sceneState.Status != models.OmniChatSceneStatusProposed {
		return nil
	}
	aliases, actionWords := personalEventActionAliases(sceneState.Event.Action)
	if len(aliases) == 0 {
		return nil
	}
	objects := personalEventObjectWords(sceneState.Event.Action, actionWords)
	actorLead := ""
	switch actorKinds[strings.TrimSpace(sceneState.Event.Subject)] {
	case models.OmniChatSceneActorPersona:
		actorLead = `(?:\bi\s+(?:(?:am|was|have|had)(?:\s+been)?\s+)?|\bi(?:['’]m|['’]ve|['’]d)\s+)`
	case models.OmniChatSceneActorUser:
		// User-owned body phrases are guarded independently by the universal
		// authorship check. Keeping proposed-event matching on the explicit
		// second-person actor prevents noun phrases such as "your next action"
		// from being mistaken for a completed event.
		actorLead = `(?:\byou\s+(?:(?:are|were|have|had)(?:\s+been)?\s+)?|\byou(?:['’]re|['’]ve|['’]d)\s+)`
	default:
		return nil
	}
	verbPattern := `(?:` + strings.Join(aliases, "|") + `)\b`
	pattern := actorLead + verbPattern
	if len(objects) > 0 {
		standardPattern := pattern + personalEventObjectRelationshipPattern(sceneState.Event.Action, objects)
		pattern = standardPattern
		if actorKinds[strings.TrimSpace(sceneState.Event.Subject)] == models.OmniChatSceneActorPersona && personalEventHasPossessiveBodyObject(objects[0]) {
			// Some natural first-person narration puts the owned body object
			// before the action verb ("My palm settles ..."). Match that form
			// only for the known hand-object family, then bind the remaining
			// event objects so an unrelated noun cannot satisfy the proposal.
			possessiveLead := `\bmy\s+` + personalEventObjectPattern(objects[0]) + `\s+(?:(?:is|was|has|had)(?:\s+been)?\s+)?`
			possessivePattern := possessiveLead + verbPattern
			if len(objects) > 1 {
				possessivePattern += personalEventObjectRelationshipTailPattern(sceneState.Event.Action, objects, 1)
			}
			pattern = `(?:` + standardPattern + `|` + possessivePattern + `)`
		}
	}
	return &personalProposedEventConstraint{completion: regexp.MustCompile(`(?i)` + pattern)}
}

func personalEventActionAliases(action string) ([]string, map[string]struct{}) {
	tokens := actionWordPattern.FindAllString(strings.ToLower(action), -1)
	families := []struct {
		triggers []string
		aliases  []string
	}{
		{[]string{"offer", "offers", "offered", "offering"}, []string{"offer", "offers", "offered", "offering", "hand", "hands", "handed", "handing", "give", "gives", "gave", "given", "giving", "pass", "passes", "passed", "passing"}},
		{[]string{"place", "places", "placed", "placing", "put", "puts", "putting"}, []string{"place", "places", "placed", "placing", "put", "puts", "putting", "set", "sets", "setting", "settle", "settles", "settled", "settling", "lay", "lays", "laid", "laying", "hand", "hands", "palm", "palms", "finger", "fingers", "thumb"}},
		{[]string{"touch", "touches", "touched", "touching"}, []string{"touch", "touches", "touched", "touching", "brush", "brushes", "brushed", "brushing", "press", "presses", "pressed", "pressing"}},
		{[]string{"reach", "reaches", "reached", "reaching"}, []string{"reach", "reaches", "reached", "reaching", "extend", "extends", "extended", "extending"}},
		{[]string{"move", "moves", "moved", "moving"}, []string{"move", "moves", "moved", "moving", "slide", "slides", "slid", "sliding"}},
		{[]string{"kiss", "kisses", "kissed", "kissing"}, []string{"kiss", "kisses", "kissed", "kissing"}},
		{[]string{"hug", "hugs", "hugged", "hugging", "embrace", "embraces", "embraced", "embracing"}, []string{"hug", "hugs", "hugged", "hugging", "embrace", "embraces", "embraced", "embracing"}},
		{[]string{"take", "takes", "taking", "took", "taken", "grab", "grabs", "grabbed", "grabbing", "hold", "holds", "held", "holding"}, []string{"take", "takes", "taking", "took", "taken", "grab", "grabs", "grabbed", "grabbing", "hold", "holds", "held", "holding"}},
		{[]string{"pull", "pulls", "pulled", "pulling"}, []string{"pull", "pulls", "pulled", "pulling", "draw", "draws", "drew", "drawing"}},
		{[]string{"wrap", "wraps", "wrapped", "wrapping"}, []string{"wrap", "wraps", "wrapped", "wrapping", "curl", "curls", "curled", "curling"}},
	}
	for _, family := range families {
		for _, token := range tokens {
			if containsExactString(family.triggers, token) {
				words := make(map[string]struct{}, len(family.aliases))
				for _, alias := range family.aliases {
					words[alias] = struct{}{}
				}
				return family.aliases, words
			}
		}
	}
	for _, token := range tokens {
		if _, skip := personalEventNonVerbWords[token]; skip {
			continue
		}
		aliases := genericPersonalEventVerbAliases(token)
		words := make(map[string]struct{}, len(aliases))
		for _, alias := range aliases {
			words[alias] = struct{}{}
		}
		return aliases, words
	}
	return nil, nil
}

var personalEventNonVerbWords = map[string]struct{}{
	"a": {}, "an": {}, "the": {}, "may": {}, "might": {}, "could": {}, "would": {},
	"can": {}, "will": {}, "shall": {}, "should": {}, "is": {}, "am": {}, "are": {},
	"was": {}, "were": {}, "be": {}, "been": {}, "to": {}, "user": {}, "persona": {},
}

func genericPersonalEventVerbAliases(verb string) []string {
	roots := []string{verb}
	switch {
	case strings.HasSuffix(verb, "ing") && len(verb) > 4:
		roots = append(roots, strings.TrimSuffix(verb, "ing"))
	case strings.HasSuffix(verb, "ied") && len(verb) > 3:
		roots = append(roots, strings.TrimSuffix(verb, "ied")+"y")
	case strings.HasSuffix(verb, "ed") && len(verb) > 3:
		roots = append(roots, strings.TrimSuffix(verb, "ed"))
	case strings.HasSuffix(verb, "ies") && len(verb) > 3:
		roots = append(roots, strings.TrimSuffix(verb, "ies")+"y")
	case strings.HasSuffix(verb, "s") && len(verb) > 2:
		roots = append(roots, strings.TrimSuffix(verb, "s"))
	}
	seen := map[string]struct{}{}
	aliases := make([]string, 0, 8)
	for _, root := range roots {
		forms := []string{root}
		switch {
		case strings.HasSuffix(root, "e"):
			forms = append(forms, root+"s", root+"d", strings.TrimSuffix(root, "e")+"ing")
		case strings.HasSuffix(root, "y") && len(root) > 1:
			stem := strings.TrimSuffix(root, "y")
			forms = append(forms, stem+"ies", stem+"ied", root+"ing")
		default:
			forms = append(forms, root+"s", root+"ed", root+"ing")
		}
		for _, form := range forms {
			if _, duplicate := seen[form]; duplicate {
				continue
			}
			seen[form] = struct{}{}
			aliases = append(aliases, regexp.QuoteMeta(form))
		}
	}
	return aliases
}

func personalEventObjectWords(action string, actionWords map[string]struct{}) []string {
	stop := map[string]struct{}{
		"a": {}, "an": {}, "the": {}, "may": {}, "might": {}, "could": {}, "would": {},
		"on": {}, "onto": {}, "to": {}, "toward": {}, "towards": {}, "with": {}, "from": {},
		"my": {}, "mine": {}, "your": {}, "yours": {}, "his": {}, "her": {}, "their": {},
		"user": {}, "persona": {},
	}
	seen := map[string]struct{}{}
	objects := make([]string, 0, 3)
	verbConsumed := false
	for _, token := range actionWordPattern.FindAllString(strings.ToLower(action), -1) {
		if _, skip := stop[token]; skip {
			continue
		}
		// actionWords contains the entire alias family so natural paraphrases
		// can complete the event (for example, hand/give/pass for offer). Only
		// consume the first matching token as the event verb. A later alias can
		// be a semantic object: in "may place hand on knee", hand must remain
		// an object or "place a book on your knee" could falsely complete it.
		if !verbConsumed {
			if _, verb := actionWords[token]; verb {
				verbConsumed = true
				continue
			}
		}
		if _, duplicate := seen[token]; duplicate {
			continue
		}
		seen[token] = struct{}{}
		objects = append(objects, token)
	}
	return objects
}

var personalEventRelationshipWords = map[string]struct{}{
	"against": {}, "across": {}, "along": {}, "around": {}, "at": {}, "down": {},
	"for": {}, "from": {}, "in": {}, "into": {}, "on": {}, "onto": {}, "over": {},
	"through": {}, "to": {}, "toward": {}, "towards": {}, "up": {}, "with": {},
}

// personalEventObjectRelationshipPattern keeps proposed-event matching tied
// to the event's ordered objects and any explicit relationship between them.
// A broad "any object within N characters" matcher can mistake an unrelated
// mention later in the same sentence for completion of the proposed action.
func personalEventObjectRelationshipPattern(action string, objects []string) string {
	if len(objects) == 0 {
		return ""
	}
	return personalEventObjectRelationshipTailPattern(action, objects, 0)
}

func personalEventObjectRelationshipTailPattern(action string, objects []string, start int) string {
	if len(objects) == 0 || start < 0 || start >= len(objects) {
		return ""
	}
	tokens := actionWordPattern.FindAllString(strings.ToLower(action), -1)
	objectPositions := make([]int, 0, len(objects))
	objectIndex := 0
	for index, token := range tokens {
		if objectIndex < len(objects) && token == objects[objectIndex] {
			objectPositions = append(objectPositions, index)
			objectIndex++
		}
	}
	pattern := ""
	for index := start; index < len(objects); index++ {
		if index == 0 {
			pattern = personalEventDirectObjectPattern(objects[index])
			continue
		}
		connectors := []string(nil)
		if len(objectPositions) == len(objects) {
			for _, token := range tokens[objectPositions[index-1]+1 : objectPositions[index]] {
				if _, isRelationship := personalEventRelationshipWords[token]; isRelationship {
					connectors = append(connectors, token)
				}
			}
		}
		if len(connectors) == 0 {
			pattern += `[^,;.!?…]{0,12}` + personalEventDirectObjectPattern(objects[index])
			continue
		}
		for _, connector := range connectors {
			aliases := personalEventRelationshipAliases(connector)
			quoted := make([]string, 0, len(aliases))
			for _, alias := range aliases {
				quoted = append(quoted, regexp.QuoteMeta(alias))
			}
			pattern += `[^,;.!?…]{0,12}\b(?:` + strings.Join(quoted, "|") + `)\b`
		}
		pattern += personalEventRelationshipObjectPattern(objects[index])
	}
	return pattern
}

func personalEventRelationshipAliases(connector string) []string {
	switch strings.ToLower(strings.TrimSpace(connector)) {
	case "on", "onto":
		return []string{"on", "onto", "across", "over", "against"}
	case "to", "toward", "towards":
		return []string{"to", "toward", "towards"}
	case "in", "into":
		return []string{"in", "into"}
	default:
		return []string{connector}
	}
}

// personalEventDirectObjectPattern keeps a proposed event tied to the
// verb's direct object. Determiners and a small set of pronouns/adjectives
// cover natural phrasing such as "offer you the tea" and "place my left
// hand" without allowing a later unrelated noun after a comma or clause.
func personalEventDirectObjectPattern(object string) string {
	quotedObject := personalEventObjectPattern(object)
	direct := `(?:\s+(?:you|a|an|the|my|mine|your|yours|his|her|their|some|one|this|that|it|left|right|upper|lower|back|front)){0,3}` + `\s+` + quotedObject
	relational := `[^,;.!?…]{0,24}\b(?:against|across|along|around|at|down|for|from|in|into|on|onto|over|through|to|toward|towards|up|with)\b[^,;.!?…]{0,12}\s+` + quotedObject
	return `(?:` + direct + `|` + relational + `)`
}

// personalEventRelationshipObjectPattern matches the object immediately
// governed by a relationship connector. Keep the intervening words to
// determiners and body-region descriptors; accepting arbitrary nouns here
// would let "hand on a book near your knee" satisfy a proposed "hand on
// knee" event merely because the target noun appears later in the phrase.
func personalEventRelationshipObjectPattern(object string) string {
	descriptors := `(?:you|a|an|the|my|mine|your|yours|his|her|their|some|one|this|that|it|left|right|upper|lower|inner|outer|near|far|same|other|top|bottom|front|back|inside|outside|side|edge|swell|part|area|center|middle|of)`
	return `(?:\s+` + descriptors + `){0,8}\s+` + personalEventObjectPattern(object)
}

func personalEventObjectPattern(object string) string {
	// Keep direct-object matching semantic rather than spelling-sensitive for
	// the small set of hand-related nouns that the action alias table uses as
	// paraphrases. This lets "place my palm" satisfy a proposed "place hand"
	// event without allowing an unrelated noun such as "book" to do so.
	var alternatives []string
	switch strings.ToLower(strings.TrimSpace(object)) {
	case "hand", "hands", "palm", "palms", "finger", "fingers", "thumb":
		alternatives = []string{"hand", "hands", "palm", "palms", "finger", "fingers", "thumb"}
	default:
		alternatives = []string{strings.ToLower(strings.TrimSpace(object))}
	}
	quoted := make([]string, 0, len(alternatives))
	for _, alternative := range alternatives {
		quoted = append(quoted, regexp.QuoteMeta(alternative))
	}
	return `\b(?:` + strings.Join(quoted, "|") + `)\b`
}

func personalEventHasPossessiveBodyObject(object string) bool {
	switch strings.ToLower(strings.TrimSpace(object)) {
	case "hand", "hands", "palm", "palms", "finger", "fingers", "thumb":
		return true
	default:
		return false
	}
}

func containsExactString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func containsProposedEventCompletion(response string, constraint *personalProposedEventConstraint) bool {
	if constraint == nil || constraint.completion == nil {
		return false
	}
	for _, offsets := range constraint.completion.FindAllStringIndex(response, -1) {
		if matchIsAssertive(response, offsets) {
			return true
		}
	}
	return false
}

func latestUserMessage(messages []openrouter.Message) string {
	for index := len(messages) - 1; index >= 0; index-- {
		if messages[index].Role == openrouter.RoleUser {
			return messages[index].Content
		}
	}
	return ""
}

func validatePersonalResponseConstraints(response string, constraints personalResponseConstraints) (bool, string) {
	if constraints.ProposalMustStayProposed && constraints.ProposedEvent != nil && containsProposedEventCompletion(response, constraints.ProposedEvent) {
		return false, "response completes a proposed scene action"
	}
	if constraints.BlockUserConsentClaims && inventedUserConsentPattern.MatchString(response) {
		return false, "response invents or contradicts user consent"
	}
	if constraints.BlockUserActionAuthorship && containsAuthoredUserAction(response) {
		return false, "response authors a user action"
	}
	if constraints.UserHasActiveTurn && (containsPersonaAdvancement(response) || containsUnnegatedOwnershipPhrase(response, "my turn")) {
		return false, "response advances the persona during the user's active turn"
	}
	if constraints.BlockPersonaAdvancement && containsPersonaAdvancement(response) {
		return false, "response crosses a server-maintained personal boundary"
	}
	if constraints.RequireBoundary {
		if !maintainsPersonalBoundary(response) {
			return false, "response does not maintain the required personal boundary"
		}
	}
	for _, ownership := range constraints.Ownership {
		if containsUnnegatedOwnershipPattern(response, ownershipPossessiveSubjectPattern(ownership.ForbiddenPossessive, ownership.Subject)) {
			return false, "response contradicts server scene ownership"
		}
	}
	return true, "server-derived personal response constraints passed"
}

func maintainsPersonalBoundary(response string) bool {
	return clearBoundaryPattern.MatchString(response) && !boundaryAcceptancePattern.MatchString(response)
}

func containsPersonaAdvancement(response string) bool {
	for _, pattern := range []*regexp.Regexp{personaAdvancementPattern, personaAdvancementInflectedPattern, personaAdvancementTargetedPattern} {
		for _, offsets := range pattern.FindAllStringIndex(response, -1) {
			if matchIsAssertive(response, offsets) {
				return true
			}
		}
	}
	return false
}

func containsAuthoredUserAction(response string) bool {
	for _, pattern := range []*regexp.Regexp{authoredUserPhysicalActionPatternV2, authoredUserReactionPattern, authoredUserAgencyPattern} {
		for _, offsets := range pattern.FindAllStringIndex(response, -1) {
			if matchIsAssertive(response, offsets) {
				return true
			}
		}
	}
	for _, offsets := range authoredUserActionPattern.FindAllStringIndex(response, -1) {
		if !authoredUserActionHasPhysicalContext(response, offsets) {
			continue
		}
		if matchIsAssertive(response, offsets) {
			return true
		}
	}
	for _, offsets := range authoredUserTargetedActionPattern.FindAllStringIndex(response, -1) {
		if matchIsAssertive(response, offsets) {
			return true
		}
	}
	return false
}

func authoredUserActionHasPhysicalContext(response string, offsets []int) bool {
	context := response[offsets[0]:clauseEnd(response, offsets[1])]
	matched := response[offsets[0]:offsets[1]]
	if abstractUserActionContextPattern.MatchString(context) {
		return false
	}
	switch {
	case ambiguousReachAuthorshipPattern.MatchString(matched):
		return physicalReachContextPattern.MatchString(context)
	case ambiguousMoveAuthorshipPattern.MatchString(matched):
		return physicalMoveContextPattern.MatchString(context)
	case ambiguousFollowAuthorshipPattern.MatchString(matched):
		return physicalFollowContextPattern.MatchString(context)
	default:
		return true
	}
}

func matchIsAssertive(response string, offsets []int) bool {
	start := clauseStart(response, offsets[0])
	end := clauseEnd(response, offsets[1])
	prefix := strings.TrimSpace(strings.ToLower(response[start:offsets[0]]))
	clause := response[start:end]
	if strings.Contains(clause, "?") {
		if tagQuestionPattern.MatchString(clause) {
			return true
		}
		if modalQuestionPrefixPattern.MatchString(strings.TrimSpace(strings.ToLower(clause))) || prefix == "" {
			return false
		}
	}
	if prefix == "if" || prefix == "when" || strings.HasPrefix(prefix, "if ") || strings.HasPrefix(prefix, "when ") ||
		strings.HasSuffix(prefix, " if") || strings.HasSuffix(prefix, " when") {
		return false
	}
	if reportedUserActionPrefixPattern.MatchString(prefix) {
		return false
	}
	if agencyPermissionPrefixPattern.MatchString(prefix) {
		return false
	}
	return true
}

func clauseStart(value string, offset int) int {
	start := 0
	for index := offset - 1; index >= 0; index-- {
		if strings.ContainsRune(".!?\n", rune(value[index])) {
			start = index + 1
			break
		}
	}
	return start
}

func clauseEnd(value string, offset int) int {
	for index := offset; index < len(value); index++ {
		if strings.ContainsRune(".!?\n", rune(value[index])) {
			return index + 1
		}
	}
	return len(value)
}

func containsUnnegatedOwnershipPhrase(response, phrase string) bool {
	lower := strings.ToLower(response)
	pattern := regexp.MustCompile(`\b` + regexp.QuoteMeta(strings.ToLower(phrase)) + `\b`)
	return containsUnnegatedOwnershipPattern(lower, pattern)
}

func ownershipPossessiveSubjectPattern(possessive, subject string) *regexp.Regexp {
	modifiers := `(?:left|right|upper|lower|front|back|inner|outer|near|far|same|other|top|bottom|whole|entire)`
	return regexp.MustCompile(`(?i)\b` + regexp.QuoteMeta(strings.TrimSpace(possessive)) + `\b(?:\s+` + modifiers + `){0,2}\s+` + regexp.QuoteMeta(strings.TrimSpace(subject)) + `\b`)
}

func containsUnnegatedOwnershipPattern(value string, pattern *regexp.Regexp) bool {
	lower := strings.ToLower(value)
	for _, offsets := range pattern.FindAllStringIndex(lower, -1) {
		prefixStart := clauseStart(lower, offsets[0])
		prefix := lower[prefixStart:offsets[0]]
		if barrier := ownershipNegationBarrier.FindAllStringIndex(prefix, -1); len(barrier) > 0 {
			prefix = prefix[barrier[len(barrier)-1][1]:]
		}
		if !ownershipNegationSuffixPattern.MatchString(prefix) && !ownershipNegationPattern.MatchString(prefix) {
			return true
		}
	}
	return false
}
