import { useCallback, useEffect, useRef, useState } from 'react'
import { piano } from '../audio'

/**
 * The pause between questions, and everything that can interrupt it.
 *
 * Every exercise screen answers a question, waits a beat on the green button,
 * and then replaces it. Two things made that a source of stray audio, and both
 * come from the same place: **the timer kept running whatever the screen was
 * doing, and a new question plays itself.**
 *
 * ## A chord from behind the Customize sheet
 *
 * Answer a question and open the menu within the second or so before the next
 * one is due, and the timer fires anyway: a question is built, the effect that
 * plays a new round sounds it, and a chord arrives out of nowhere while the
 * user is reading their settings. It is a narrow window, which is why it
 * presented as random rather than as something the user was doing.
 *
 * So opening the menu holds the exercise still. The pending advance is
 * cancelled and remembered, and taken up again when the sheet closes — because
 * the question underneath has already been answered and locked, so simply
 * dropping the advance would strand the user on a grid that does nothing.
 *
 * **Not resumed if the question is gone.** Changing a setting clears the round
 * on purpose, to send the user back to Start; resuming over the top of that
 * would put them straight into a question they did not ask for.
 *
 * ## Why the timer, and not the effect that plays
 *
 * Gating the audio instead would leave the question itself being built and
 * swapped in behind the sheet — silently, so the user returns to a different
 * question than the one they left. The advance is the thing that should not be
 * happening, so the advance is what stops.
 *
 * `piano.stop()` on the way in for the same reason: a chord still ringing when
 * the sheet opens is the exercise talking over the screen the user just asked
 * for.
 */
export function useAutoAdvance(
  nextQuestion: () => void,
  /**
   * Whether there is still a question to come back to.
   *
   * Read when the menu closes, so a settings change that cleared the round
   * leaves the user at Start rather than resuming into a new question.
   */
  hasQuestion: boolean,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** An advance that was cancelled by the menu and is owed to the user. */
  const due = useRef(false)
  const [menuOpen, setMenuOpen] = useState(false)

  /** Cancels a pending advance, reporting whether there was one. */
  const cancelAdvance = useCallback(() => {
    if (!timer.current) return false
    clearTimeout(timer.current)
    timer.current = null
    return true
  }, [])

  /**
   * Memoised, and it has to be.
   *
   * Melody and Progressions judge inside an effect and list what that effect
   * calls in its dependencies. A function rebuilt every render is a changed
   * dependency every render, so the effect that judges would re-run itself
   * continuously — the same shape as the settings-object bug in `Chords.tsx`.
   * Its identity now changes exactly when `nextQuestion` does, which is what
   * those dependency arrays were tracking before this hook existed.
   */
  const advanceAfter = useCallback(
    (ms: number) => {
      cancelAdvance()
      timer.current = setTimeout(() => {
        timer.current = null
        nextQuestion()
      }, ms)
    },
    [cancelAdvance, nextQuestion],
  )

  const openMenu = () => {
    due.current = cancelAdvance()
    piano.stop()
    setMenuOpen(true)
  }

  const closeMenu = () => {
    setMenuOpen(false)
    if (!due.current) return
    due.current = false
    if (hasQuestion) nextQuestion()
  }

  /**
   * Close without taking the advance up again — for a close that goes
   * somewhere else.
   *
   * Resuming is right when the sheet closes back onto the exercise, and wrong
   * when it closes *because* the user chose to leave: starting a drill
   * navigates, so the question the resume builds is thrown away by the
   * navigation a moment later and the only trace of it is a chord played at
   * someone who has already left the screen. Which is precisely the "a random
   * chord played when I picked a drill" report.
   *
   * The pending advance is dropped rather than kept, because whatever the user
   * is going to is bringing its own question.
   */
  const dismissMenu = () => {
    due.current = false
    setMenuOpen(false)
  }

  useEffect(
    () => () => {
      cancelAdvance()
      piano.stop()
    },
    [cancelAdvance],
  )

  return {
    menuOpen,
    openMenu,
    closeMenu,
    dismissMenu,
    advanceAfter,
    cancelAdvance,
  }
}
