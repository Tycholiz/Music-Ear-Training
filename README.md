# Music Ear Training

A mobile-first PWA for musicians to practise ear training. Installable to the
home screen and fully functional offline.

This README is the high-level source of truth for the project. It is updated
periodically and is meant to be readable cold, without the commit history.

## Exercises

| Exercise                          | Route           | The question                                                |
| --------------------------------- | --------------- | ----------------------------------------------------------- |
| **Interval Identification**       | `/intervals`    | Two notes play — name the interval                          |
| **Chord Identification**          | `/chords`       | A chord plays — name the quality                            |
| **Chord Root Recognition**        | `/chord-root`   | A chord plays — find its root (self-graded)                 |
| **Melody Dictation**              | `/melody`       | A melody plays over a tonic chord — enter its scale degrees |
| **Chord Progression Recognition** | `/progressions` | A progression plays — name the chords in roman numerals     |

Every exercise has its own persisted settings, its own score, and a Customize
modal reached from the header's menu button.

## Status

**1435 tests across 52 files.** All of `npm run lint`, `npm run build`,
`npx tsc -b --noEmit`, `npm run format:check` and `npm test` pass on `main`.

**All five exercises are complete**, each with its own generation, grading,
persisted settings, Customize modal and score. Also done: the PWA (offline
precaching, install offer, update prompt) and iOS audio handling.

Done: a run of follow-ups to the statistics feature, `#110`–`#122` — sharper
progression statistics, direction-aware interval statistics, drills for
confusable chords, chord-quality confusion roll-ups, and some customization and
formatting work. All of them except `#113`, which was built and then reverted
(see Audio).

See **Ideas not yet built** at the end for what is deliberately left undone.

## Workflow

One GitHub issue per piece of work → one branch cut fresh from `main` → one PR.
The user reviews and merges each PR themselves before the next begins.

**Never stack PR branches.** Earlier in the project, stacking caused two PRs to
merge into their base branch instead of `main` when the base was squash-merged
first, silently stranding work off `main`. Every branch starts from `main`. If
two open PRs touch the same file, rebase the second _after_ the first merges —
not before, because merges here are squash merges and rebasing onto the
pre-merge branch leaves the second PR carrying duplicates.

Before every PR, all five of these must pass:

```bash
npm run lint && npx tsc -b --noEmit && npm run format:check && npm test && npm run build
```

`npx tsc -b --noEmit` is not optional and not covered by `npm test` — Vitest
transpiles without typechecking, so the suite can pass green while the build is
broken. This has caught real type errors more than once.

Commit messages and PR bodies are long-form and explain _why_, not just what.
They end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Stack

|               |                                                               |
| ------------- | ------------------------------------------------------------- |
| Build         | Vite                                                          |
| UI            | React 19 + TypeScript                                         |
| Styling       | Tailwind CSS v4 (CSS-first config, tokens in `src/index.css`) |
| Routing       | react-router                                                  |
| Tests         | Vitest + Testing Library                                      |
| Lint / format | oxlint + Prettier                                             |
| Hosting       | Vercel                                                        |

## Layout

Directories are organised **by concern, not by feature**. An exercise's code is
spread across `theory`, `audio`, `exercises`, `routes` and `customize` rather
than gathered in one folder, because the layers have genuinely different rules:
theory is pure and unit-tested directly, audio owns the Web Audio lifecycle,
exercises owns generation and grading, routes owns React state.

```
src/
  theory/       pure music theory, no React, no audio
    pitch.ts          MIDI numbers, names, pitch classes
    intervals.ts      interval table (Minor 2nd to Double Octave; no Unison)
    chords.ts         chord table, inversions, root ambiguity
    scales.ts         scale degrees, the scale ladder, tonic chords
    romanNumerals.ts  roman numerals, cadence definitions
  audio/        the playback engine
    samples.ts        the bundled piano sample set
    schedule.ts       note groups → timed notes; per-exercise timings
    piano.ts          AudioContext lifecycle, voices, master limiter
    audioSession.ts   iOS audio session claim/release
  pitch/        pitch detection and microphone input (see "Dead code")
  exercises/    question generation, grading, validation — one file per exercise
  settings/     versioned localStorage stores and their sanitisers
  about/        every word of written guidance, one file
  customize/    the settings screens inside each exercise's modal
  components/   shared UI kit
  routes/       one file per screen
  pwa/          install offer, update prompt, standalone detection
```

## Key architectural decisions

### Theory: each table answers exactly one question

`intervals.ts` measures the gap between two notes. `scales.ts` measures a note
against a fixed tonic. `romanNumerals.ts` names a chord _and_ its position at
once. These overlap numerically — all three deal in semitone counts — and were
deliberately kept apart, because a table serving two questions reads clearly for
neither. `ii` is a minor triad on the second degree; neither of the other tables
can say that.

Accidentals are written `♭` (not `b`) everywhere they are shown to a user, since
`b` reads as a note name. **Ids stay ASCII** (`bIII`) because they go into
persisted settings, where a stable key matters more than a pretty one.

**These tables are the exercises' vocabulary, not catalogues of music theory.**
`INTERVALS` has no Unison — two notes at the same pitch are not something anyone
has to identify, and it cost a special case in every direction-aware path, since
descending a gap of zero would have read as an octave. Dropping the entry is
what removes it from the settings list, the answer pad and the statistics at
once, because all three are built from the table.

Removing one taught a lesson worth keeping: **look up by the id field, never by
array position.** `intervalBySemitones` was `INTERVALS[semitones]`, which worked
only because the table happened to begin at zero. Dropping the first entry would
have shifted every lookup by one and named a Perfect 5th a Tritone with nothing
throwing. It is a `Map` keyed on `semitones` now.

Anything reading an id out of persisted settings has to check the table still
has it. `candidateAnswers` filtered only by range and direction, which was
survivable while every stored id was also in the table — a stored Unison would
otherwise have generated a question with no button on the pad to answer it.

### Settings: one store per exercise, sanitised on read _and_ write

`createStore({ key, version, defaults, sanitize })` in `src/settings/store.ts`.
Both `read()` and `write()` sanitise. The write path was added after finding
that a screen offering an out-of-range value left it live in memory until the
next reload — sanitising only on read closes the door after the horse.

Each exercise has its own store even where the shapes look similar. The chord
and chord-root exercises both use `ChordSettings` but different store keys,
because identifying a root over wide voicings is reasonable long before
identifying those chords' qualities is, so one shared selection would serve
both badly.

Stores also enforce cross-field legality that the UI enforces separately:
melody's featured degrees are filtered to the chosen scale, and progressions'
cadences are filtered to the enabled chords. Between the UI and the store there
is no way in for an illegal combination.

### Statistics: which items go wrong, not how many

`Score` says the user is 71% and cannot say which chords the 29% were.
`settings/stats.ts` keeps the missing detail, one store per exercise, keyed by
a **namespaced id the exercise chooses** — `chord:major-7th`, `interval:6`,
`numeral:V`, `cadence:authentic`, `inversion:1`. The store knows nothing about
music; which dimensions matter differs per exercise, and the namespace is what
lets a reader group them again.

Each item keeps **lifetime totals and a rolling window of recent attempts**,
because they answer different questions — "you have done this 340 times" is not
"you are getting it right lately", and one decayed counter is an honest answer
to neither. Plus `lastSeen`, recorded from the start because weighted selection
can starve an item and nothing else would notice.

**What was answered instead lives on the attempt, not in a separate tally.**
That is what lets a mistake expire with the window holding it: someone who
spent a month hearing every perfect 5th as an octave and then stopped should
not still be told about it. A lifetime confusion map cannot forget.

Three rules that cost real debugging:

- **Record through `recordInStore`, never `setStats(recordAttempts(stats, …))`.**
  A render-time snapshot loses writes when two presses land in one React batch,
  and on the melody screen — which judges in an effect — a write that changes
  `stats` re-runs the effect that wrote it. Reading the store at write time
  fixes both, and keeps `stats` out of the dependency array rather than needing
  a guard to break the cycle.
- **Statistics measure one attempt per item, but "one attempt" differs.**
  Intervals and chords take the first press, since later ones are process of
  elimination. Progressions take the first time each _position is reached_,
  which is not the same thing: a wrong press ends the attempt, so recording only
  the first run left the closing chords measured solely on progressions that had
  already gone right.
- **`recent` holds objects, not booleans.** It was `boolean[]`; the day it
  gained a shape, `recent.filter(Boolean)` started counting every attempt as
  correct — a silent perfect score for everybody, and adaptive difficulty
  quietly switched off. Only the tests caught it.

Nothing in `stats.ts` reports an accuracy. Two out of three is not 67%, and the
consumers need different policies about it: a screen should decline to print a
number, a weighting function must still return something for an item with no
data. So the store records and the callers decide what it means.

### The statistics screen: what am I actually bad at

Shown per exercise, reached from its menu. `exercises/statsView.ts` holds what
each namespace _means_, so the screen stays one component rather than five.

**One flat list of sections, in the order they are shown.** Exactly one of them
is `bucketed` into needs work / getting there / solid — usually the thing the
user names, but **melody buckets how a note arrived** — step or leap, up or
down — because a per-degree figure conflates every way a degree can turn up, and
those differ more than the degrees do. Every other section is a condition the
question was asked under, as a plain list.

This was two tiers, an `answer` that was always first and `breakdowns` after it,
until progressions needed the **first chord above the buckets**: the measure that
should lead there is not the bucketed one, and no reordering within a tier can
say so. Order is explicit now and the tier is one flag.

On screen every section is a heading with cards under it, and the buckets are
cards _within_ a section. They used to render a tier apart — the bucketed
measure got a real heading and everything else got only the small uppercase
strip a `ListCard` draws — so two things at the same level in the model looked
nested on screen.

Whether a section diagnoses — "often mistaken for …" — is declared per section,
never inferred from what happens to be in the store. It was inferred once, and
a namespace that stopped recording answers went on reporting them until every
window rolled over.

Confusions are **one per line under the row, with no cap on how many**. They
were a sentence — "often mistaken for A and B" — which reads as a clause to
parse rather than a list to scan, and the awkwardness of a third clause was the
only reason the list was ever truncated at two. Lines do not have that problem,
so `CONFUSION_THRESHOLD` governs alone and bounds the list on its own: an answer
has to be 15% of _attempts_ to appear, and they compete for the share that went
wrong at all, so an item at 40% accuracy can name four at the very most.

Which makes the count say something a cap was hiding. A row naming one mistake
is a systematic confusion; a row naming four is a user guessing. Those want
different practice.

#### Chords also roll their confusions up by quality

A per-chord confusion serves a user working on extensions — this Dominant 7th
keeps coming out as a Dominant 9th. A less experienced user's commonest mistake
is coarser than any one chord: they hear major as minor, everywhere. No row can
say that, so `qualityConfusions` groups the chord records by `quality` —
a second cut of the chord table, orthogonal to the `category` the Customize
screen offers chords under — and reports the cross-family habits above the
buckets.

**Both axes are grouped, and each fixes a different half of the problem.**
Grouping the _answer_ is what clears the threshold: a Major 7th mistaken for a
Minor 7th 8% of the time, a Minor 9th 7% and a Minor 6/9 6% names nothing at all
and is one habit at 21%. Grouping the _item_ is what gets there sooner: five
major chords with four attempts each are five rows the screen refuses to
summarise and twenty attempts' worth of evidence about major chords. The roll-up
is often the only thing on the screen with anything to say, which is exactly the
user it is for.

Its evidence floor is its own — `MIN_QUALITY_ATTEMPTS_TO_REPORT`, three times
the per-item one — because pooling changes what a thin sample looks like. Five
attempts on one chord is thin because five is few; five pooled over eight chords
is thin _and_ misleading, since one slip would print a claim about all eight. It
stays at or below `RECENT_WINDOW`, so a user with a single major chord switched
on can still fill it — a floor above that would be a section silent by
construction rather than by evidence.

Mistakes _inside_ a quality are dropped: a Major 7th heard as a Major 9th is
real and it is the per-chord list's business, and here it could only come out as
"you hear major as major". The section is not a `StatsSection` and deliberately
so — no accuracy, no bucket, and no swipe to reset, since one row stands on ten
chords' records and a swipe would clear all of them. It renders nothing when
there is nothing to say, which is what makes it safe to put first.

**The qualities are curated, like the drill pairs.** Written per chord in
`theory/chords.ts` rather than derived from the offsets, because the offsets do
not settle every case: a Dominant 7th Sus4 has no third to read, and a Dominant
7♯9's ♯9 is a minor third an octave up over a major third the chord also has. A
derivation right for thirty-three of thirty-five is worse than none, because the
two it gets wrong are invisible. The tests assert the rule each quality _would_
follow, which pins the thirty-three and names the two exceptions on their own.

Rules the screen has to keep:

- **No percentage below five attempts, and no bucket either.** Bucketing and
  reporting must agree about what counts as enough: `mastery` smooths, so a
  thin item lands under "Getting there" with no percentage beside it — a
  verdict on evidence the same screen is refusing to summarise. Thin items are
  hidden and counted in one line.
- **The buckets use the same smoothed accuracy adaptive difficulty weights
  by.** Two definitions of struggling would have the app contradicting itself.
- **Accuracy is measured over the recent window**, like the bucket. A lifetime
  figure put a low percentage next to "Solid" for anyone who had improved.
- **Say what a number counts.** `{n} more to go` never said more of _what_;
  `{percent}% of {n}` parses like a fraction.

**Each exercise is measured by the skill it actually trains**, which is rarely
the thing the user taps:

| Exercise    | Buckets                        | And also lists                                                          |
| ----------- | ------------------------------ | ----------------------------------------------------------------------- |
| Intervals   | the interval **and direction** | play mode                                                               |
| Chords      | the chord                      | inversion, play mode                                                    |
| Chord root  | the chord                      | inversion — its whole difficulty                                        |
| Melody      | how a note arrives             | opening degree, scale                                                   |
| Progression | the chord, **after the first** | first chord _(leads)_, root movement, bass movement, cadence, inversion |

Four of those are worth the detail.

**Intervals bucket the interval _and the direction it was heard in_.** A
descending minor 7th and an ascending one are two skills — someone can name one
every time and lose the other — and the pooled figure described neither, while
the play-mode breakdown could say ascending was going badly without saying which
interval was the problem in it. So the buckets can now disagree with themselves
about one interval, and should: "Minor 7th (desc)" under Solid and "Minor 7th
(asc)" under Needs work is the finding.

Direction is three values against five play modes. `ascending-harmonic` plays the
notes up and then together, so its melodic work is plain ascending with a chord
as confirmation, and the two share a direction; `harmonic` is not a direction at
all and gets its own value, since both notes arrive at once and the interval is
heard as a sonority rather than a move. The play-mode breakdown stays because
what is left of it is a real question — whether the harmonic confirmation is
doing any work — and nothing above it can answer that.

Records written before direction was part of the identity are an average of two
skills with no way to say now which they were, so `recognizes` leaves them off
rather than showing them beside the rows that replaced them. Only rows are
filtered: a confusion naming a bare interval is still fine, since naming what was
pressed claims nothing about direction.

**Progressions lead with the first chord, and keep it out of the buckets.**
There is nothing before chord one, so it is heard by its function against the
key alone; every later chord can lean on the one before it as a landmark. Two
skills — mistaking `V` for `I` when it opens is a lost tonic, mistaking `vi` for
`I` in the middle is two chords that both sound like home — and one figure
across both describes neither. So position zero writes `opening:` and nothing
else, positions one onward write `numeral:`, and the bucketed heading says "after
the first" because its contents now match. It is a plain list that still shows
confusions: bucketing is not what earns those, and "you hear the opening `V` as
`I`" is the most useful line on the screen.

**Melody's degree breakdown covers the opening note only** — naming a degree is
the real task for exactly one note, the one judged against the drone with nothing
before it; everywhere else the ear follows a step or a leap and the degree it
lands on is a consequence of where it started.

**Progressions record root movement and bass movement as two separate sections**,
because an inversion makes them disagree, and that gap is the hardest case in the
exercise: `V IV I` with the `I` inverted has a bass of G F E, which reads as
`V IV III`. They were one list headed "By root and bass movement" — two findings
under one heading, and worst-first interleaves them, so each row had to be read
prefix-first to know which measure it belonged to. Split by **namespace**
(`root-movement:up-fourth`, `bass-movement:third`) rather than by filtering one
list in the view, so the store groups them the way the screen shows them and
`statsRows` needs to know nothing about it.

Only the root list is directed. The bass is a sounding note, so a fourth up and a
fourth down are the same distance travelled and the ear meets them as one move;
the root is a pitch class and its direction is a fact about the harmony.

That last case is detected rather than described. When the numeral pressed is
rooted on the note actually sounding underneath, the row says **"often mistaken
for the chord on the bass note"** instead of naming a numeral — a bass-reading
failure and a misjudged function are different mistakes wanting different
practice, and reporting both as "mistaken for III" tells the user neither. Only
counted when the chord was inverted; in root position the bass _is_ the root,
and `IV` answered as `iv` is a mistake about quality.

Root movement is **directed**. Measuring it by interval class collapsed a fifth
into a fourth and a sixth into a third — three relationships reported as one,
and `I`→`V` and `V`→`I` are not the same move. Roots are pitch classes, so the
far half of the circle is named by its descending complement, which is how
these moves are spoken about: `I`→`vi` is nine semitones up and every musician
calls it down a third.

#### A list the user already knows keeps its order

Rows are worst-first by default, because the point of the screen is what to work
on next. Inversions were the first exception — root position, 1st, 2nd is a
sequence the reader already has, and the numbers falling off as the bass climbs
is a shape only visible in order — and it generalises into a rule:

**Where a statistic corresponds to a list a Customize screen shows, the two
appear in the same order.** A user who has just chosen four cadences on one
screen should not meet them shuffled on the next. So cadences read Authentic,
Plagal, Half, Deceptive, Secondary; play modes, scales and the first-chord
numerals each follow their own screen; and the order comes from the same table
the screen reads rather than a copy of it, so the two cannot drift.

`order` on a section is an explicit array for those, `'natural'` where the value
_is_ its own order (inversion `0 1 2`, scale degree `0…11` — writing those out
would be restating the number line), and absent for worst-first. A value missing
from a canonical array sorts **after** everything in it, worst-first among
whatever else is unlisted: a record from a removed cadence is an anomaly, and
leading with an anomaly reads as a finding about the user.

Root and bass movement are the sections that stay worst-first. No Customize
screen offers movements — they are a property of the progression that comes out,
not something switched on — so there is no order to mirror.

### The written pages are plain, and all in one file

`src/about/pages.ts` holds every word of guidance in the app: five exercise
pages reached from each menu, and a **How to use this app** page linked from the
bottom of the home screen.

Each page is a list of headings and paragraphs. Nothing is generated, nothing is
shared between pages, and nothing reads any other part of the app — so any page
can be rewritten on its own without knowing what else it touches. The first
version generated half of each page from `StatsView` and interpolated the
thresholds, which was clever, drift-proof and completely unmaintainable: nobody
could edit a sentence without first working out where it came from. **Content is
not a place to be efficient.**

`*asterisks*` make italics and that is the whole markup vocabulary. It exists
because the bucket names need it — _needs work_, _getting there_, _solid_ — and
stops there.

**Anything true of the whole app goes on the general page**, not repeated across
five exercise pages: what the app is for, why playing what you hear on an
instrument matters more than naming it, and how the statistics work. A test
asserts the exercise pages do not re-explain the statistics, since a manual that
says the same thing in five places goes out of date in four of them.

### The answer grid: a blank cell holds a column, a blank row holds nothing

Both identification exercises lay their buttons out on the theory table, two
across, with a blank cell wherever the user has switched an answer off. The
blanks are what keep a button in one place: someone who has learned the Major
2nd is on the right and the Minor 2nd on the left should never find them
swapped, so the grid does not repack around a gap.

That argument only ever applied _across_ a row. **A row with nothing in it holds
no position for anything** — it is dead height, and there was a lot of it. Three
ninth chords out of thirty-five left fourteen empty rows on screen and three
buttons too small to hit, staggered down a page of nothing.

`dropEmptyRows` takes those out, and the rows that survive divide the height
between them (`auto-rows-fr` is what makes the compaction worth anything).
**Column is preserved by construction**, because a row is only ever kept or
dropped whole. Closing the _holes_ instead would pack tighter still and swap the
Major 2nd with the Minor 2nd the first time somebody switched a neighbour off.

A lone button in a row stays half-width rather than spanning it. Growing it
would arguably not betray anything — it covers its old position rather than
moving away from it — but Chord Identification scores every press, so **an empty
cell is a safe place to miss** and filling it makes a stray thumb cost a point.
The price is a selection that sits all in one column leaving the other half of
the screen empty, which is accepted.

It replaced the trailing-blank trim and the pad-to-even that both builders ended
with: a trailing blank row is just a row with nothing in it, so one rule does
what two did and does it everywhere rather than only at the bottom.

### Drills: two chords, ten questions, nothing else

The chord exercise asks about everything at once, which is right for practice
and wrong for a specific confusion — someone who hears every dominant 9th as a
dominant 7th meets that pair twice a session, buried among eight other chords.
A drill puts the two side by side and nothing else.

**The pairs are curated, not computed.** Shared notes is most of the story and
not all of it: major and minor share everything but the third, so by that rule
they would be one of the hardest pairs in the table, when they are one of the
_easiest_ distinctions there is. Each pair carries a `rank` for how
_fundamental_ it is rather than how similar the chords look, and the list is
ordered by that — someone working down it builds on what they already have.

A drill runs through the chord exercise itself rather than beside it: same
audio, same grid, with the pool cut to two. What it pins is everything else —
root position, block, no adaptive weighting — because a drill exists to isolate
one distinction, and a failed drill that could not say whether the pair or the
voicing was the problem answers nothing.

**Drills record to their own store.** Ten forced repetitions of two chords are
not a sample of how someone hears chords in general; folded into the chord
record they would make those two the most-practised chords in the app and
reweight what the exercise asks next — a measurement changing the thing it
measures.

**Done goes back to the Drills list, not to the exercise.** That list is both
where the drill was chosen and where the result of the run turns up — a pair
that has just moved out of _needs work_ says so there and nowhere else. Landing
on the exercise, or on the root menu, would make the user walk back down to it
to see the one thing the run just produced.

The sheet is opened with a flag rather than given a second entry point: the row
and the shortcut push the same screen through one callback, so the list cannot
drift into two versions of itself.

**The flag is spent when it is used, not when the sheet closes**, and that
distinction is the whole of a bug it caused. `ModalSheet` renders a pushed
screen _instead of_ its children, so the menu unmounts while the list is up and
mounts again when Back pops it — which gives anything that opens the list on
mount a second go at it on the way back. Back slid the list away and put an
identical one in its place, forever. A ref cannot fix that, because the ref
goes with the unmount; the flag has to mean "open onto Drills _this once_" and
be put down by the thing that acts on it.

#### A pool of two changes what a question is

Three things follow from there being two buttons, and all three came out of the
exercise's behaviour rather than being added to it.

**The question ends on the first press, right or wrong.** The ordinary exercise
leaves a miss open because working out what it was is the exercise; here
pressing one button has already said which the other was, so pressing it to be
allowed to continue is a keystroke that teaches nothing. It also cannot change
the score, since only the first press ever counted.

**There is no Reveal**, for the same reason — with a pool of two, a red button
_is_ the answer. Being told costs a miss and so does guessing, and guessing at
least leaves you having heard your guess against what played.

**The score is the drill's own**, kept in component state rather than a store,
and the exercise's running total does not move while a drill is on. This is the
visible half of the argument that already keeps the records apart: ten forced
repetitions of one pair are not a sample of how someone is doing at chords, so
they should not move the number that claims to say. It also read as though the
drill were not scored at all, since a chord total in the hundreds does not
visibly change over ten questions.

No percentage beside it. Over ten questions the score already is the summary a
percentage would be, and one question in it is either 0% or 100%. The summary
screen states the final score outright rather than leaving the user to look
back up at the header for it — out of the questions answered rather than out of
`DRILL_LENGTH`, so there is only one claim about how long a drill is.

`Chords.tsx` derives its settings when a drill is running, and **that object has
to be memoised**. An effect clears the round whenever the settings change, and a
fresh object every render is a change every render: the question was thrown away
as fast as it arrived, and the screen sat on Start forever. Un-memoise it and
the test suite hangs rather than fails, which is the shape of that bug.

**A drill lays its two chords out side by side, not on the chord table.** The
reserved positions exist so a chord keeps its place among the other thirty-four;
a drill has no other thirty-four, and honouring the table there made the layout
depend on where the pair happened to land in a list the user cannot see. Major
against Minor filled the screen because those two sit in one row of it; Add9
against Major 9th got opposite corners of a four-cell grid with two holes in it.
Two chords are two chords.

Deliberately not folded into `buildChordCells` as "a pool of two goes side by
side". Someone who has switched everything off but Major Triad and Minor 13th is
still reading the chord table, and moving one of them out of its column to close
a gap is the reflow the reserved positions exist to prevent. The pair is ordered
by the chord table rather than by how the drill is written down, so which chord
is on the left is a fact about the two chords — and it agrees with the main grid
for every pair that shares a row there.

**A pair the exercise has already seen you tell apart is marked solid without
you ever opening it.** Being made to prove major against minor when you
demonstrate it every session is busywork, and it is what would have put the most
basic drill permanently at the top of an experienced user's list. Ordinary play
answers the same question the drill asks, so it is allowed to.

Both chords have to have been met, not just one — a clean record on major says
nothing about telling it from a minor the user has never heard. And it reads
`CONFUSION_THRESHOLD` from both sides rather than inventing a second, stricter
number: above the line worth mentioning is a pair you mix up, below it is one
you do not.

The list is **tiered rather than scored** — confused pairs, then unknown ones,
then anything already filed, each tier by `rank`. A weighted score needs a
constant chosen to make the arithmetic come out, and nobody reading the list
afterwards can say why one row sits above another. Within a tier it stays
`rank`: someone who mixes up major/minor _and_ the elevenths should fix
major/minor first, whichever they get wrong more often.

A drill actually done outranks anything inferred, because it asked the same
question directly. An untried, unknown drill is still not bucketed at all —
_needs work_ would be a verdict on evidence nobody has collected.

### Adaptive difficulty: same pool, different frequency

`exercises/adaptive.ts` weights question selection toward whatever is going
worst, reading the recent window from the statistics above. It **never changes
which items are in the pool** — that is the user's, set on a screen they can
see, and a chord they switched off appearing anyway would make the settings a
lie. Widening the pool automatically is a separate idea and deliberately not
this one.

Three things it has to get right, and each has a test that fails without it:

- **Smoothed, not raw.** One hit is not mastery. Accuracy is shrunk toward an
  even prior (Beta(1,1)), so a single correct answer reads as 2/3 rather than
  certain, and an item with no record at all sits mid-weight — it needs
  _exposure_, and either extreme would be a guess about a user who has not been
  asked yet.
- **Capped at 4:1.** Someone bad at exactly one chord should not meet it eight
  times in ten. That is tedious rather than effective and is the standard way
  naive spaced repetition becomes unbearable.
- **Floored above zero.** An item that stops being asked stops generating
  evidence about itself, so a lucky streak would freeze it out permanently.

Only the **sampled** exercises are weighted: intervals, chords, and chord root
through `generateChordQuestion`. Melody and progressions are constraint-walked
toward a cadence or a shape, and forcing a weak chord into a progression can
make the cadence unreachable — breaking exact reachability to bias a
distribution is a bad trade. They stay uniform until that gets its own design.

Weighting is on the **answer** — the chord, the interval-and-direction — not on
inversion or play mode. Those are how a question is presented rather than what
it asks, and weighting several dimensions at once needs a joint record the stats
do not keep. Worth revisiting for chord root, where inversion _is_ the
difficulty.

Intervals are the one place where a presentation detail was promoted into the
answer, because it turned out not to be one: `intervalKey` takes a direction, so
a user solid on descending 7ths and lost on ascending ones meets the ascending
ones more often. The play mode is still picked first and stays uniform — its
direction is simply known by the time the answer is chosen.

**`intervalKey` and what the exercise records have to stay the same key**, which
is why the route records through `intervalKey` rather than building the id
itself. Changing one without the other is the worst kind of broken: every lookup
misses, every item reads as having no record, and adaptive difficulty switches
itself off with nothing failing to say so.

### Audio: the engine knows nothing about music

`piano.ts` takes MIDI numbers and times. It has no idea what an interval or a
progression is. Exercise-specific arrangement lives in `schedule.ts` as separate
builders, because the layers genuinely differ:

| Builder                    | Sustain rule                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buildSchedule`            | Everything rings to the end of the phrase, as if the pedal were down. Right for intervals and arpeggios, which are _meant_ to accumulate into a chord. |
| `buildMelodySchedule`      | Melody notes detached, backing chord sustained. Two opposite rules in one phrase, which is why note groups cannot express it.                          |
| `buildProgressionSchedule` | Each chord released as the next takes over; the last rings out, because it is the cadence and the arrival is the point.                                |

**Legato has a hard constraint worth knowing:** a note's length must clear its
onset gap by more than `RELEASE_MS` (180ms), or it begins fading before its
successor arrives and a run of them pulses instead of joining up. Melody notes
were 520ms against a 460ms onset and sounded choppy for exactly this reason.
Tests assert the relationship, not the numbers.

**Nothing is sounded in front of a progression, and that was tried.** `I V I V`
and `IV I IV I` are the same four sounds, differing only in where home is, so
the answer is not strictly well defined without a tonic — and for a while one
was played first, released, and separated by silence (`#113`, `#126`, refined to
a single note in `#127`).

It was removed. The argument for it was about correctness on paper; in use, the
frame read as part of the progression, so a user counting chords had to know to
discard the first thing they heard. That is a worse problem than the one it
fixed, and it was imposed on every question to serve an ambiguity most
progressions do not have.

**The Key button already answers it**, on demand, for the users who want it —
without being a sound everyone else has to learn to ignore. Worth remembering
before reaching for a frame again: the fix has been built twice, and the reason
it came out both times is that a grounding sound and a question sound arriving
back to back are hard to tell apart, however much silence sits between them.

`piano.strike(notes)` plays and lets the sample decay naturally — for references
the user asked to hear. `piano.play(groups)` cuts at a scheduled length — for
questions, where something else is about to happen. Guesses use `play`, not
`strike`: struck, they ring for seconds and pile up under the next press.

A master `DynamicsCompressorNode` catches chord clipping. Per-note gain scaling
was tried and rejected — under sustain-pedal semantics the count of sounding
voices changes throughout a phrase, an arpeggio ends as dense as the block chord
it spells, and a melody note struck over its backing would be quietened by the
_backing_ rather than by anything about itself. The threshold sits above a
single note's peak so nothing that was never going to clip is touched.

### Generation: shaped, not sampled

Every generator that produces a _sequence_ is constraint-based rather than
random, and the reason is the same each time: random output does not sound
unfamiliar, it sounds like a mistake, and the difficulty then comes from the
strangeness rather than from the thing being taught.

- **Melodies** (`melodyQuestion.ts`) work in _scale positions_, not semitones —
  a step is one position, whatever distance that is. Measuring in semitones
  would make the pentatonics look like they were leaping about. Steps outnumber
  leaps ~1.6:1; leaps turn back ~8:1.
- **Progressions** (`progressionQuestion.ts`) walk a table of conventional
  successors (`ii`→`V`, `V`→`I`/`vi`). The cadence is chosen _first_ and the walk
  built to arrive at it — the approach is part of the cadence, and a `V` reached
  from nowhere does not sound like an arrival.

**Cadencing is not ending on `I`.** Five cadence types land on `I`, `I`, `V`,
`vi` and `vi`, so every progression resolves while the ending stays
unpredictable. Measured: `I` 41%, `vi` 40%, `V` 19%.

The fifth is `III`→`vi` — the dominant _of_ `vi` resolving to it, which is an
authentic cadence heard in the relative minor. It is the only cadence whose
approach chord is out of the key, and adding it forced a change to the
successor table: `III` had been reachable only from `I`, which was fine while
it was an ordinary chord in a walk and became a fault the moment it was an
approach chord, since every such progression then ended `I III vi` and a
three-chord one had exactly one possible answer. `IV` and `vi` now lead to it
too. **A chord that is a cadence's approach needs more than one way in.**

#### A secondary dominant resolves, or hands on down the circle

Each one used to have a single successor — the chord it is the dominant of —
which is the rule for a secondary dominant heard on its own and not the rule for
a _chain_ of them. `III VI II V I` is E7 A7 D7 G7 C: every chord the dominant of
the next, every root falling a fifth, and one of the most worn grooves in tonal
music. Under one-successor-each the generator could not produce a note of it,
because `III` could only go to `vi` and `VI` only to `ii`.

So `III` also leads to `VI`, and `VI` to `II`. Each still resolves the ordinary
way, so nothing that could be generated before is lost — what changes is that a
dominant may delay its resolution by pointing at the next dominant instead,
which is what makes the chain a chain. Two additions and no more: `II` needs
none, since the chord a fifth below it is `V`, which it already leads to. A test
pins that resolving stays the common case, because a dominant that rarely
resolved would stop teaching the sound it is there for.

#### The walk is weighted toward the circle of fifths

A root falling a fifth is the strongest move in tonal harmony and the shape
behind an enormous amount of real music. Left to an unweighted walk it turned up
by accident: about one progression in six had two consecutive fifths, and one in
twenty-five had three. Now it is about a half and about one in six.

**The weight is on where a move _leads_, not on whether the move is itself a
fifth.** That was the first attempt and it barely moved the numbers — and
raising it from 4 to 12 moved them no further, which was the clue. The
bottleneck was never continuing a chain, which a plain weight already made
likely, but _getting onto_ one.

The reason is specific to where the diatonic circle runs. From `I` the fifth
move is `I`→`IV`, and it dead-ends at once: the next step round would be
`IV`→`vii°`, the tritone the diatonic circle is broken at. The productive run is
the other side — `iii vi ii V I` — and the way onto it from the tonic is
`I`→`vi`, a _third_, which a weight on fifths ignored while favouring the dead
end. Scoring each option by how long a fifths run remains from it, counting the
cadence, doubled the rate again.

Weighted rather than built as a pattern of its own, so every invariant holds by
construction: the walk was already free to make these choices, and preferring
some of them cannot break enabled-chords-only, no-chord-twice, or the cadence
still being reachable. A dedicated circle generator would have needed its own
reachability arithmetic and could dead-end when the chords it wanted were off.

Every option keeps a base weight, so nothing is ever _only_ a fifths chain — a
hard rule would run every chain to its end and the user would learn one shape
rather than the sound. The tests assert an upper bound as well as a lower one.

Progression generation does **exact reachability**, computing backwards which
chords can occupy each position while still leaving the cadence reachable. The
first version walked forwards, gave up on dead ends, and fell back on the bare
cadence — silently returning a shorter progression than the settings asked for.

Progressions also have an **`Up to` length**, which makes the setting a ceiling
and picks a length per question. Without it the row of empty slots announces how
long the phrase will be before a note has sounded, and the user never has to
hear where it ends. The length is chosen _before_ the cadence, since which
cadences fit depends on how many chords there are; exact reachability then runs
per length, which makes the setting **more** permissive rather than less — a
selection that cannot fill five chords but can fill three is playable, because
five was only ever a ceiling.

### Voicing: what the inversions setting is actually for

In the progression exercise, inversions are **heard, not answered** — `I⁶` is
still `I`, so the pad stays at one button per chord. The setting controls how
much freedom the voicing has. Root position alone makes every voice jump at
once; allowing the others lets the bass step and common tones hold.

Measured over 1000 eight-chord progressions: total voice movement drops from 98
semitones to 25, and the worst single chord change from 33 semitones to 9.

### Sound feedback follows the _position_, not the note

This bit the project three times in different disguises, so it is worth stating
as a rule: **when a guess is sounded back, its pitch or voicing must come from
the position being answered.**

1. Melody guesses used `degreePitch`, which always returns the tonic's lower
   octave — so a melody's high `1` answered a correct press with a low one.
2. Fixed by taking the pitch from the melody, but from the degree's _first_
   appearance — which broke again for melodies using the tonic at both octaves.
3. Progression guesses were voiced standalone and centre-placed, so a right
   answer sounded in a different register from the progression's own chord.

In each case the sound existed to turn a wrong answer into information, and
instead made a right answer look wrong.

The rule now covers a fourth caller: **the progression answer slots are
tappable**, and each plays its own chord taken from `voiceProgression`, not
voiced standalone. It exists as a scaffold — a user who hears the first two
chords and loses the third can pick that one out instead of replaying the whole
phrase and trying to catch it going past. It costs no score, because it sounds
a chord without naming it and the user still has to identify what they heard.

Testing this needs a progression chosen for the purpose. The obvious `I IV V I`
is useless for it twice over: its first and last chords are voiced identically,
so a slot playing the wrong one of the two passes, and its voice leading happens
to land on the centre-placed voicing every time, so `voiceChordAlone` and
`voiceProgression` are indistinguishable and the register claim above cannot
fail. The tests use `I ♭VII ♭VI V I`, where all five voicings differ and three
of them differ from standalone.

### Scoring: only the first attempt

Melody, chord root and progression exercises all score only the first attempt at
a question. A wrong answer ends the _attempt_, not the question — the answer
clears and the same question can be retried, costing and crediting nothing. A
user who knows the answer but mis-taps should not be charged for the tap.
Implemented with a `graded` ref rather than state, because the grading path
needs to read it without waiting for a re-render.

Reveal exists on every exercise that retries, and counts as a miss. Without it a
stuck user retries the same unsolved question forever. `scoreOnce` makes it come
out right in both directions with no extra bookkeeping.

**Chord Identification is the exception, because it scores every press.** Three
wrong guesses then a hit is 1/4 there, so its Reveal charges one more failed
attempt rather than one per remaining chord — reveal after two wrong guesses
ends the question at 0/3. "Counts as a miss" is ambiguous in an exercise where a
single question can already be 0/3, so it is pinned down by test rather than
left to be inferred. A revealed answer is styled `revealed`, not `correct`:
green would tell the user they got something they asked to be handed.

## Gotchas

### React batching loses presses

Two taps inside one React batch both read the state the current render was built
with, so the second overwrites the first. This is **not** caught by
`userEvent.click`, which awaits a render between presses — it needs
`fireEvent.click` twice inside one `act`.

Two separate manifestations: entered notes going missing (fixed with a
functional state update), and both presses being graded against the same
position (fixed with a `position` ref, resynced from state by an effect so undo,
a cleared attempt and a new question all correct it without remembering to).

### Tests that pass without guarding anything

Found four times in this project. Worth defaulting to suspicion:

- **Melody generator:** every melody ended on a chord tone. The assertion read
  `>0.8` against a real rate of **100%**, so it passed while the last answer was
  free. Now asserts an _upper_ bound too.
- **Progression voicing:** two tests compared movement totals against a naive
  baseline, and an arbitrary-but-legal voicing beats fixed-octave root position
  _by accident_. Replaced by asserting the contract exactly — what was chosen
  moves no more than anything else in the candidate set.
- **Progression screen:** tests waited for the answer row to empty after a wrong
  press, but a wrong press never appends, so after a mistake on the _first_
  chord the condition was already true. Presses then landed on a locked pad and
  did nothing. Now waits for the pad to be re-enabled.

**The habit that catches these:** temporarily break the implementation and
confirm the test fails. If it does not, the test is documentation, not a guard.
Also worth measuring statistical properties directly rather than inferring them
from a passing threshold.

### iOS audio

Two separate layers, and fixing one does not fix the other:

- **The `AudioContext`** gets `interrupted` (a WebKit state that is not in the
  spec or in `AudioContextState`) when the app is backgrounded. `unlock()`
  resumes anything not `running`, and replaces a context that will not revive.
  Decoded `AudioBuffer`s survive the swap — they belong to no context in
  particular — so recovery re-fetches nothing.
- **The iOS audio session** is claimed only while something is sounding and
  released ~2s after the last voice ends. Holding `playback` for the life of the
  page put a media session in the Dynamic Island and, worse, gave iOS a claim to
  reclaim while the app was away. Reactivating it by writing `playback` over the
  top is a **no-op**, because the property still reads `playback` after iOS has
  deactivated the session underneath — so a claim forces a transition via `auto`
  when the type is stale.

Neither is verifiable off-device. The state machines are tested against fakes;
the fixes need a real iPhone, in Safari and installed to the home screen.

### Scroll stays inside the modal, and it took three rules

Scrolling the sheet moved the exercise page behind it. Three separate things
were letting it, and fixing any one of them alone left a case that still leaked.

**`overscroll-y-contain` on the sheet's scroller** stops a scroll that reaches
the end of the content from chaining outward. But it **only takes effect on a
container that is actually scrolling** — a screen whose content fits, like the
root menu or most Customize screens, absorbs nothing at all, so the drag goes
straight past it. That is why fixing the statistics screen looked like fixing
the problem, and the short screens still leaked.

**The page is held still while the sheet is open**, with `overflow: hidden` on
both `documentElement` and `body`, restored to whatever they had rather than to
`''`. That is what covers the screens with nothing to scroll. Both elements,
because which one scrolls the viewport differs by browser.

**`overscroll-behavior: none` is set on `html` as well as `body`**, and the pair
is not redundant for the same reason: which element the viewport takes it from
is not agreed between browsers. Set on one alone it works in some and silently
does nothing in others.

The scrim is `touch-none` alongside all of it: it cannot scroll, so a drag on it
would otherwise fall through to the nearest thing that can.

### PWA updates

`registerType: 'prompt'`, so a new deployment waits for the user to accept the
update banner. When a fix appears not to work on device, **confirm which build
is actually running** before re-diagnosing.

### The shell's working directory drifts

In this environment the Bash tool's cwd occasionally resets to a different
project between calls. Always `cd` with an absolute path at the start of every
Bash call. This once caused `prettier --write` to run against the wrong repo.

### Dead code

`src/pitch/` (`MicrophoneListener.ts`, `detectPitch.ts`, `testTones.ts`) is
fully built and tested but **not referenced by anything**. It was written for a
microphone-input mode for Chord Root Recognition that was later dropped. Left in
place deliberately; remove it or revive it, but do not assume it is wired up.

## Conventions

- **Dark theme only.** Colours come from the `@theme` block in `src/index.css`
  and are used as Tailwind utilities (`bg-surface`, `text-content-muted`,
  `text-accent`, `bg-correct`, `bg-incorrect`). Never hardcode hex values.
- **Phone-first.** Every screen is designed for a phone; wide viewports just
  centre a `max-w-md` column.
- **Comments explain why.** The codebase is heavily commented with reasoning and
  rejected alternatives, not descriptions of what the line does. Match that.
- **Shared UI is parameterised, not duplicated.** `ChordSettingsMenu` serves two
  exercises via a store prop and an `extraRows` slot. `RangeScreen` takes its
  value, footer and warning from the caller.
- **A group checkbox obeys the rules the rows already have.** Sectioned
  checklists carry an "All …" row per section and one for the whole screen,
  three-state so a partial group reads as `mixed` rather than lying in either
  direction. Tapping a partial group goes to _all_, never to none: the tap means
  "I want these", and the user who wants none is one more tap away.

  The screens hand `bulkSelect.ts` what they already computed per row — whether
  it may be switched on, whether it may be switched off — so a group can never
  reach past a chord the range cannot build or a numeral an enabled cadence
  depends on. It would otherwise be the way round both.

  **Nothing may write an empty selection.** `sanitizeSelection` reads one as
  corrupt and returns the _defaults_, so a bulk uncheck that emptied the list
  would look like the screen resetting itself to something the user never chose.
  A group whose tap would empty the list is disabled, which is the rule the last
  remaining individual row already follows.

- **A control that can fix itself does, rather than explaining why it will
  not.** A cadence needs its chords, and one whose chords are off used to be
  disabled with the reason printed under the card. That was a refusal plus
  homework: go to another screen, work out which chords these are, switch them
  on, come back. Pressing the cadence now switches them on itself, and the row
  says so first — _"Choosing this will also switch on vi."_ — so nothing changes
  behind the user's back.

  Written in one `setSettings` call, because the store drops a cadence whose
  chords are not enabled: saving the cadence first would have it stripped before
  the chords justifying it arrived.

  The note is not styled as an error. Nothing has gone wrong — it describes a
  consequence of a tap that has not happened yet.
  The progression chords screen used to print one line under the whole card,
  for whichever locked chord happened to come first — nowhere near the row a
  user had actually pressed, and silent for every other locked row on screen.
  Each locked `CheckRow` now carries its own explanation as red text in its
  label, using the multi-line label pattern the Cadences screen already had.
  The row stays `disabled`; a tap still does nothing.

- **New pads pack their buttons**, unlike `AnswerGrid` which holds empty
  positions _within a row_. For a _selection_ the gaps are the point — major
  pentatonic would leave seven of twelve cells blank — and nothing can move
  mid-question because changing the selection ends the round. See
  **The answer grid** above for what the gaps do and do not buy.

## Getting started

```bash
npm install
npm run dev
```

## Scripts

| Script                  | Does                                        |
| ----------------------- | ------------------------------------------- |
| `npm run dev`           | Dev server                                  |
| `npm run build`         | Typecheck then production build to `dist/`  |
| `npm run preview`       | Serve the production build locally          |
| `npm test`              | Run tests once                              |
| `npm run test:watch`    | Tests in watch mode                         |
| `npm run test:coverage` | Tests with a coverage report                |
| `npm run lint`          | oxlint                                      |
| `npm run format`        | Prettier, writing in place                  |
| `npm run format:check`  | Prettier, check only                        |
| `npm run icons`         | Regenerate app icons from `public/icon.svg` |

## Offline and installation

The shell and all 52 piano samples (~1.5 MB) are precached by a Workbox service
worker, so the app launches and plays with no network at all.

Icons are generated from `public/icon.svg` by `npm run icons` and committed.
They are not built on demand — they change about never, and this keeps `sharp`,
a large native dependency, off the build path. Edit the SVG and rerun the script.

## Deployment

Pushes to `main` deploy to Vercel. `vercel.json` rewrites all paths to
`index.html` so deep links like `/intervals` survive a hard refresh.

## Ideas not yet built

- **Cadence identification** as its own exercise ("which cadence was that?" —
  four options, not a sequence). Deliberately _not_ a mode of the progression
  exercise, which would have one setting serving two exercises.
- **Sevenths in progressions.** `V` and `V7` are not distinguished as answers by
  design, but a seventh could be _sounded_ as a voicing detail.
- **Inversion identification**, if the pad can be made to fit — figured bass
  (`V⁶₄`, `V⁴₃`) gets dense on a phone.
