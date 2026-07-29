import {
  CheckRow,
  ListCard,
  ListRow,
  RadioGroup,
  RadioRow,
  useModalNav,
} from '../components'
import {
  MELODY_BACKINGS,
  melodySettingsStore,
  usePersisted,
  type MelodySettings,
} from '../settings'
import {
  degreeLabel,
  midiToName,
  scaleById,
  scalesByDifficulty,
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
        <ListRow label="Reset Score" destructive onClick={onResetScore} />
        <ListRow
          label="Customize Exercise"
          chevron
          onClick={() =>
            push({ title: 'Customize', content: <CustomizeScreen /> })
          }
        />
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
          label="Scale"
          value={scaleById(settings.scaleId).name}
          chevron
          onClick={() => push({ title: 'Scale', content: <ScaleScreen /> })}
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

/**
 * The difficulty ladder, easiest first.
 *
 * Listed in that order rather than alphabetically because the order *is* the
 * guidance — a user who works down the list is following a sensible
 * progression without having to be told one.
 *
 * Changing scale reconciles the featured degrees rather than leaving them to
 * be sanitised away on the next read. A b7 featured under Mixolydian is not
 * merely invalid once the scale becomes Major, it is unreachable, and leaving
 * it in place would stop any melody generating at all.
 */
function ScaleScreen() {
  const [settings, setSettings] = usePersisted(melodySettingsStore)

  const choose = (scaleId: string) => {
    const degrees = scaleById(scaleId).degrees
    setSettings({
      ...settings,
      scaleId,
      featured: settings.featured.filter((degree) => degrees.includes(degree)),
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard footer="Listed easiest first. The pentatonics have no semitones and no tritone, so every note is consonant against the tonic; the chromatic scale has no key at all.">
        <RadioGroup label="Scale">
          {scalesByDifficulty().map((scale) => (
            <RadioRow
              key={scale.id}
              label={scale.name}
              description={scale.degrees.map(degreeLabel).join(' ')}
              selected={scale.id === settings.scaleId}
              onSelect={() => choose(scale.id)}
            />
          ))}
        </RadioGroup>
      </ListCard>
    </div>
  )
}

/**
 * Degrees that must appear in every melody.
 *
 * Only the chosen scale's degrees are offered, which is what makes an illegal
 * combination unreachable rather than merely warned about.
 */
function FeaturedScreen() {
  const [settings, setSettings] = usePersisted(melodySettingsStore)
  const scale = scaleById(settings.scaleId)
  const featured = new Set(settings.featured)

  const toggle = (degree: number, checked: boolean) => {
    const next = checked
      ? scale.degrees.filter(
          (option) => featured.has(option) || option === degree,
        )
      : settings.featured.filter((option) => option !== degree)
    setSettings({ ...settings, featured: [...next] })
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard footer="A featured degree is guaranteed to appear in every melody. Without one, enabling a degree only means it may turn up — a six-note melody from the major scale will often contain no 7 at all.">
        {scale.degrees.map((degree) => (
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
              onSelect={() => setSettings({ ...settings, length })}
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
              onSelect={() => setSettings({ ...settings, backing })}
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
        setSettings({ ...settings, range })
      }
      footer="Melodies are written across one octave, placed anywhere inside this range."
      warning={melodyRangeWarning(settings)}
    />
  )
}
