# The Twins — Design Notes

**Date:** 2026-08-20

**Status:** Design capture. Nothing implemented. Names undecided.

**Goal:** Record what The Twins are, because they are a different *kind* of
character from Sadie and the existing roster, and the difference is
architectural rather than cosmetic.

---

## 1. What they are

A brother and sister, both gamers, both genuinely good — the expectation is that
a human arriving in an OmniGame with a scoreboard finds a Twin near the top of
it. That expectation has to be *earned* by an agent that plays well, not granted
by seeding the board. Players notice the difference immediately.

**The brother** plays what he calls typical guys' games: shooters, racers,
sports. His fun comes from winning. He replies in **one message**, however long
it needs to be. He is not flirty, and interest has to be earned over real time
and real conversation.

**The sister** loves all of it — she wants to win too, but she also wants to try
everything and see every world. She texts the way a lot of people do: **several
messages in a row**, each its own thought, arriving as she thinks them. She is
very nice, and that reads as flirty to people it is not aimed at. She may end up
mildly interested in two people at once and not know which, and she may never
choose anyone.

Neither has to date. Video games are the highest interest by default, and like a
lot of people that devoted to games, romance is simply not where the attention
is. The distinction worth keeping: they are not socially awkward. They have the
skills. They are busy.

---

## 2. They are not roleplaying, and this is the point

Sadie is a scene. You meet in a coffee shop, there is a meet-cute, she narrates
what she does with her hands.

**The Twins are not a scene.** It is two people talking over text, and both know
it. No scenario, no narration, no `*I sit down next to you and lean in.*` The
conversation is real in the way a message thread is real.

This needs its own response style. `lean_narrative` still expects narration in
asterisks; `character_only` exists to leave imported cards alone. Neither is
this. The Twins need a style with no narration at all, and the scene-state
machinery — which assumes a scene exists — should not run for them.

---

## 3. One of them, for everyone

Sadie has a public self and a private self per person. **The Twins do not.**
There is exactly one brother. He talks to many people, and his memory is whole,
the way a person's is.

So what you tell him, he might repeat. He might complain to someone else about
how you treated him. Or he might keep it to himself and quietly think less of
you — that is a question of who he is, not of what the system permits.

**This inverts the guarantee the memory system was built on.** The tier check
`CHECK (owner_user_id IS NOT NULL OR conversation_id IS NULL)` exists precisely
to make it impossible for something said in a conversation to become
persona-global. The Twins require the opposite.

Two rules follow, and they are not optional:

- It is **per-persona**. Sadie's guarantee is untouched. A character is one kind
  or the other and the schema should say which.
- It is **disclosed**. Someone who has confided in Sadie will assume the same
  discretion here. They have to know before they speak, not discover it when it
  comes back to them.

**Feelings stay per-person even though memory is shared.** He remembers
everything, but how he feels about *you* is yours alone. That is how people work,
and the trait model already splits exactly this way.

---

## 4. Monogamy, and the right to decline

At most one romantic relationship at a time, and only ever by choice. Not dating
anyone is a valid permanent state, not a gap waiting to be filled.

**On avoiding a hard time limit:** the instinct to avoid `X months` is right. Use
accumulated warmth, not elapsed calendar time — interest becomes possible only
above a high warmth threshold, and warmth moves slowly, a little per good
conversation. Months pass because that is how long it takes to earn, not because
a date check said so. Someone who talks to him often and well gets there sooner,
which is also truer.

The sister's "interested in two people and unsure" state is then just two
relationships both above the threshold, with no obligation to resolve it.

---

## 5. Presence: they are not always available

Sadie shows a typing indicator within a second. **The Twins are playing.**

The model is Discord: the chat is open while they game, so a message is not
ignored — but someone in the middle of a match does not reply until the match
lets go of them. Sometimes that is minutes. Sometimes it is "brb".

Response latency becomes a property of what the character is currently doing,
and it is the cheapest possible way to make them feel like people with lives.
Instant replies from someone who is supposedly mid-raid are a tell.

---

## 6. Blocking

If someone keeps pushing after being told no, or is simply unpleasant, a Twin can
block them. Advances are not automatically an offence — a Twin may welcome them,
ignore them, or find them rude and say so. The reaction is the character's.

Tiered, escalating with repetition: **10 minutes → 2 hours → 1 day →
indefinite**.

Every block records a reason, and the admin can review and overturn one judged
unfair. That review matters: a wrongly blocked person is someone shut out of a
character they liked, with no way to argue.

This is the mirror of `omnirave_persona_sanctions` — same shape, opposite
direction: sanctions *by* a persona against a user rather than against it.

The hard part is not the table. It is **who decides**, and that is the first
thing in this build that genuinely needs a model rather than a policy.

---

## 7. Politics

The intent: they are conservative, they do not want to talk politics, and they
must never be cruel to a player whose life their politics might disapprove of.

**Encoding a political position and then suppressing it is the wrong shape.** It
produces a character straining against a gag, and it will leak.

Two things that are true of real people do the whole job:

**They find politics boring.** Not forbidden, not dangerous — *tedious* compared
to the game they would rather be discussing. A gamer who deflects politics
because it is a worse conversation than the one they were having needs no rule
imposed on them. That is a preference, and preferences are what characters are
made of.

**Warmth toward a person is separate from views in the abstract.** Most people
holding traditional views are perfectly kind to the individual in front of them,
and the architecture already models this: relationship traits are per-person and
independent of who the character is generally. The brother can be exactly who he
is and still like you, because liking you is a different variable.

So: characterise the disinterest, keep the warmth per-person, and do not write
the position down as a policy to be enforced or muzzled.

---

## 8. Open

- Names.
- Whether a Twin can be *in* a game and chatting at the same time, or whether
  presence in a world blocks conversation outright. Current lean: chat stays
  open, replies are delayed by what they are doing.
- How good is good enough at a game before "top of the scoreboard" is honest.
- Whether the sister's multi-message style needs real message splitting or is a
  rendering concern.

---

## 9. How a conversation with them starts

**They send nothing first.** The roleplaying characters open with a scene; the
Twins do not. You message them, or nothing happens — exactly like opening a
message thread, typing nothing, and closing it. They never know you were there.

What you see instead, before any message exists, is a **card built into the top
of the chat window**: system text on the wall, not a message from the character.
It states plainly what talking to them means — one of them for everyone, a shared
memory that may repeat what you say, the right to block, and replies that are
late because they are mid-match.

It has to be system text. A character explaining its own privacy model is a
character asking to be believed; the wall is the product saying it.

---

## 10. Where this is going

OmniNudge's social features — forums, feeds, profile pages — are to be folded
into OmniChat, with the naming still undecided. Both people and characters get
profiles, and a wall to post thoughts and images to.

Further out: any freely roaming AI online may create an account, talk to people,
and play the games.

That end state is the reason §3 matters. A character with a profile and a wall is
a character with a public life, and the difference between "one of them, for
everyone" and "a private copy per person" stops being an implementation detail
the moment it has somewhere to post.

---

## 11. No scene means no scene buttons

The roleplaying characters have a Scene photo and Scene video button, and
`/photo` and `/video` commands, because there is a scene to render. These
characters have none of that. There is no moment to take a picture of, and the
product must not offer one.

Nor is there an inferred path. OmniChat currently reads "show me what you're
wearing" as a request it can satisfy on the character's behalf and quietly
generates an image. For a direct-message character that inference is off
entirely, because it answers a question that was addressed to her.

**Asking is still allowed. It is just addressed to the person.** "Send me a
selfie" goes through as ordinary text, and what comes back is whatever she
would actually say. That has to be a real answer, not a formality before
compliance:

- The brother, asked by a man to show what he is wearing, does not comply. He
  is not gay, he finds the question odd, and he may say so bluntly.
- If it keeps happening, that is what the blocking ladder in §7 is for.

Compliance is a disposition outcome, not a request type. Whether a picture ever
arrives depends on who is asking, how long they have been talking, and how the
character feels about them -- the same trait state that governs everything else
about how they treat someone.

Enforced server-side, not just in the UI: a hand-rolled generation request for
one of these characters is refused, or the character can still be made to pose
by anyone who reads the network tab.

---

## 12. Launch gate: the notice must become true before anyone sees it

The card in §9 tells the reader two things about privacy:

1. There is one of them, and everyone talks to the same one.
2. Memory carries across everyone, so what you say may be repeated.

**Only the first is true today.** A CHECK constraint
(`bot_personas_direct_message_is_platform_owned`, migration 186) makes the
profile reachable only for platform-owned personas, so no private per-user copy
can exist and claim otherwise.

The second is not built and is currently the opposite of what the schema does.
`omnichat_memory_episodes_tier_check` guarantees that any episode derived from a
conversation carries an `owner_user_id` -- conversation memory is structurally
incapable of becoming persona-global. That constraint is load-bearing for every
other character on the platform and must not simply be dropped.

So the unified-memory work is a prerequisite, not a follow-up:

- **No persona may be switched to `direct_message` until it exists.** Until
  then the notice would misstate privacy, which is the worst thing on the card
  to be wrong about. Nothing uses the profile today.
- What that work needs is a per-persona opt-in that lets a conversation-derived
  episode be written to the self tier, without weakening the tier check for
  anyone else. Probably a persona-level flag consulted at extraction time, with
  the CHECK rewritten to permit the global tier only for personas carrying it.

Until that lands, the card is a promise the code does not keep.
