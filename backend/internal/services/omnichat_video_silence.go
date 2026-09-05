package services

import (
	"regexp"
	"strings"
)

// Clips ship without sound for the first release, so nobody may appear to
// speak in one. A silent clip of a person visibly talking is worse than no
// clip: it reads as broken audio rather than as a silent video.
//
// Two things that look like the control are not. Asked plainly -- "She does
// not speak. Her lips stay closed." -- she spoke anyway. Sent
// generate_audio=false, the returned file carried no audio stream at all and
// she still mouthed words in silence. The audio flag governs the soundtrack,
// not the animation.
//
// What worked was removing the audience. Four renders in a row failed while
// every one of their prompts pointed her at a viewer: "talks and smiles",
// "waves at the camera", "smiles at the camera". A prompt describing a
// self-contained action with nobody to address -- "she takes a record from the
// shelf, holds it in both hands, and looks down at the cover" -- produced no
// mouth movement at all, and ended cleanly because the action finished.
//
// So this does not add a prohibition. It removes the addressee.

// speechClause matches a clause that asks the subject to communicate. Word
// boundaries on both sides: "talks" must match and "stalks" must not, and a
// blind pattern on this repository once failed for exactly that reason.
var speechClause = regexp.MustCompile(`(?i)\b(talk|talks|talking|speak|speaks|speaking|say|says|saying|tell|tells|telling|greet|greets|greeting|chat|chats|chatting|whisper|whispers|whispering|sing|sings|singing|shout|shouts|shouting|call out|calls out|introduce|introduces|introducing|explain|explains|explaining|answer|answers|answering|ask|asks|asking)\b`)

// addresseeClause matches being pointed at an audience. "At the camera" is the
// commonest and the most reliable trigger: it is in three of the four prompts
// that produced speech.
var addresseeClause = regexp.MustCompile(`(?i)\b(at|into|to|toward|towards)\s+(the\s+)?(camera|lens|viewer|screen|phone|you)\b`)

// silentMotionFallback is used when removing the speech leaves nothing.
//
// It has to be an action rather than a state: "standing still" arrived at the
// model as an instruction contradicting "add only motion", which is why the
// pose field was dropped from this prompt in the first place.
//
// And it carries no pronoun. The first version read "she shifts her weight",
// which described every male character as a woman -- the same defect a prompt
// matrix was built to prevent after it shipped once already, in a builder that
// matrix does not cover. It does now.
const silentMotionFallback = "shifts weight slightly and looks around, taking in the surroundings"

// SilentMotion rewrites a motion description so the subject has nobody to
// address and nothing to say.
//
// It removes rather than forbids, because a prohibition demonstrably does not
// reach this model. An empty result falls back to a neutral action instead of
// returning nothing: a video job with no motion animates nothing and charges
// for it.
func SilentMotion(motion string) string {
	motion = strings.TrimSpace(motion)
	if motion == "" {
		return silentMotionFallback
	}

	// Clause by clause, so removing "talking to him" does not also remove
	// "holding a mug" from the same sentence.
	kept := make([]string, 0, 4)
	for _, clause := range strings.Split(motion, ",") {
		clause = strings.TrimSpace(clause)
		if clause == "" {
			continue
		}
		if speechClause.MatchString(clause) || addresseeClause.MatchString(clause) {
			continue
		}
		kept = append(kept, clause)
	}

	rebuilt := strings.TrimSpace(strings.Join(kept, ", "))
	// A one-clause motion that was entirely about speaking leaves nothing, and
	// so does "she talks to the camera". Both must still produce a clip.
	if rebuilt == "" || len(strings.Fields(rebuilt)) < 2 {
		return silentMotionFallback
	}
	return rebuilt
}

// MotionImpliesSpeech reports whether a description would put words in her
// mouth. Exposed so a caller can log or count how often it fires: this rewrite
// changes what a user asked for, and doing that silently and unmeasured is how
// a feature quietly stops doing what people expect.
func MotionImpliesSpeech(motion string) bool {
	return speechClause.MatchString(motion) || addresseeClause.MatchString(motion)
}
