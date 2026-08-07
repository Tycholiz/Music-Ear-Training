import type { AboutContent } from '../components'

/**
 * Every word of written guidance in the app, in one file.
 *
 * Each page is a plain list of headings and paragraphs. Nothing is generated,
 * nothing is shared between pages, and nothing here reads any other part of the
 * app — so any page can be rewritten on its own without knowing what else it
 * touches.
 *
 * `*asterisks*` make italics. That is the only markup.
 */

/**
 * The general page, reached from the bottom of the home screen.
 *
 * Anything true of the whole app lives here rather than being repeated on five
 * exercise pages, which is also what keeps those pages short enough to read.
 */
export const HOW_TO_USE_THIS_APP: AboutContent = [
  {
    title: 'What this app is for',
    paragraphs: [
      'Ear training really happens with real music — working songs out, playing along with records, transcribing solos. That is messy and slow, and it is also the only thing that actually makes you better.',
      'This app is not a replacement for that. It is a supplement. What it does is take one element at a time and strip everything else away, so you can drill the bit you are weak at without the rest of the music going on around it.',
      'Use it to sharpen the pieces, then go back to real music and put them together.',
    ],
  },
  {
    title: 'Use an instrument if you can',
    paragraphs: [
      'Whenever you can, play what you hear. In Melody Dictation, do not just enter the degrees and move on — pick up the guitar, or sit at the piano, and play the melody back until you can get through it without a mistake.',
      'Knowing that what you heard was a fifth is one thing. Knowing what a fifth *feels* like under your fingers is another, and it is the one that lets you play what you hear without stopping to think about it.',
      'If you cannot have an instrument in front of you, visualise it instead. Picture the shape your hand would make, where the fingers would go. It is not as good as playing it, but it is far better than nothing.',
      'None of this is required. The app works perfectly well on its own — the instrument just makes what you learn here stick harder.',
    ],
  },
  {
    title: 'How the statistics work',
    paragraphs: [
      'Every exercise keeps a record of what you get right and wrong, and sorts it into three buckets: *needs work*, *getting there* and *solid*. The exercise also asks you more often about whatever is in *needs work*, so the practice follows the record without you having to do anything.',
      'Nothing gets a percentage until you have answered it five times recently. Two right out of three is not 67%, and a number you might act on should not be built on three attempts.',
      'Everything is measured over your last twenty attempts at each item rather than your whole history. Improvement shows up within a session or two, and something you used to get wrong stops being mentioned once you have stopped getting it wrong.',
      'The most useful lines are the "often mistaken for" ones. Being told you are at 41% tells you to practise, which you already knew. Being told you keep hearing it as a minor triad tells you what to listen for.',
      'Swipe any row left to reset just that one — for when you have cracked something and would rather the record started fresh than waited to catch up.',
    ],
  },
]

export const INTERVAL_ABOUT: AboutContent = [
  {
    title: 'What it asks',
    paragraphs: [
      'You will hear two notes, one after the other — or both at once depending on your *Play Mode*. Name the interval between them: a minor 3rd, a perfect 5th, and so on.',
    ],
  },
  {
    title: 'What it trains',
    paragraphs: [
      'Being able to hear the distance between two notes forms the basis of what lets you pick up melodies by ear.',
      'Say a tune opens with a big leap. If you hear that leap as a perfect 5th, and you know where a perfect 5th sits under your fingers, you can play it immediately. Without that you are hunting around for the note and hoping.',
      'Furthermore, everything else is built out of intervals. A chord is a stack of them; a melody is a chain of them.',
    ],
  },
  {
    title: 'Working it',
    paragraphs: [
      '*Play again* repeats the question as often as you like, and costs nothing.',
      'Pressing an answer plays it, from the same starting note as the question. That makes a wrong guess worth listening to — you hear your answer and the real one back to back, which teaches you more than being told you were wrong.',
      'Start with one direction and add the others once it is comfortable. Mixing all five play modes from the beginning is a lot harder than it looks.',
    ],
  },
  {
    title: 'What is tracked',
    paragraphs: [
      'Recognising an ascending 5th is a different skill from recognising a descending one, and hearing both notes at the same time is different again.',
      'So each is kept as its own skill to master. You might be *solid* on descending 7ths and still in *needs work* on ascending ones, and the statistics will say so rather than averaging the two into something that describes neither.',
    ],
  },
  {
    title: 'Worth knowing',
    paragraphs: [
      'The score counts every press, so three wrong guesses and then the right one is one correct out of four. The statistics only count your first press, because that is the one that says whether you actually knew it.',
    ],
  },
  {
    title: 'Descending intervals are named differently here',
    paragraphs: [
      'Worth reading before you decide the app has marked you wrong.',
      'Play a D, then the C below it. Many would call that a descending major 2nd, because the two notes sit two semitones apart. Here, we call it a *minor 7th*.',
      'That is because the second note is named by its function against the first, not by the raw gap between them. C is the ♭7 of D, and it stays the ♭7 whether you reach it going up or coming down.',
      'It falls out neatly when you look at where the notes actually are. The C a minor 7th above that D, and the C just below it, are the same note an octave apart — so under this naming, a minor 7th below the root and a minor 7th above it land on the same note. Call the descending one a major 2nd and that stops being true: the same note ends up with two different names depending on which direction you happened to approach it from.',
      'The practical upshot is that a descending answer is always somewhere between a minor 2nd and an octave. Compound intervals (ie. those that span more than an octave) only ever turn up ascending or harmonic.',
    ],
  },
]

export const CHORD_ABOUT: AboutContent = [
  {
    title: 'What it asks',
    paragraphs: [
      'You will hear a chord. Name what kind of chord it is: major, minor, dominant 7th, and so on.',
    ],
  },
  {
    title: 'What it trains',
    paragraphs: [
      'Hearing the distinct sound each basic triad makes — the three-note chords: major, minor, diminished, augmented — and then the particular character that gets added when you stack more notes on top of them.',
      'A major 7th and a dominant 7th are one semitone apart. Telling them apart on paper is arithmetic; telling them apart by ear is a different skill, and this is where you build it.',
      'The root moves every question, so what you are learning is the *quality* rather than any one chord. It transfers to every key.',
    ],
  },
  {
    title: 'Working it',
    paragraphs: [
      '*Play again* repeats the chord. *Reveal* gives you the answer and counts as a miss, so a question you cannot get does not turn into a wall.',
      'Inversions and the play mode — block or arpeggiated — both change how hard the same chord is to name. Leave them alone until the chords themselves feel comfortable.',
      'Start with a handful of chords rather than all of them. Eight chords you meet often will teach you more than thirty you meet rarely.',
    ],
  },
  {
    title: 'What is tracked',
    paragraphs: [
      'Which chords you name correctly, sorted into *needs work*, *getting there* and *solid*, along with what you tend to mistake each one for.',
      'Mistakes that run through a whole family of chords are counted across the family as well. Hearing major chords as minor ones is one habit however many major chords you have switched on, and counted chord by chord it would be split between them until none of the pieces looked like anything.',
      'It also keeps a separate record by inversion and by play mode, so you can see whether it is the chord giving you trouble or the way it is being played to you.',
    ],
  },
  {
    title: 'Worth knowing',
    paragraphs: [
      'The score counts every press, so a question can end up 1 out of 4. Revealing after two wrong guesses ends it at 0 out of 3 rather than charging you for every chord you did not press.',
    ],
  },
]

export const ROOT_ABOUT: AboutContent = [
  {
    title: 'What it asks',
    paragraphs: [
      'You will hear a chord. Work out which note is its root, then tell the app whether you got it.',
    ],
  },
  {
    title: 'What it trains',
    paragraphs: [
      'This trains you to find the root of a chord quickly. Once you can do that, hearing how chords *move* gets much easier — and that is what the progression exercise is built on.',
      'Inversions are what make it hard, because they hide the real movement. Take a I chord in root position followed by a V in first inversion: the bass walks downward, and it is very easy to hear that as a I–VII. It is not. It is I–V with the third of the V sitting in the bass.',
      'Getting better at finding the actual root is what lets you hear that as the I–V it really is.',
    ],
  },
  {
    title: 'How to find the root',
    paragraphs: [
      'Hum any note you can pick out of the chord. Then try to hum a fifth below it.',
      'If that note sounds like it fits with the chord, you have found the root. If it does not, the note you started on was the 3rd or the 5th — pick a different note out of the chord and try again.',
      'This works the same way for major and minor chords.',
    ],
  },
  {
    title: 'Working it',
    paragraphs: [
      'Reveal plays the root on its own so you can check yourself. Sing or hum your answer *before* you press it — deciding what you thought after you have already heard the answer is the one way to get nothing at all out of this exercise.',
    ],
  },
  {
    title: 'What is tracked',
    paragraphs: [
      'Which chords you find the root of, sorted into *needs work*, *getting there* and *solid*, and a separate record for each inversion.',
      'That inversion breakdown is the useful one here. Finding the root of a root-position chord and finding it under a second inversion are distinct skills, and this tells you which of the two is costing you.',
    ],
  },
]

export const MELODY_ABOUT: AboutContent = [
  {
    title: 'What it asks',
    paragraphs: [
      'You will hear a short melody played over a chord or a drone. Enter the scale degrees you heard, in order.',
    ],
  },
  {
    title: 'What it trains',
    paragraphs: [
      'This trains you to hear a note by where it sits in the key, against a chord — which is most of what playing by ear actually is.',
      'If you can hear that the note being played is the 3rd, you immediately know what is around it: a semitone up to the 4th, a whole tone down to the 2nd. You know roughly what a leap from there up to the 5th is going to sound like before it happens.',
      'You also learn how each degree *feels*. The 5th sits still and settled. The 7th pulls up toward the tonic and will not leave you alone. Once you can feel that instability, the particular flavour of it tells you which degree you are on.',
    ],
  },
  {
    title: 'Steps and leaps',
    paragraphs: [
      'A *step* moves to the next note of the scale, up or down. A *leap* skips at least one note on the way.',
      'They are genuinely different problems for your ear — a step is a small adjustment from where you already are, and a leap means finding a new place — so the two are tracked separately.',
    ],
  },
  {
    title: 'Working it',
    paragraphs: [
      'Tonic and Chord replay the key reference whenever you lose your bearings. Use them freely: the exercise is about hearing the melody against a key, not about remembering the key.',
      'Tapping a slot you have already filled plays that note again, so you can check one part of a phrase without replaying the whole thing.',
      'Start with a short melody and one scale. Length and the scale list are both settings, and raising them together is much harder than raising either alone.',
    ],
  },
  {
    title: 'A tip',
    paragraphs: [
      'If you hear a semitone movement, it is almost always either 3–4 or 7–1. Those are the only two places a major scale puts its semitones.',
      'So when you catch one, ask which of the two it felt like. If the higher note was more stable, then it was 7-1. If the lower note felt more stable, then it was 3-4',
    ],
  },
  {
    title: 'What is tracked',
    paragraphs: [
      'How each note *arrived* rather than which note it was — a step up, a leap down, a repeat, the opening note — sorted into *needs work*, *getting there* and *solid*.',
      'The opening note is kept separately because it has only the root note/chord to measure against, which makes it a different job from every note that follows. There is also a breakdown by scale.',
    ],
  },
  {
    title: 'Worth knowing',
    paragraphs: [
      'Only your first attempt at a melody is scored. Getting it right on the second try neither costs nor credits anything, so a mis-tap does not follow you around.',
    ],
  },
]

export const PROGRESSION_ABOUT: AboutContent = [
  {
    title: 'What it asks',
    paragraphs: [
      'You will hear a few chords played one after another. Name them in roman numerals, in order.',
    ],
  },
  {
    title: 'What it trains',
    paragraphs: [
      'This trains you to recognize progressions. To do this effectively, you must be comfortable recognizing the root of each chord. Once you can hear where the root goes, you can hear how far it moved — and how far it moved is usually most of the answer. If you struggle with root recognition, spend some time with the Chord Root Recognition exercise',
      'Your knowledge of theory can help determine chord movements. You know a IV sits a semitone above a iii. So if you hear a minor chord, and then the root climbs a semitone and the chord turns major, you can be fairly confident you just heard a iii–IV. That also narrows down what can sensibly come next.',
      'Get good at this and you can pick up songs very quickly. Chord progressions are far more standardized than melodies — the same three chords in the same order turn up in countless songs, and somehow all of them still sound like themselves.',
    ],
  },
  {
    title: 'Working it',
    paragraphs: [
      'Key plays the tonic chord whenever you need reminding where home is. Nothing is given away by using it: the exercise is about the relationships between the chords, not about finding the key.',
      'Tapping an answer slot plays that one chord on its own. Use this when you are *stuck*, not as a shortcut — the whole point is to hear the root move, so what came immediately before the chord you are naming matters enormously.',
      'So if you cannot tell where the root went, or cannot tell whether the chord is major or minor, pick it out on its own, settle those two questions, and then put it back against the chord before it.',
      'Reveal ends the question and counts as a miss.',
    ],
  },
  {
    title: 'Inversions and the bass note',
    paragraphs: [
      'Inversions are an important part of real music. They are what makes voice leading work — they let the bass move smoothly instead of leaping around under every chord change.',
      'They also make it very easy to mistake the bass note for the root of the chord, which will send you to the wrong roman numeral every time. If that is catching you out, spend some time on the root exercise until finding the root is automatic.',
    ],
    link: { label: 'Chord Root Recognition', to: '/chord-root' },
  },
  {
    title: 'What is tracked',
    paragraphs: [
      'The first chord is kept separately from all the others, because there is nothing before it to measure against — you have to hear it against the key alone, while every later chord has the one before it as a landmark.',
      'Everything after the first is sorted into *needs work*, *getting there* and *solid*, with separate records for how far the root moved, how far the bass moved, which cadence ended the phrase, and which inversions were used.',
      'Root movement and bass movement are kept apart on purpose. Where the two disagree is exactly where an inversion has put something other than the root underneath, which is the hardest case in the whole exercise.',
    ],
  },
  {
    title: 'Worth knowing',
    paragraphs: [
      'A wrong chord ends the attempt, not the question. The answer clears and you can try the same progression again — and only the first mistake is charged, so a second run at it costs nothing.',
    ],
  },
]
