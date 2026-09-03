package models

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// OmniAIStyleProfile is her taste in clothes, written once and kept.
//
// It exists because the four candidate pictures used to be the only place her
// style lived. Somebody chose her wearing a green field jacket in a bookshop,
// the brief that produced it was thrown away, and every later picture of her
// dressed her from nothing again. A character whose look is re-invented on
// every render is not a character anybody recognises.
//
// Deliberately her taste rather than one outfit. Storing the picked outfit
// would hold her still: she would wear the same clothes for the rest of her
// life, which reads as a cartoon rather than a person. Taste is what a person
// actually keeps -- the colours they reach for, the shapes they own, the way
// they layer -- and it dresses her differently on different days while still
// looking like her.
//
// Nothing here describes a scene or a place. An OmniAI has no life off-screen
// and no occupation, so this says what she owns and never what she does.
type OmniAIStyleProfile struct {
	// Taste is the whole of how she dresses, in prose: her colours, materials,
	// silhouettes, and how she puts them together.
	Taste string `json:"taste,omitempty"`
	// SignatureItem is the one thing she has in nearly every picture -- the
	// headphones round her neck, a particular hat, a ring she never takes off.
	//
	// Nearly, not always. It is dropped wherever it would be wrong rather than
	// forced in, because an item that survives every context stops reading as
	// hers and starts reading as a costume.
	SignatureItem string `json:"signature_item,omitempty"`
	// Note is the creator's own words about how she dresses, kept verbatim.
	//
	// Separate from Taste, and never overwritten by it. Taste is written by a
	// model from her personality and can be rewritten whenever that changes;
	// this is somebody's instruction and outranks it. Merging the two would
	// lose the distinction on the first rewrite.
	Note string `json:"note,omitempty"`
}

// What one style profile may contribute. Taste is the largest because it is
// prose that has to carry colours, materials and silhouettes; the other two are
// a phrase and a sentence.
const (
	OmniAIStyleMaxTasteRunes         = 500
	OmniAIStyleMaxSignatureItemRunes = 100
	OmniAIStyleMaxNoteRunes          = 300
)

// IsZero reports whether nothing has been written or asked for.
//
// A zero profile is normal, not an error: every character created before this
// existed has one, and a character whose creator said nothing and whose writer
// was unreachable has one too. Callers dress her from her personality alone.
func (s OmniAIStyleProfile) IsZero() bool {
	return strings.TrimSpace(s.Taste) == "" &&
		strings.TrimSpace(s.SignatureItem) == "" &&
		strings.TrimSpace(s.Note) == ""
}

// Validate rejects a profile too long to put in a prompt.
//
// Length only. There is no required field: a creator may give a note and no
// more, a writer may produce taste with no signature item worth naming, and
// both are complete profiles.
func (s OmniAIStyleProfile) Validate() error {
	for _, field := range []struct {
		name  string
		value string
		limit int
	}{
		{"taste", s.Taste, OmniAIStyleMaxTasteRunes},
		{"signature_item", s.SignatureItem, OmniAIStyleMaxSignatureItemRunes},
		{"note", s.Note, OmniAIStyleMaxNoteRunes},
	} {
		if utf8.RuneCountInString(field.value) > field.limit {
			return fmt.Errorf("omniai style: %s is longer than %d characters", field.name, field.limit)
		}
	}
	return nil
}
