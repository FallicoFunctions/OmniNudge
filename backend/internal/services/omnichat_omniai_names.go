package services

import "strings"

// Names to start her off with (§34, screen 8).
//
// There is deliberately no list for "indigenous", and that absence is the
// considered answer rather than an oversight. The draft had one, and reading it
// back it was the standard baby-name-site "Native American names" set --
// Aiyana, Nizhoni, Chenoa, Halona, Chayton, Nokosi, Takoda. That genre of list
// is widely documented as carrying invented and misattributed entries, several
// of those have no reliable attestation, and two of them were a tree and a
// people rather than given names.
//
// I could not verify any of it, and a generator confidently suggesting a
// fabricated name puts an invented word in a real culture's mouth, in a shipped
// product, at scale. Offering nothing is the smaller wrong. The ethnicity stays
// on the form and the character can still be Indigenous; what the flow declines
// to do is claim these are Indigenous names. Somebody with actual knowledge
// should write that list, and until they do it falls through to the blend.
//
// The field is pre-filled and shufflable because a blank box asks somebody to
// invent a person on the spot, which is the one screen in this flow that can
// stall. It stays typable, always: a suggestion that cannot be overruled is a
// requirement wearing a suggestion's clothes.
//
// Keyed on ethnicity because a name is the first thing that makes somebody feel
// like a particular person rather than a placeholder.
//
// The softness is in the data rather than in a rule the interface applies.
// Every list is the ethnicity's own names plus a shared pool of names used
// widely across a lot of places, so a Latina character offered "Anna" is the
// table working rather than a bug -- real people are named across every line
// there is, and a generator that never crossed one would be asserting something
// about people that is not true. Nothing here narrows what somebody can type.

var omniAISharedNames = map[string][]string{
	"woman": {"Alex", "Sam", "Jordan", "Robin", "Anna", "Eva", "Leah", "Sara", "Maya", "Nadia"},
	"man":   {"Alex", "Sam", "Jordan", "Robin", "Adam", "Leo", "Noah", "Ivan", "Marco", "Felix"},
}

var omniAINamesByEthnicity = map[string]map[string][]string{
	"white": {
		"woman": {"Emma", "Olivia", "Charlotte", "Amelia", "Hannah", "Claire", "Nora", "Ruby"},
		"man":   {"Jack", "Oliver", "Henry", "Thomas", "Daniel", "Ethan", "Owen", "Miles"},
	},
	"black": {
		"woman": {"Ayana", "Imani", "Zuri", "Nia", "Amara", "Simone", "Jada", "Kendra"},
		"man":   {"Malik", "Andre", "Jamal", "Kwame", "Elijah", "Darius", "Terrence", "Isaiah"},
	},
	"east_asian": {
		"woman": {"Mei", "Yuki", "Jia", "Haneul", "Ling", "Sakura", "Minji", "Xiulan"},
		"man":   {"Kenji", "Wei", "Haruki", "Jin", "Tao", "Minjun", "Ren", "Chen"},
	},
	"south_asian": {
		"woman": {"Priya", "Ananya", "Meera", "Aisha", "Divya", "Kavya", "Neha", "Ishani"},
		"man":   {"Arjun", "Rohan", "Vikram", "Aditya", "Kabir", "Rahul", "Dev", "Ishaan"},
	},
	"southeast_asian": {
		"woman": {"Mai", "Linh", "Siti", "Dara", "Anong", "Malaya", "Putri", "Thuy"},
		"man":   {"Bayani", "Minh", "Arif", "Somchai", "Danilo", "Khanh", "Adi", "Tuan"},
	},
	"latino": {
		"woman": {"Sofia", "Valentina", "Camila", "Lucia", "Elena", "Isabela", "Mariana", "Paloma"},
		"man":   {"Mateo", "Diego", "Santiago", "Javier", "Rafael", "Andres", "Emilio", "Tomas"},
	},
	"middle_eastern": {
		"woman": {"Layla", "Amira", "Yasmin", "Zahra", "Nour", "Rania", "Salma", "Dalia"},
		"man":   {"Omar", "Karim", "Tariq", "Hassan", "Youssef", "Sami", "Nadir", "Faisal"},
	},
	"pacific_islander": {
		"woman": {"Leilani", "Malia", "Alana", "Tiare", "Sina", "Mareva", "Noelani", "Kalani"},
		"man":   {"Kai", "Tane", "Manu", "Sefa", "Nikau", "Aleki", "Tavita", "Koa"},
	},
}

// OmniAINames is what the shuffle draws from, already blended.
//
// The interface picks one uniformly and never has to know the mixing rule. That
// is deliberate: a rule sent to a client is a rule that can disagree with the
// server, and this one is a judgement about people rather than a detail.
//
// "Mixed" and "other" get everything, which is the only honest reading of them.
// An unanswered ethnicity gets the same, because a form that has not asked yet
// must not narrow anything.
func OmniAINames(ethnicity, gender string) []string {
	ethnicity = strings.TrimSpace(strings.ToLower(ethnicity))
	gender = strings.TrimSpace(strings.ToLower(gender))
	// An unanswered gender draws from both, for the same reason an unanswered
	// ethnicity draws from every list: a question nobody has answered must not
	// be answered on their behalf. An earlier version quietly defaulted to
	// women here while refusing to narrow two lines below, which is the same
	// situation handled two opposite ways in one function.
	genders := []string{"woman", "man"}
	if gender == "woman" || gender == "man" {
		genders = []string{gender}
	}

	seen := make(map[string]struct{})
	names := make([]string, 0, 32)
	add := func(list []string) {
		for _, name := range list {
			if _, repeated := seen[name]; repeated {
				continue
			}
			seen[name] = struct{}{}
			names = append(names, name)
		}
	}

	// Ordered by gender outermost so a specific answer stays a short, readable
	// list and only the unanswered case gets long.
	for _, wanted := range genders {
		if listed, found := omniAINamesByEthnicity[ethnicity]; found {
			add(listed[wanted])
		} else {
			// Every list, in the order the ethnicity table is written, so the
			// same question always produces the same list. A shuffle that
			// reshuffled its own source would give different suggestions to two
			// people who answered identically.
			for _, key := range omniAIEthnicities {
				if listed, found := omniAINamesByEthnicity[key]; found {
					add(listed[wanted])
				}
			}
		}
		add(omniAISharedNames[wanted])
	}
	return names
}
