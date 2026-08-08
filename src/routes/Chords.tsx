import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  AnswerGrid,
  ExerciseHeader,
  ModalSheet,
  ReplayButton,
  SilentSwitchHint,
} from '../components'
import { ChordSettingsMenu } from '../customize'
import { useAutoAdvance } from './useAutoAdvance'
import { piano, scheduleDurationMs } from '../audio'
import {
  chordDrillStatsStore,
  chordScoreStore,
  chordSettingsStore,
  chordStatsStore,
  itemId,
  recordInStore,
  recordGuess,
  usePersisted,
} from '../settings'
import {
  CHORD_STATS_VIEW,
  DRILL_LENGTH,
  DRILL_NAMESPACE,
  buildChordCells,
  buildDrillCells,
  canGenerateChord,
  generateChordQuestion,
  groupsForChordPreview,
  groupsForChordQuestion,
  drillById,
  drillChords,
  drillSettings,
  type Drill,
  isChordCorrect,
  type ChordQuestion,
} from '../exercises'
import { CHORD_ABOUT } from '../about/pages'

/** Minimum pause on the green button before the next question starts. */
const AUTO_ADVANCE_MS = 800

/**
 * Pause on a revealed chord before the next question starts.
 *
 * Longer than the solved pause: the user is hearing the answer for the first
 * time knowing what it is, which is the only part of a lost question that
 * teaches anything.
 */
const REVEAL_ADVANCE_MS = 2000

/** Silence left after a confirming chord finishes, before the next question. */
const ADVANCE_GAP_MS = 250

interface Round {
  number: number
  question: ChordQuestion
}

export default function Chords() {
  const navigate = useNavigate()
  const { drillId } = useParams()
  const [stored] = usePersisted(chordSettingsStore)
  const [score, setScore, resetScore] = usePersisted(chordScoreStore)

  /**
   * The same screen, with the pool cut down to two chords.
   *
   * A drill is this exercise asked a narrower question, so it runs through the
   * exercise rather than beside it — the audio, the grid, the reveal and the
   * scoring are all things a drill wants exactly as they already are, and a
   * second screen would be the same code with two chords in it.
   */
  const drill = drillId ? drillById(drillId) : null
  // Memoised, and it has to be. An effect below clears the round whenever the
  // settings change, and a fresh object every render is a change every render —
  // in a drill that meant the question was thrown away as fast as it arrived
  // and the screen never showed one at all.
  const settings = useMemo(
    () => (drill ? drillSettings(drill, stored) : stored),
    [drill, stored],
  )

  /** How many questions of this drill have been answered. */
  const [answered, setAnswered] = useState(0)
  const finished = drill !== null && answered >= DRILL_LENGTH

  /**
   * How many of them were right — the drill's score, and nothing else's.
   *
   * **Kept apart from the exercise score, and in component state rather than
   * in a store.** The chord score is a running total across every session and
   * survives a reload; a drill is ten questions with a beginning and an end,
   * and it starts again at nothing every time it is opened. Folding the two
   * together was the visible half of the same mistake the statistics already
   * avoid — ten forced repetitions of one pair are not a sample of how someone
   * is doing at chords, so they should not move the number that claims to say.
   *
   * The total is `answered`, so there is nothing to keep in step: a drill
   * scores exactly one attempt per question, which is what makes the pair of
   * numbers a score rather than a tally of presses.
   */
  const [drillCorrect, setDrillCorrect] = useState(0)

  const startDrillRun = useCallback(() => {
    setAnswered(0)
    setDrillCorrect(0)
  }, [])

  /** Whether this question has gone into the statistics — see Intervals.tsx. */
  const measured = useRef(false)

  const [round, setRound] = useState<Round | null>(null)
  const [wrong, setWrong] = useState<string[]>([])
  const [solvedId, setSolvedId] = useState<string | null>(null)
  const [revealedId, setRevealedId] = useState<string | null>(null)
  /**
   * Whether the sheet should open on the Drills list instead of the root menu.
   *
   * Set by Done on the drill summary. The user got here from that list, and
   * the drill they have just finished has moved between its buckets — so the
   * list is both where they came from and where the result of the run shows
   * up. Dropping them on the root menu would make them walk back down to it.
   */
  const [openDrills, setOpenDrills] = useState(false)
  const replayRef = useRef<HTMLButtonElement>(null)

  const playable = canGenerateChord(settings)

  const nextQuestion = useCallback(() => {
    setWrong([])
    setSolvedId(null)
    setRevealedId(null)
    measured.current = false
    setRound((current) => ({
      number: (current?.number ?? 0) + 1,
      question: generateChordQuestion(
        settings,
        undefined,
        chordStatsStore.read(),
      ),
    }))
  }, [settings])

  const { menuOpen, openMenu, closeMenu, advanceAfter, cancelAdvance } =
    useAutoAdvance(nextQuestion, round !== null)

  useEffect(() => {
    if (!round) return
    void piano.play(groupsForChordQuestion(round.question, settings.chords))
  }, [round, settings.chords])

  useEffect(() => {
    setRound(null)
    setWrong([])
    setSolvedId(null)
    setRevealedId(null)
    measured.current = false
  }, [settings])

  // Park focus on Replay for every new question, so a keyboard user can
  // press space to hear it again rather than activating whichever answer
  // button they last pressed.
  useEffect(() => {
    if (!round) return
    replayRef.current?.focus()
  }, [round])

  /**
   * A finished drill has nothing to advance to.
   *
   * The tenth answer schedules the next question exactly like the nine before
   * it, and by the time that timer fires the drill is over and the summary is
   * on screen. It still built a question — one nobody would ever see — and the
   * effect that plays a new round still sounded it. That was the unexplained
   * chord at the end of every drill.
   *
   * Cancelled on the way into the summary rather than guarded where the timer
   * is set, because the answer that ends a drill can arrive by more than one
   * route and a guard would have had to be remembered at each of them.
   */
  useEffect(() => {
    if (finished) cancelAdvance()
  }, [finished, cancelAdvance])

  /**
   * The one measurement a question gets, wherever it came from.
   *
   * **A drill records only to the drill store**, never to the chord record. Ten
   * forced repetitions of the same two chords are not a sample of how the user
   * hears chords in general — folded in, they would make those two the
   * most-practised chords in the app and reweight what the exercise asks next,
   * which is a measurement changing the thing it measures.
   *
   * The drill's own record is one entry per pair, one attempt per question, so
   * `mastery` reads it exactly as it reads everything else.
   */
  const recordFirstPress = (correct: boolean, pressed?: string) => {
    if (!round) return

    if (drill) {
      recordInStore(chordDrillStatsStore, [
        { item: itemId(DRILL_NAMESPACE, drill.id), correct },
      ])
      setAnswered((count) => count + 1)
      return
    }

    recordInStore(chordStatsStore, [
      {
        item: itemId('chord', round.question.chordId),
        correct,
        // Absent on a reveal: they did not confuse this chord with another,
        // they had nothing.
        answered: pressed,
      },
      { item: itemId('inversion', round.question.inversion), correct },
      { item: itemId('mode', round.question.playMode), correct },
    ])
  }

  /**
   * Whether this question is over and a press can only replay a sound.
   *
   * **A drill question ends on the first press, right or wrong.** The ordinary
   * exercise leaves a missed question open, because working out what it was is
   * the exercise — but a drill has two buttons, so pressing the wrong one has
   * already told the user which the answer was, and making them press the
   * other to move on is a keystroke that teaches nothing. It also cannot be
   * used to improve the drill's score, since only the first press counts.
   *
   * Which is why nothing needs revealing on a miss either: with a pool of two,
   * a red button *is* the answer.
   */
  const over =
    solvedId !== null ||
    revealedId !== null ||
    (drill !== null && wrong.length > 0)

  const handleAnswer = (chordId: string) => {
    if (!round) return

    // Always sound the chord that was pressed, built on the question's own
    // root. A wrong guess then becomes a direct comparison against the target
    // rather than just a red button.
    const groups = groupsForChordPreview(round.question, chordId)
    if (groups) void piano.play(groups)

    // Pressing an answer that has already been given — or any answer once the
    // question is over — replays its sound without scoring again.
    if (over || wrong.includes(chordId)) return

    // A question where several enabled chords share the same notes plays a
    // root reference tone first (see groupsForChordQuestion), so exactly one
    // chord is correct even then: the one that was actually generated.
    const correct = isChordCorrect(round.question, chordId)

    // The two scores never both move. A drill is not practice at chords in
    // general, so it leaves the exercise's running total exactly where it was.
    if (drill) {
      if (correct) setDrillCorrect((count) => count + 1)
    } else {
      setScore(recordGuess(score, correct))
    }

    if (!measured.current) {
      measured.current = true
      recordFirstPress(correct, chordId)
    }

    if (correct) setSolvedId(chordId)
    else setWrong((current) => [...current, chordId])

    // A missed question in the ordinary exercise stays open to be retried; in
    // a drill it is over, so both outcomes move on.
    if (!correct && !drill) return

    // Let the chord that just sounded finish before the next question
    // interrupts it.
    const settle = groups
      ? Math.max(AUTO_ADVANCE_MS, scheduleDurationMs(groups) + ADVANCE_GAP_MS)
      : AUTO_ADVANCE_MS
    advanceAfter(settle)
  }

  /**
   * Give up on this chord and be told what it was.
   *
   * Every other retrying exercise has this, and for the reason the README
   * gives: without it a stuck user works through the grid until something
   * turns green, which is elimination rather than listening.
   *
   * **It charges one miss, not one per remaining chord.** This exercise scores
   * every press — three wrong guesses then a hit is 1/4 — so a reveal is
   * simply one more attempt that failed. A user who reveals after two wrong
   * guesses ends the question at 0/3. Being told the answer is not identifying
   * it, and it costs exactly what one more wrong press would have.
   *
   * The chord is marked `revealed` rather than `correct`. Green would tell the
   * user they got something they asked to be handed.
   *
   * **A drill has no Reveal**, and needs none: two buttons mean pressing either
   * one settles the question, so the way out of a chord you cannot name is to
   * guess — which costs the same as revealing did and leaves you having heard
   * your guess against the answer.
   */
  const reveal = () => {
    if (!round || over) return

    void piano.play(groupsForChordQuestion(round.question, settings.chords))
    setRevealedId(round.question.chordId)
    setScore(recordGuess(score, false))

    // Giving up is evidence too, and the guard means it only counts when the
    // grid was never pressed. Without this a chord the user reveals every time
    // would record nothing at all and read as untouched rather than as the
    // hardest thing on the screen — which is exactly backwards.
    //
    // No `answered`: they did not confuse this chord with another, they had
    // nothing. Same reasoning as the self-graded root exercise.
    if (!measured.current) {
      measured.current = true
      recordFirstPress(false)
    }

    advanceAfter(REVEAL_ADVANCE_MS)
  }

  return (
    <main className="flex h-full flex-col">
      {/*
        A drill shows its own score, not the exercise's. The number a user
        watches while they work has to be the one about what they are doing —
        a chord total in the hundreds does not move over ten questions, so it
        read as though the drill were not being scored at all.
      */}
      <ExerciseHeader
        correct={drill ? drillCorrect : score.correct}
        total={drill ? answered : score.total}
        showAccuracy={drill === null}
        onBack={() => navigate('/')}
        onMenu={openMenu}
      />

      {finished ? (
        <DrillSummary
          drill={drill}
          correct={drillCorrect}
          total={answered}
          onAgain={() => {
            startDrillRun()
            nextQuestion()
          }}
          onDone={() => {
            // Back to the list this drill was chosen from, rather than to the
            // exercise. Navigating first leaves the drill route, so the screen
            // underneath is the ordinary chord exercise by the time the sheet
            // is over it.
            navigate('/chords')
            setOpenDrills(true)
            // Through the same door as every other open, so nothing is left
            // sounding and no advance is left owed. There is none pending here
            // — finishing the drill cancelled it — but the sheet should not
            // have two ways in for that to depend on.
            openMenu()
          }}
        />
      ) : round ? (
        <>
          <div className="flex justify-center py-1">
            <ReplayButton
              ref={replayRef}
              onClick={() =>
                void piano.play(
                  groupsForChordQuestion(round.question, settings.chords),
                )
              }
            />
          </div>
          <SilentSwitchHint />
          <AnswerGrid
            // A drill lays its two chords out side by side rather than on the
            // chord table, because it is not showing the chord table. The
            // reserved positions are there so a chord keeps its place among
            // the other thirty-four, and a drill has no other thirty-four.
            cells={
              drill
                ? buildDrillCells(drill, wrong, solvedId, revealedId)
                : buildChordCells(settings.chords, wrong, solvedId, revealedId)
            }
            onAnswer={handleAnswer}
          />
          {/* No Reveal in a drill — see `reveal`. Two buttons answer it. */}
          {!drill && (
            <div className="flex shrink-0 justify-center pb-2">
              <button
                type="button"
                onClick={reveal}
                disabled={over}
                className="rounded-full px-6 py-2 text-sm text-content-muted active:bg-surface disabled:opacity-30"
              >
                Reveal
              </button>
            </div>
          )}
        </>
      ) : (
        <StartPanel playable={playable} onStart={nextQuestion} />
      )}

      <ModalSheet
        open={menuOpen}
        onClose={() => {
          closeMenu()
          setOpenDrills(false)
        }}
        title="Menu"
      >
        <ChordSettingsMenu
          store={chordSettingsStore}
          statsStore={chordStatsStore}
          statsView={CHORD_STATS_VIEW}
          about={CHORD_ABOUT}
          openDrills={openDrills}
          onDrillsOpened={() => setOpenDrills(false)}
          onStartDrill={(id) => {
            setOpenDrills(false)
            startDrillRun()
            closeMenu()
            navigate(`/chords/drill/${id}`)
          }}
          onResetScore={() => {
            resetScore()
            closeMenu()
          }}
        />
      </ModalSheet>
    </main>
  )
}

/**
 * The end of a drill: what it was, how it went, and the two ways out.
 *
 * **The score is the point of this screen**, so it is the biggest thing on it
 * rather than left to the header. The header is chrome a user reads while they
 * work; a run of ten that has just ended wants its result stated, and having
 * to look back up at a small number in the corner to find out how you did is
 * the screen declining to say.
 *
 * Out of the questions actually answered rather than out of `DRILL_LENGTH`.
 * The two are the same at the end of a run, and writing the constant here
 * would be a second claim about the length that could disagree with the first.
 */
function DrillSummary({
  drill,
  correct,
  total,
  onAgain,
  onDone,
}: {
  drill: Drill
  correct: number
  total: number
  onAgain: () => void
  onDone: () => void
}) {
  const [first, second] = drillChords(drill)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="flex flex-col gap-2">
        <p className="text-lg font-semibold">
          {first.name} vs {second.name}
        </p>
        <p
          aria-label="Drill score"
          className="text-5xl font-semibold tabular-nums"
        >
          {correct}/{total}
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onAgain}
          className="rounded-full bg-accent px-8 py-3 text-lg font-medium active:opacity-80"
        >
          Again
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-6 py-2 text-sm text-content-muted active:opacity-60"
        >
          Done
        </button>
      </div>
    </div>
  )
}

function StartPanel({
  playable,
  onStart,
}: {
  playable: boolean
  onStart: () => void
}) {
  if (!playable) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-content-muted">
        No chord can be played with the current settings. Open the menu and
        widen the range or enable more chords.
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      {/* See the note in Intervals.tsx: iOS needs a real tap to start audio. */}
      <button
        type="button"
        onClick={onStart}
        className="rounded-full bg-accent px-8 py-3 text-lg font-medium active:opacity-80"
      >
        Start
      </button>
      <p className="text-center text-sm text-content-muted">
        Listen, then pick the chord you heard.
      </p>
    </div>
  )
}
