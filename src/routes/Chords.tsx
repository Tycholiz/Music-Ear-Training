import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  AnswerGrid,
  ExerciseHeader,
  ListCard,
  ListRow,
  ModalSheet,
} from '../components'
import { piano } from '../audio'
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
  groupsForChordQuestion,
  isChordCorrect,
  type ChordQuestion,
} from '../exercises'

/** Pause on the green button before the next question starts. */
const AUTO_ADVANCE_MS = 800

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

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
      piano.stop()
    },
    [],
  )

  const handleAnswer = (chordId: string) => {
    if (!round || solvedId) return

    // Several enabled chords can be indistinguishable by ear; any of them
    // counts. The pressed button is the one that turns green.
    const correct = isChordCorrect(round.question, chordId, settings.chords)
    setScore(recordGuess(score, correct))

    if (!correct) {
      setWrong((current) => [...current, chordId])
      return
    }

    setSolvedId(chordId)
    advanceTimer.current = setTimeout(nextQuestion, AUTO_ADVANCE_MS)
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
              onClick={() =>
                void piano.play(
                  groupsForChordQuestion(round.question, settings.chords),
                )
              }
            />
          </div>
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

function ReplayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Play again"
      className="flex h-11 w-11 items-center justify-center rounded-full bg-surface active:bg-surface-raised"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
        <path d="M16.5 8.5a5 5 0 010 7" />
        <path d="M19 6a8.5 8.5 0 010 12" />
      </svg>
    </button>
  )
}
