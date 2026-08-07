import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  ExerciseHeader,
  ModalSheet,
  ReplayButton,
  SilentSwitchHint,
} from '../components'
import { ChordSettingsMenu } from '../customize'
import { piano } from '../audio'
import { UNAMBIGUOUS_ROOT_CHORDS, chordById } from '../theory'
import {
  itemId,
  recordInStore,
  recordGuess,
  rootStatsStore,
  rootScoreStore,
  rootSettingsStore,
  usePersisted,
} from '../settings'
import {
  ROOT_STATS_VIEW,
  canGenerateChord,
  generateRootQuestion,
  groupsForRootQuestion,
  rootAnswer,
  type RootQuestion,
} from '../exercises'
import { ROOT_ABOUT } from '../about/pages'

/** Pause on the graded answer before the next question starts. */
const AUTO_ADVANCE_MS = 800

interface Round {
  number: number
  question: RootQuestion
}

/**
 * Chord root recognition, self-graded.
 *
 * A chord sounds; the user works out its root; Reveal plays that root alone so
 * they can check themselves. There is no way for the app to know what they were
 * thinking, so they report whether they had it — the exercise only works if
 * they are honest with themselves, and there is no reason to doubt them.
 *
 * Microphone mode, where the app listens instead, arrives in #42.
 */
export default function ChordRoot() {
  const navigate = useNavigate()
  const [settings] = usePersisted(rootSettingsStore)
  const [score, setScore, resetScore] = usePersisted(rootScoreStore)

  const [round, setRound] = useState<Round | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [graded, setGraded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  /**
   * Whether this question has already been graded.
   *
   * A ref as well as state, for the reason the melody and progression screens
   * keep one: two taps inside a single React batch both read the `graded` this
   * render was built with, so state alone cannot stop the second. The ref is
   * the authority; the state exists only to grey the buttons out.
   */
  const gradedRef = useRef(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const replayRef = useRef<HTMLButtonElement>(null)

  const playable = canGenerateChord(settings)

  const nextQuestion = useCallback(() => {
    setRevealed(false)
    setGraded(false)
    gradedRef.current = false
    setRound((current) => ({
      number: (current?.number ?? 0) + 1,
      question: generateRootQuestion(
        settings,
        undefined,
        rootStatsStore.read(),
      ),
    }))
  }, [settings])

  const playChord = useCallback((question: RootQuestion) => {
    void piano.play(groupsForRootQuestion(question))
  }, [])

  useEffect(() => {
    if (!round) return
    playChord(round.question)
  }, [round, playChord])

  useEffect(() => {
    setRound(null)
    setRevealed(false)
    setGraded(false)
    gradedRef.current = false
  }, [settings])

  // Park focus on Replay for every new question, so space hears the chord
  // again rather than activating whichever button was last pressed.
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

  const reveal = () => {
    if (!round) return
    // The root alone, at the pitch it sounds at in this voicing. Repeatable:
    // hearing it once is often not enough to be sure either way.
    void piano.play([[rootAnswer(round.question)]])
    setRevealed(true)
  }

  /**
   * Record the first grade of this question and nothing after it.
   *
   * The guard is not only about the score. Every grade schedules an advance,
   * and two of them land in separate timer callbacks — separate tasks, so
   * separate React commits — which meant two questions were generated and two
   * chords played a fraction of a second apart, the second cutting off the
   * first. It reads as the exercise changing its mind about what it just
   * asked, and it shows: the quality label changes with the second chord
   * whenever the two generated chords differ.
   *
   * Second taps are easy to invite here, because grading is the one press in
   * this exercise that produces no immediate sound of its own — nothing
   * happens for `AUTO_ADVANCE_MS` and the buttons sit there looking unpressed.
   * Hence the disabled state as well as the guard: the tap is refused *and*
   * seen to have landed.
   */
  const grade = (correct: boolean) => {
    if (!round || !revealed || gradedRef.current) return
    gradedRef.current = true
    setGraded(true)
    setScore(recordGuess(score, correct))

    // No `answered` here, and there cannot be one: this exercise is
    // self-graded, so what exists is the user's report that they had the note
    // or did not. There is no wrong answer to name, and inventing one — the
    // bass note, say — would put a confusion in the record that nobody made.
    //
    // Inversion is recorded because it is the whole difficulty of this
    // exercise. Finding the root of a root-position chord and finding it
    // under a 2nd inversion are barely the same task, and one accuracy figure
    // across both says nothing useful about either.
    recordInStore(rootStatsStore, [
      { item: itemId('chord', round.question.chordId), correct },
      { item: itemId('inversion', round.question.inversion), correct },
    ])
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
          <div className="flex flex-col items-center gap-1 py-1">
            <ReplayButton
              ref={replayRef}
              onClick={() => playChord(round.question)}
            />
            {/*
              The chord's quality is given away deliberately. The question here
              is which note is the root, not what the chord is, and knowing you
              are listening to a diminished 7th rather than a major triad is
              the context a musician would have anyway.
            */}
            <p className="text-sm text-content-muted">
              {chordById(round.question.chordId).name}
            </p>
          </div>
          <SilentSwitchHint />

          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
            <RevealButton
              onClick={reveal}
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
                    onClick={() => grade(true)}
                    disabled={graded}
                    className="rounded-full bg-correct px-8 py-3 font-medium text-black active:opacity-80 disabled:opacity-40"
                  >
                    Correct
                  </button>
                  <button
                    type="button"
                    onClick={() => grade(false)}
                    disabled={graded}
                    className="rounded-full bg-incorrect px-8 py-3 font-medium text-white active:opacity-80 disabled:opacity-40"
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
          </div>
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
          store={rootSettingsStore}
          statsStore={rootStatsStore}
          statsView={ROOT_STATS_VIEW}
          about={ROOT_ABOUT}
          availableChords={UNAMBIGUOUS_ROOT_CHORDS}
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
 * Reveal, with a play icon on it.
 *
 * Reveal is not a disclosure — it *plays* the root, and can be pressed again
 * to hear it again. Without the icon it reads like it will print the answer
 * on screen, which is the one thing it doesn't do.
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
