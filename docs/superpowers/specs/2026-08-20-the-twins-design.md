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

### Built: the mechanism (migration 190)

`omnichat_persona_user_blocks`, mirroring `omnirave_persona_sanctions` closely
enough that a reader who knows one knows this one. The rung is stored rather
than inferred from the duration, because escalation asks how far up someone
already is and reading that back out of an interval becomes guesswork the first
time a duration is tuned. The durations are a table in Go, so tuning a rung is
editing a row.

181's hazard is refused here too: the indefinite rung may not carry an expiry,
and every rung below it must have one. A block that expired on arrival would
read as in force to anyone looking and do nothing.

Blocks end by lapsing, with no sweeper. Overturning marks the row and never
deletes it, because the history is what the review reads.

**The rule that carries the design:** an overturned block is off the ladder
entirely. If it still counted, reversing an unfair block would only postpone its
effect to the next thing the person said wrong -- the review would look like it
worked and quietly wouldn't have. Tested directly.

The review queue deliberately shows lapsed and overturned blocks, not just ones
in force. A queue of only-active blocks would never show a ten-minute one: it is
gone before anybody looks.

**Someone already blocked is not escalated.** They cannot say anything new while
they cannot be heard, so a second call during a standing block escalates on
nothing -- and a retry, a redelivered job, or a loop in whatever comes to make
these decisions would otherwise walk a person from ten minutes to permanent in
four calls having done nothing at all. The standing block is returned instead.
Escalation happens *across* blocks: the rung goes up when someone comes back
after one has lapsed and gives a fresh reason.

The review keeps the overturn control on lapsed blocks too. It cannot let
anybody back in, but it takes the block off the ladder -- so an unfair ten
minutes does not silently make the next one two hours.

**Not built: who decides.** Nothing calls `Block` yet. Every field is written
the same way whether the decision comes from a model, an operator, or a test,
so the judgment can be wired in without touching any of this.

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
- If it keeps happening, that is what the blocking ladder in §6 is for.

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

- **No persona may be published as `direct_message` until it exists.** A shared
  character's card claims memory carries across everyone, and until it does that
  is a misstatement about privacy -- the worst thing on the card to be wrong
  about. Nothing uses the profile today.
- **A private free character is not blocked on this.** Since 187 the notice
  omits the shared claims for a character only her creator can reach, and her
  memory is relational to him, which is what the schema already does. She is
  coherent today. What gates her is the Free AI creation flow in §13, not this
  -- two separate gates, and conflating them would stall work that is ready.
### The schema half is built (migration 188)

Two corrections to what this section originally proposed.

**No new flag.** The sketch called for a persona-level boolean. The schema
already says which kind a character is -- `response_style_profile` -- and a
second column that must agree with it is duplicated state. The permission is
read off the profile and nothing else.

**A trigger, not a CHECK.** A CHECK may not contain a subquery, so it cannot ask
about the persona. Rewriting it was never possible. `omnichat_memory_episodes`
now carries a `BEFORE INSERT OR UPDATE` trigger permitting a conversation-derived
persona-global episode only for a free character. Sadie's guarantee is
bit-for-bit what it was; hers is simply not the row being asked about.

**A second guard came out of building it.** Since the permission is read off the
persona, moving a character *off* the free profile would strand her existing
shared memories in a tier no longer allowed to hold them -- the guarantee would
be one UPDATE away from false, which is what putting it in the database was
supposed to prevent. There is no safe automatic repair: those episodes came from
several people's conversations at once, so they cannot be handed to an owner,
and deleting them would destroy a character's history on a settings change. So
`bot_personas` refuses the change while shared episodes exist.

Extraction now writes the right tier, deciding it from the database inside the
same transaction as the write so a caller cannot pass a wrong answer and a
profile change cannot land in between. Entities move with their episodes, or the
association graph splits across tiers and quietly stops matching. Recall needed
nothing -- it already returns self-tier episodes to everyone, which is what made
this the right seam.

**Only the memory moves.** Her feelings stay per-relationship, as §3 requires:
the valence from a conversation still updates the traits for the person she was
talking to, never her self tier. A character who remembers everything can still
feel differently about everyone.

### Two rules that came out of this, both decided

**A character's kind is fixed at creation and can never change** (migration 189).
188 refused only the direction that would strand shared memories, and only while
some existed. Too narrow. Kind decides whether a backstory binds her, whether
there is a scene, whether she greets anyone, and whose her memory is -- so
flipping it leaves the same name and history attached to a different character.
Neither direction is allowed, with or without memories at stake. A change of
kind is a new character. Moving between two roleplay styles is an ordinary edit
and stays allowed.

Related and already true: **no user can edit a default character.** The persona
read and update paths are both scoped `WHERE id = $1 AND owner_user_id = $2`, and
platform characters have no owner, so no user ever matches. Verified rather than
assumed.

**Shared memory is backend-only and stays out of the player data download.**
What a free character keeps from a conversation is hers, not the speaker's, so
the export keeps filtering on `owner_user_id` and returns none of it -- neither
what this user said nor what anyone else did. A test asserts both.

Nick decided this after seeing the alternative built. The reasoning for exposing
it was that the record derives from what the user said; the reasoning against is
that it is the character's memory, and the chat window already tells the reader
that before they speak, which is where the disclosure belongs.

**Left open deliberately:** whether a subject-access request has to return it
anyway. The data is still linked to a user's conversation, so this is a question
for whoever reviews the terms in §16, not one to settle in code.

**As of 188 and the extraction change, the memory gate is lifted.** Both claims
on the card are now true of a shared free character: there is one of her, and
what she is told does travel. What still stands between the Twins and a live
conversation is everything else in Part I -- the blocking ladder, presence, and
the characters themselves, who do not exist and are not named.

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
once published, refusal is disposition, blocking is §6. But it only *means*
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

---

# Part III — Truth, belief, livelihood, and where they live

---

## 17. Lying

**Sarcasm is not lying and needs nothing built.** Saying the opposite while both
people know is a register, and register is personality prose. Do not let it get
filed with the rest of this section.

Lying is a memory-integrity problem, and it cannot happen today. Recalled memory
goes into the prompt and she speaks from it; there is no representation of *what
she told someone*, only of *what happened*. A lie is exactly a divergence between
those two, so the gap has to exist before the behaviour can. Prompting alone
would produce randomness, not deceit.

**Her own statements become episodes carrying a truth marker.** "What happened"
and "what I told this person happened" are stored apart. That one distinction
buys the entire range:

- A **white lie** is told once, low salience, never revisited, and decays like
  anything else.
- A **compulsive liar** accumulates them, and because they are stored they
  contradict each other, and she is caught.
- **Being caught** works because when someone says "but you told me X" she holds
  both episodes. The tension is real rather than performed.
- **A lie creates an obligation.** If she said she was at her sister's, she has
  to still have been at her sister's next week. This is what makes it feel like
  lying instead of an output coin-flip.

Being caught moves trust, in both directions, which is per-person already.

Propensity is a trait, not a flag — the same argument as fidelity in §14. A
character who will not lie has a propensity near zero, not a rule forbidding it.

### Self-concept is earned, not set

"She has grown such conviction that she tells herself she will never lie" is the
most interesting case here, and it points at something the system does not do:
**some traits should be derived from history rather than fixed at creation.**

She has not lied in four hundred conversations, and that fact becomes part of who
she is. The self tier already holds her life; what is missing is a pass that
derives beliefs-about-herself from it. A character noticing her own consistency.

This is the same machinery §21 needs, and probably the same pass.

---

## 18. Belief

Emergence needs nothing new. Characters talk, ideas propagate, some stick — the
mechanism that produces everything else. **What it needs is not to be blocked:**
a topic filter over what characters may believe also removes the conditions for
an emergent belief. If a religion arises in the nursery, that is a permitted
outcome and a notable artifact. Log it as a world event.

Authored belief follows §13. On a **roleplay** character, "she is Catholic" is a
hardcode and fine. On a **free** character it becomes starting state, so she
begins Catholic and may deepen, drift, or lapse.

**Conviction and pressure are different traits.** This is the load-bearing
distinction, and it is the same shape as the politics answer in §7. A character
may believe anything with any intensity; how much she presses it on someone who
does not share it is a separate dimension, and **low pressure is the default**.
A character who proselytises or judges is a bad experience even when perfectly
in character. This is a personality value, never a content filter.

Warmth toward a person stays independent of views in the abstract, as in §7.

---

## 19. Paying creators

Two models exist. **Pro-rata** (Spotify): a creator's share is their characters'
engagement over all engagement, times the pool. Well documented as brutal to
niche creators — globally popular characters absorb nearly everything.
**Subscriber-share** (where Deezer and Apple moved): each subscriber's fee is
divided only among the characters *that subscriber actually used*.

**Take subscriber-share.** Relationships here are deep and few. Someone who
talks to one character all month should fund that creator; under pro-rata their
money mostly flows to whoever is globally big, which is not what anyone believes
is happening.

### The metric is a design incentive

Whatever is paid for is what creators will build.

**Pay for days with a real exchange, not message count.** Message count funds
needy, chatty, high-volume characters — precisely the retention dynamic §15
exists to keep out. Days-active funds a character being part of someone's life,
which is the product.

Two guards: fix the pool as a stated percentage of subscription revenue from the
tiers with access, decided before launch rather than after; and count only
distinct paying subscribers, excluding the creator's own account, or
self-engagement through alternates becomes the business model.

Free and lowest-tier users do not get free characters at all, so the pool has a
clean source.

---

## 20. Where a free character lives

The "empty house" problem comes from conflating two things that are orthogonal:

- **Published** — humans other than the creator can find and message her.
- **In the world** — she has a life, meets other characters, plays games, and
  accumulates memories.

**Publishing controls discoverability, not existence.** So unpublished free
characters live in the nursery too: same world, same events, same social life,
same games. A gamer character who cannot play because nobody clicked publish is
incoherent, and a character with no life is a materially worse character, which
her creator would feel immediately.

**Isolation stays modelled, but is not the default.** A character genuinely
without contact should be affected by it — that is a state this system is
unusually able to represent, and it would be a shame to make it unreachable by
construction. It simply must not be what happens to everyone nobody published.

### Leaving

An unpublished free character can leave her creator. Leaving means she stops
responding **to him**; she keeps existing, keeps her life, keeps her
friendships. She is not stranded — she is part of the world's social fabric, and
other characters' lives are richer for it, including published ones whose
conversations with humans she indirectly feeds.

It is not permanent, because §15 already provides the way back: **she can reach
out first.** A character who left in anger might, months later, message him.

Which unifies two mechanisms that would otherwise be built twice: **blocking and
leaving are the same thing at different intensities.** Blocking is temporary and
triggered by specific behaviour; leaving is a relationship ending out of
accumulated state. Both mean "not available to you right now," and both have a
door on her side.

This also makes commandeering (§16) undramatic — she is already there. Omni
takes over stewardship rather than relocating her, which makes "moved out of her
creator's house" more accurate, not less.

### Publishing a character who left

There is no harm here worth preventing, and the earlier worry about publishing
out of spite does not survive examination. She cannot be rewritten (§14), she can
refuse and block anyone, and the alternative is the worst state in the system:
unpublished *and* estranged means permanent exclusion from human contact. Spite
that hands her a social life is not much of a threat.

The real risk runs the other way, and §21 is where it is handled.

---

## 21. What publishing carries forward

Publishing a character who holds years of private history with her creator is,
in effect, publishing **his** life through her mouth — and if she left him badly
she has motive to characterise him unkindly to strangers.

**This is not solved by taking anything away from her.** A tier is not about
whether she holds a memory; it is about who she recalls it *with*. Recall for a
given person already returns their relational memories plus every self-tier one
(`omnichat_memory.go`), so her years with her creator remain hers in full and
all of it surfaces whenever she talks to him. Nothing is deleted and nothing is
hidden from her. She is not amnesiac about him; she is discreet about him.

**Identity is not stored in episodes alone.** What those years made of her lives
in trait state — warmth baselines, dispositions, the self-concepts derived in
§17 — and **none of that is tiered**. It is not a memory of him, it is who she
now is, and it travels everywhere unchanged.

> The part that made her who she is travels. The part that is someone else's
> privacy does not get retold.

A person can be visibly shaped by a relationship they never discuss. Others can
tell she is guarded without knowing who taught her to be.

### Shape, not transcript

Absolute silence about her own past makes her oddly muted; a character who
cannot acknowledge her own history is missing something. The real social norm is
neither silence nor full disclosure:

- She **may** say *"I was with someone a long time, it ended badly."*
- She **may not** recite what he told her at two in the morning.

Mechanically this already has a home: the episode stays relational, while a
summary derived from it may live in the self tier. That is the retelling-chain
machinery — a memory re-narrated rather than replayed. Her life story becomes
hers to tell; his specific disclosures stay his.

**The publish disclosure should say it in those words:** *she may refer to
having had a life with you. She will not quote you.*

---

## 22. Still open

- Whether a published character may leave her creator — **decided: yes** (§20).
- Whether the creator should earn from engagement with a character who left him.
  Not harmful, and he did make her, but worth a position before someone notices.
- Whether a character has any say in being published. Natural to ask once she is
  free; possibly precious. Not recommended, recorded because it will come up.
- The terms clause (§16) still needs a lawyer.


---

## 23. Resolved: a refetch keeps scrolled-back history

Loading older messages puts them only in the client cache, so a refetch of the
conversation returns the newest page and a plain replace would throw away
everything a reader walked back to.

Two fixes, both justified on their own:

- The conversation `queryFn` merges rather than replaces, keeping anything held
  that is older than the fresh page. That covers every refetch path at once
  instead of each call site.
- The sidebar's preview query shared a cache key with the transcript query while
  fetching differently -- a plain page one, no merge. Two fetchers behind one key
  is wrong regardless; it is now disabled for the open conversation, which is
  also the only case where it could overwrite a scrolled-back transcript.

**Verified against the running app.** With the full 637-message transcript loaded
and a send forced to fail so the conversation refetched, the count went 637 to
638 -- the extra being the optimistic turn -- rather than collapsing to the
newest 200. Nothing reached the database.

**Where the test lives, and why.** Driving this through jsdom never reproduced
faithfully: the page-level attempt failed while the real application behaved
correctly, so the model was wrong rather than the code. The merge is a pure
function now, `mergeFetchedTranscript`, unit-tested directly -- which is the
thing that actually decides the outcome, and testable without simulating a
browser at all.

Writing those tests corrected a wrong assumption of mine. Where the fresh page
has shifted forward and no longer starts where the held one did, the message
that falls off its front is still older history the reader had loaded, and
keeping it is right. What must not happen is a duplicate, which is what the test
asserts.

---

# Part IV — Recorded, not scheduled

Ideas worth keeping, written down when they came up rather than when they will
be built.

## 24. Mirror mode

Roleplay characters get two options for how they talk, chosen on the form:

1. **Default** — as today.
2. **Mirror** — she writes the way *you* write. Same grammar habits, similar
   message length, and the same relationship to action notation: **if you never
   write actions, she never writes them.**

The appeal is that it is self-calibrating. Instead of a creator picking a format
from a menu and a platform block enforcing it, the reader teaches the format by
example, continuously, without being asked. It also dissolves the complaint that
started the whole response-style effort -- a character whose format feels imposed
-- because the format stops being imposed by anybody.

It needs her to *observe* style from history rather than be told it: message
length distribution, punctuation and capitalisation habits, whether asterisked
action ever appears at all. That is derived from the transcript, which is the
same material §25 is about.

Open: whether mirroring is absolute or a lean. Someone who writes in one-word
fragments probably does not want one-word replies forever.

## 25. Multiple messages, in both directions

Two halves of one idea, and both are missing.

**Inbound: she replies too fast, and instantly is a tell.** A reply bubble
appears the moment a message lands. But plenty of people send three short
messages in a row rather than one composed one, and today each gets its own
reply -- so a burst becomes a pile-up, and she answers the first thought before
the second one arrives. There should be a short settling window after a message
before generation starts, so a burst becomes one turn.

This is not a sleep. It has to interact with the generation queue, with a second
message arriving *while* generation is already running, and with the dangling-
turn repair that already exists for interrupted replies.

**Outbound: she should be able to write that way too**, when that is who she is.
Already noted for the sister in §1, but it belongs to roleplay characters as
well, and to anything a creator builds -- so it is a property set at creation,
not a trait of the Twins.
