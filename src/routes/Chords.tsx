import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  AnswerGrid,
  ExerciseHeader,
  ModalSheet,
  ReplayButton,
  SilentSwitchHint,
} from '../components'
import { ChordSettingsMenu } from '../customize'
import { piano, scheduleDurationMs } from '../audio'
import {
  chordScoreStore,
  chordSettingsStore,
  recordGuess,
  usePersisted,
} from '../settings'
import {
  buildChordCells,
  canGenerateChord,
  generateChordQuestion,
  groupsForChordPreview,
  groupsForChordQuestion,
  isChordCorrect,
  type ChordQuestion,
} from '../exercises'

/** Minimum pause on the green button before the next question starts. */
const AUTO_ADVANCE_MS = 800

/** Silence left after a confirming chord finishes, before the next question. */
const ADVANCE_GAP_MS = 250

interface Round {
  number: number
  question: ChordQuestion
}

export default function Chords() {
  const navigate = useNavigate()
  const [settings] = usePersisted(chordSettingsStore)
  const [score, setScore, resetScore] = usePersisted(chordScoreStore)

  const [round, setRound] = useState<Round | null>(null)
  const [wrong, setWrong] = useState<string[]>([])
  const [solvedId, setSolvedId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const replayRef = useRef<HTMLButtonElement>(null)

  const playable = canGenerateChord(settings)

  const nextQuestion = useCallback(() => {
    setWrong([])
    setSolvedId(null)
    setRound((current) => ({
      number: (current?.number ?? 0) + 1,
      question: generateChordQuestion(settings),
    }))
  }, [settings])

  useEffect(() => {
    if (!round) return
    void piano.play(groupsForChordQuestion(round.question, settings.chords))
  }, [round, settings.chords])

  useEffect(() => {
    setRound(null)
    setWrong([])
    setSolvedId(null)
  }, [settings])

  // Park focus on Replay for every new question, so a keyboard user can
  // press space to hear it again rather than activating whichever answer
  // button they last pressed.
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

  const handleAnswer = (chordId: string) => {
    if (!round) return

    // Always sound the chord that was pressed, built on the question's own
    // root. A wrong guess then becomes a direct comparison against the target
    // rather than just a red button.
    const groups = groupsForChordPreview(round.question, chordId)
    if (groups) void piano.play(groups)

    // Pressing an answer that has already been given — or any answer once the
    // question is solved — replays its sound without scoring again.
    if (solvedId || wrong.includes(chordId)) return

    // A question where several enabled chords share the same notes plays a
    // root reference tone first (see groupsForChordQuestion), so exactly one
    // chord is correct even then: the one that was actually generated.
    const correct = isChordCorrect(round.question, chordId)
    setScore(recordGuess(score, correct))

    if (!correct) {
      setWrong((current) => [...current, chordId])
      return
    }

    setSolvedId(chordId)
    // Let the confirming chord finish before the next question interrupts it.
    const settle = groups
      ? Math.max(AUTO_ADVANCE_MS, scheduleDurationMs(groups) + ADVANCE_GAP_MS)
      : AUTO_ADVANCE_MS
    advanceTimer.current = setTimeout(nextQuestion, settle)
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
            cells={buildChordCells(settings.chords, wrong, solvedId)}
            onAnswer={handleAnswer}
          />
        </>
      ) : (
        <StartPanel playable={playable} onStart={nextQuestion} />
      )}

      <ModalSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Menu"
      >
        <ChordSettingsMenu
          store={chordSettingsStore}
          onResetScore={() => {
            resetScore()
            setMenuOpen(false)
          }}
        />
      </ModalSheet>
    </main>
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
