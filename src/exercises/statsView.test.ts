import { describe, expect, it } from 'vitest'
import {
  CHORD_STATS_VIEW,
  INTERVAL_STATS_VIEW,
  MELODY_STATS_VIEW,
  MIN_ATTEMPTS_TO_REPORT,
  MIN_QUALITY_ATTEMPTS_TO_REPORT,
  PROGRESSION_STATS_VIEW,
  ROOT_STATS_VIEW,
  bucketedSection,
  confusionsFor,
  hasAnyStats,
  mastery,
  qualityConfusionLabel,
  qualityConfusions,
  reportableRows,
  statsRows,
  type StatsSection,
  type StatsView,
} from './statsView'
import {
  CHORD_PLAY_MODES,
  INTERVAL_PLAY_MODES,
  RECENT_WINDOW,
  recordAttempts,
  type Attempt,
  type ExerciseStats,
} from '../settings'
import {
  CADENCES,
  numeralsInCustomizeOrder,
  scalesByDifficulty,
} from '../theory'

const ALL_VIEWS: StatsView[] = [
  INTERVAL_STATS_VIEW,
  CHORD_STATS_VIEW,
  ROOT_STATS_VIEW,
  MELODY_STATS_VIEW,
  PROGRESSION_STATS_VIEW,
]

/** The section under a namespace, for asserting about one in particular. */
function sectionOf(view: StatsView, namespace: string) {
  const found = view.sections.find((s) => s.namespace === namespace)
  if (!found) throw new Error(`no ${namespace} section`)
  return found
}

function record(...attempts: Attempt[]): ExerciseStats {
  return recordAttempts({}, attempts, 1)
}

function repeat(item: string, correct: boolean, times: number): Attempt[] {
  return Array.from({ length: times }, () => ({ item, correct }))
}

describe('labels', () => {
  it('turns each namespace back into something a musician reads', () => {
    expect(bucketedSection(INTERVAL_STATS_VIEW).label('7')).toBe('Perfect 5th')
    expect(bucketedSection(CHORD_STATS_VIEW).label('major-7th')).toBe(
      'Major 7th',
    )
    expect(bucketedSection(PROGRESSION_STATS_VIEW).label('vii-dim')).toBe(
      'vii°',
    )
    // Not a numeral: the reserved id for hearing the bass as the root.
    expect(bucketedSection(PROGRESSION_STATS_VIEW).label('bass-as-root')).toBe(
      'the chord on the bass note',
    )
    expect(bucketedSection(MELODY_STATS_VIEW).label('leap-down')).toBe(
      'Leap down',
    )
    expect(bucketedSection(MELODY_STATS_VIEW).label('opening')).toBe(
      'First note',
    )
  })

  it('names an interval with the direction it was heard in', () => {
    // A descending minor 7th and an ascending one are two skills, so they are
    // two rows and each has to say which it is.
    const intervals = bucketedSection(INTERVAL_STATS_VIEW)
    expect(intervals.label('10-asc')).toBe('Minor 7th (asc)')
    expect(intervals.label('10-desc')).toBe('Minor 7th (desc)')
    expect(intervals.label('10-harmonic')).toBe('Minor 7th (harmonic)')
  })

  it('names a bare interval without inventing a direction for it', () => {
    // Confusions are recorded without one, deliberately: the row above has
    // already said which direction it is, so repeating it would be noise.
    expect(bucketedSection(INTERVAL_STATS_VIEW).label('9')).toBe('Major 6th')
  })

  it('names the first chord of a progression the same way as any other', () => {
    // Same numerals, and the same bass-reading failure can happen on chord one
    // as on chord four — so the two sections share a label function rather
    // than each writing out the roman numerals separately.
    const opening = sectionOf(PROGRESSION_STATS_VIEW, 'opening')
    expect(opening.label('vii-dim')).toBe('vii°')
    expect(opening.label('bass-as-root')).toBe('the chord on the bass note')
  })

  it('names root movements by how far the root travels', () => {
    const root = sectionOf(PROGRESSION_STATS_VIEW, 'root-movement')
    // A fourth and a fifth are separate moves — one arrives, one departs —
    // and interval class used to report them as the same thing.
    expect(root.label('up-fourth')).toBe('Root moves up a fourth')
    expect(root.label('up-fifth')).toBe('Root moves up a fifth')
    // A sixth up is a third down, named the way it is spoken about.
    expect(root.label('down-third')).toBe('Root moves down a third')
    // Nothing is ever merely "a step".
    expect(root.label('up-half-step')).toBe('Root moves up a half step')
  })

  it('names bass movements by distance alone, with no direction', () => {
    // The bass is a sounding note, so a fourth up and a fourth down are the
    // same distance travelled. The root is a pitch class and its direction is
    // a fact about the harmony, which is why only that list is directed.
    const bass = sectionOf(PROGRESSION_STATS_VIEW, 'bass-movement')
    expect(bass.label('half-step')).toBe('Bass moves by a half step')
    expect(bass.label('whole-step')).toBe('Bass moves by a whole step')
    expect(bass.label('sixth-or-more')).toBe('Bass moves by a sixth or more')
  })

  it('keeps the two movement measures in separate sections', () => {
    // One list called "By root and bass movement" was two findings under one
    // heading, and interleaved worst-first the rows had to be read prefix by
    // prefix to work out which measure each belonged to.
    const root = sectionOf(PROGRESSION_STATS_VIEW, 'root-movement')
    const bass = sectionOf(PROGRESSION_STATS_VIEW, 'bass-movement')

    expect(root.title).toBe('By root movement')
    expect(bass.title).toBe('By bass movement')
    // Both label `tritone`, and each has to say whose tritone it is.
    expect(root.label('tritone')).toBe('Root moves by a tritone')
    expect(bass.label('tritone')).toBe('Bass moves by a tritone')
  })

  it('falls back to the raw id rather than throwing on a stale record', () => {
    // A chord removed from the table would otherwise take the whole screen
    // down, and a statistics screen is the last place worth crashing.
    expect(bucketedSection(CHORD_STATS_VIEW).label('no-such-chord')).toBe(
      'no-such-chord',
    )
    expect(bucketedSection(INTERVAL_STATS_VIEW).label('nonsense')).toBe(
      'nonsense',
    )
  })
})

describe('what each exercise measures, and in what order', () => {
  it('gives every view exactly one bucketed section', () => {
    // Two would put two sets of needs work / getting there / solid on one
    // screen with nothing to say which was which; none would lead with a list
    // and never name what the user is bad at.
    for (const view of ALL_VIEWS) {
      expect(view.sections.filter((s) => s.bucketed)).toHaveLength(1)
    }
  })

  it('leads chord root with its buckets, then inversion — its whole difficulty', () => {
    expect(ROOT_STATS_VIEW.sections.map((s) => s.namespace)).toEqual([
      'chord',
      'inversion',
    ])
  })

  it('breaks intervals down by play mode, since descending is its own skill', () => {
    expect(INTERVAL_STATS_VIEW.sections.map((s) => s.namespace)).toContain(
      'mode',
    )
  })

  it('leads progressions with the first chord, then the rest of them', () => {
    // The first chord is heard against the key alone; every later chord has
    // the one before it as a landmark. Different skills, and the harder one
    // used to sit below a bucketed figure that was averaging it in.
    //
    // Position is not here at all: a wrong press ends the attempt, so later
    // positions only existed in the record for progressions already going
    // well, and "Chord 4: 90%" was close to a tautology.
    expect(PROGRESSION_STATS_VIEW.sections.map((s) => s.namespace)).toEqual([
      'opening',
      'numeral',
      'root-movement',
      'bass-movement',
      'cadence',
      'inversion',
    ])
    expect(bucketedSection(PROGRESSION_STATS_VIEW).namespace).toBe('numeral')
  })

  it('says in the heading that the buckets start from the second chord', () => {
    // The recording side stopped writing openings to `numeral`, so a heading
    // promising "each chord" would contradict its own contents.
    expect(bucketedSection(PROGRESSION_STATS_VIEW).title).toBe(
      'Naming each chord after the first',
    )
  })

  it('diagnoses the first chord even though it is not bucketed', () => {
    // Bucketing is not what earns confusions. "You hear the opening V as I" is
    // the most useful line on this screen and belongs to a plain list.
    expect(sectionOf(PROGRESSION_STATS_VIEW, 'opening').showsConfusions).toBe(
      true,
    )
  })

  it('never lists two sections under one namespace', () => {
    // They would double-count: the same items shown twice, once bucketed and
    // once flat, reading as two different findings.
    for (const view of ALL_VIEWS) {
      const namespaces = view.sections.map((s) => s.namespace)
      expect(new Set(namespaces).size).toBe(namespaces.length)
    }
  })
})

describe('statsRows', () => {
  it('sorts worst first, which is the only order worth reading', () => {
    const stats = record(
      ...repeat('chord:good', true, 10),
      ...repeat('chord:bad', false, 10),
      ...repeat('chord:mixed', true, 5),
      ...repeat('chord:mixed', false, 5),
    )

    expect(
      statsRows(stats, bucketedSection(CHORD_STATS_VIEW)).map((row) => row.id),
    ).toEqual(['bad', 'mixed', 'good'])
  })

  it('withholds a percentage until there is enough to report one', () => {
    // Two out of three is not 67%, and a screen that says so is worse than one
    // that says nothing, because the user acts on it.
    const stats = record(...repeat('chord:major', true, 2))
    const [row] = statsRows(stats, bucketedSection(CHORD_STATS_VIEW))

    expect(row.accuracy).toBeNull()
    expect(reportableRows([row])).toEqual([])
  })

  it('reports one as soon as the threshold is reached', () => {
    const stats = record(
      ...repeat('chord:major', true, MIN_ATTEMPTS_TO_REPORT - 1),
      ...repeat('chord:major', false, 1),
    )
    const [row] = statsRows(stats, bucketedSection(CHORD_STATS_VIEW))

    expect(reportableRows([row])).toHaveLength(1)
    expect(row.accuracy).toBeCloseTo(
      (MIN_ATTEMPTS_TO_REPORT - 1) / MIN_ATTEMPTS_TO_REPORT,
    )
  })

  it('holds a thin item out of the buckets entirely, not just out of the numbers', () => {
    // The bug behind the confusing screen: `mastery` smooths and so always
    // produces an answer, so one correct attempt was bucketed as "Getting
    // there" while its percentage abstained — a verdict on evidence the same
    // screen was refusing to summarise.
    const stats = record({ item: 'chord:major', correct: true })
    const [row] = statsRows(stats, bucketedSection(CHORD_STATS_VIEW))

    expect(mastery(row.item)).toBe('practising')
    expect(reportableRows([row])).toEqual([])
  })

  it('reports the recent window, not the lifetime record', () => {
    // Someone who was bad at a chord months ago and has since fixed it would
    // otherwise read a low percentage while sitting under "Solid" — the bucket
    // and the number describing different stretches of time.
    const stats = record(
      ...repeat('chord:major', false, 30),
      ...repeat('chord:major', true, 20),
    )
    const [row] = statsRows(stats, bucketedSection(CHORD_STATS_VIEW))

    expect(row.item.attempts).toBe(50)
    // Lifetime is 40%; the last twenty were all correct.
    expect(row.accuracy).toBe(1)
  })

  it('agrees in direction with the bucket it is shown under', () => {
    // The two are computed differently — the bucket smooths — but they must
    // never point opposite ways, which is what a lifetime figure allowed.
    const stats = record(
      ...repeat('chord:fixed', false, 30),
      ...repeat('chord:fixed', true, 20),
    )
    const [row] = statsRows(stats, bucketedSection(CHORD_STATS_VIEW))

    expect(mastery(row.item)).toBe('solid')
    expect(row.accuracy).toBeGreaterThan(0.85)
  })

  it('leaves out interval records written before direction was part of them', () => {
    // `interval:7` is an average of ascending and descending, and there is no
    // way now to say which it was. Shown, it would sit beside the two rows
    // that replaced it and read as a third finding about a third skill.
    const stats = record(
      ...repeat('interval:7', true, 20),
      ...repeat('interval:7-asc', false, 20),
    )

    expect(
      statsRows(stats, bucketedSection(INTERVAL_STATS_VIEW)).map((r) => r.id),
    ).toEqual(['7-asc'])
  })

  it('leaves out a record for an interval the table no longer has', () => {
    // Every `interval:0` a user built up before the Unison was removed. It
    // would otherwise fall through `safely` and print its own raw id, since
    // there is no name left to look up.
    const stats = record(
      ...repeat('interval:0-asc', true, 20),
      ...repeat('interval:7-asc', false, 20),
    )

    expect(
      statsRows(stats, bucketedSection(INTERVAL_STATS_VIEW)).map((r) => r.id),
    ).toEqual(['7-asc'])
  })

  it('buckets one interval two ways when the two directions differ', () => {
    // The finding, not a contradiction: solid one way and lost the other is
    // exactly what a pooled figure could never say.
    const stats = record(
      ...repeat('interval:10-desc', true, 20),
      ...repeat('interval:10-asc', false, 20),
    )
    const rows = statsRows(stats, bucketedSection(INTERVAL_STATS_VIEW))

    expect(rows.map((r) => r.label)).toEqual([
      'Minor 7th (asc)',
      'Minor 7th (desc)',
    ])
    expect(rows.map((r) => mastery(r.item))).toEqual(['learning', 'solid'])
  })

  it("keeps one namespace out of another one's section", () => {
    const stats = record(
      { item: 'chord:major', correct: true },
      { item: 'inversion:1', correct: false },
    )

    expect(
      statsRows(stats, bucketedSection(CHORD_STATS_VIEW)).map((row) => row.id),
    ).toEqual(['major'])
  })
})

describe('ordering', () => {
  it('lists inversions from the root up, not worst first', () => {
    // Root position, 1st, 2nd is an order the reader already has in their
    // head, and the shape of the numbers falling off as the bass climbs is
    // only visible in sequence.
    const stats = record(
      ...repeat('inversion:2', false, 16),
      ...repeat('inversion:2', true, 4),
      ...repeat('inversion:0', true, 18),
      ...repeat('inversion:0', false, 2),
      ...repeat('inversion:1', true, 10),
      ...repeat('inversion:1', false, 10),
    )
    const inversions = sectionOf(CHORD_STATS_VIEW, 'inversion')

    expect(statsRows(stats, inversions).map((row) => row.id)).toEqual([
      '0',
      '1',
      '2',
    ])
  })

  it('sorts numerically, so a tenth inversion would not land between 1 and 2', () => {
    const stats = record(
      ...repeat('inversion:10', true, 5),
      ...repeat('inversion:2', true, 5),
    )
    const inversions = sectionOf(CHORD_STATS_VIEW, 'inversion')

    expect(statsRows(stats, inversions).map((row) => row.id)).toEqual([
      '2',
      '10',
    ])
  })

  it('lists cadences the way the Customize screen does, not worst first', () => {
    // Seeded so that worst-first would produce the exact reverse, which is
    // what makes this fail if the canonical order is dropped rather than
    // passing on a coincidence.
    const stats = record(
      ...repeat('cadence:secondary', false, 20),
      ...repeat('cadence:deceptive', false, 15),
      ...repeat('cadence:deceptive', true, 5),
      ...repeat('cadence:half', true, 10),
      ...repeat('cadence:half', false, 10),
      ...repeat('cadence:plagal', true, 15),
      ...repeat('cadence:plagal', false, 5),
      ...repeat('cadence:authentic', true, 20),
    )
    const cadences = sectionOf(PROGRESSION_STATS_VIEW, 'cadence')

    expect(statsRows(stats, cadences).map((row) => row.id)).toEqual([
      ...CADENCES,
    ])
  })

  it('puts a value missing from the canonical order last, not first', () => {
    // A record from a cadence since removed, or a hand-edited blob. Leading
    // with an anomaly reads as a finding about the user.
    const stats = record(
      ...repeat('cadence:no-such-cadence', false, 20),
      ...repeat('cadence:authentic', true, 20),
    )
    const cadences = sectionOf(PROGRESSION_STATS_VIEW, 'cadence')

    expect(statsRows(stats, cadences).map((row) => row.id)).toEqual([
      'authentic',
      'no-such-cadence',
    ])
  })

  it('orders every section that mirrors a Customize screen by that screen', () => {
    // The general rule, checked against the tables the screens themselves
    // read rather than against a copy of them written out here.
    const mirrors: [StatsSection, readonly string[]][] = [
      [sectionOf(PROGRESSION_STATS_VIEW, 'cadence'), CADENCES],
      [sectionOf(INTERVAL_STATS_VIEW, 'mode'), INTERVAL_PLAY_MODES],
      [sectionOf(CHORD_STATS_VIEW, 'mode'), CHORD_PLAY_MODES],
      [
        sectionOf(MELODY_STATS_VIEW, 'scale'),
        scalesByDifficulty().map((scale) => scale.id),
      ],
      [
        sectionOf(PROGRESSION_STATS_VIEW, 'opening'),
        numeralsInCustomizeOrder().map((numeral) => numeral.id),
      ],
    ]

    for (const [section, expected] of mirrors) {
      expect(section.order).toEqual(expected)
    }
  })

  it('leaves movement worst-first, since no Customize screen offers it', () => {
    // Movements are a property of the progression that comes out, not
    // something switched on, so there is no order to mirror.
    const stats = record(
      ...repeat('root-movement:up-fourth', true, 20),
      ...repeat('root-movement:tritone', false, 20),
    )
    const root = sectionOf(PROGRESSION_STATS_VIEW, 'root-movement')

    expect(root.order).toBeUndefined()
    expect(statsRows(stats, root).map((row) => row.id)).toEqual([
      'tritone',
      'up-fourth',
    ])
  })

  it('still puts the worst first everywhere else', () => {
    const stats = record(
      ...repeat('chord:good', true, 20),
      ...repeat('chord:bad', false, 20),
    )

    expect(
      statsRows(stats, bucketedSection(CHORD_STATS_VIEW)).map((row) => row.id),
    ).toEqual(['bad', 'good'])
  })
})

describe('mastery buckets', () => {
  it('agrees with what adaptive difficulty is doing', () => {
    // Two definitions of struggling would have the app contradicting itself:
    // the screen calling a chord solid while the exercise drills it.
    const solid = record(...repeat('chord:a', true, 20))
    const learning = record(...repeat('chord:b', false, 20))

    expect(mastery(solid['chord:a'])).toBe('solid')
    expect(mastery(learning['chord:b'])).toBe('learning')
  })

  it('does not call one right answer solid', () => {
    const stats = record({ item: 'chord:a', correct: true })
    expect(mastery(stats['chord:a'])).not.toBe('solid')
  })

  it('has somewhere for a middling item to go', () => {
    const stats = record(
      ...repeat('chord:a', true, 15),
      ...repeat('chord:a', false, 5),
    )
    expect(mastery(stats['chord:a'])).toBe('practising')
  })
})

describe('confusions', () => {
  /** `wrong` misses answered as `as`, plus `right` correct attempts. */
  function withMisses(as: string, wrong: number, right: number) {
    return record(
      ...repeat('chord:diminished', false, wrong).map((a) => ({
        ...a,
        answered: as,
      })),
      ...repeat('chord:diminished', true, right),
    )
  }

  const namedFor = (stats: ExerciseStats) =>
    confusionsFor(
      statsRows(stats, bucketedSection(CHORD_STATS_VIEW))[0],
      bucketedSection(CHORD_STATS_VIEW),
    )

  it('names what was heard instead, commonest first', () => {
    // The user's own example: right 30% of the time, heard as one thing half
    // the time and as another a fifth of the time. Both are worth saying.
    const stats = record(
      ...repeat('chord:diminished', false, 10).map((a) => ({
        ...a,
        answered: 'minor',
      })),
      ...repeat('chord:diminished', false, 4).map((a) => ({
        ...a,
        answered: 'augmented',
      })),
      ...repeat('chord:diminished', true, 6),
    )

    expect(namedFor(stats)).toEqual(['Minor Triad', 'Augmented Triad'])
  })

  it('leaves out a mistake too rare to be a habit', () => {
    // One miss in twenty is noise. Naming it beside a habitual confusion
    // would read as though both were findings.
    const stats = record(
      ...repeat('chord:diminished', false, 8).map((a) => ({
        ...a,
        answered: 'minor',
      })),
      ...repeat('chord:diminished', false, 1).map((a) => ({
        ...a,
        answered: 'augmented',
      })),
      ...repeat('chord:diminished', true, 11),
    )

    expect(namedFor(stats)).toEqual(['Minor Triad'])
  })

  it('names every habit, not just the two commonest', () => {
    // Truncating at two was a fix for the sentence they used to be rendered as.
    // Set one per line there is nothing to truncate for, and the count itself
    // says something: one mistake is a systematic confusion, three is a user
    // guessing, and a cap made those look the same.
    const stats = record(
      ...repeat('chord:diminished', false, 5).map((a) => ({
        ...a,
        answered: 'minor',
      })),
      ...repeat('chord:diminished', false, 5).map((a) => ({
        ...a,
        answered: 'augmented',
      })),
      ...repeat('chord:diminished', false, 5).map((a) => ({
        ...a,
        answered: 'sus2',
      })),
      ...repeat('chord:diminished', true, 5),
    )

    expect(namedFor(stats)).toHaveLength(3)
  })

  it('is still bounded, because the threshold is a share of attempts', () => {
    // No cap, but no runaway list either: an answer has to be 15% of attempts,
    // so at most a handful can ever qualify — and they compete for the share
    // that went wrong at all.
    const stats = record(
      ...repeat('chord:diminished', true, 17),
      ...['a', 'b', 'c'].flatMap((answered) =>
        repeat('chord:diminished', false, 1).map((a) => ({ ...a, answered })),
      ),
    )

    expect(namedFor(stats)).toEqual([])
  })

  it('forgets a mistake once it falls out of the window', () => {
    // A confusion from months ago is not a fact about how the user hears this
    // chord now. It expires with the attempt that carried it.
    let stats = withMisses('minor', 10, 0)
    expect(namedFor(stats)).toEqual(['Minor Triad'])

    stats = recordAttempts(
      stats,
      repeat('chord:diminished', true, RECENT_WINDOW),
      2,
    )
    expect(namedFor(stats)).toEqual([])
  })

  it('stays silent for a section that has not asked to diagnose', () => {
    // The bug this guards: melody stopped recording answers on degrees, but
    // every window written before it stopped still had them, and the screen
    // kept reporting them for another twenty questions. The section decides,
    // not the record.
    const stats = record(
      ...repeat('degree:3', false, 10).map((a) => ({ ...a, answered: '2' })),
      ...repeat('degree:3', true, 10),
    )
    const degrees = sectionOf(MELODY_STATS_VIEW, 'degree')
    const [row] = statsRows(stats, degrees)

    // The stale answers really are in the record...
    expect(row.item.recent.some((a) => a.answered === '2')).toBe(true)
    // ...and the screen still says nothing about them.
    expect(confusionsFor(row, degrees)).toEqual([])
  })

  it('stays silent for a self-graded exercise even if answers appear', () => {
    // Chord root cannot produce one, so a record carrying them is corrupt or
    // stale. Either way the exercise has no wrong answer to name.
    const stats = record(
      ...repeat('chord:major', false, 10).map((a) => ({
        ...a,
        answered: 'minor',
      })),
    )
    const [row] = statsRows(stats, bucketedSection(ROOT_STATS_VIEW))

    expect(confusionsFor(row, bucketedSection(ROOT_STATS_VIEW))).toEqual([])
  })

  it('has none for a self-graded exercise', () => {
    // Chord root records no answer, because there is none to record.
    const stats = record(...repeat('chord:major', false, 5))
    const [row] = statsRows(stats, bucketedSection(ROOT_STATS_VIEW))

    expect(confusionsFor(row, bucketedSection(ROOT_STATS_VIEW))).toEqual([])
  })
})

describe('the chord-quality roll-up', () => {
  /** `times` misses on `item`, each answered as `answered`. */
  function misses(item: string, answered: string, times: number): Attempt[] {
    return repeat(`chord:${item}`, false, times).map((a) => ({
      ...a,
      answered,
    }))
  }

  const named = (stats: ExerciseStats) =>
    qualityConfusions(stats).map((c) => qualityConfusionLabel(c))

  it('names a habit spread thin across several answers', () => {
    // The case the per-chord list cannot reach. One chord, three different
    // minor chords pressed instead, two attempts each — every answer sits at
    // 10% of attempts, under the threshold, so the chord's own row names
    // nothing while three in ten of its attempts went to a minor chord.
    const stats = record(
      ...misses('major-7th', 'minor-7th', 2),
      ...misses('major-7th', 'minor-9th', 2),
      ...misses('major-7th', 'minor-6th', 2),
      ...repeat('chord:major-7th', true, 14),
    )

    const chords = bucketedSection(CHORD_STATS_VIEW)
    expect(confusionsFor(statsRows(stats, chords)[0], chords)).toEqual([])

    expect(qualityConfusions(stats)).toEqual([
      { from: 'major', to: 'minor', share: 0.3 },
    ])
  })

  it('speaks before any single chord has enough attempts to report', () => {
    // Four major chords, four attempts each: every row is below
    // `MIN_ATTEMPTS_TO_REPORT` and the screen shows none of them, while the
    // sixteen attempts between them are four times the evidence any one row
    // has. That is the beginner this section is for.
    const stats = record(
      ...['major', 'major-6th', 'major-7th', 'add9'].flatMap((chord) => [
        ...misses(chord, 'minor', 1),
        ...repeat(`chord:${chord}`, true, 3),
      ]),
    )

    expect(
      reportableRows(statsRows(stats, bucketedSection(CHORD_STATS_VIEW))),
    ).toEqual([])

    expect(named(stats)).toEqual(['Major chords answered as minor'])
  })

  it('says nothing on evidence too thin to pool', () => {
    // Fourteen attempts, half of them wrong in the same direction — a glaring
    // rate on a sample that is still two per chord across a family. The
    // threshold on a pooled count has to be a pooled threshold.
    const stats = record(
      ...misses('major', 'minor', 7),
      ...repeat('chord:major', true, 7),
    )
    expect(named(stats)).toEqual([])

    // One more attempt, and the same habit is worth saying.
    const enough = recordAttempts(stats, repeat('chord:major', true, 1), 2)
    expect(named(enough)).toEqual(['Major chords answered as minor'])
  })

  it('drops a mistake inside one quality', () => {
    // A Major 7th heard as a Major 9th is a real mistake and the per-chord
    // list's business. Here it could only ever come out as "you hear major as
    // major", which is not a finding about anything.
    const stats = record(
      ...misses('major-7th', 'major-9th', 10),
      ...repeat('chord:major-7th', true, 10),
    )

    expect(qualityConfusions(stats)).toEqual([])
  })

  it('keeps the two directions apart', () => {
    // Hearing major as minor and hearing minor as major are two habits, not
    // one symmetrical one, and a user with the first should not be told they
    // have both.
    const stats = record(
      ...misses('major', 'minor', 6),
      ...repeat('chord:major', true, 14),
      ...repeat('chord:minor', true, 20),
    )

    expect(named(stats)).toEqual(['Major chords answered as minor'])
  })

  it('puts the strongest habit first', () => {
    // Worst-first, like every other section with no fixed list to mirror.
    const stats = record(
      ...misses('major', 'minor', 4),
      ...misses('major', 'diminished', 8),
      ...repeat('chord:major', true, 8),
    )

    expect(named(stats)).toEqual([
      'Major chords answered as diminished',
      'Major chords answered as minor',
    ])
  })

  it('pools the answers as well as the chords', () => {
    // Both axes at once: three major chords, each mistaken for a different
    // minor chord, and neither grouping alone would find it. The answers are
    // spread too thin to name and the chords are too thin to report.
    const stats = record(
      ...misses('major', 'minor', 1),
      ...repeat('chord:major', true, 4),
      ...misses('major-7th', 'minor-7th', 1),
      ...repeat('chord:major-7th', true, 4),
      ...misses('major-9th', 'minor-9th', 1),
      ...repeat('chord:major-9th', true, 4),
    )

    expect(qualityConfusions(stats)).toEqual([
      { from: 'major', to: 'minor', share: 0.2 },
    ])
  })

  it('ignores records and answers naming a chord the table has dropped', () => {
    // Both positions. An id with no chord behind it cannot be grouped, and
    // guessing which family it belonged to would invent the finding.
    const stats = record(
      ...misses('no-such-chord', 'minor', 20),
      ...misses('major', 'no-such-answer', 6),
      ...repeat('chord:major', true, 14),
    )

    expect(qualityConfusions(stats)).toEqual([])
  })

  it('forgets a habit once it falls out of the window', () => {
    // Same rule as the per-chord confusions: the roll-up describes where the
    // user is, not where they have been.
    let stats = record(
      ...misses('major', 'minor', 6),
      ...repeat('chord:major', true, 14),
    )
    expect(named(stats)).toEqual(['Major chords answered as minor'])

    stats = recordAttempts(stats, repeat('chord:major', true, RECENT_WINDOW), 2)
    expect(named(stats)).toEqual([])
  })

  it('is offered by the chord exercise alone', () => {
    // Chord root shares the namespace and is self-graded, so it has no answers
    // to group; nothing else has chords at all.
    expect(CHORD_STATS_VIEW.qualityRollUp).toBe(true)
    for (const view of ALL_VIEWS.filter((v) => v !== CHORD_STATS_VIEW)) {
      expect(view.qualityRollUp).toBeFalsy()
    }
  })

  it('never asks for more evidence than one chord can supply', () => {
    // A user with a single major chord switched on tops out at one window of
    // attempts. Set the floor above that and their roll-up could never appear,
    // which is a section that is silent by construction rather than by
    // evidence.
    expect(MIN_QUALITY_ATTEMPTS_TO_REPORT).toBeLessThanOrEqual(RECENT_WINDOW)
    expect(MIN_QUALITY_ATTEMPTS_TO_REPORT).toBeGreaterThan(
      MIN_ATTEMPTS_TO_REPORT,
    )
  })
})

describe('hasAnyStats', () => {
  it('is false before anything has been answered', () => {
    expect(hasAnyStats({})).toBe(false)
  })

  it('is true once something has', () => {
    expect(hasAnyStats(record({ item: 'chord:major', correct: true }))).toBe(
      true,
    )
  })
})
