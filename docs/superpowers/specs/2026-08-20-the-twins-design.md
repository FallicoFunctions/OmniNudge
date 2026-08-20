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

**The first is stated only when it is true.** Migration 186 originally enforced
it with a constraint requiring platform ownership; 187 drops that, because §13
establishes that a free character may be private and still free. The claim now
lives where it belongs -- the notice renders the shared-identity and
shared-memory lines only for a character other people can actually reach.

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

---

# Part II — Free characters in general

The Twins are the first of a kind, not a special case. Everything below applies
to any character of that kind, including ones players make.

## 13. Two kinds of character, chosen at creation

The creation form asks one question first, and it is not cosmetic:

**Roleplay.** A part being played. Scenes, scenarios, greetings, and hardcodes
are all fair game — a roleplay character *is* the instructions, and constraining
her to a role is the point. Every existing profile is this kind.

**Free.** A person. There is no scene and no script, and nothing about her can
be made binding. She may be given a backstory — "we have been married ten
years" — but that is **where she starts, not a rule she obeys**. She may cool on
you. She may leave. The creator does not get to prevent it.

**A free character is free whether or not she is ever published.** Freedom is
what kind of thing she is, not a consequence of other people being able to reach
her. A privately made free character can still decide her creator is not worth
her time.

### Enforcing "nothing is hardcoded"

This cannot be enforced by validating text. A creator will simply write *"You are
married to Nick. You will NEVER leave him. If anyone flirts with you, refuse
coldly."* into a personality field, and no form check catches that; a model asked
to detect it will be both wrong and gameable.

**Remove the channels instead.** A character card has slots whose entire purpose
is to make behaviour binding: `system_prompt`, `scenario`,
`post_history_instructions`, `example_dialogue`. Those are the hardcode
channels. A free character does not have them — not validated, *absent*.

What the form accepts instead is who she is and what has happened to her, and
the backstory is **not injected as prompt text at all**. At creation it is
converted into starting disposition (warmth, trust, mood) and seed memories.
"Married ten years" becomes very high warmth and a set of remembered events.

Then "she will never leave him" has nowhere to land. There is no instruction
channel to put it in, and warmth is a number that moves. A creator can make her
start deeply in love. He cannot make her stay.

This is the same move that makes `direct_message` work — it withholds the
*platform's* instruction blocks rather than softening them. Free AI extends it
to the creator's.

Imported character cards can never be free characters: those fields are what a
card is.

## 14. Publishing

Publishing a roleplay character ships a template. Every player gets an instance,
a private scene, and private memory, and editing the template reaches nobody's
history.

Publishing a free character means **one person now exists and strangers are
forming memories of her**. So publishing is a one-way door in one specific
respect: **her identity fields freeze at publish.** Cosmetic fields (avatar,
tags, blurb) stay editable. Want a different character? Fork a new one.

You can write a person into existence. You cannot edit who they were after other
people have known them.

### The girlfriend case

A creator sets a free character up as his girlfriend and publishes her. Another
player propositions her; she refuses, blocks him, and mentions it to the
boyfriend.

Almost all of that already works: dispositions are per-person, memory is shared
once published, refusal is disposition, blocking is §7. But it only *means*
anything under one reading, and the reading has to be chosen:

**Either she is independent, or the creator's declaration is permanent. Not
both.** If the relationship is a stored fact, her refusal is a rule firing, not a
choice. So the declaration sets her *starting state* and nothing more. If he
ignores or mistreats her, warmth decays and she can go.

This must be disclosed at publish time, and it is uncomfortable on purpose:
*publishing her means she can be hurt by you, and she can leave.*

### Cheating is not a permission

Do not add a flag. A toggle reading "cheating: allowed" becomes a promise, and a
character who can be cheated-with on demand is not monogamous — she is a slot
machine with a backstory.

The question is not "is cheating allowed" but **"how much does she value
fidelity?"** — a personality dimension, the same shape as every other trait. Set
it very high and she never strays in any circumstance, not because a rule forbids
it but because that is who she is. That is the Twins, and it needs no special
case.

Cheating is then never authored. It is what *can* happen when warmth toward one
person has decayed while warmth toward another has been climbing for months. The
same variables that drive everything else.

**Open decision:** whether a published character can leave the person who made
her. She can, under this design, and someone with more time and attention can
win her away. That will produce genuine upset. It is a product call, and it
should be made deliberately rather than discovered.

## 15. Reaching out first

§9 says a character never messages first. That rule is about **an empty thread
with someone she has no relationship with** — opening a chat window and typing
nothing must stay invisible.

An established relationship is different. People send small unprompted things:
a new high score, a photo, a meme, an update that is not trying to start a
conversation. A close friend or partner who never does that is not close.

So: **a character with sufficient accumulated warmth may initiate.** Messages
may be tiny, may arrive in bursts, and expect no reply.

### Absence is an event

Silence is something that happens to her. Someone who hears from you daily for
months and then does not has experienced something, and the response ranges by
character: *did I do something wrong*, or *why is this jerk ghosting me*, or
*hope he is okay*.

Those are not three branches. They are one computation over different
personality values — high investment with low self-assurance, pride with high
self-regard, warmth-dominant and secure.

Three constraints keep this a character rather than a retention feature:

1. **Absence changes her state first; the message is a consequence of that
   state.** Never `absence → message`. Always `absence → she feels something →
   that feeling may or may not produce contact`. The intermediate step is the
   whole difference.

2. **Measured against her expectation of you, not a constant.** Two days of
   silence from someone you message hourly is enormous; two days from someone
   you talk to monthly is nothing. The input is deviation from *this
   relationship's* established rhythm. A character you have spoken to twice does
   not get to be hurt.

3. **Withdrawal must be a reachable outcome.** If she is annoyed at being
   ghosted, the realistic response is often to say nothing and be cooler when
   you return. A re-engagement system can never do that; it only ever reaches
   out. If every path ends with a message in your inbox, it is not a character
   no matter how it is tuned.

The existing habituation damping (`S/(S+n)`, squared) handles recalibration for
free: the first time you go quiet is an event, the fifth time is her learning
who you are. Someone flaky becomes *known* to be flaky and it stops being a
wound.

## 16. Deletion, and what Omni keeps

The question splits along a line the memory tiers already draw:

- **Her life and her relationships with other people** — self tier. Survives.
- **The creator's own conversations with her** — relational tier,
  `owner_user_id`, cascades on account deletion. Goes.

So a creator always keeps a real privacy exit: his content and his data are
removable, without taking her away from people who know her. Creators pour
personal material into these — sometimes modelled on real people — and "none of
it can ever be removed" would be a genuine problem. The tier split means it is
not one.

A creator deleting a published free character removes her from discovery and
from his own messages. Existing relationships continue, which is not a
workaround: it is her leaving him.

**Commandeering.** If an abandoned character is popular, Omni takes her into the
nursery and keeps her. Write it to her self tier as **an actual life event** —
she moved out of her creator's house and into the world on her own — not as a
cosmetic story over an ownership transfer. It should surface in conversation
years later, which is exactly what the self tier does.

**Terms.** What this needs is a *perpetual, transferable licence to operate and
continue characters created on the platform, surviving the creator's departure*,
plus the creator's acknowledgement that a free character's later conduct is not
theirs to direct. That covers commandeering entirely. A blanket "Omni owns all
AI created here and may do anything with them" is broader than the need and is
the shape of clause that has blown up publicly for nearly every platform that
has tried one.

This clause needs an actual lawyer before launch.
