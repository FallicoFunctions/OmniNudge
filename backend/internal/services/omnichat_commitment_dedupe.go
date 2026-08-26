package services

import "strings"

// A commitment is restated when most of what it is about is already held.
//
// The threshold is on the *new* summary's content words rather than on both,
// because a restatement is usually shorter than the original: "the user owes me
// a coffee" against "he owes me a coffee for calling the match wrong" shares
// everything the short one says and only some of what the long one does.
const omniChatCommitmentRestatementOverlap = 0.6

// Words that carry no subject matter. A promise and an unrelated one share
// plenty of these, and counting them would make everything look like a
// duplicate of everything.
var omniChatCommitmentStopWords = map[string]bool{
	"a": true, "an": true, "the": true, "to": true, "of": true, "for": true,
	"and": true, "or": true, "is": true, "it": true, "that": true, "this": true,
	"i": true, "me": true, "my": true, "he": true, "she": true, "him": true,
	"her": true, "they": true, "them": true, "you": true, "your": true,
	"user": true, "will": true, "would": true, "said": true, "says": true,
	"owes": true, "owe": true, "on": true, "in": true, "at": true, "with": true,
	"be": true, "been": true, "was": true, "were": true, "do": true, "does": true,

	// Fillers, which matter more than they look. A restatement is often only
	// two or three words long, so one uncounted filler drags the overlap below
	// the threshold: "he still owes me that coffee" scored 0.50 purely because
	// "still" was being counted as subject matter.
	"still": true, "again": true, "just": true, "really": true,
	"actually": true, "now": true, "then": true, "about": true,
}

// restatesAHeldCommitment reports whether this summary is another wording of a
// commitment already held.
//
// Deliberately a blunt lexical test rather than anything cleverer. It runs on
// output a model has already been asked not to produce, so it is the second
// line rather than the first, and the failure it prevents -- two copies of one
// promise, permanently -- is worse than the failure it can cause, which is one
// genuinely new commitment being missed in an exchange that also reopened
// another.
func restatesAHeldCommitment(summary string, held []string) bool {
	fresh := commitmentContentWords(summary)
	if len(fresh) == 0 {
		return false
	}
	for _, existing := range held {
		known := commitmentContentWords(existing)
		if len(known) == 0 {
			continue
		}
		shared := 0
		for word := range fresh {
			if known[word] {
				shared++
			}
		}
		if float64(shared)/float64(len(fresh)) >= omniChatCommitmentRestatementOverlap {
			return true
		}
	}
	return false
}

func commitmentContentWords(summary string) map[string]bool {
	words := map[string]bool{}
	for _, field := range strings.Fields(strings.ToLower(summary)) {
		word := strings.Trim(field, ".,;:!?\"'()[]")
		if word == "" || omniChatCommitmentStopWords[word] {
			continue
		}
		words[word] = true
	}
	return words
}
