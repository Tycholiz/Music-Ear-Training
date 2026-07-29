import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  DegreePad,
  ExerciseHeader,
  ListCard,
  ListRow,
  ModalSheet,
  ReplayButton,
  SilentSwitchHint,
} from '../components'
import { buildMelodySchedule, piano } from '../audio'
import { degreeLabel, scaleById, type Degree } from '../theory'
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
  phraseForMelodyQuestion,
  type MelodyQuestion,
  type MelodyResult,
} from '../exercises'

/** Pause on a correct answer before the next melody starts. */
const AUTO_ADVANCE_MS = 1200

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
 * A wrong answer does not advance on a timer. Being shown which position was
 * missed, and what belonged there, is the entire lesson, and it takes as long
 * as it takes to read — so the user moves on by asking to. Correct answers do
 * advance on their own; there is nothing to study.
 */
export default function Melody() {
  const navigate = useNavigate()
  const [settings] = usePersisted(melodySettingsStore)
  const [score, setScore, resetScore] = usePersisted(melodyScoreStore)

  const [round, setRound] = useState<Round | null>(null)
  const [entered, setEntered] = useState<Degree[]>([])
  const [result, setResult] = useState<MelodyResult | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  /**
   * Whether this melody has already gone into the score. A ref rather than
   * state, for the same reason the chord root exercise keeps one: the grading
   * effect has to read it without waiting for a render to tell it.
   */
  const graded = useRef(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const replayRef = useRef<HTMLButtonElement>(null)

  const playable = canGenerateMelody(settings)
  const scaleDegrees = playable ? scaleById(settings.scaleId).degrees : []

  const playMelody = useCallback((question: MelodyQuestion) => {
    void piano.playSchedule(
      buildMelodySchedule(phraseForMelodyQuestion(question)),
    )
  }, [])

  const nextQuestion = useCallback(() => {
    setEntered([])
    setResult(null)
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
    setResult(null)
    graded.current = false
  }, [settings])

  useEffect(() => {
    if (!round) return
    replayRef.current?.focus()
  }, [round])

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      piano.stop()
    },
    [],
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
    if (!round || result) return
    setEntered((current) =>
      current.length >= round.question.degrees.length
        ? current
        : [...current, degree],
    )
  }

  /**
   * Grade once the answer is as long as the melody.
   *
   * An effect rather than part of the press, because the press no longer knows
   * what the answer became — and because scoring is a side effect, which has no
   * business inside a state updater React is free to run twice.
   */
  useEffect(() => {
    if (!round || graded.current) return
    if (entered.length < round.question.degrees.length) return

    graded.current = true
    const outcome = checkMelody(entered, round.question)
    setResult(outcome)
    setScore(recordGuess(score, outcome.correct))
    if (outcome.correct) {
      advanceTimer.current = setTimeout(nextQuestion, AUTO_ADVANCE_MS)
    }
  }, [entered, round, score, setScore, nextQuestion])

  const undo = () => {
    if (result) return
    setEntered((current) => current.slice(0, -1))
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

          <div className="flex min-h-0 flex-1 items-center justify-center px-4">
            <Entry
              entered={entered}
              length={round.question.degrees.length}
              result={result}
            />
          </div>

          {result && !result.correct ? (
            <Correction question={round.question} onNext={nextQuestion} />
          ) : (
            <div className="shrink-0 pb-4">
              <DegreePad
                degrees={scaleDegrees}
                onPress={enter}
                disabled={result !== null}
              />
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={undo}
                  disabled={entered.length === 0 || result !== null}
                  className="rounded-full px-6 py-2 text-sm text-content-muted active:bg-surface disabled:opacity-30"
                >
                  Undo
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <StartPanel playable={playable} onStart={nextQuestion} />
      )}

      {/* Customize lands in #57; until then the menu carries what exists. */}
      <ModalSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Menu"
      >
        <div className="p-4">
          <ListCard>
            <ListRow
              label="Reset Score"
              destructive
              onClick={() => {
                resetScore()
                setMenuOpen(false)
              }}
            />
          </ListCard>
        </div>
      </ModalSheet>
    </main>
  )
}

/**
 * The answer as it is built up, one slot per note of the melody.
 *
 * The empty slots are the point: they say how many notes are still to come,
 * which the user would otherwise have to count off the playback while also
 * trying to identify it.
 */
function Entry({
  entered,
  length,
  result,
}: {
  entered: readonly Degree[]
  length: number
  result: MelodyResult | null
}) {
  return (
    <div
      aria-label="Your answer"
      className="flex flex-wrap items-center justify-center gap-2 text-2xl font-medium tabular-nums"
    >
      {Array.from({ length }, (_, i) => {
        const degree = entered[i]
        const state = !result
          ? 'pending'
          : result.positions[i]
            ? 'correct'
            : 'wrong'

        return (
          <span
            key={i}
            className={`flex h-11 min-w-11 items-center justify-center rounded-lg px-2 ${
              degree === undefined
                ? 'bg-surface/40 text-content-muted'
                : state === 'correct'
                  ? 'bg-correct text-black'
                  : state === 'wrong'
                    ? 'bg-incorrect text-white'
                    : 'bg-surface'
            }`}
          >
            {degree === undefined ? '·' : degreeLabel(degree)}
          </span>
        )
      })}
    </div>
  )
}

/**
 * What the melody actually was, shown only when it was missed.
 *
 * Marking the wrong position without saying what belonged there would tell the
 * user they failed without telling them anything they could use.
 */
function Correction({
  question,
  onNext,
}: {
  question: MelodyQuestion
  onNext: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <p className="text-sm text-content-muted">The melody was</p>
      <p
        aria-label="The melody"
        className="text-xl font-medium tabular-nums text-content"
      >
        {question.degrees.map(degreeLabel).join(' · ')}
      </p>
      <button
        type="button"
        onClick={onNext}
        className="rounded-full bg-accent px-8 py-3 text-lg font-medium active:opacity-80"
      >
        Next
      </button>
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
