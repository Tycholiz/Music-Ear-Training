import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  ExerciseHeader,
  ModalSheet,
  ReplayButton,
  SilentSwitchHint,
} from '../components'
import { ChordSettingsMenu, InputModeRow } from '../customize'
import { piano, scheduleDurationMs } from '../audio'
import { microphone } from '../pitch'
import { UNAMBIGUOUS_ROOT_CHORDS, chordById } from '../theory'
import {
  recordGuess,
  rootInputModeStore,
  rootScoreStore,
  rootSettingsStore,
  usePersisted,
} from '../settings'
import {
  canGenerateChord,
  generateRootQuestion,
  groupsForRootQuestion,
  matchesRoot,
  rootAnswer,
  type RootQuestion,
} from '../exercises'

/** Pause on the graded answer before the next question starts. */
const AUTO_ADVANCE_MS = 800

/** How long a wrong-answer cross stays up before the chord is played again. */
const WRONG_FEEDBACK_MS = 900

/** Silence between the chord ending and the microphone being trusted again. */
const LISTEN_GAP_MS = 150

interface Round {
  number: number
  question: RootQuestion
}

/**
 * Chord root recognition, in two modes.
 *
 * **Reveal** is self-graded: a chord sounds, the user works out its root, and
 * Reveal plays that root alone so they can check themselves. There is no way to
 * know what they were thinking and no reason to doubt them.
 *
 * **Microphone** listens instead — the user hums the root or plays it. A right
 * answer advances; a wrong one shows a cross and replays the chord so they can
 * try again against a fresh hearing of it.
 *
 * Either way only the *first* attempt at a question is scored. Humming is
 * imprecise, and a singer who knows the answer may still fumble the pitch
 * several times getting to it; charging them for each miss would measure their
 * voice rather than their ear.
 */
export default function ChordRoot() {
  const navigate = useNavigate()
  const [settings] = usePersisted(rootSettingsStore)
  const [inputMode] = usePersisted(rootInputModeStore)
  const [score, setScore, resetScore] = usePersisted(rootScoreStore)

  const [round, setRound] = useState<Round | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  /**
   * The microphone is only trusted between chords. While one is sounding it
   * would otherwise hear the piano and answer the question itself.
   */
  const [listening, setListening] = useState(false)

  /**
   * Whether this question has already gone into the score. A ref rather than
   * state: nothing renders from it, and the microphone callback needs to read
   * it without waiting for a re-render.
   */
  const scored = useRef(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listenTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const replayRef = useRef<HTMLButtonElement>(null)

  const usingMicrophone = inputMode === 'microphone'
  const playable = canGenerateChord(settings)

  /** Play the chord, and hold the microphone off until it has finished. */
  const playChord = useCallback((question: RootQuestion) => {
    const groups = groupsForRootQuestion(question)
    void piano.play(groups)

    setListening(false)
    if (listenTimer.current) clearTimeout(listenTimer.current)
    listenTimer.current = setTimeout(
      () => setListening(true),
      scheduleDurationMs(groups) + LISTEN_GAP_MS,
    )
  }, [])

  const nextQuestion = useCallback(() => {
    setRevealed(false)
    scored.current = false
    setFeedback(null)
    setRound((current) => ({
      number: (current?.number ?? 0) + 1,
      question: generateRootQuestion(settings),
    }))
  }, [settings])

  useEffect(() => {
    if (!round) return
    playChord(round.question)
  }, [round, playChord])

  // Changing what is asked, or how it is answered, invalidates the question —
  // and sends the user back through Start, which is the gesture the microphone
  // needs in order to open.
  useEffect(() => {
    setRound(null)
    setRevealed(false)
    setListening(false)
  }, [settings, inputMode])

  useEffect(() => {
    if (!round) return
    replayRef.current?.focus()
  }, [round])

  // Close the microphone the moment it stops being needed, rather than waiting
  // for the screen to unmount. Switching to Reveal mode or changing the
  // settings drops the round, and leaving the recording indicator lit — and the
  // audio session in a recording category — through either would be wrong.
  useEffect(() => {
    if (usingMicrophone && round) return
    microphone.stop()
  }, [usingMicrophone, round])

  useEffect(
    () => () => {
      for (const timer of [advanceTimer, listenTimer, feedbackTimer]) {
        if (timer.current) clearTimeout(timer.current)
      }
      piano.stop()
      microphone.stop()
    },
    [],
  )

  /** Record the first attempt at a question and nothing after it. */
  const scoreOnce = useCallback(
    (correct: boolean) => {
      if (scored.current) return
      scored.current = true
      setScore(recordGuess(score, correct))
    },
    [score, setScore],
  )

  const advance = useCallback(() => {
    advanceTimer.current = setTimeout(nextQuestion, AUTO_ADVANCE_MS)
  }, [nextQuestion])

  // --- microphone ----------------------------------------------------------

  useEffect(() => {
    if (!usingMicrophone || !round) return

    return microphone.onPitch((heard) => {
      // Anything picked up while the chord is sounding is the chord.
      if (!listening) return

      if (matchesRoot(heard, round.question)) {
        scoreOnce(true)
        setFeedback('correct')
        setListening(false)
        advance()
        return
      }

      scoreOnce(false)
      setFeedback('wrong')
      setListening(false)
      // Let the cross land, then give them the chord again to work from.
      feedbackTimer.current = setTimeout(() => {
        setFeedback(null)
        playChord(round.question)
      }, WRONG_FEEDBACK_MS)
    })
  }, [usingMicrophone, round, listening, scoreOnce, advance, playChord])

  const handleStart = async () => {
    // start() has to happen inside the tap: browsers refuse the permission
    // prompt otherwise, and iOS will not open an audio context without one.
    if (usingMicrophone) await microphone.start()
    nextQuestion()
  }

  const reveal = () => {
    if (!round) return
    // The root alone, at the pitch it sounds at in this voicing. Repeatable:
    // hearing it once is often not enough to be sure either way.
    void piano.play([[rootAnswer(round.question)]])
    setRevealed(true)
    // In microphone mode, being told the answer is a miss — they did not
    // identify it themselves.
    if (usingMicrophone) scoreOnce(false)
  }

  const grade = (correct: boolean) => {
    if (!round || !revealed) return
    scoreOnce(correct)
    advance()
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
          <div className="flex flex-col items-center gap-1 py-1">
            <ReplayButton
              ref={replayRef}
              onClick={() => playChord(round.question)}
            />
            {/*
              The chord's quality is given away deliberately. The question here
              is which note is the root, not what the chord is, and knowing you
              are listening to a diminished 7th rather than a major triad is the
              context a musician would have anyway.
            */}
            <p className="text-sm text-content-muted">
              {chordById(round.question.chordId).name}
            </p>
          </div>
          <SilentSwitchHint />

          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
            {usingMicrophone ? (
              <MicrophonePanel
                listening={listening}
                feedback={feedback}
                onReveal={reveal}
              />
            ) : (
              <RevealPanel
                revealed={revealed}
                onReveal={reveal}
                onGrade={grade}
              />
            )}
          </div>
        </>
      ) : (
        <StartPanel playable={playable} onStart={() => void handleStart()} />
      )}

      <ModalSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Menu"
      >
        <ChordSettingsMenu
          store={rootSettingsStore}
          availableChords={UNAMBIGUOUS_ROOT_CHORDS}
          extraRows={<InputModeRow />}
          onResetScore={() => {
            resetScore()
            setMenuOpen(false)
          }}
        />
      </ModalSheet>
    </main>
  )
}

function RevealPanel({
  revealed,
  onReveal,
  onGrade,
}: {
  revealed: boolean
  onReveal: () => void
  onGrade: (correct: boolean) => void
}) {
  return (
    <>
      <RevealButton
        onClick={onReveal}
        className="px-8 py-3 text-lg font-medium"
      />

      {revealed ? (
        <>
          <p className="text-center text-sm text-content-muted">
            Was that the note you had in mind?
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onGrade(true)}
              className="rounded-full bg-correct px-8 py-3 font-medium text-black active:opacity-80"
            >
              Correct
            </button>
            <button
              type="button"
              onClick={() => onGrade(false)}
              className="rounded-full bg-incorrect px-8 py-3 font-medium text-white active:opacity-80"
            >
              Wrong
            </button>
          </div>
        </>
      ) : (
        <p className="text-center text-sm text-content-muted">
          Work out the root, then reveal it to check yourself.
        </p>
      )}
    </>
  )
}

function MicrophonePanel({
  listening,
  feedback,
  onReveal,
}: {
  listening: boolean
  feedback: 'correct' | 'wrong' | null
  onReveal: () => void
}) {
  return (
    <>
      <div
        role="status"
        aria-label={
          feedback === 'correct'
            ? 'Correct'
            : feedback === 'wrong'
              ? 'Not the root'
              : listening
                ? 'Listening'
                : 'Playing'
        }
        className={`flex h-28 w-28 items-center justify-center rounded-full text-5xl transition-colors ${
          feedback === 'correct'
            ? 'bg-correct text-black'
            : feedback === 'wrong'
              ? 'bg-incorrect text-white'
              : listening
                ? 'bg-surface-raised text-accent'
                : 'bg-surface text-content-muted'
        }`}
      >
        {feedback === 'correct' ? '✓' : feedback === 'wrong' ? '✕' : '♪'}
      </div>

      <p className="text-center text-sm text-content-muted">
        {feedback === 'wrong'
          ? 'Not the root — listen again.'
          : listening
            ? 'Hum or play the root.'
            : 'Listen…'}
      </p>

      <RevealButton onClick={onReveal} className="px-6 py-2 text-sm" />
    </>
  )
}

/**
 * Reveal, with a play icon on it.
 *
 * Reveal is not a disclosure — it *plays* the root, and can be pressed again to
 * hear it again. Without the icon it reads like it will print the answer on
 * screen, which is the one thing it doesn't do.
 */
function RevealButton({
  onClick,
  className,
}: {
  onClick: () => void
  className: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full bg-surface active:bg-surface-raised ${className}`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0"
        fill="currentColor"
      >
        <path d="M8 5.5v13l11-6.5-11-6.5z" />
      </svg>
      Reveal
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
        Listen, then work out the root of the chord.
      </p>
    </div>
  )
}
