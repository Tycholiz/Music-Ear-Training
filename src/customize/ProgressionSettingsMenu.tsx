import {
  AboutPage,
  CheckRow,
  ListCard,
  ListRow,
  RadioGroup,
  RadioRow,
  useModalNav,
} from '../components'
import {
  progressionSettingsStore,
  progressionStatsStore,
  usePersisted,
  type ProgressionSettings,
} from '../settings'
import {
  CADENCES,
  NUMERAL_SECTIONS,
  midiToName,
  numeralsByDifficulty,
  numeralsInCategory,
  numeralsInCustomizeOrder,
} from '../theory'
import type { Cadence, RomanNumeral } from '../theory'
import {
  PROGRESSION_STATS_VIEW,
  CADENCE_DESCRIPTIONS,
  CADENCE_NAMES,
  INVERSION_NAMES,
  PROGRESSION_INVERSIONS,
  PROGRESSION_LENGTHS,
  cadenceMissing,
  cadenceUnlockNote,
  numeralLockWarning,
  progressionRangeWarning,
  progressionStuckReason,
  usableCadences,
} from '../exercises'
import { RangeScreen } from './RangeScreen'
import { StatisticsScreen } from './StatisticsScreen'
import { PROGRESSION_ABOUT } from '../about/pages'
import { afterGroupToggle, groupCanToggle, groupIsFull } from './bulkSelect'
import { SelectAll } from './SelectAll'

/**
 * Hamburger menu for the chord progression exercise, and the Customize screen
 * it pushes.
 *
 * The theme running through these screens is that chords and cadences depend on
 * each other, and the dependency is enforced by prevention rather than by
 * warning after the fact. A cadence needs its chords; a chord holding up the
 * last remaining cadence cannot be switched off. Between the two, the exercise
 * cannot be configured into a state with no way to end a progression.
 */
export function ProgressionSettingsMenu({
  onResetScore,
}: {
  onResetScore: () => void
}) {
  const { push } = useModalNav()

  return (
    <div className="p-4">
      <ListCard>
        <ListRow
          label="Customization"
          chevron
          onClick={() =>
            push({ title: 'Customize', content: <CustomizeScreen /> })
          }
        />
        <ListRow
          label="Statistics"
          chevron
          onClick={() =>
            push({
              title: 'Statistics',
              content: (
                <StatisticsScreen
                  store={progressionStatsStore}
                  view={PROGRESSION_STATS_VIEW}
                  onReset={() => progressionStatsStore.reset()}
                />
              ),
            })
          }
        />
        <ListRow
          label="About this exercise"
          chevron
          onClick={() =>
            push({
              title: 'About',
              content: <AboutPage content={PROGRESSION_ABOUT} />,
            })
          }
        />
        <ListRow label="Reset Score" destructive onClick={onResetScore} />
      </ListCard>
    </div>
  )
}

function CustomizeScreen() {
  const { push } = useModalNav()
  const [settings] = usePersisted(progressionSettingsStore)
  const stuck = progressionStuckReason(settings)

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard>
        <ListRow
          label="Chords"
          value={`${settings.numerals.length} selected`}
          chevron
          onClick={() => push({ title: 'Chords', content: <NumeralsScreen /> })}
        />
        <ListRow
          label="Cadences"
          value={cadenceSummary(settings)}
          chevron
          onClick={() =>
            push({ title: 'Cadences', content: <CadencesScreen /> })
          }
        />
        <ListRow
          label="Length"
          value={lengthSummary(settings)}
          chevron
          onClick={() => push({ title: 'Length', content: <LengthScreen /> })}
        />
        <ListRow
          label="Inversions"
          value={`${settings.inversions.length} selected`}
          chevron
          onClick={() =>
            push({ title: 'Inversions', content: <InversionsScreen /> })
          }
        />
        <ListRow
          label="Range"
          value={`${midiToName(settings.range.low)}–${midiToName(settings.range.high)}`}
          chevron
          onClick={() =>
            push({ title: 'Range', content: <ProgressionRangeScreen /> })
          }
        />
      </ListCard>

      {stuck && (
        <p className="px-4 text-center text-sm text-incorrect">{stuck}</p>
      )}
    </div>
  )
}

/**
 * The length as a count or as a ceiling.
 *
 * Which of the two it is has to be on the summary row. A user who set "up to
 * 5" and reads back "5 chords" would reasonably conclude it had not taken.
 */
function lengthSummary(settings: ProgressionSettings): string {
  return settings.upTo
    ? `Up to ${settings.length} chords`
    : `${settings.length} chords`
}

/** One name, or a count once there are too many to read at a glance. */
function cadenceSummary(settings: ProgressionSettings): string {
  const usable = usableCadences(settings)
  if (usable.length === 0) return 'None'
  if (usable.length === 1) return CADENCE_NAMES[usable[0]]
  return `${usable.length} selected`
}

/**
 * The chord vocabulary, grouped by where each chord comes from.
 *
 * Fifteen check rows in one column is a list to be scrolled rather than a
 * vocabulary to be chosen from, and it hides the thing a musician picking
 * chords wants first: whether a chord is in the key or borrowed from
 * somewhere. So the sections are the answer to that question, in the order
 * `NUMERAL_SECTIONS` gives — which puts the secondary dominants second, above
 * the borrowed chords they outrank in usefulness if not in difficulty.
 *
 * Ladder order survives inside each section, because it is guidance and it
 * still reads as guidance across five rows. What is gone is the claim that the
 * whole screen is ordered by difficulty, which the grouping makes untrue: the
 * old single footer said "Listed easiest first" and the section descriptions
 * take over from it.
 *
 * A chord an enabled cadence depends on is locked rather than dropping the
 * cadence when it goes. Each locked row carries its own explanation, in red,
 * directly under the chord it belongs to — the same multi-line label the
 * Cadences screen already uses for its description text, so a locked row
 * never has to be found by scanning a note somewhere else on the screen.
 * Still disabled: the row does not respond to a tap, only reads why.
 */
function NumeralsScreen() {
  const [settings, setSettings] = usePersisted(progressionSettingsStore)
  const chosen = new Set(settings.numerals)

  const inOrder = (ids: Iterable<string>) => {
    const wanted = new Set(ids)
    return numeralsByDifficulty()
      .map((numeral) => numeral.id)
      .filter((id) => wanted.has(id))
  }

  // Derived inside the updater, so four quick taps are four toggles rather
  // than whichever one landed last. See `usePersisted`.
  const toggle = (numeralId: string, checked: boolean) => {
    setSettings((current) => ({
      ...current,
      numerals: checked
        ? inOrder([...current.numerals, numeralId])
        : current.numerals.filter((id) => id !== numeralId),
    }))
  }

  /**
   * What a group checkbox needs about each numeral.
   *
   * `canDisable` is the interesting one here: a numeral an enabled cadence
   * depends on is locked, and a bulk uncheck has to leave it exactly as a
   * single tap would — switching off every chord a plagal cadence is made of
   * would break the setting the lock exists to protect.
   */
  const selectable = (numerals: readonly RomanNumeral[]) =>
    numerals.map((numeral) => ({
      id: numeral.id,
      checked: chosen.has(numeral.id),
      canEnable: true,
      canDisable:
        !chosen.has(numeral.id) ||
        numeralLockWarning(numeral.id, settings) === null,
    }))

  const toggleGroup = (numerals: readonly RomanNumeral[]) => {
    setSettings((current) => ({
      ...current,
      numerals: inOrder(
        afterGroupToggle(selectable(numerals), current.numerals),
      ),
    }))
  }

  const selectAll = (numerals: readonly RomanNumeral[], of?: string) => (
    <SelectAll
      of={of}
      full={groupIsFull(selectable(numerals))}
      disabled={!groupCanToggle(selectable(numerals))}
      onToggle={() => toggleGroup(numerals)}
    />
  )

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex justify-end px-4">
        {selectAll(numeralsInCustomizeOrder(), 'chords')}
      </div>

      {NUMERAL_SECTIONS.map((section) => (
        <ListCard
          key={section.category}
          title={section.title}
          action={selectAll(numeralsInCategory(section.category))}
        >
          {numeralsInCategory(section.category).map((numeral) => {
            const checked = chosen.has(numeral.id)
            const warning = checked
              ? numeralLockWarning(numeral.id, settings)
              : null

            return (
              <CheckRow
                key={numeral.id}
                label={
                  warning ? (
                    <>
                      <span className="block">{numeral.label}</span>
                      <span className="block text-xs text-incorrect">
                        Locked: {warning}
                      </span>
                    </>
                  ) : (
                    numeral.label
                  )
                }
                checked={checked}
                disabled={warning !== null}
                onChange={(next) => toggle(numeral.id, next)}
              />
            )
          })}
        </ListCard>
      ))}
    </div>
  )
}

/**
 * How progressions may end.
 *
 * Every progression cadences — one that stops on `ii` is a fragment rather than
 * a progression. What this chooses is *which* ways, and the five do not all land
 * on `I`: with more than one selected the final chord stays unpredictable, which
 * is what keeps the last answer from being free.
 *
 * A cadence whose chords are switched off is shown but disabled, with the chords
 * it needs named underneath. Hiding it would leave the user wondering where it
 * had gone.
 */
/**
 * How progressions may end.
 *
 * A cadence needs its chords, and one whose chords are switched off used to be
 * disabled — with the reason printed as a paragraph under the card. Two things
 * wrong with that. The words were in a place that was not an answer to the
 * press that raised the question, and the answer itself was homework: *go to
 * another screen, work out which chords these are, switch them on, come back*.
 *
 * **Now the row switches them on itself.** Every one of those cadences is one
 * press from being usable, so the press does it, and the note says what will
 * happen before it does — nothing is turned on behind the user's back.
 *
 * The note is not styled as an error any more either. Nothing has gone wrong;
 * it is a consequence of a tap the user has not yet made.
 */
function CadencesScreen() {
  const [settings, setSettings] = usePersisted(progressionSettingsStore)
  const chosen = new Set(settings.cadences)

  // Derived inside the updater, so two quick taps are two toggles rather than
  // whichever one landed last. See `usePersisted`.
  const toggle = (cadence: Cadence, checked: boolean) => {
    setSettings((current) => {
      if (!checked) {
        return {
          ...current,
          cadences: current.cadences.filter((option) => option !== cadence),
        }
      }

      // The chords come with it. Written in the same call rather than in two,
      // because the store filters out a cadence whose chords are not enabled —
      // saving the cadence first would have it stripped before the chords that
      // justify it ever arrived.
      return {
        ...current,
        numerals: [...current.numerals, ...cadenceMissing(cadence, current)],
        cadences: [
          ...CADENCES.filter(
            (option) => current.cadences.includes(option) || option === cadence,
          ),
        ],
      }
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard footer="With more than one selected, each progression picks a way to end — and you are not told which. They do not all land on I, which is what keeps the last chord from being a formality.">
        {CADENCES.map((cadence) => {
          const note = cadenceUnlockNote(cadence, settings)

          return (
            <CheckRow
              key={cadence}
              label={
                <>
                  <span className="block">{CADENCE_NAMES[cadence]}</span>
                  <span className="block text-sm text-content-muted">
                    {CADENCE_DESCRIPTIONS[cadence]}
                  </span>
                  {note && (
                    <span className="block text-xs text-accent">{note}</span>
                  )}
                </>
              }
              // A cadence whose chords are off reads as unchecked, because it
              // is: it cannot be part of a progression until they are on. The
              // press is what changes that.
              checked={chosen.has(cadence) && note === null}
              onChange={(next) => toggle(cadence, next)}
            />
          )
        })}
      </ListCard>
    </div>
  )
}

/**
 * How many chords, and whether that is a count or a ceiling.
 *
 * `Up to` sits below the lengths rather than above them, because it modifies
 * the choice that has just been made — read top to bottom it says "five
 * chords, or rather up to five", which is the order the thought arrives in.
 */
function LengthScreen() {
  const [settings, setSettings] = usePersisted(progressionSettingsStore)

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard footer="Two chords is a bare cadence, which is the right place to start and no less real for being short. Past eight, identifying chords turns into remembering how many there were.">
        <RadioGroup label="Length">
          {PROGRESSION_LENGTHS.map((length) => (
            <RadioRow
              key={length}
              label={`${length} chords`}
              selected={length === settings.length}
              onSelect={() =>
                setSettings((current) => ({ ...current, length }))
              }
            />
          ))}
        </RadioGroup>
      </ListCard>

      <ListCard
        footer={`Each progression is a random length up to ${settings.length} chords, rather than always ${settings.length}. The row of empty slots otherwise says how long the phrase is before you have heard a note of it.`}
      >
        <CheckRow
          label="Up to"
          checked={settings.upTo}
          onChange={(upTo) => setSettings((current) => ({ ...current, upTo }))}
        />
      </ListCard>
    </div>
  )
}

/**
 * Which inversions the voicing may use.
 *
 * Not part of the answer — `I⁶` is still `I` — so this changes how the exercise
 * *sounds* rather than what it asks. Root position alone makes every voice jump
 * at once, which is a chord chart being read aloud; allowing the others lets the
 * bass step and the inner voices hold their common tones, and the voices end up
 * travelling about a quarter as far.
 */
function InversionsScreen() {
  const [settings, setSettings] = usePersisted(progressionSettingsStore)
  const chosen = new Set(settings.inversions)

  const toggle = (inversion: number, checked: boolean) => {
    setSettings((current) => ({
      ...current,
      inversions: checked
        ? [
            ...PROGRESSION_INVERSIONS.filter(
              (option) =>
                current.inversions.includes(option) || option === inversion,
            ),
          ]
        : current.inversions.filter((option) => option !== inversion),
    }))
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard footer="Inversions are heard, not answered — a chord in any inversion is still the same numeral. What this changes is how smoothly the progression moves.">
        {PROGRESSION_INVERSIONS.map((inversion) => {
          const checked = chosen.has(inversion)

          return (
            <CheckRow
              key={inversion}
              label={INVERSION_NAMES[inversion]}
              checked={checked}
              onChange={(next) => toggle(inversion, next)}
            />
          )
        })}
      </ListCard>
    </div>
  )
}

function ProgressionRangeScreen() {
  const [settings, setSettings] = usePersisted(progressionSettingsStore)

  return (
    <RangeScreen
      range={settings.range}
      onChange={(range: ProgressionSettings['range']) =>
        setSettings((current) => ({ ...current, range }))
      }
      footer="Every voice of every chord is placed inside this range."
      warning={progressionRangeWarning(settings)}
    />
  )
}
