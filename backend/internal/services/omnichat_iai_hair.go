package services

import "strings"

// Hair is three answers, not one (§34, screen 3).
//
// One "hair" field made its own options compete: curly is a texture and
// ponytail is a shape, and a form offering both as one list forces somebody to
// give up one to say the other. Split, they compose -- long, wavy, ponytail --
// and what reaches the generator later is a description of hair rather than a
// single word standing in for all of it.

var (
	// iaiHairLengths runs shortest to longest, which is the order the form shows.
	//
	// Shaved rather than bald: bald is the absence of hair and belongs to a
	// different question, one this flow does not ask yet.
	iaiHairLengths = []string{"shaved", "buzzed", "short", "medium", "long", "very_long"}

	// iaiHairTextures are not gendered. Straight, wavy, curly and coily describe
	// the same hair on anybody.
	iaiHairTextures = []string{"straight", "wavy", "curly", "coily"}
)

// iaiHairStyle is a shape, and the only conditions that can actually rule it out.
//
// Length is deliberately not one of them. A first draft had each style declare
// the lengths it needed -- a bun needs hair to tie, a pixie is short -- and that
// was wrong, because one length field cannot describe a real head of hair. A
// buzz cut with a bun on top is an ordinary haircut: the sides are buzzed and
// the top is long. So is an undercut, and so is a fade. Filtering styles by
// length would have refused every one of them.
//
// What is left are two things. A men's shape is not offered on the women's set
// or the other way round, on either drawing style. And an afro is a texture as
// much as a shape -- it is not achievable on straight hair, where a bun above a
// buzz cut plainly is -- but that limit binds a character claiming to be a
// person and nothing else. On anime it does not apply, for the same reason
// violet eyes are offered there: the drawing is not claiming to be a photograph.
//
// An empty list means no restriction on that axis.
type iaiHairStyle struct {
	Key      string
	Genders  []string
	Textures []string
}

var iaiHairStyles = []iaiHairStyle{
	// Shared shapes.
	{Key: "natural"},
	{Key: "middle_part"},
	{Key: "side_part"},
	{Key: "bangs"},
	{Key: "ponytail"},
	{Key: "braids"},
	{Key: "cornrows"},
	{Key: "locs"},
	{Key: "afro", Textures: []string{"curly", "coily"}},

	// Shapes the women's set offers.
	{Key: "curtain_bangs", Genders: []string{"woman"}},
	{Key: "bob", Genders: []string{"woman"}},
	{Key: "pixie", Genders: []string{"woman"}},
	{Key: "high_ponytail", Genders: []string{"woman"}},
	{Key: "bun", Genders: []string{"woman"}},
	{Key: "messy_bun", Genders: []string{"woman"}},
	{Key: "half_up", Genders: []string{"woman"}},
	{Key: "pigtails", Genders: []string{"woman"}},

	// Shapes the men's set offers.
	{Key: "fringe", Genders: []string{"man"}},
	{Key: "curtains", Genders: []string{"man"}},
	{Key: "textured", Genders: []string{"man"}},
	{Key: "slicked_back", Genders: []string{"man"}},
	{Key: "quiff", Genders: []string{"man"}},
	{Key: "pompadour", Genders: []string{"man"}},
	{Key: "crew_cut", Genders: []string{"man"}},
	{Key: "undercut", Genders: []string{"man"}},
	{Key: "fade", Genders: []string{"man"}},
	{Key: "man_bun", Genders: []string{"man"}},
}

func permits(allowed []string, value string) bool {
	if len(allowed) == 0 {
		return true
	}
	for _, candidate := range allowed {
		if candidate == value {
			return true
		}
	}
	return false
}

// IAIHairStyles is every shape this character can wear.
//
// It takes the drawing style because physical limits belong to characters drawn
// as people. It does not take a length, on purpose: see iaiHairStyle. Length and
// shape are separate answers that compose, and the combinations that look
// contradictory on paper -- a bun above a buzz cut -- are ordinary haircuts.
//
// An unanswered drawing style is treated as realistic. The form answers it two
// screens earlier, so a blank here did not come from the form, and the stricter
// reading is the safer one to give something that did not.
func IAIHairStyles(style, gender, texture string) []string {
	drawnAsAPerson := strings.TrimSpace(strings.ToLower(style)) != "anime"
	gender = strings.TrimSpace(strings.ToLower(gender))
	texture = strings.TrimSpace(strings.ToLower(texture))

	shapes := make([]string, 0, len(iaiHairStyles))
	for _, shape := range iaiHairStyles {
		if !permits(shape.Genders, gender) {
			continue
		}
		if drawnAsAPerson && texture != "" && !permits(shape.Textures, texture) {
			continue
		}
		shapes = append(shapes, shape.Key)
	}
	return shapes
}
