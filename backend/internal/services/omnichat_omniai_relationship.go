package services

import "strings"

// What the two of them are to each other, asked before anything else about the
// relationship.
//
// This replaces a question that did not work. The You screen asked how she
// feels about you and, beside it, how drawn to you she is -- so somebody making
// a friend was handed a question about attraction they had not asked for, and
// the honest answer to "is she attracted to me" was none every time. Naming the
// relationship asks the plain thing once and lets attraction follow from it.
//
// Four, because these are the ones that change how she talks. A situationship
// is not a partner who has not been labelled yet: it is its own thing, and
// people are in them on purpose.
type omniAIRelationshipKind struct {
	Key string

	// Where attraction starts. Not a second question -- a spouse who is not
	// attracted to you is a marriage in trouble, which is a thing that happens
	// but is not what somebody is asking for on the first day.
	Attraction float64

	// Added to whatever the feeling seeds. Somebody who calls this person their
	// husband has already been through the part where you become attached, and
	// starting him at a friend's attachment would contradict the answer.
	Attachment float64
}

var omniAIRelationshipKinds = []omniAIRelationshipKind{
	{Key: "friend", Attraction: 0.00, Attachment: 0.00},
	{Key: "situationship", Attraction: 0.45, Attachment: 0.10},
	{Key: "partner", Attraction: 0.70, Attachment: 0.30},
	{Key: "spouse", Attraction: 0.75, Attachment: 0.50},
}

// OmniAIDefaultRelationshipKind is what an unanswered screen means, and what every
// relationship made before the question existed is read as. Friendship is the
// honest reading of silence; inventing a romance from it is not.
const OmniAIDefaultRelationshipKind = "friend"

// OmniAIRelationshipKeys lists what the form may offer, in the order it asks.
func OmniAIRelationshipKeys() []string {
	keys := make([]string, 0, len(omniAIRelationshipKinds))
	for _, kind := range omniAIRelationshipKinds {
		keys = append(keys, kind.Key)
	}
	return keys
}

// NormaliseOmniAIRelationshipKind answers what to store. An unrecognised kind
// reads as friend rather than failing the creation: a form that gains an option
// before this table does should make a plainer relationship, not lose her.
func NormaliseOmniAIRelationshipKind(key string) string {
	if _, found := findOmniAIRelationshipKind(key); found {
		return strings.TrimSpace(strings.ToLower(key))
	}
	return OmniAIDefaultRelationshipKind
}

func findOmniAIRelationshipKind(key string) (omniAIRelationshipKind, bool) {
	key = strings.TrimSpace(strings.ToLower(key))
	for _, kind := range omniAIRelationshipKinds {
		if kind.Key == key {
			return kind, true
		}
	}
	return omniAIRelationshipKind{}, false
}
