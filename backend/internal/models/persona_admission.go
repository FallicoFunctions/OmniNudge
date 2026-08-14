package models

// AdmissiblePersonaPredicate is the one definition of which character may enter
// a world, and therefore of which character has a life there.
//
// Two paths ask this question: admission, which decides whether a character
// gets in, and the world-event write, which decides whether what a character
// did is part of who it is. They must answer identically. Until now they said
// the same thing in two places, which held only because nobody edited one --
// and adding sanctions is exactly the sort of edit that would have split them,
// leaving a withdrawn character refused at the door but still accumulating a
// history. So the sentence lives here once and both paths quote it.
//
// It lives in models rather than in omnigame because this is a fact about
// bot_personas, and because models imports nothing internal: omnigame can reach
// it, and the reverse dependency that would make this a cycle cannot arise.
//
// Two things the callers must supply: the persona table aliased as p, and the
// persona id as $1. Both are checked by a test that runs the two paths over the
// same set of personas and requires the same verdict from each.
//
// The clauses, in order:
//
// Only a platform character roams. A character that belongs to a user never
// enters a world at all -- it is that user's private thing, and letting it walk
// around would put a face the platform did not author in front of everyone
// else. Saying so in the query makes it structural rather than a rule each new
// path has to remember.
//
// A sanction in force refuses it. A sanction with no expiry is indefinite,
// which is what withdrawal is; one with an expiry lapses on its own and the
// character is admissible again the moment it does, with nothing to run and no
// state to clean up. A character already inside a world is not disconnected by
// the sanction itself: its session ends at its token's expiry, five minutes
// out at most, and the token it needs to come back is only issued to a
// character this predicate still admits. The door closing is enough because
// the session cannot outlast the key.
const AdmissiblePersonaPredicate = `
	p.id = $1
	  AND p.is_active
	  AND p.owner_user_id IS NULL
	  AND p.visibility = 'public'
	  AND NOT EXISTS (
	      SELECT 1
	      FROM omnirave_persona_sanctions s
	      WHERE s.persona_id = p.id
	        AND (s.expires_at IS NULL OR s.expires_at > now())
	  )
`
