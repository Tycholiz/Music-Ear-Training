import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  ExerciseHeader,
  ModalSheet,
  NumeralPad,
  ReplayButton,
  SilentSwitchHint,
  type Flash,
} from '../components'
import { ProgressionSettingsMenu } from '../customize'
import { buildProgressionSchedule, piano } from '../audio'
import { numeralById, numeralsByDifficulty } from '../theory'
import {
  progressionScoreStore,
  progressionSettingsStore,
  itemId,
  progressionStatsStore,
  recordInStore,
  recordGuess,
  usePersisted,
} from '../settings'
import {
  canGenerateProgression,
  generateProgressionQuestion,
  BASS_AS_ROOT,
  bassMovement,
  inversionOf,
  isBassMistakenForRoot,
  isCadenceChord,
  rootMovement,
  keyChord,
  voiceGuess,
  voiceProgression,
  type ProgressionQuestion,
} from '../exercises'

/** Pause on a finished progression before the next one starts. */
const AUTO_ADVANCE_MS = 1200

/** How long a press stays lit. Long enough to see, short enough not to wait. */
const FLASH_MS = 260

/** How long the wrong chord stays red before the answer is cleared to retry. */
const WRONG_FEEDBACK_MS = 800

/**
 * Where a question is up to.
 *
 * `wrong` is a held moment rather than an end state: the chord that broke the
 * run stays red long enough to be read, then the answer clears and the same
 * progression is tried again. `revealed` is the end state retrying lacks.
 */
type Phase = 'entering' | 'wrong' | 'correct' | 'revealed'

interface Round {
  number: number
  question: ProgressionQuestion
}

/**
 * Chord progression recognition: hear a progression, name its chords.
 *
 * The answer is roman numerals, so what is being trained is hearing chords by
 * *function* rather than by name — that a chord is the dominant of where you
 * are, not that it is a G major. Which is why the key is randomised and a Key
 * button is always to hand: the exercise is about relationships, and being
 * given the tonic costs nothing it was asking for.
 *
 * A wrong chord ends the attempt rather than the question. The answer clears
 * and the same progression can be tried again, because hearing it a second time
 * knowing where you went wrong is the practice — and only the first mistake is
 * charged, so a user who knows the progression but mis-taps is not billed for
 * the tap.
 */
export default function Progressions() {
  const navigate = useNavigate()
  const [settings] = usePersisted(progressionSettingsStore)
  const [score, setScore, resetScore] = usePersisted(progressionScoreStore)

  const [round, setRound] = useState<Round | null>(null)
  const [entered, setEntered] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('entering')
  const [flash, setFlash] = useState<Flash | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  /** Whether this progression has already gone into the score. */
  const graded = useRef(false)
  /**
   * How many chords are in, readable without waiting for a render.
   *
   * A press has to know which position it is answering *during* the press, to
   * judge it and to sound it. Two presses inside one React batch would both
   * read the length this render was built with, so the second would be graded
   * against the first one's position. Kept in step by an effect below.
   */
  const position = useRef(0)
  /**
   * The furthest position this progression has ever been answered at.
   *
   * Statistics are recorded once per position, the first time it is reached,
   * so a retry re-covering ground already measured adds nothing and a position
   * beyond the previous failure is still counted. Reset with the question.
   */
  const furthestReached = useRef(0)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const replayRef = useRef<HTMLButtonElement>(null)

  const playable = canGenerateProgression(settings)
  const available = numeralsByDifficulty().filter((numeral) =>
    settings.numerals.includes(numeral.id),
  )

  const playProgression = useCallback(
    (question: ProgressionQuestion) => {
      void piano.playSchedule(
        buildProgressionSchedule(voiceProgression(question, settings)),
      )
    },
    [settings],
  )

  /**
   * Play one chord of the progression on its own.
   *
   * The step between hearing chords and hearing chords *in a progression*: a
   * user who catches the first two and loses the third can pick that one out
   * rather than replaying the whole thing and trying to catch it going past.
   *
   * Taken from `voiceProgression`, not voiced standalone. The register and
   * inversion are part of what the user is matching against their memory of
   * the playback, and a chord placed centre-range instead would be a different
   * arrangement of the same harmony — the mistake logged three times in the
   * README under "Sound feedback follows the position, not the note".
   *
   * `play` rather than `strike`: slots get tapped in quick succession, and
   * struck chords ring for seconds and pile up under each other.
   */
  const playChordAt = useCallback(
    (question: ProgressionQuestion, index: number) => {
      void piano.play([voiceProgression(question, settings)[index]])
    },
    [settings],
  )

  const nextQuestion = useCallback(() => {
    setEntered([])
    setPhase('entering')
    setFlash(null)
    graded.current = false
    furthestReached.current = 0
    setRound((current) => ({
      number: (current?.number ?? 0) + 1,
      question: generateProgressionQuestion(settings),
    }))
  }, [settings])

  useEffect(() => {
    if (!round) return
    playProgression(round.question)
  }, [round, playProgression])

  // Changing what is asked invalidates the question in progress.
  useEffect(() => {
    setRound(null)
    setEntered([])
    setPhase('entering')
    setFlash(null)
    graded.current = false
    furthestReached.current = 0
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
      for (const timer of [advanceTimer, feedbackTimer, flashTimer]) {
        if (timer.current) clearTimeout(timer.current)
      }
      piano.stop()
    },
    [],
  )

  /** Record the first attempt at a progression and nothing after it. */
  const scoreOnce = useCallback(
    (correct: boolean) => {
      if (graded.current) return
      graded.current = true
      setScore(recordGuess(score, correct))
    },
    [score, setScore],
  )

  const lightUp = (numeralId: string, correct: boolean) => {
    setFlash({ numeralId, correct })
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS)
  }

  /**
   * Judge a pressed chord, and sound it.
   *
   * Judged here rather than in an effect, unlike the melody screen: what makes
   * a press right depends only on the position it lands in, which the ref
   * already knows, so there is nothing to wait for a render to find out.
   */
  const press = (numeralId: string) => {
    if (!round || phase !== 'entering') return

    const index = position.current
    if (index >= round.question.numerals.length) return

    // Sound what was pressed, voiced as the chord at this position would have
    // been. Naming a chord and never hearing it makes this a guessing game with
    // a keypad; hearing it turns a wrong answer into information — that was the
    // subdominant, and the progression was not.
    void piano.play([voiceGuess(round.question, index, numeralId, settings)])

    const wasRight = numeralId === round.question.numerals[index]

    // Each position is measured the first time it is *reached*, whichever
    // attempt that happens on — not on the first attempt only.
    //
    // A wrong press ends the attempt, so recording only the first run meant
    // position four existed in the record solely for progressions where one
    // to three had already gone right. Every figure downstream inherited that:
    // the cadence chords sit at the end, so `I`, `vi` and `V` were measured
    // almost exclusively on progressions the user was already getting right,
    // and read as mastery when they were mostly selection.
    //
    // Reaching a position on a retry is still fresh evidence about *that*
    // chord — the user has been told the ones before it, not this one — and a
    // position already recorded is skipped however often it comes round again.
    if (index >= furthestReached.current) {
      furthestReached.current = index + 1
      const voiced = voiceProgression(round.question, settings)
      const heardBassAsRoot =
        !wasRight &&
        isBassMistakenForRoot(round.question, index, numeralId, voiced)

      recordInStore(progressionStatsStore, [
        {
          item: itemId('numeral', round.question.numerals[index]),
          correct: wasRight,
          // Two failures wear the same name and want different practice.
          // Answering `vi` for `V` is a misjudged *function*. Answering `III`
          // for an inverted `I` is not — the bass was E, and the ear took it
          // for the root. Reporting both as "mistaken for III" is true and
          // tells the user nothing about which mistake they made.
          answered: heardBassAsRoot ? BASS_AS_ROOT : numeralId,
        },
        // Which chord opens a progression is a different skill from how the
        // harmony moves: there is nothing before it, so it has to be heard by
        // its function against the key rather than by a distance travelled.
        // Every later chord can lean on the one before it as a landmark.
        ...(index === 0
          ? [
              {
                item: itemId('opening', round.question.numerals[index]),
                correct: wasRight,
              },
            ]
          : [
              {
                item: itemId(
                  'movement',
                  `root-${rootMovement(round.question, index)}`,
                ),
                correct: wasRight,
              },
              {
                item: itemId('movement', `bass-${bassMovement(voiced, index)}`),
                correct: wasRight,
              },
            ]),
        {
          item: itemId(
            'inversion',
            inversionOf(
              round.question.numerals[index],
              round.question.tonic,
              voiced[index],
            ),
          ),
          correct: wasRight,
        },
        // Only the chords the cadence is actually made of. Averaging every
        // press in the progression made this a figure about the run-up: nail
        // four chords, miss the deceptive `vi`, and it read 80% for a cadence
        // that was not heard at all.
        ...(isCadenceChord(round.question, index)
          ? [
              {
                item: itemId('cadence', round.question.cadence),
                correct: wasRight,
              },
            ]
          : []),
      ])
    }

    if (numeralId !== round.question.numerals[index]) {
      lightUp(numeralId, false)
      scoreOnce(false)
      setPhase('wrong')
      feedbackTimer.current = setTimeout(() => {
        setEntered([])
        setPhase('entering')
      }, WRONG_FEEDBACK_MS)
      return
    }

    lightUp(numeralId, true)
    position.current = index + 1
    const complete = index + 1 === round.question.numerals.length
    setEntered((current) =>
      current.length > index ? current : [...current, numeralId],
    )

    if (complete) {
      scoreOnce(true)
      setPhase('correct')
      advanceTimer.current = setTimeout(nextQuestion, AUTO_ADVANCE_MS)
    }
  }

  /**
   * Give up on this progression and be told what it was.
   *
   * A wrong chord ends the attempt rather than the question, which is right for
   * a user who is close and wrong for one who is stuck: without this they retry
   * the same progression indefinitely. It costs the question, on the same
   * reasoning as every other exercise — being told the answer is not
   * identifying it — and `scoreOnce` makes that come out right whether or not
   * they had already missed.
   */
  const reveal = () => {
    if (!round || phase === 'correct' || phase === 'revealed') return
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFlash(null)
    scoreOnce(false)
    setPhase('revealed')
  }

  const answered = phase === 'revealed' ? round?.question.numerals : entered

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
              onClick={() => playProgression(round.question)}
            />
            <button
              type="button"
              onClick={() =>
                void piano.strike(keyChord(round.question, settings))
              }
              aria-label="Play the key"
              className="rounded-full bg-surface px-4 py-2.5 text-sm font-medium active:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Key
            </button>
          </div>

          <Answer
            answered={answered ?? []}
            length={round.question.numerals.length}
            revealed={phase === 'revealed'}
            onPlay={(index) => playChordAt(round.question, index)}
          />
          <SilentSwitchHint />

          <div className="flex min-h-0 flex-1 items-center justify-center px-4">
            {phase === 'wrong' ? (
              <p className="text-sm text-content-muted">
                Not that one — listen again.
              </p>
            ) : phase === 'revealed' ? (
              <p className="text-sm text-content-muted">
                That was the progression.
              </p>
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
              <NumeralPad
                numerals={available}
                flash={flash}
                onPress={press}
                disabled={phase !== 'entering'}
              />
              <div className="flex justify-center pt-2">
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
        <ProgressionSettingsMenu
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
 * The progression as it is named, one slot per chord.
 *
 * The empty slots say how many chords are still to come, which the user would
 * otherwise have to count off the playback while also trying to identify it.
 *
 * Correctness is not coloured here: a wrong chord never survives long enough to
 * appear, so everything in the row is right by construction, and the button
 * that flashed has already said so. A revealed progression is marked as given
 * rather than found, because it was.
 *
 * ## Every slot plays its own chord
 *
 * Replay plays the whole progression and the Key button plays the tonic, so a
 * user who can hear the first two chords and loses the third has nothing
 * between "all of it" and "none of it" — their only option is to play the
 * whole thing again and try to catch that one going past. Tapping a slot picks
 * it out.
 *
 * Deliberately available before that position has been answered, since that is
 * the entire point: it is a scaffold for working up to hearing a progression
 * whole. It costs no score either. It sounds a chord without naming it, so the
 * user still has to identify what they heard — there is nothing to charge for.
 *
 * The slots only sound; the pad is what answers. Nothing here can grade, so a
 * tap cannot fall through into an attempt, and this stays live in every phase
 * — including `revealed`, where the slots hold the answer and hearing it named
 * and played together is the lesson.
 */
function Answer({
  answered,
  length,
  revealed,
  onPlay,
}: {
  answered: readonly string[]
  length: number
  revealed: boolean
  onPlay: (index: number) => void
}) {
  return (
    <div
      aria-label="Your answer"
      className="flex flex-wrap items-center justify-center gap-2 px-4 pt-2 text-xl font-medium tabular-nums"
    >
      {Array.from({ length }, (_, i) => {
        const id = answered[i]

        return (
          <button
            key={i}
            type="button"
            onClick={() => onPlay(i)}
            // `·` is not an accessible name, and neither is a numeral on its
            // own once the row is pressable: what the control does is play,
            // and which one it is is the position rather than the label.
            aria-label={`Play chord ${i + 1}`}
            className={`flex h-10 min-w-12 items-center justify-center rounded-lg px-2 active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              id === undefined
                ? 'bg-surface/40 text-content-muted'
                : revealed
                  ? 'bg-surface-raised text-content'
                  : 'bg-surface text-content'
            }`}
          >
            {id === undefined ? '·' : numeralById(id).label}
          </button>
        )
      })}
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
        No progression can be played with the current settings. Enable more
        chords, or a cadence whose chords are switched on.
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
        Listen, then name the chords of the progression in order.
      </p>
    </div>
  )
}
