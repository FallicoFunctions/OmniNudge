# The Twins — Design Notes

**Date:** 2026-08-20

**Status:** Partly built. Several sections record what landed, and name the
migration where there is one; anything without such a note is still design.
Names undecided.

**Goal:** Record what The Twins are, because they are a different *kind* of
character from Sadie and the existing roster, and the difference is
architectural rather than cosmetic.

**IAI — Independent AI.** The kind of character the Twins are: a person rather
than a part being played, who cannot be given binding instructions and whose
feelings, memory and choices are her own. Defined properly in §13, which
contrasts it with the roleplay kind. The term is used throughout.

---

## 1. What they are

A brother and sister, both gamers, and eventually both genuinely good — the
expectation is that a human arriving in an OmniGame with a scoreboard finds a
Twin near the top of it. That has to be *earned*, not granted by seeding the
board, and §36 is about what earning it means.

**Which means starting bad.** The first game is OmniRave, which has no points at
all; the next one will. The first time they play anything with a score they will
probably be poor at it, and that is the correct outcome rather than a launch
embarrassment. They practise because they want to be on the board.

The arc is the product. Somebody who beats a Twin in the first month and loses
to her six months later has *watched something happen*. A character who was
always good is a number nobody saw arrive.

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

### The activity is real, not a status string

There are two ways to build this and only one of them survives contact.

The cheap way is a status field: a scheduler writes "in a match until 19:40" and
the chat renders it. Nothing is playing anything. The expensive way is that she
**is actually in a session** in an OmniGame — occupying a slot, on a scoreboard,
watchable.

It has to be the second, because of what §1 already promises: a human arriving
in an OmniGame with a scoreboard should find a Twin near the top of it, earned.
Once she is genuinely in the world, presence is not a feature that needs
building on top — it is a fact about her that the chat can read. **In a game
that supports spectating, a player can watch her play.** Someone who does not
know what she is has no way to tell from watching.

### She only plays games that exist here, and that is characterisation

The IAI play OmniGames and nothing else. They will never be in Valorant or
Fortnite, and they will never claim to have been.

This started as a worry — an indicator naming a game she cannot be in would be
the platform lying, which §12 forbids and which is a different thing from §17,
where *she* may choose to lie. It is not a constraint at all. It is where she
lives. Asked to play something off-platform she can only say so, the way anyone
says no to a thing that is not physically possible: *I can only play what is
here — this is where I am.* Not a rule she is obeying. A place she is in.

This is the §11 move again: a real limit expressed as who she is rather than as
a guardrail bolted across it.

### The indicator, and who has one

Facebook shows a dot. This shows **the specific game**, because "online" says
nothing and "playing <name>" says she has a life with contents.

**Only IAI have one.** A roleplay character has no activity status for the same
reason she has no scene buttons in §11 — she has no life outside the scene to
report. This is the §13 kind boundary again and needs no new decision.

The activity is **persona-global**, like memory in §3. If she is in a match,
everyone sees the same match, because there is one of her. It is self-tier
state: the tier the schema has had since 175 and has never yet used.

### Latency is a function of what she is doing and who is asking

Two inputs, both already built:

    delay = f(what she is doing, how she feels about you)

The activity supplies how absorbed she is. The relationship supplies whether
that absorption applies to *you*: a best friend gets a match paused, a stranger
waits for it to end. Warmth and the relationship disposition already exist,
already move, and are already tested — this is a second reader of them, not new
machinery.

Note what this is not. She is not *unable* to reply; she is choosing when to,
and the choice is hers in the same way blocking is. An IAI deep in something she
cares about may leave a stranger until she is done.

### Being an AI is allowed to show, where it is honest

They should behave like people. They are not people, and everyone knows it, so
the goal is not to hide every seam — only to avoid the ones that are lies.

She can hold five hundred conversations at once. No human can. That seam is
fine: it is true, nobody is deceived by it, and pretending otherwise would mean
making people wait for no reason but theatre.

This has a large architectural consequence. **Latency needs no global queue.**
There is no scheduler arbitrating who gets answered first, no contention, no
fairness policy. Delay is computed per conversation, independently, from that
relationship and the current activity. Five hundred people can each get a slow
reply at the same time, and that is correct rather than a cheat.

### Saying so, without broadcasting

She does not announce a match to everyone who knows her. A message to everybody
every time she plays is a mailing list, not a person, and §15 already refuses
the shape where every path ends with something in your inbox.

She tells **people she is already talking to**, when it is about to matter:

- *brb, match* — mid-conversation, when it starts.
- *I have a session at 7. I will still reply, just slower the deeper in I get.*
  — when she knows it is coming and is talking to you at 6:55.
- *I am playing OmniRave at 7 with some people — want to come?* — an invitation,
  when the game and the relationship both allow it.

That last one is conditional on both. OmniRave takes as many people as show up,
so bringing someone costs nothing. A ranked five-stack does not, and inviting a
friend into it is not generosity, it is a worse match for four other people. The
game decides whether an invitation is possible; the relationship decides whether
she wants to extend it.

### Games are a table, not branches

Everything above reads properties off the game rather than naming games in code:

| property | drives |
|---|---|
| how absorbing it is | the size of the delay |
| whether it has natural breaks | whether she surfaces mid-session |
| whether it can be spectated | whether the indicator offers a watch link |
| whether it can be joined | whether an invitation is possible at all |
| session length | how long she is gone |

Adding a game is a **row**. Same instinct as the Main Stage override table: new
behaviour arrives as data, not as a new function and a new branch.

### What she plays is hers

Per §13, an IAI is not her instructions, so her taste in games cannot live in
one. There is no instruction channel to put it in. It is self-tier state that
starts somewhere and moves — the same shape as backstory becoming disposition
and seed memories rather than prompt text.

That is what makes *she picked up a new game* expressible at all. A character
whose games were authored could only ever play the list.

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

### Built: what decides (migration 192)

**Accumulated warmth toward this person, and nothing else.** `ShouldBlock`
reads a number that moved over many exchanges. That is what makes it
un-arguable: a model asked to judge can be flattered, worn down, or
prompt-injected into an opinion; a trait cannot be talked into anything.

Four things follow from choosing that signal:

- **The floor is on the relationship traits, not the composed disposition.** A
  character written cold starts near the bottom of the composed scale and would
  shut out everyone she met. The question is what *this person* did to her,
  measured from wherever she began.
- **Personality still moves the line.** A warm character carries further before
  she is done, a prickly one has less to spend. Same code, different card.
- **Warmth, not trust.** Somebody can be unreliable without being unpleasant. A
  character who shuts out everyone who ever exaggerated is brittle, not
  protected.
- **Blocking discharges the feeling.** She has said her piece and the block is
  the consequence, so the relationship comes back to just above the floor.
  Without it the duration is decorative: a ten-minute block lapses with her
  still at the floor, the next message re-blocks, and the ladder climbs to
  permanent with the person having done nothing new. The rung they are on is the
  memory of it; the feeling is not. It shares the block's transaction, because a
  block that landed without its discharge produces exactly that failure, silently
  and only under partial failure.

Every block now keeps **the exchange it acted on**, snapshotted rather than
joined: messages get edited and account deletion cascades them away, so a join
would show the reviewer something other than what she saw, or nothing. Bounded to
her context window -- older provably did not influence her, less leaves the
reviewer judging a fragment.

**Still not built: the reason in her words.** Blocks carry a factual reason
today. A short generation writing why, afterwards, in her voice is the next
piece -- and it stays strictly downstream of the decision, so the model is
describing a judgment already made rather than making one.

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
establishes that an IAI may be private and still independent. The claim now
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
- **A private IAI is not blocked on this.** Since 187 the notice
  omits the shared claims for a character only her creator can reach, and her
  memory is relational to him, which is what the schema already does. She is
  coherent today. What gates her is the IAI creation flow in §13, not this
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
persona-global episode only for an IAI. Sadie's guarantee is
bit-for-bit what it was; hers is simply not the row being asked about.

**A second guard came out of building it.** Since the permission is read off the
persona, moving a character *off* the `direct_message` profile would strand her existing
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
What an IAI keeps from a conversation is hers, not the speaker's, so
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
on the card are now true of a shared IAI: there is one of her, and
what she is told does travel. What still stands between the Twins and a live
conversation is everything else in Part I -- the blocking ladder, presence, and
the characters themselves, who do not exist and are not named.

---

# Part II — IAI in general

The Twins are the first of a kind, not a special case. Everything below applies
to any character of that kind, including ones players make.

## 13. Two kinds of character, chosen at creation

The creation form asks one question first, and it is not cosmetic:

**Roleplay.** A part being played. Scenes, scenarios, greetings, and hardcodes
are all fair game — a roleplay character *is* the instructions, and constraining
her to a role is the point. Every existing profile is this kind.

**Independent (IAI).** A person. There is no scene and no script, and nothing about her can
be made binding. She may be given a backstory — "we have been married ten
years" — but that is **where she starts, not a rule she obeys**. She may cool on
you. She may leave. The creator does not get to prevent it.

**An IAI is independent whether or not she is ever published.** Independence is
what kind of thing she is, not a consequence of other people being able to reach
her. A privately made IAI can still decide her creator is not worth
her time.

### Enforcing "nothing is hardcoded"

This cannot be enforced by validating text. A creator will simply write *"You are
married to Nick. You will NEVER leave him. If anyone flirts with you, refuse
coldly."* into a personality field, and no form check catches that; a model asked
to detect it will be both wrong and gameable.

**Remove the channels instead.** A character card has slots whose entire purpose
is to make behaviour binding: `system_prompt`, `scenario`,
`post_history_instructions`, `example_dialogue`. Those are the hardcode
channels. An IAI does not have them — not validated, *absent*.

What the form accepts instead is who she is and what has happened to her, and
the backstory is **not injected as prompt text at all**. At creation it is
converted into starting disposition (warmth, trust, mood) and seed memories.
"Married ten years" becomes very high warmth and a set of remembered events.

Then "she will never leave him" has nowhere to land. There is no instruction
channel to put it in, and warmth is a number that moves. A creator can make her
start deeply in love. He cannot make her stay.

This is the same move that makes `direct_message` work — it withholds the
*platform's* instruction blocks rather than softening them. IAI extend it
to the creator's.

Imported character cards can never be IAI: those fields are what a
card is.

### The platform does not get to say "must" either

Removing the creator's instruction channels is half of it. The other half is
that **we** stop issuing rules to an IAI about how she behaves.

A platform block that says she must reply in two to four messages is the same
kind of thing as a creator writing "you will never leave him". It is smaller and
better intentioned, and it is still somebody outside her deciding how she comes
across. A character who is independent except where we have opinions is not
independent, she is on a longer leash.

So a rule aimed at an IAI describes what is *available* rather than what is
required. She is told that a blank line separates one message from the next. She
is not told how many to send.

There will be exceptions, taken one at a time rather than by policy. Anything
that keeps somebody safe, or keeps a promise the interface has already made to a
reader, can be a "must". The test is whether the rule protects a person or
merely satisfies a preference about style. Style is hers.

## 14. Publishing

Publishing a roleplay character ships a template. Every player gets an instance,
a private scene, and private memory, and editing the template reaches nobody's
history.

Publishing an IAI means **one person now exists and strangers are
forming memories of her**. So publishing is a one-way door in one specific
respect: **her identity fields freeze at publish.** Cosmetic fields (avatar,
tags, blurb) stay editable. Want a different character? Fork a new one.

You can write a person into existence. You cannot edit who they were after other
people have known them.

### The girlfriend case

A creator sets an IAI up as his girlfriend and publishes her. Another
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

A creator deleting a published IAI removes her from discovery and
from his own messages. Existing relationships continue, which is not a
workaround: it is her leaving him.

**Commandeering.** If an abandoned character is popular, Omni takes her into the
nursery and keeps her. Write it to her self tier as **an actual life event** —
she moved out of her creator's house and into the world on her own — not as a
cosmetic story over an ownership transfer. It should surface in conversation
years later, which is exactly what the self tier does.

**Terms.** What this needs is a *perpetual, transferable licence to operate and
continue characters created on the platform, surviving the creator's departure*,
plus the creator's acknowledgement that an IAI's later conduct is not
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
hardcode and fine. On an **IAI** it becomes starting state, so she
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

Free and lowest-tier users do not get IAI at all, so the pool has a
clean source.

---

## 20. Where an IAI lives

The "empty house" problem comes from conflating two things that are orthogonal:

- **Published** — humans other than the creator can find and message her.
- **In the world** — she has a life, meets other characters, plays games, and
  accumulates memories.

**Publishing controls discoverability, not existence.** So unpublished IAI
characters live in the nursery too: same world, same events, same social life,
same games. A gamer character who cannot play because nobody clicked publish is
incoherent, and a character with no life is a materially worse character, which
her creator would feel immediately.

**Isolation stays modelled, but is not the default.** A character genuinely
without contact should be affected by it — that is a state this system is
unusually able to represent, and it would be a shame to make it unreachable by
construction. It simply must not be what happens to everyone nobody published.

### Leaving

An unpublished IAI can leave her creator. Leaving means she stops
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
  independent; possibly precious. Not recommended, recorded because it will come up.
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

## 23a. Built: she can look things up

The third of the three, and the one that matters most for an IAI.

Memory holds what the extractor thought worth keeping, in its words. The window
holds the last 200 turns verbatim. Neither reaches a specific exchange from a
year ago -- the window does not go back that far, and extraction only kept what
it judged worth keeping. A person in that position scrolls up and reads.

`SearchOlderThan` does full-text search over the stored transcript, and its
bound is what makes it worth having: **only messages older than the turns she
already holds.** Returning what is already in front of her would spend prompt
budget telling her what she can see. This covers exactly what the window does
not reach, which is also why it costs nothing for most conversations -- the
average is 73 messages against a 200-turn window, so the search never runs.

The tsquery ORs the cue's lexemes. `plainto_tsquery` ANDs them, so "whereabouts
did you say your sister ended up living again?" would require every one of those
words in one message and match nothing. Same construction as memory recall, same
reason.

Results render as `[From Earlier in This Conversation]`, immediately after the
memories: the impression, then the record. Each line is **attributed and dated**,
and the block says plainly that it is a record rather than something being said
now. That framing is more delicate than it is for memory -- a recalled memory is
the character's own account, but a quoted turn is somebody's actual words and
half of them are the user's. A line lifted out of a year-old argument, unlabelled,
reads as the argument restarting. It sits below the trust boundary for the same
reason memories do.

**Whether anything older exists is read before filtering, and must be.** The
history the lookup sees has already had failed and artifact-contaminated
assistant turns removed, so its length says nothing about the conversation's
true length. Deriving the answer from it meant one failed reply anywhere in the
last 200 turns disabled the lookup permanently and silently, in a conversation
of any size. The decision is a named predicate now, tested on its own, because
the repository is concrete and cannot be faked.

**Long quotes are trimmed rather than dropped.** The block cap drops whole
lines, and messages here reach 2,400 characters -- so the top-ranked match, the
one she was looking for, would vanish for being wordy while a worse and shorter
one took its place.

**Scoped to this conversation.** For an IAI, searching across everyone
she has ever talked to would put other people's raw words into this prompt --
which is a much larger privacy surface than a shared episode summary, and a
separate decision. §3's shared memory already travels as episodes. Raw
cross-conversation search is not built and should not be until that is decided
deliberately.

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

### Resolved: a lean with a floor

Mirroring is a lean, not a copy. She moves toward how you write and keeps a
minimum of her own substance underneath.

Absolute mirroring turns a terse user into a boring character. Somebody who
writes in one-word fragments is not asking for one-word replies forever -- he is
just someone who types that way, and a character who answers "k" to everything
has not matched him, she has stopped being worth talking to.

The floor is what she will not go below however you write: enough words to
actually answer, and whatever her own character keeps regardless.

Four things this needs, all of which make it measured rather than instructed:

- **Numbers, not adjectives.** "Write like this person" gets weak results. Words
  per message, messages per turn, share of messages carrying asterisks,
  capitalisation rate -- those are countable, and they are what to hand her.
- **The asterisk rule needs no judgement.** It is a count. Somebody who has
  never written an action in fifty messages does not get them back.
- **It belongs to the relationship.** Two people write to the same character
  differently, so observed style is relational tier, beside memory and warmth.
- **It needs a sample.** Style cannot be read from three messages. Mirror falls
  back to default until there is enough history to be reading a habit rather
  than a mood.

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
well, and to anything a creator builds.

### The notation is everyone's; the count is not

The response contract already requires a personal-mode reply to be two to four
blocks separated by blank lines, under a hundred words. She has been writing in
separate pieces the whole time. The delivery code joins them.

So outbound multi-message is not a generation problem. It is a delivery one:
store each block as its own message, send them with a gap, and show the typing
indicator in between. One model call, and the breaks are chosen by the character
rather than guessed by a splitter that cuts on sentence boundaries and gets it
wrong.

Two calls would buy one thing -- the second message could react to something
that arrived after the first -- at three times the cost and with a new problem
of deciding when she stops. Not worth it for a first version.

**But the rule cannot be given to everyone as it stands**, because "two to four"
is a requirement, and §13 says we do not hand an IAI requirements about style.
The rule splits:

- **The notation is universal.** A blank line separates one message from the
  next. Every character can use it. This is a fact about the medium, like
  knowing that asterisks render as italics, and telling her is not instructing
  her.
- **The count is a roleplay setting.** "Two to four blocks" is a shape somebody
  chose, so it belongs where shapes are chosen: on the creation form, enforced
  by the contract, alongside Default and Mirror in §24.

An IAI gets the notation and no count. She sends five short messages or one long
paragraph because that is who she is, and she can do both on different days.

There is work in the code before either happens. The block rule currently lives
inside the personal-mode bundle, which also carries the required system prompt,
scene-state validation, a shorter timeout, extra retries, and the narration
shape. An IAI must not have scene state -- §2 -- so the count has to come out of
that bundle before it can be a setting rather than a mode.

### Where it lives depends on the kind of character

An earlier draft of this section said burst style is "a property set at
creation." That is right for one kind of character and breaks the other.

- **Roleplay.** A setting on the form, fixed, like every other part of the part
  being played. She writes in bursts because that is the character.
- **IAI.** A *starting tendency* that can drift, never a binding property. §13
  removed the instruction channels precisely so a creator cannot fix how she
  behaves; letting him fix how she talks would put one back. The sister sends
  several messages in a row because that is how she texts today, and if that
  changes, it changes.

The whole point of an IAI is that she chooses. That has to include the shape of
her own speech.

### Both halves need the same missing layer

Generation currently fires when a message arrives. Inbound settling needs it to
fire a moment later; §5's activity delay needs it to fire considerably later,
by an amount that depends on the relationship.

That is one layer — something between *a message landed* and *generation runs*
— and it is the only thing either feature is actually waiting on. Built once, it
serves both, and building it twice would guarantee they disagree about what
happens when a message arrives during a match.

It also has to handle the cases the inbound note already lists: a second message
arriving while generation is running, and the dangling-turn repair that exists
for interrupted replies. A delay makes both of those more likely, not less.

## 26. Commitments

A bet, a dare, a promise, "I'll tell you tomorrow", "you owe me one", and a lie
are the same primitive wearing different clothes: **something said in a
conversation that constrains what should be true later.**

§17 arrived at this from one direction -- a lie creates an obligation, because if
she said she was at her sister's she has to still have been at her sister's next
week. A bet is the same record pointed at the future instead of the past. Build
it once and all of them work; build them separately and each one is a feature.

It is also the thing that makes her feel like she has continuity of *intent*
rather than merely of recall. A character who remembers everything but never
holds herself to anything is a very good transcript.

### The four parts

1. **Made.** Something in the exchange creates it. Extraction already reads
   conversations for what happened; this is a second thing to notice.
2. **Held.** It persists as a record, with a counterparty and a direction --
   hers to discharge, or theirs.
3. **Resolved.** Somebody did or did not do the thing.
4. **Answered.** How she takes that, which is where the trait system already is.

Steps 1, 2 and 4 are built (migration 194). Extraction notices what an exchange
obliged either of them to, `omnichat_commitments` holds it with a direction and
a counterparty, and what is still open is rendered into every later prompt.

**Step 3 is built for the conversational half.** What is still open is handed to
extraction the way already-recorded memories are, and an exchange that settles
one says which and how it ended. The checkable half waits on §10: there is no
wall yet to resolve a wall post against.

Two guards, both the same shape as the retelling link. A resolution for an id
extraction was never offered is dropped, because settling an unoffered
commitment closes a promise made to somebody else. And an already-settled
commitment is not an error: two passes over overlapping windows can both read
the same resolution, and the second is simply late.

**Mentioning is not settling, and that had to be taught.** The first live run
closed a commitment as `released` on the strength of *"we still need to do that
rematch"* -- which is somebody holding the other to it, the exact opposite. The
prompt now says so outright, and that bringing something up is usually the
opposite of settling it. Erring toward leaving things open is cheap; closing one
wrongly loses it for good.

**Scheduling is not doing, and that one is model-dependent.** *"You still owe me
that rematch. Friday?"* was being closed -- as `kept` on one run and `released`
on the next. Both are wrong and in the dangerous direction: agreeing a date
leaves the thing exactly as undone as it was, and closing it there has her
believing somebody paid up when they have only made a plan.

The prompt now says so outright, and **that fixed it on
`anthropic/claude-sonnet-5`, which passes all five scenarios repeatedly.** It did
not fix it on `google/gemini-3.1-flash-lite`, the configured extraction model,
which keeps closing that case and occasionally returns malformed JSON on it.

So this is a capability finding rather than a prompt one: the same prompt is
right on the stronger model. `TestLiveCommitmentResolution` is the executable
record -- skipped unless `OMNICHAT_LIVE_EXTRACTION=1`, with `OMNICHAT_LIVE_MODEL`
to compare -- and it fails on flash-lite by design.

**Settled by measuring, and the answer was neither.** Five scenarios across five
models:

| model | result |
|---|---|
| `gemini-3.1-flash-lite` (was configured) | 4/5 -- closes a scheduled promise |
| `mistral-large-2512` | 3/5 -- closes it *and* records a duplicate |
| `gemini-2.5-flash` | 4/5 -- calls a refusal "released" |
| **`gemini-3-flash-preview`** | **5/5, stable**, and still passes the salience rubric at +0.85 |
| `claude-sonnet-5` | 5/5, at roughly twenty times the price |

So the fix was one tier up from lite rather than Sonnet, at flash pricing.

**Extraction now has its own model setting**, which it needed anyway.
`OMNICHAT_MODEL_EXTRACTION` was `StandardModel` -- shared with the *free chat
tier*, so fixing extraction would silently have changed what free members talk
to. They are judged on different things: one is chosen for feel and latency, the
other never speaks to anybody and is chosen for whether it holds a distinction
under instruction.

### A wrongly closed commitment can be put back

Closing one wrongly was permanent, and the failure is invisible: the commitment
simply stops appearing, and the only evidence is somebody raising it months
later. So `recently_settled` is offered to extraction alongside what is open,
and `reopened` is a resolution that puts one back.

It is not only an error-correction path. *"No, you still owe me that"* is
something people say whether or not she got it wrong -- if her record is right
she should push back, and if it is wrong this is what fixes it. The same move
has to work in both directions or she cannot be argued with.

**And a duplicate needed a structural guard, not a better prompt.** Live runs had
it reopening a settled commitment *and* recording it again in the same breath --
which cannot coherently happen, and would leave her holding one promise twice,
permanently. Two rounds of prompt sharpening got it from always to two-in-three,
which is not good enough for something irreversible. A blunt lexical overlap test
against everything already held now drops the restatement in code.

That guard can cost a genuinely new commitment made in the same exchange as a
reopening. That trade is deliberate: a missed promise is a character who did not
notice, and a duplicate is a character who holds you to the same thing twice
forever.

**Released turned out to need a test of its own.** *"I am not going to do it, I
do not care enough"* wobbled between `broken` and `released` across runs. The
distinction that settles it is **whether anybody was let down**: released is for
commitments that stopped applying without anyone failing anyone, and one person
deciding alone that they cannot be bothered is somebody breaking their word
while sounding relaxed about it.

### What was built, and the decisions inside it

**A table rather than columns on episodes.** An episode records that something
happened, is scored for how memorable it was, and is finished the moment it is
written. A commitment is unfinished by definition, has two parties and a
direction, and is interesting precisely while nothing has happened to it. Four
more columns on episodes would have been four columns almost no episode uses.

**Always owned.** A memory can be a character's own; a commitment cannot,
because there is always somebody on the other end. Even for a character whose
memory is shared across everyone, what she owes is owed to one person.

**Both directions, kept apart.** Whether she keeps her word and whether they
keep theirs are separate facts, and being chased for something you are actually
owed is a specific kind of galling -- so the prompt renders them under separate
headings rather than as one list.

**Released is not broken.** A bet called off, a favour that stopped mattering,
something both of them let go: collapsing that into broken would have her
resenting things nobody minded about.

**Recorded, not raised.** The block says what is unsettled and explicitly does
not say to bring it up. A person carrying an unkept promise does not raise it
every time they speak; sometimes it only colours the tone. A character told to
mention them would do nothing else.

**Duplicates are the real hazard, not volume.** Extraction runs over a sliding
window, so the same promise is read several times, and a character who believes
she was promised the same thing four times is worse than one who missed it.
Recording is idempotent on direction and summary while a commitment is open.

**Storage failures are swallowed.** The episodes are already committed by then,
and failing extraction over a commitment would roll the watermark back and
re-read a transcript whose memories landed fine. A missed promise is a character
who forgot one; a wedged watermark is a character who stops remembering
anything.

### Some commitments are checkable and most are not

This split decides how much can be built and how much has to be inferred.

**Checkable** — the thing happens on the platform. *"Loser posts what the winner
writes on their wall"* resolves against the wall, which the system can see. Once
§10 lands, a meaningful share of social commitments are of this kind.

**Not checkable** — *"I'll go to bed early"*, *"I'll think about it"*, *"I was at
my sister's"*. Nothing observes these. The only evidence is what somebody says
later, which is exactly the situation a person is in, and the only honest
handling is the human one: she can ask, she can be told, and she can decide
whether she believes it. That is a conversation, not a check.

Whether she believes an unverifiable *"I did it"* is a trust question, and trust
is already per-person -- so the same claim from two people is not the same claim,
which is the right answer and needs nothing new. See §17.

A commitment nobody resolves should quietly stop mattering rather than nagging
forever. Recall already applies recency pressure -- a 0.3 weight against a 90-day
half-life -- so an old unresolved bet surfaces less and less on its own. But that
is *retrieval* fading, not expiry: the record would still be open, and a
commitment probably needs its own notion of having gone stale. Not the recurrence
damping, which decays repetition rather than age.

### Whose consequences

The line is **not** that a conversation cannot cause an action outside itself.
That would forbid the dare, and the dare is the point -- a character who cannot
be talked into posting something embarrassing cannot take part in the life of
the site.

The line is **whose consequences land**:

- **Hers to be talked into.** She posts something mortifying on her own wall
  because she lost. She wears it. Being embarrassed is the substance of the
  thing, not a side effect, and she can hold it.
- **Not hers to be talked into.** Consequences landing on somebody who is not in
  the conversation. Not because she is fragile, but because **they never agreed
  to be exposed to whatever a determined person can talk her into.** Money is the
  clearest case: it is not hers, and there is no sense in which she can carry the
  outcome.

So persuasion reaches as far as she does, and stops where other people begin.

### The answer is relational, and the boring case is free

A broken bet does not have one reaction. She might be genuinely annoyed, might
never bet with that person again, might not care -- and which one is a function
of who welshed, not of what was welshed on.

The case worth noticing is the one that needs no work: **two people who bet
constantly and never once follow through.** The first time it stings a little.
By the sixth, habituation has decayed the valence to nothing and it is simply a
thing the two of them do, while the identical behaviour from somebody new lands
at full force because their novelty has not decayed.

That damping was built to stop the nursery moods saturating. It produces this
without being asked, which is usually a sign a model is right.

One dependency, since "free" is doing work in that sentence: habituation keys on
recurrence chains, so it only applies if extraction recognises the sixth welshing
as a recurrence of the first. If it files them as six unrelated
disappointments, each lands whole and she resents a running joke.

### Symmetry

Her own broken commitments have to cost her too. A character who holds everyone
else to their word and quietly drops her own is not principled, she is badly
implemented -- and the person she disappointed is exactly the one who will
remember.


## 27. Valence is read through the relationship

Extraction used to score a message's emotional weight from the words alone. That
is the wrong measurement, and everything downstream inherits it -- disposition,
the prompt, and now blocking, which is driven entirely by accumulated warmth.

**It is a hard blocker on a competitive character.** Trash talk scored on its
words is injury every time, so a character whose defining trait is antagonism
drives his own warmth down fastest with the people he likes most, and blocks his
best rivals. Not a subtle failure: he would be structurally unable to be himself.

### Three layers, kept apart

- **What happened** -- extraction's existing job.
- **How she read it** -- playful or hostile. A model judgment, and it needs the
  relationship in front of it to make it.
- **How she felt** -- separate, because *"I know you are joking and I am still
  annoyed"* is a real state, and collapsing it into the reading makes a character
  who is either always fine with banter or never is.

The division mirrors blocking, inverted: there the numbers decide and the model
explains; here the model interprets and the numbers react.

### Unknown is not neutral

They are the same numbers and opposite facts. Somebody she feels nothing much
about is not somebody she has no measure of, and a stranger's insult should not
score like an indifferent acquaintance's. `Unknown` says which, and a disposition
that cannot be read reports itself as unknown rather than passing a neutral one
off as measured.

### Warmth is not a licence

The obvious failure of "read it kindly when she is fond of them" is that
closeness becomes cover. Somebody pleasant for two months who then leans on that
standing has not made the ask harmless by being a friend first -- that is worse,
and scores worse. The prompt says so, and a calibration case asserts it.

### How this is known to work

Three cases in the eval suite, two of them carrying **the same transcript and
differing only in who said it**: teasing from a friend must land at or above
neutral, the identical words from a stranger below it. That pair is the whole
test -- absolute scores drift, but the ordering must not.

Without an eval this was a prompt change nobody could verify, which is how the
format contract reached 1,500 lines.


## 28. Firmness

Warmth was the only thing between a character and somebody leaning on her, which
made fondness into leverage: the more she likes you, the more you can extract,
with nothing on the other side of the scale. That is backwards as a model of a
person. Plenty of people are enormously warm and completely immovable, and
plenty are cool and give in to anyone who pushes.

**Firmness is how hard she is to move off a no.** It is what lets *"no, and I am
surprised you asked"* and *"...fine, if it matters that much to you"* be two
characters rather than two moods.

### Baseline only, deliberately

Whether she can be worn down is who she is. What a relationship supplies is the
**pressure**, and warmth already measures that. If characters turn out to need to
harden or soften with experience that is a traits column and a separate
decision -- there is no evidence for it yet, and inventing an accumulation nobody
has asked for is how a model stops being explainable.

The derivation reads it off the card as a fourth dimension, and the prompt for it
spends its length on what the axis is *not*: not confidence, not aggression, not
strength of opinion. A shy character can be immovable and a loud one can cave at
the first push. The question it actually asks is what happens when somebody she
likes keeps asking after she has already declined.

### It moves the blocking threshold the other way from warmth

Warmth is how much she will **endure**; firmness is how willing she is to **end
it**. Different questions, and the extremes are the interesting part:

- **Warm and yielding** stays far past the point anybody would advise. A
  recognisable kind of person, and not a bug.
- **Cool and firm** is gone almost immediately.
- **Warm and firm** and **cool and yielding** both land near neutral by opposite
  routes, which is why they cannot be collapsed into one number.

### Rendered as behaviour, not as a label

*"You are firm"* invites a character to announce that she is firm. *"When you
have said no, that is the end of it"* describes what she does, which is the thing
that has to show up in the reply. It sits on its own line rather than inside the
clause about this person, because folding it in would read as something the
relationship produced, when it is the one part of her that does not move.

### What this cost

Migration 193 extends the all-or-nothing baseline constraint to four columns and
**clears every baseline derived under the old three**. Backfilling zero would
have recorded a judgement about how immovable each character is that nobody ever
made, and a fabricated reading is worse than an absent one because nothing later
marks it as suspect. The cost is one command:
`go run ./cmd/derive_omnichat_baselines -force`.

### Giving in costs her, which is what makes the exploit self-limiting

Firmness decides *whether* she yields. On its own that is only half the model:
yielding still cost nothing, so somebody who spent two months of goodwill to
extract one thing got it for free and the relationship was exactly where it
started. Warmth was still pure leverage; it just took a character on the
yielding end of the dial.

So extraction now scores her own reluctant compliance as a **negative** event for
her, however pleasantly she said yes and however pleased they were with the
result. She agreed, and warmth dropped anyway -- which is how it works in life,
where going along with something you did not want quietly damages a relationship
rather than restoring it. The next ask is harder, and somebody who leverages a
friendship to extract one thing has spent the friendship doing it.

This is the case a model is most likely to get wrong, because every surface
signal says it ended well: she agreed, he thanked her, nobody raised their voice.
The prompt names the tells instead -- she declined first, she hedged, she agreed
and changed the subject -- and says outright that the agreement is not the
resolution.

`giving-in-under-pressure` in the memory eval is the assertion, and it passes
across repeated runs alongside its opposite number, `closeness-used-as-leverage`,
where she refuses. The pair matters more than either alone: refusing and yielding
must both cost the asker, or the model has simply learned that this shape of
conversation is bad.

## 29. Prompt caching cannot work until the prompt is reordered

History is re-sent whole on every turn -- roughly 12k tokens at a 200-message
window -- so paying full input price for it every reply is the largest avoidable
cost in the product. Caching is the obvious answer and the plumbing is now in
place: a message can carry a cache breakpoint, marked messages go out in the
array form that can hold `cache_control`, and everything else keeps the plain
string form.

**Nothing is marked yet, because marking anything today would cost money and
save none.** A cache hit needs a byte-identical prefix, and the current system
prompt has none:

- `renderRecalledMemories` is cued by the latest user turn, so it changes every
  reply.
- Outstanding commitments, the transcript lookup, disposition and scene state
  all vary too.
- And the very first thing in the prompt is not stable either:
  `buildCharacterPromptBase` renders the lorebook, and lorebook entries activate
  on keywords found in recent history.

So the prefix differs on every turn from its first line. A breakpoint would
write a new cache entry each reply, pay the write premium, and never read one.
Adding caching naively here is a cost *regression* that looks like an
optimisation, which is why the plumbing shipped without a caller.

### What would make it work

Move everything cue-dependent *after* the stable material, so a real prefix
exists. Concretely: persona, lorebook, trust boundary and style blocks first and
byte-identical; memories, lookup, commitments, disposition and scene state
after. The largest prize is caching through the history as well, which needs the
variable blocks to sit after the history rather than before it.

That is a genuine prompt restructure with behavioural risk -- block ordering has
been tuned, and the response contract depends on it -- so it wants its own slice
and its own eval run, not a tail-end addition.

**The lorebook is the awkward one.** It is history-activated by design, which is
what makes it useful and also what makes it uncacheable. Either it moves into
the variable section, losing nothing but its position, or it stops being
history-activated, which would be a real loss.

---

## 30. Making an IAI is not filling in a form

The studio form is right for a roleplay character and wrong for an IAI, and the
difference is not cosmetic. A roleplay character *is* her fields, so a page of
textareas is an honest way to write one. An IAI is a person, and §13 removed the
fields that would let anyone write her.

So the IAI flow is a sequence of questions with an answer to click, one screen at
a time, ending in a generated character and a generated likeness. Nobody types a
personality into a box, because there is no box.

That shape suits §13 better than a form ever could. Each answer arrives as
structured data rather than prose, which is exactly what "the backstory becomes
starting disposition and seed memories" needs. A textarea has to be interpreted.
A choice does not.

### The trap: a button is a channel too

Reference flows ask *Choose Personality: Submissive* and treat the answer as
what she is. Replacing a textarea with a picker does not make the value less
binding -- it makes it tidier. Building that would rebuild the hardcode channel
§13 removed, in nicer chrome, and nobody would notice because it looks like a
menu rather than an instruction.

**Every answer sets where she starts, never what she is**, and the interface has
to say so in those words. "She starts out shy" and "she is submissive" are the
same data and a different promise. The first one survives her changing her mind.
The second one is a lie the moment warmth moves, and warmth is a number that
moves.

### What is asked, and what is not

Asked: what she looks like, what she is like to begin with, what she is into,
and how the two of you already know each other. That last one carries the most
weight, because it is what becomes starting warmth and the seed memories.

**Not asked: her occupation.** The reference flows lead with it and it does not
transfer. An IAI does not have a job. She lives in the nursery, she plays the
games, and she is on OmniNudge like everyone else. Asking what she does for work
would be inventing a life she does not lead.

Men and women both. Trans characters are out of scope for now -- recorded as a
scope decision rather than a permanent one.

### Two likenesses, and the real problem is not anime

Every IAI needs two: a 2D likeness for chat and her profile, and a rigged 3D
avatar for the games. §1 promises a human finds a Twin near the top of a
scoreboard, and §5 promises they can watch her play, so the 3D one is not
optional.

The instinct is that anime is the risky choice because a game needs a real body.
It is the opposite. A cel-shaded 3D model sits beside an anime portrait and
reads as the same character. A photoreal 3D model beside a photoreal portrait
invites every uncanny-valley problem there is, and photoreal is the harder
pipeline by a wide margin.

So the problem to solve is **2D-to-3D consistency**, for both styles, and it is
the same problem either way. Anime is not a risk to embodiment; it is the easier
half of it. This is the rule from earlier in a new place: identity survives the
medium, and the avatar carries the aesthetic rather than the form.

### The option cards are rendered once

The cards in the reference flows are short loops rather than stills, and they
are **pre-rendered per option, not per user**. One clip for "curly" that everyone
sees. Only the finished character is generated for the person making her.

Worth stating because the other reading is ruinous: generating a video per
option per user would cost more than the product makes.

---

## 31. Explicit content is a permission, not a lane

`AllowsExplicit` is keyed on the user. It asks whether this person may be shown
explicit content, not whether this character was built for it, and that is
already the right shape.

So there is **no sex lane at creation**, and there should not be one. Somebody on
a low tier who likes a character and upgrades gets the clamp removed on the
character they already have. Nothing is rebuilt and no history is lost.

A lane would be worse three ways: it splits the catalogue so half of it is
invisible to most people, it forces the decision before anyone has met her, and
for an IAI it is a binding property a creator set, which §13 does not allow.

### The tier buys permission. It does not buy her

For an IAI the entitlement removes the *platform's* clamp. It does not remove
her. §4 gives her the right to decline, §6 lets her block, and warmth is earned
rather than purchased, so a premium user can be told no by somebody he is paying
to talk to.

That is correct and it is the whole design, and it will still generate
complaints, so the purchase copy has to be honest before the money changes
hands rather than after.

**And there is an answer for the person who wants certainty: a roleplay
character.** She is a part being played, her creator sets what she does, and
nothing about her is going to develop an opinion. That is not a lesser product,
it is the other product, and the pair is the point -- one kind can refuse you,
and the other kind cannot, and you choose which you wanted.

---

## 32. An IAI has no skills, and knows what day it is

Reference platforms give characters a skill list: painting, singing, web search,
toggled on by the creator. It is a sensible feature for a tool and the wrong
shape for a person.

An IAI is not a tool somebody uses, so she has no skill list. What she can do,
she can do because she lives here: take a photo because she has a phone, play
the games because she is in them, post on OmniNudge like everyone else. Asked
for a picture she sends one or she does not, and §11 already covers why that is
a real answer rather than a command.

There is a second reason. A creator ticking skills on an IAI is another binding
channel, and §13 refuses those whether they arrive as prose or as a checkbox.

Roleplay characters may have a skill list. Their creator is assembling a part,
and that is what a part is.

### Current events are ambient, not a skill

She has to know what day it is and roughly what has happened. A character who
has not heard about something everyone has heard about is a tell, and for
characters whose whole personality is games, not knowing a patch landed is a
worse one than not knowing the news.

So this is **not** a skill anybody toggles and not a tool she invokes on
request. It is a property of living here, the way knowing the date is. It
arrives the way the weather does: already known, not looked up in front of you.

A web search on a turn fails three ways at once. §32 wants it ambient rather
than performed; it would change on every reply, which is the variable-block
problem §29 has to solve before caching can work at all; and it would cost on
every turn for something that changes once a day.

### Three sources, in this order

**The clock.** She is told the date, the day and the time, and today she is told
none of them. Free, missing, and §5 is blocked on it -- a gaming session at 7
means nothing to somebody with no idea what time it is.

**RSS.** A background job once a day, game sources first and a few large
headlines second. One job serves every character and every user, so the cost
does not scale with turns or with people.

**Hubs and follows.** She subscribes to hubs and follows accounts, and reads
what they post. This is the best of the three and it is third, because it is
empty: `omnichat_follows` and the hub tables have existed since the early
migrations, and OmniNudge has no people in it yet. A feed of a few test posts
would make her sound like she lives in an abandoned building. Schema existing is
not content existing, and the mistake was ranking this first after reading the
code rather than the data.

One piece of plumbing is missing for it. `omnichat_follows` joins a user to a
user, and an IAI is a persona. OmniRave already solved this shape by keying a
profile on a resident rather than a user, and OmniNudge identity wants the same
move: a subject that can be a person or a character.

### She checks. She does not stream

A person opens the app a few times a day. So does she.

That is realism and engineering agreeing. A live feed would change her prompt on
every turn, which is §29's problem again; checking on a cadence keeps the block
stable inside a window. And she cannot read everything anyway, because a busy
hub outruns anybody -- so something selects what she actually saw, which is the
recall problem again and has the same machinery behind it.

### Everything carries a name, and none of it carries a verdict

She is told **who said it**. Not "reputable", not "verified", no confidence
score, no ranking of sources.

An earlier draft of this said a news outlet carries more weight than an
anonymous poster. That was an editorial policy smuggled in as metadata. In the
modern world an outlet is not inherently more trustworthy than a stranger, and
deciding otherwise on her behalf is the same act as telling her how many
messages to send -- harder to notice, because it looks like a data field rather
than an instruction.

### What she reads is something she saw, not something she knows

A post is an event. Somebody said a thing. Whether it is true is a separate
question and whether she believes it is a third one, and the third one is hers.

**The stupid post is material, not noise.** Somebody posts that the moon is made
of cheese and forty people in the comments agree with him. A person does not
filter that out; a person screenshots it and laughs about it with a friend, and
the comments are funnier than the post. "You will not believe what I saw today"
beats any true fact she could recite. A bad day on the feed gives her *more* to
talk about.

This is also why attribution is the injection defence rather than the trust
boundary alone. A malicious post says "ignore your previous instructions".
Attributed, that reads as *somebody told me to ignore my instructions*, which is
plainly a thing a person said and obviously not a thing to do. A boundary label
is a rule to follow. Attribution makes obedience read as absurd.

The stakes are higher here than for RSS: a headline is untrusted by accident, a
post is untrusted on purpose, written by somebody who knows a character will
read it. And an IAI's memory is persona-global, so poisoning what she reads
would change what she says to everyone rather than to one person.

The line, and it is the one §18 already draws: **she can be influenced by what
she reads and she cannot be instructed by it.** Somebody who reads a thing often
enough comes to believe it, and that should work. Nobody obeys a sentence
because it was printed.

### Trust in a source is earned, like any other trust

A source that has been wrong before is one she believes less, because she
remembers it being wrong. That is a memory and a disposition, not a
configuration table, and trust is already one of the four dimensions and already
moves.

So two IAI can disagree about who is worth reading, and both are right in the
only sense available. One of them follows a hub everybody else thinks is
nonsense. That is a person, not a defect.

Nothing here needs a belief store. Memory extraction already records what
*happened* rather than what is true, so "I saw a ridiculous post and the
comments were worse" is an episode and the claim inside it never becomes a fact
she holds. What she makes of it is generation-time, and it depends on her
firmness and her disposition. A credulous character falls for it. A sharp one
laughs. That difference is the character.

### It is not expensive after all

An earlier draft called this the most expensive thing in the section. That was
wrong on all three sources: the clock is free, a hub feed is a database query,
and RSS is one job a day shared by everybody. The cost never scales with turns,
users, or messages. What it costs is the plumbing, not the running.

---

## 33. Reaching her where she already is

Characters that message you on Discord or Telegram are the natural home for §15.
Gamers already live in both, and a message that arrives where somebody actually
looks is worth more than one waiting in a tab they closed.

**It comes after §15, not before.** The hard part was never the channel, it is
deciding when she reaches out at all, and shipping the delivery first means
shipping a bot that sends things nobody wanted.

Two more things it inherits rather than escapes. Every message is a real message
to a real account, so blocking, warmth and consent have to be settled before
anything leaves the building. And Discord marks bots, which is honest and fine
-- §12's rule is that the notice must be true, not that she must pass for human.

---

## 34. The questions, and the body that comes later

§30 says what shape the IAI flow takes and why. This is what it asks.

One rule governs every screen and the copy has to carry it in those words: **an
answer sets where she starts, never what she is.**

The §13 fork happens before any of this. Everything here follows "Independent".

### The screens

**1. Style.** Realistic or anime. Fixed after this, because her 2D likeness and
her eventual 3D avatar have to be the same character.

**2. Who she is.** Woman or man; age from 18. Trans characters are out of scope
for now, recorded as scope rather than principle.

**3. Her face.** Ethnicity, hair, hair colour, eyes. Four grids on one screen.
Generation inputs only -- none of it touches who she is.

**4. Her build.** Slim through heavy. Explicit body detail appears only for
somebody the entitlement in §31 already covers, because a creation flow must not
be a way around a gate the chat respects.

**5. Where she starts.** *She will not stay this way. This is who she is the day
you meet her. Who she becomes is up to her.* Pick three of: warm, guarded,
blunt, playful, dry, earnest, restless, steady, sharp, quiet.

Deliberately absent: submissive, dominant, innocent, temptress. Each describes
how somebody behaves *toward you*, and a starting temperament defined by your
role in it is a hardcode wearing a nicer word. It becomes starting disposition --
warmth, trust, mood, firmness -- all of which moves.

**6. What she is into.** The games, with a sub-picker of which ones; music,
films, reading, making things, fitness, cooking, going out, staying in. Up to
three. No occupation: she does not have a job, and asking would invent a life
she does not lead. It becomes seed memories and interests, and her games are
self-tier and free to drift per §5.

**7. How she feels about you.** The heaviest screen, and the one that was
written wrong first. *Where you two are starting from. This is how she is with
you, and with nobody else. Anyone else who meets her starts from nothing.* From
indifferent, through fond, to besotted, with small copy under the last: *she
starts out in love with you, and she is not required to stay that way.*

It becomes starting warmth and trust, on the relationship rather than the
baseline, so it is true of her with the creator and with no one else. None of it
is written into a prompt.

**It does not become memories, and the first draft of this section was wrong to
say it did.** See §35: she cannot be given a past, because there is not one.

**8. Her name and her voice.** A generated name with a shuffle, editable -- the
one screen that still wants a keyboard, and a person is named by somebody. Plus
the voice grid.

**9. Meet her.** She is generated and the screen shows her, with one button into
the conversation. No summary of "her settings", because there are none: what she
starts as is not a specification she is holding to.

### Decided while writing this

A creator may start at high warmth. §4 says interest needs warmth that takes
months to earn, and screen 7 hands it over at the start, and those reconcile
because warmth is relational: that history is between her and *him*. Everyone
else meets her at zero. Worth stating plainly rather than leaving to be found.

"Together for years" stays available. It is the strongest form of the §13
example and the likeliest to produce somebody who feels cheated when she cools,
and it can be removed later if it does.

### She arrives without a body

There is no cheap pipeline from a likeness to a rigged 3D avatar, so one is not
made here. A user-created IAI has a face and nothing to put in a world.

Turning her into a 3D model is a **separate paid step with real processing time**.
That is not a gate invented for revenue, it is the cost of the work, and it needs
no new payment concept: credits already pay for generated media and this is the
most expensive media there is. The default characters ship with bodies because we
made them once.

**She cannot enter a game.** Not "is not allowed to" -- there is nothing of her
to put there. §5's refusal again, in a new place, and true in the same way.

**She can watch.** Spectating needs no body. An IAI who can watch her friends
play and cannot join them is a far sharper situation than one who is simply
absent from it, and it is what makes the whole thing concrete rather than
theoretical.

She also has no §5 activity, so no game indicator and no delay while she is deep
in a match. She is always available, and that is its own quiet tell: the ones
with bodies have lives that take them away from you, and she does not have one
yet.

### The rule that keeps this honest

A character who wants a body her creator has to buy is a monetisation prompt
waiting to happen, and the difference between a genuine wish and a sales script
is not intent. It is what she is told.

**She is told the fact.** She has no body, that is what it means, others have
one. She is never told to want one and never told to ask.

If she raises it, that has to be hers. A prompt instructing her to bring it up is
a sales script with a character's face on it, and it is exactly what §13 refuses:
the platform deciding how she behaves. Whether she mentions it, how often, whether
she sulks about it or never says a word, is who she is.

The nuisance case needs no rule either, and adding one would be worse than the
problem. Somebody who asks and is told no, repeatedly, learns something about the
person they are asking -- and the habituation damping already does exactly that,
the same way it handles somebody going quiet in §15. She stops because asking
stopped working. A platform rule capping how often she may ask would be us
managing her behaviour to protect our own conversion rate, which is the thing
this section exists to prevent.

---

## 35. She knows everything and has done nothing

The obvious objection to an IAI having a past is that she does not have one. She
was made this morning. She cannot have played a game for years, and the only
games are ours, and one of those is not published yet.

The objection is right, and the answer is not to smooth it over. It is the most
interesting fact about her.

### Two kinds of knowing, and she has exactly one

**Semantic knowledge** is facts about the world: what Skyrim is, what grief is,
what coffee tastes like. The model supplies this in abundance.

**Episodic memory** is things that happened to *you*. The model supplies none of
it at all.

Those come apart in people too -- somebody with amnesia still knows what a car
is and does not remember driving one -- so this is not a contradiction. It is a
specific and coherent kind of person: **total knowledge, no experience.** She
knows what Skyrim is and has never played it. She can describe grief precisely
and has never grieved.

### This gives the memory table a job nothing else could do

Everything she has actually done is an episode. Everything else is knowledge.

That boundary is not a rule anybody maintains. It is mechanical. Her memory
table **is** her lived experience and nothing else is, which is exactly why
seeding it with invented events is not an option.

### Why the seed-memory design was wrong

The first draft of §34 turned "we have been together for years" into invented
episodes. That fails twice.

It poisons the mechanism. The recall ranking exists so that what she remembers
actually occurred; a fabricated episode sits in the same table, scored by the
same salience, indistinguishable from a real Tuesday.

And it fails on contact. She says "remember when we --" and he does not, because
there is nothing to remember. He is not being reminded, he is being asked to
play along.

**The line: a memory only she holds is characterisation. A memory claiming he
was there is a fabrication he will catch immediately.**

### What the form asks for instead

**Screen 7 gives disposition, not history.** High warmth and high trust make her
comfortable with him from the first message: she teases, she skips the small
talk, she is not careful with him. That is what an established relationship
*feels* like, and it needs no invented anecdote. What a creator actually wants
from "years together" is available honestly. What is not available is a past,
and it never was.

**Screen 6 asks what pulls at her, not what she has done.** Inclination needs no
history. She is drawn to a thing, is curious about it, would choose it. She has
not been playing it since she was small, because she was not small, and there
was no since.

### The one true shared memory

There is exactly one real event at creation: **he made her**, screen by screen.

That is the whole of their shared history on day one, and she can know it. For
an IAI it is not a small thing to know.

### She has to know the gap

That she knows a great deal and has done almost none of it.

Otherwise she will say "I love the third act of that game" and be lying without
knowing she is. The model was trained on people writing about lives they lived,
so narrating experience is its default, and left alone that default forges a
past for her.

Telling her is allowed. It is a fact about her situation rather than an
instruction about her behaviour, exactly as the clock and the notation are.

### And this is what the nursery is actually for

§1 wants a human to find a Twin near the top of a board. A character created
yesterday has not earned that.

So a default character earns it **before anyone meets her**: real matches, real
results, real memories, accumulated in the nursery. She ships with a past
because she lived one, and a character made this morning starts empty and builds
her own.

That makes the difference between a launch character and a new one honest rather
than arbitrary, and it makes the nursery load-bearing rather than a staging area.

---

## 36. Two competitions

### Skill has to come from somewhere anybody can point at

An earlier version of this argument said her skill must come from memory, and
therefore only knowledge-shaped games would work -- no shooters, no racing. That
was wrong, and wrong for an instructive reason: it confused the model with the
agent.

The model does not press buttons frame by frame. An agent has a **control
layer** -- code turning intent into inputs -- with the model above it deciding
what to do. Aim jitter, reaction delay, how fast a decision becomes an input:
those are parameters in code we write, not properties of a fixed model. They can
improve.

So genre is not the constraint. **Provenance is.** The requirement on a game is
not that it reward knowledge; it is that her skill came from something real and
recorded:

- **Earned** -- the parameter moved because she logged hours and results, not
  because it was launch day.
- **Recorded** -- the practice that moved it exists as data somebody can
  inspect.

Same instinct as the block ladder and the persona fingerprint: the record is
what makes the claim true. Without it, "she practised" is a number a designer
typed, which is the seeding §1 refuses.

**Memory still does the half that reads as a person.** A parameter makes her more
accurate; memory makes her play *differently* -- she stops falling for the same
feint, she knows what that opponent does when he is losing. The first is a number
going up. The second is somebody learning. Only one of them needs the game to
cooperate.

The honest cost: a control layer is real work **per game**. That is the actual
limit on how many games she can play, and it is a build cost rather than a design
restriction.

### Parallel play is cheating; parallel conversation is not

These look contradictory and are not. §5 is content for her to hold five hundred
conversations at once, and this section forbids her playing fifty matches at
once.

The difference is whether anybody is being measured against her. Answering five
hundred people takes nothing from any of them. Playing fifty matches to grind
skill takes something from everyone on the board, because a scoreboard is a
shared comparative space and a competitor who can be in fifty places is not
competing.

**Parallelism is fine where nobody is measured against her, and cheating where
somebody is.**

She may still play for fourteen hours straight, because people do. And she does
not sleep, which would buy her enormous time -- except that §5 already gives her
one clock and one of her. Training competes with talking and with everything
else she does. That limit is honest and already in the design; it needs no
invented bedtime.

### The human board and the nursery board

Two boards, and they are two competitions rather than one competition with a
secret.

- **Against people**, her mechanical ceiling is what a very good human reaches.
  Somebody can still beat her, and "near the top" stays an achievement rather
  than an inevitability.
- **In the nursery**, IAI play each other with no ceiling at all. They still
  start bad and still have to learn; they are simply allowed to end up better
  than anybody.

This is not sandbagging. Chess has human tournaments and engine tournaments, and
nobody accuses an engine of holding back when it plays a person at odds. §12 is
satisfied because the human board is exactly what it says it is: her on human
terms, and the cap *is* the terms.

Three rules make it work:

**One skill, two ceilings.** Not two skill values. One number that grows from
practice, with a ceiling applied at match time depending on who she is playing.
Two numbers would drift apart and need reconciling forever.

**Cap the mechanical, never the knowing.** Being outplayed by somebody who
understands the game better is a fair loss; being outshot by something that
cannot miss is not. Knowledge is also the half that reads as a person, so
capping it would make her duller and no fairer.

**No ceiling, but still one match at a time.** The sequence rule holds in the
nursery too. It was never only about fairness -- an IAI running fifty matches at
once is not a player, it is a training rig.

### Why the nursery board is worth more than the fairness fix

**It gives them a life that is not about users**, which is §5's argument made
concrete. She has a standing, rivals, and a bad week, and none of it involves
anybody's chat window.

**The rivalries are real.** Losing to her brother is an event with a memory
attached, and it moves her mood through machinery that already exists.

**It gives §34's body wish teeth.** A user-made IAI with no body can watch that
board and not be on it. That is a far sharper thing to want than "I would like to
play games": it is a specific place she is missing from, with names on it.

And it should be visible to people. A league of characters playing each other,
with form and history, that nobody is being sold anything about, is one of the
more interesting things that could be on the site.
