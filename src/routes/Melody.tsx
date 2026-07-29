import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  DegreePad,
  ExerciseHeader,
  ModalSheet,
  ReplayButton,
  SilentSwitchHint,
} from '../components'
import { MelodySettingsMenu } from '../customize'
import { buildMelodySchedule, piano } from '../audio'
import { combinedDegrees, degreeLabel, type Degree } from '../theory'
import {
  melodyScoreStore,
  melodySettingsStore,
  recordGuess,
  usePersisted,
} from '../settings'
import {
  canGenerateMelody,
  checkMelody,
  generateMelodyQuestion,
  guessPitch,
  phraseForMelodyQuestion,
  selectedScales,
  type MelodyQuestion,
} from '../exercises'

/** Pause on a correct answer before the next melody starts. */
const AUTO_ADVANCE_MS = 1200

/** How long the wrong note stays red before the answer is cleared to retry. */
const WRONG_FEEDBACK_MS = 800

/**
 * Where a question is up to.
 *
 * `wrong` is a held moment rather than an end state: the note that broke the
 * run stays red long enough to be read, then the answer clears and the user
 * tries the same melody again. `revealed` is the end state that retrying
 * lacks — the answer is out, so there is nothing left to enter.
 */
type Phase = 'entering' | 'wrong' | 'correct' | 'revealed'

interface Round {
  number: number
  question: MelodyQuestion
}

/**
 * Melody dictation: hear a melody, enter its degrees in order.
 *
 * The tonic chord sounds underneath the melody throughout, so the reference is
 * never something to be remembered — it is still playing. That is what makes
 * the exercise about which degree each note *is* rather than about how well
 * the user held a pitch in their head from a cadence a few seconds ago.
 *
 * Every note is marked as it is entered, rather than the whole answer being
 * graded at the end. Hearing that the fourth note was wrong only after
 * committing to a fifth and sixth teaches nothing about the fourth — by then
 * the melody has moved on and so has the ear. Marked immediately, a mistake is
 * still attached to the sound that caused it.
 *
 * A wrong note therefore ends the attempt, not the question: it goes red, the
 * answer clears, and the same melody can be tried again. Only the first
 * attempt is scored, the same as the chord root exercise — a user who knows
 * the melody but fumbles a button should not be charged for the button.
 */
export default function Melody() {
  const navigate = useNavigate()
  const [settings] = usePersisted(melodySettingsStore)
  const [score, setScore, resetScore] = usePersisted(melodyScoreStore)

  const [round, setRound] = useState<Round | null>(null)
  const [entered, setEntered] = useState<Degree[]>([])
  const [phase, setPhase] = useState<Phase>('entering')
  const [menuOpen, setMenuOpen] = useState(false)

  /**
   * Whether this melody has already gone into the score. A ref rather than
   * state, for the same reason the chord root exercise keeps one: the grading
   * effect has to read it without waiting for a render to tell it.
   */
  const graded = useRef(false)
  /**
   * How many degrees are in, readable without waiting for a render.
   *
   * `entered.length` is the same number, but a press has to know it *during*
   * the press to sound the right octave, and two presses inside one React
   * batch would both read the length this render was built with. Kept in step
   * by an effect below, so undo, a cleared attempt and a new question all
   * correct it without any of them having to remember to.
   */
  const position = useRef(0)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const replayRef = useRef<HTMLButtonElement>(null)

  const playable = canGenerateMelody(settings)

  /**
   * Every degree any selected scale can produce.
   *
   * The union rather than the chosen scale's own degrees, because the user is
   * not told which scale this melody came from — offering only its degrees
   * would answer that for them, and narrowing the pad mid-exercise would
   * announce a change of scale before a note had sounded.
   */
  const scaleDegrees = combinedDegrees(selectedScales(settings))

  const playMelody = useCallback((question: MelodyQuestion) => {
    void piano.playSchedule(
      buildMelodySchedule(phraseForMelodyQuestion(question)),
    )
  }, [])

  const nextQuestion = useCallback(() => {
    setEntered([])
    setPhase('entering')
    graded.current = false
    setRound((current) => ({
      number: (current?.number ?? 0) + 1,
      question: generateMelodyQuestion(settings),
    }))
  }, [settings])

  useEffect(() => {
    if (!round) return
    playMelody(round.question)
  }, [round, playMelody])

  // Changing what is asked invalidates the question in progress.
  useEffect(() => {
    setRound(null)
    setEntered([])
    setPhase('entering')
    graded.current = false
  }, [settings])

  useEffect(() => {
    position.current = entered.length
  }, [entered])

  useEffect(() => {
    if (!round) return
    replayRef.current?.focus()
  }, [round])

  useEffect(
    () => () => {
      for (const timer of [advanceTimer, feedbackTimer]) {
        if (timer.current) clearTimeout(timer.current)
      }
      piano.stop()
    },
    [],
  )

  /** Record the first attempt at a melody and nothing after it. */
  const scoreOnce = useCallback(
    (correct: boolean) => {
      if (graded.current) return
      graded.current = true
      setScore(recordGuess(score, correct))
    },
    [score, setScore],
  )

  /**
   * Append a degree.
   *
   * Functional, and it matters: a fast player taps two degrees inside one
   * React batch, and appending to the `entered` captured by this render would
   * have the second press overwrite the first. Notes went missing under
   * exactly the input this exercise invites.
   */
  const enter = (degree: Degree) => {
    if (!round || phase !== 'entering') return

    const index = position.current
    if (index >= round.question.degrees.length) return
    position.current = index + 1

    // Sound what was pressed, at the pitch this melody uses at this point in
    // it. Choosing a degree by name and never hearing it makes this a guessing
    // game with a keypad; hearing it turns a wrong answer into information —
    // that was a 6, and the melody was not that.
    void piano.play([[guessPitch(round.question, index, degree)]])

    setEntered((current) =>
      current.length >= round.question.degrees.length
        ? current
        : [...current, degree],
    )
  }

  /**
   * Judge the note that was just entered.
   *
   * An effect rather than part of the press: the press uses a functional
   * update, so it does not know what the answer became, and judging is a side
   * effect with no business inside an updater React is free to run twice.
   *
   * `checkMelody` does the comparing even though only the last position is
   * being looked at, so there is one place that decides whether a degree
   * matches rather than two that could drift apart.
   */
  useEffect(() => {
    if (!round || phase !== 'entering' || entered.length === 0) return

    const outcome = checkMelody(entered, round.question)
    const latest = entered.length - 1

    if (!outcome.positions[latest]) {
      scoreOnce(false)
      setPhase('wrong')
      // Hold the red long enough to read, then clear for another attempt at
      // the same melody.
      feedbackTimer.current = setTimeout(() => {
        setEntered([])
        setPhase('entering')
      }, WRONG_FEEDBACK_MS)
      return
    }

    if (outcome.correct) {
      scoreOnce(true)
      setPhase('correct')
      advanceTimer.current = setTimeout(nextQuestion, AUTO_ADVANCE_MS)
    }
  }, [entered, round, phase, scoreOnce, nextQuestion])

  const undo = () => {
    if (phase !== 'entering') return
    setEntered((current) => current.slice(0, -1))
  }

  /**
   * Give up on this melody and be told what it was.
   *
   * A wrong note ends the attempt rather than the question, which is right for
   * a user who is close and wrong for one who is stuck: without this they
   * retry the same unsolved melody indefinitely, learning nothing new each
   * time round.
   *
   * It costs the question, on the chord root exercise's reasoning that being
   * told the answer is not identifying it. `scoreOnce` makes that exactly
   * right in both directions for free — revealing before any mistake charges
   * the question, and revealing after one charges nothing further, because it
   * was already lost.
   */
  const reveal = () => {
    if (!round || phase === 'correct' || phase === 'revealed') return
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)

    // Revealing mid-mistake catches a wrong note still on screen, and the
    // red that marked it belongs to a phase we are leaving. Keep only the
    // prefix the user actually got, or their error would be handed back to
    // them as one of the answers.
    const { positions } = checkMelody(entered, round.question)
    const firstWrong = positions.indexOf(false)
    if (firstWrong !== -1) setEntered(entered.slice(0, firstWrong))

    scoreOnce(false)
    setPhase('revealed')
  }

  return (
    <main className="flex h-full flex-col">
      <ExerciseHeader
        correct={score.correct}
        total={score.total}
        onBack={() => navigate('/')}
        onMenu={() => setMenuOpen(true)}
      />

      {round ? (
        <>
          <div className="flex items-center justify-center gap-3 py-1">
            <ReplayButton
              ref={replayRef}
              onClick={() => playMelody(round.question)}
            />
            <TonicButton
              onClick={() => void piano.play([[round.question.tonic]])}
            />
          </div>
          <SilentSwitchHint />

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4">
            <Entry
              entered={entered}
              length={round.question.degrees.length}
              wrongAt={phase === 'wrong' ? entered.length - 1 : null}
              revealed={phase === 'revealed' ? round.question.degrees : null}
            />
            {phase === 'wrong' ? (
              <p className="text-sm text-content-muted">
                Not that one — listen again.
              </p>
            ) : null}
            {phase === 'revealed' ? (
              <p className="text-sm text-content-muted">That was the melody.</p>
            ) : null}
          </div>

          {phase === 'revealed' ? (
            <div className="flex shrink-0 justify-center pb-8">
              <button
                type="button"
                onClick={nextQuestion}
                className="rounded-full bg-accent px-8 py-3 text-lg font-medium active:opacity-80"
              >
                Next
              </button>
            </div>
          ) : (
            <div className="shrink-0 pb-4">
              <DegreePad
                degrees={scaleDegrees}
                onPress={enter}
                disabled={phase !== 'entering'}
              />
              <div className="flex justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={undo}
                  disabled={entered.length === 0 || phase !== 'entering'}
                  className="rounded-full px-6 py-2 text-sm text-content-muted active:bg-surface disabled:opacity-30"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={reveal}
                  disabled={phase === 'correct'}
                  className="rounded-full px-6 py-2 text-sm text-content-muted active:bg-surface disabled:opacity-30"
                >
                  Reveal
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <StartPanel playable={playable} onStart={nextQuestion} />
      )}

      <ModalSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Menu"
      >
        <MelodySettingsMenu
          onResetScore={() => {
            resetScore()
            setMenuOpen(false)
          }}
        />
      </ModalSheet>
    </main>
  )
}

/**
 * The answer as it is built up, one slot per note of the melody.
 *
 * Every entered degree is green, because a wrong one never survives long
 * enough to be anything else — it goes red and the answer clears. So the row
 * reads as how far the run has got, and the single red slot as where it broke.
 *
 * A revealed melody fills the slots the user never reached, in a plain style
 * rather than green. Green means they found it; a note they were handed has
 * not been found, and saying otherwise would flatter the row into
 * meaninglessness. Anything they did get stays green — it was still theirs.
 *
 * The empty slots are the point too: they say how many notes are still to
 * come, which the user would otherwise have to count off the playback while
 * also trying to identify it.
 */
function Entry({
  entered,
  length,
  wrongAt,
  revealed,
}: {
  entered: readonly Degree[]
  length: number
  /** Index of the note that broke the run, while it is being shown. */
  wrongAt: number | null
  /** The melody itself, once the user has asked to be told it. */
  revealed: readonly Degree[] | null
}) {
  return (
    <div
      aria-label="Your answer"
      className="flex flex-wrap items-center justify-center gap-2 text-2xl font-medium tabular-nums"
    >
      {Array.from({ length }, (_, i) => {
        const own = entered[i]
        const given = own === undefined ? revealed?.[i] : undefined
        const degree = own ?? given

        return (
          <span
            key={i}
            className={`flex h-11 min-w-11 items-center justify-center rounded-lg px-2 ${
              degree === undefined
                ? 'bg-surface/40 text-content-muted'
                : given !== undefined
                  ? 'bg-surface-raised text-content'
                  : i === wrongAt
                    ? 'bg-incorrect text-white'
                    : 'bg-correct text-black'
            }`}
          >
            {degree === undefined ? '·' : degreeLabel(degree)}
          </span>
        )
      })}
    </div>
  )
}

/** Re-hear where home is, at any point in the question. */
function TonicButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Play the tonic"
      className="rounded-full bg-surface px-4 py-2.5 text-sm font-medium active:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      Tonic
    </button>
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
        No melody can be played with the current settings. Widen the range, or
        ask for fewer featured degrees.
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
        Listen, then tap the degrees of the melody in order.
      </p>
    </div>
  )
}
