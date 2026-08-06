/**
 * What each exercise is for, in the user's words rather than the code's.
 *
 * A manual, reachable from the menu. Everything here is something a user would
 * otherwise have to work out by playing — what the exercise is asking, what
 * skill it is building, and the handful of behaviours that are deliberate and
 * look like bugs until you know why they are there.
 *
 * ## What is *not* here
 *
 * Anything the statistics screen already knows about itself. The About screen
 * lists what each exercise tracks by reading its `StatsView`, so adding a
 * breakdown updates the manual and a title can never describe a section that no
 * longer exists. Prose repeating those titles would go stale the first time one
 * changed, and nothing would fail.
 */

export interface ExerciseAbout {
  /** What sounds, and what the user does about it. */
  question: string
  /**
   * The skill being built, and why it is worth having.
   *
   * The part that answers "why am I doing this", which every one of these
   * exercises has an answer to and none of them says on screen.
   */
  trains: readonly string[]
  /** How to actually work it: the buttons, and what they are for. */
  working: readonly string[]
  /**
   * Deliberate behaviour that looks like a fault until it is explained.
   *
   * Each of these was a decision with a reason. A user meeting one without the
   * reason concludes the app is broken, which is worse than the behaviour it is
   * defending.
   */
  worthKnowing?: readonly string[]
}

export const INTERVAL_ABOUT: ExerciseAbout = {
  question:
    'Two notes sound. Name the distance between them — a Minor 3rd, a Perfect 5th, and so on.',
  trains: [
    'Intervals are the unit everything else is built from. A chord is a stack of them and a melody is a chain of them, so hearing intervals reliably is what makes the other exercises possible rather than guesswork.',
    'The reference note moves every question, so what you are learning is the *relationship* between two pitches rather than the sound of any particular pair. That is the thing that transfers.',
  ],
  working: [
    'Play again repeats the question as often as you like, and costs nothing.',
    'Pressing an answer plays it, measured from the same starting note as the question. A wrong guess is worth listening to for that reason: you hear your answer and the real one side by side, which is more use than being told you were wrong.',
    'Ascending, descending and harmonic are separate skills. Start with one, and add the others once it is comfortable rather than mixing all five from the beginning.',
  ],
  worthKnowing: [
    'The score counts every press, so three wrong guesses and then the right one is one correct out of four. The statistics only count your first press, because that is the one that says whether you knew it.',
    'There is no Unison. Two notes at the same pitch are not something anyone has to identify.',
  ],
}

export const CHORD_ABOUT: ExerciseAbout = {
  question:
    'A chord sounds. Name its quality — major, minor, dominant 7th, and so on.',
  trains: [
    'Hearing a chord as one colour rather than as separate notes. A major 7th and a dominant 7th differ by a single semitone, and telling them apart by ear is a different task from working them out on paper.',
    'The root moves every question, so you are learning the quality rather than the chord. What you gain transfers to every key.',
  ],
  working: [
    'Play again repeats the chord. Reveal gives you the answer and costs one attempt, which is there so a question you cannot get does not become a wall.',
    'Inversions and the play mode — block or arpeggiated — change how hard the same chord is to name. Both are worth leaving off until the chords themselves are solid.',
    'Start with a handful of chords rather than everything. The statistics are far more useful over eight chords you meet often than over thirty you meet rarely.',
  ],
  worthKnowing: [
    'The score counts every press, so a question can be 1 out of 4. Reveal after two wrong guesses ends it at 0 out of 3 rather than charging one for every chord you did not press.',
    'A revealed answer is marked differently from a correct one. It was given rather than found, and colouring it green would be telling you something that is not true.',
  ],
}

export const ROOT_ABOUT: ExerciseAbout = {
  question:
    'A chord sounds. Work out which note is its root, then tell the app whether you had it.',
  trains: [
    'Finding the bass of a harmony by ear, which is what lets you follow a chord chart or work out a song without being told the key.',
    'Inversions are the whole difficulty here. Finding the root of a root-position chord and finding it under a second inversion are barely the same task, and the statistics break the two apart so you can see which one is costing you.',
  ],
  working: [
    'Reveal plays the root on its own, so you can check yourself against it. Sing or hum your answer before pressing it — deciding after you have heard the answer is the one way to get nothing out of this exercise.',
    'Then say honestly whether you had it. The app cannot know what you were thinking, so the record is only worth as much as your answers to that question.',
  ],
  worthKnowing: [
    'This is the one exercise with no "often mistaken for" line. There is no wrong answer for the app to see — only your word that you had the note or did not.',
  ],
}

export const MELODY_ABOUT: ExerciseAbout = {
  question:
    'A short melody plays over a chord or drone. Enter the scale degrees you heard.',
  trains: [
    'Hearing notes by their function in a key rather than as isolated pitches — that a note is the third, not that it is an E. This is the skill behind playing by ear and behind writing down what you hear.',
    'A step and a leap are different problems, and so is the first note of a phrase, which has nothing before it to measure against. The statistics separate them because they improve at different rates.',
  ],
  working: [
    'Tonic and Chord play the key reference again whenever you lose it. Use them freely — the exercise is about hearing the melody against a key, not about remembering the key.',
    'Undo takes back the last note. Tapping a slot you have already filled plays that note back, so you can check part of a phrase without replaying all of it.',
    'Start with a short melody and one scale. Length and the scale list are both settings, and both are much harder than they look when raised together.',
  ],
  worthKnowing: [
    'Only your first attempt at a melody is scored. Getting it on the second try costs and credits nothing, so a mis-tap is not charged.',
  ],
}

export const PROGRESSION_ABOUT: ExerciseAbout = {
  question:
    'A chord progression plays. Name the chords in roman numerals, in order.',
  trains: [
    'Hearing chords by *function* — that a chord is the dominant of where you are, rather than that it is a G major. Function is what stays the same when a song is transposed, and it is what lets you hear where a progression is going.',
    'The key is randomised every question for exactly that reason. What you are learning is the relationship between the chords, not the sound of any one key.',
  ],
  working: [
    'Key plays the tonic chord whenever you need reminding where home is. Nothing is lost by using it: the exercise is about relationships, and being given the tonic gives away none of them.',
    'Tapping an answer slot plays that one chord from the progression. If you can hear the first two and lose the third, pick it out rather than replaying the whole phrase and trying to catch it going past. It costs no score.',
    'Reveal ends the question and counts as a miss. Length is a setting, and "Up to" makes it a ceiling so you have to hear where the phrase ends rather than counting empty slots.',
  ],
  worthKnowing: [
    'A wrong chord ends the attempt, not the question — the answer clears and the same progression can be tried again. Only the first mistake is charged.',
    'Inversions are heard but never answered: a first-inversion I is still I. They exist to give the progression its voice leading, and the statistics track them because they are the one thing here you cannot see going wrong from the pad alone.',
    'The first chord is measured separately from the rest. There is nothing before it, so it has to be heard against the key alone, while every later chord has the one before it as a landmark.',
  ],
}
