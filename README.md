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

**1261 tests across 47 files.** All of `npm run lint`, `npm run build`,
`npx tsc -b --noEmit`, `npm run format:check` and `npm test` pass on `main`.

**All five exercises are complete**, each with its own generation, grading,
persisted settings, Customize modal and score. Also done: the PWA (offline
precaching, install offer, update prompt) and iOS audio handling.

In progress: a run of follow-ups to the statistics feature, `#110`–`#122` —
sharper progression statistics, direction-aware interval statistics, drills for
confusable chords, and some customization and formatting work. `#110` and `#111`
are done.

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
    intervals.ts      interval table (gap between two notes)
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
| Intervals   | the interval                   | play mode                                                               |
| Chords      | the chord                      | inversion, play mode                                                    |
| Chord root  | the chord                      | inversion — its whole difficulty                                        |
| Melody      | how a note arrives             | opening degree, scale                                                   |
| Progression | the chord, **after the first** | first chord _(leads)_, root movement, bass movement, cadence, inversion |

Three of those are worth the detail.

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

Inversion lists are ordered **root position first**, not worst first — the
sequence is one the reader already has, and the numbers falling off as the bass
climbs is a shape only visible in order.

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

Weighting is on the **answer** — the interval, the chord — not on inversion or
play mode. Those are how a question is presented rather than what it asks, and
weighting several dimensions at once needs a joint record the stats do not
keep. Worth revisiting for chord root, where inversion _is_ the difficulty.

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
- **A disabled control names its reason on the row, not off in a shared note.**
  The progression chords screen used to print one line under the whole card,
  for whichever locked chord happened to come first — nowhere near the row a
  user had actually pressed, and silent for every other locked row on screen.
  Each locked `CheckRow` now carries its own explanation as red text in its
  label, using the multi-line label pattern the Cadences screen already had.
  The row stays `disabled`; a tap still does nothing.
- **New pads pack their buttons**, unlike `AnswerGrid` which holds empty
  positions. For a _selection_ the gaps are the point — major pentatonic would
  leave seven of twelve cells blank — and nothing can move mid-question because
  changing the selection ends the round.

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
