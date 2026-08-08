import {
  AboutPage,
  CheckRow,
  ListCard,
  ListRow,
  RadioGroup,
  RadioRow,
  useModalNav,
} from '../components'
import { MELODY_STATS_VIEW, selectedScales } from '../exercises'
import {
  MELODY_BACKINGS,
  melodySettingsStore,
  melodyStatsStore,
  usePersisted,
  type MelodySettings,
} from '../settings'
import {
  degreeLabel,
  midiToName,
  scaleById,
  scalesByDifficulty,
  sharedDegrees,
} from '../theory'
import {
  BACKING_DESCRIPTIONS,
  BACKING_NAMES,
  MELODY_LENGTHS,
  featuredWarning,
  melodyRangeWarning,
  melodyStuckReason,
} from '../exercises'
import { RangeScreen } from './RangeScreen'
import { StatisticsScreen } from './StatisticsScreen'
import { MELODY_ABOUT } from '../about/pages'

/**
 * Hamburger menu for the melody exercise, and the Customize screen it pushes.
 *
 * Unlike the chord menu this is not shared with anything — melody settings
 * have almost nothing in common with chord settings, and the one screen they
 * do share, Range, is already a standalone component taking a value and a
 * warning.
 */
export function MelodySettingsMenu({
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
                  store={melodyStatsStore}
                  view={MELODY_STATS_VIEW}
                  onReset={() => melodyStatsStore.reset()}
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
              content: <AboutPage content={MELODY_ABOUT} />,
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
  const [settings] = usePersisted(melodySettingsStore)
  const stuck = melodyStuckReason(settings)

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard>
        <ListRow
          label="Scales"
          value={scaleSummary(settings)}
          chevron
          onClick={() => push({ title: 'Scales', content: <ScaleScreen /> })}
        />
        <ListRow
          label="Featured Degrees"
          value={
            settings.featured.length === 0
              ? 'None'
              : settings.featured.map(degreeLabel).join(' ')
          }
          chevron
          onClick={() =>
            push({ title: 'Featured Degrees', content: <FeaturedScreen /> })
          }
        />
        <ListRow
          label="Length"
          value={`${settings.length} notes`}
          chevron
          onClick={() => push({ title: 'Length', content: <LengthScreen /> })}
        />
        <ListRow
          label="Backing"
          value={BACKING_NAMES[settings.backing]}
          chevron
          onClick={() => push({ title: 'Backing', content: <BackingScreen /> })}
        />
        <ListRow
          label="Range"
          value={`${midiToName(settings.range.low)}–${midiToName(settings.range.high)}`}
          chevron
          onClick={() =>
            push({ title: 'Range', content: <MelodyRangeScreen /> })
          }
        />
      </ListCard>

      {stuck && (
        <p className="px-4 text-center text-sm text-incorrect">{stuck}</p>
      )}
    </div>
  )
}

/** One name, or a count once there are too many to read at a glance. */
function scaleSummary(settings: MelodySettings): string {
  const scales = selectedScales(settings)
  if (scales.length === 0) return 'None'
  if (scales.length === 1) return scales[0].name
  return `${scales.length} selected`
}

/**
 * The difficulty ladder, easiest first, and more than one at a time.
 *
 * Listed in ladder order rather than alphabetically because the order *is* the
 * guidance — a user who works down the list is following a sensible
 * progression without having to be told one.
 *
 * Several at once is a harder exercise than any one of them and a different
 * one: each question picks a scale, so the ear has to place the degree *and*
 * work out which scale it is placing it in. That is what listening to real
 * music actually asks.
 *
 * Changing the selection reconciles the featured degrees rather than leaving
 * them to be sanitised away on the next read. A b7 featured under Mixolydian
 * is not merely invalid once Major joins the selection, it is unreachable —
 * no melody could be generated at all — and the user would have no way to see
 * which setting had broken it.
 */
function ScaleScreen() {
  const [settings, setSettings] = usePersisted(melodySettingsStore)
  const chosen = new Set(settings.scaleIds)

  const toggle = (scaleId: string, checked: boolean) => {
    // Derived inside the updater, so two quick taps are two toggles rather
    // than whichever one landed last. See `usePersisted`.
    setSettings((current) => {
      const scaleIds = checked
        ? scalesByDifficulty()
            .map((scale) => scale.id)
            .filter((id) => current.scaleIds.includes(id) || id === scaleId)
        : current.scaleIds.filter((id) => id !== scaleId)

      const shared = sharedDegrees(scaleIds.map(scaleById))
      return {
        ...current,
        scaleIds,
        featured: current.featured.filter((degree) => shared.includes(degree)),
      }
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard footer="Listed easiest first. The pentatonics have no semitones and no tritone, so every note is consonant against the tonic; the chromatic scale has no key at all. With more than one selected, each melody picks one — and you are not told which.">
        {scalesByDifficulty().map((scale) => {
          const checked = chosen.has(scale.id)

          return (
            <CheckRow
              key={scale.id}
              label={
                <>
                  <span className="block">{scale.name}</span>
                  <span className="block text-sm text-content-muted">
                    {scale.degrees.map(degreeLabel).join(' ')}
                  </span>
                </>
              }
              checked={checked}
              // Nothing selected can generate nothing. The exercise says so,
              // but stopping it here means it never has to.
              onChange={(next) => toggle(scale.id, next)}
            />
          )
        })}
      </ListCard>
    </div>
  )
}

/**
 * Degrees that must appear in every melody.
 *
 * Only degrees common to every selected scale are offered, which is what makes
 * an illegal combination unreachable rather than merely warned about.
 */
function FeaturedScreen() {
  const [settings, setSettings] = usePersisted(melodySettingsStore)
  const scales = selectedScales(settings)
  const offered = sharedDegrees(scales)
  const featured = new Set(settings.featured)

  // Derived inside the updater, so four quick taps are four toggles rather
  // than whichever one landed last. See `usePersisted`.
  const toggle = (degree: number, checked: boolean) => {
    setSettings((current) => ({
      ...current,
      featured: checked
        ? [
            ...offered.filter(
              (option) =>
                current.featured.includes(option) || option === degree,
            ),
          ]
        : current.featured.filter((option) => option !== degree),
    }))
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard
        footer={
          scales.length > 1
            ? 'A featured degree is guaranteed to appear in every melody, so only degrees every selected scale contains can be offered — one that some of them lack could not be promised.'
            : 'A featured degree is guaranteed to appear in every melody. Without one, enabling a degree only means it may turn up — a six-note melody from the major scale will often contain no 7 at all.'
        }
      >
        {offered.map((degree) => (
          <CheckRow
            key={degree}
            label={degreeLabel(degree)}
            checked={featured.has(degree)}
            onChange={(next) => toggle(degree, next)}
          />
        ))}
      </ListCard>

      {featuredWarning(settings) && (
        <p className="px-4 text-center text-sm text-incorrect">
          {featuredWarning(settings)}
        </p>
      )}
    </div>
  )
}

function LengthScreen() {
  const [settings, setSettings] = usePersisted(melodySettingsStore)

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard footer="Three notes is the shortest thing with a shape rather than a pair of intervals. Past eight it becomes a test of memory rather than of ear.">
        <RadioGroup label="Length">
          {MELODY_LENGTHS.map((length) => (
            <RadioRow
              key={length}
              label={`${length} notes`}
              selected={length === settings.length}
              onSelect={() =>
                setSettings((current) => ({ ...current, length }))
              }
            />
          ))}
        </RadioGroup>
      </ListCard>

      {featuredWarning(settings) && (
        <p className="px-4 text-center text-sm text-incorrect">
          {featuredWarning(settings)}
        </p>
      )}
    </div>
  )
}

/**
 * What sounds under the melody.
 *
 * This is the real difficulty control, and a steeper one than any scale on the
 * ladder: with the chord holding underneath, the tonic never has to be
 * remembered because it never stopped playing. Take it away and every degree
 * has to be measured against something the user is carrying in their head.
 */
function BackingScreen() {
  const [settings, setSettings] = usePersisted(melodySettingsStore)

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard footer="Removing the backing is a bigger jump in difficulty than any change of scale.">
        <RadioGroup label="Backing">
          {MELODY_BACKINGS.map((backing) => (
            <RadioRow
              key={backing}
              label={BACKING_NAMES[backing]}
              description={BACKING_DESCRIPTIONS[backing]}
              selected={backing === settings.backing}
              onSelect={() =>
                setSettings((current) => ({ ...current, backing }))
              }
            />
          ))}
        </RadioGroup>
      </ListCard>
    </div>
  )
}

function MelodyRangeScreen() {
  const [settings, setSettings] = usePersisted(melodySettingsStore)

  return (
    <RangeScreen
      range={settings.range}
      onChange={(range: MelodySettings['range']) =>
        setSettings((current) => ({ ...current, range }))
      }
      footer="Melodies are written across one octave, placed anywhere inside this range."
      warning={melodyRangeWarning(settings)}
    />
  )
}
