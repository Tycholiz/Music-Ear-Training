import {
  AboutPage,
  type AboutContent,
  CheckRow,
  ListCard,
  ListRow,
  useModalNav,
} from '../components'
import {
  usePersisted,
  type ChordSettings,
  type ExerciseStats,
  type PersistedStore,
} from '../settings'
import { CHORDS, midiToName, type Chord } from '../theory'
import { chordRangeWarning, isChordStuck, type StatsView } from '../exercises'
import { ChordsScreen } from './ChordsScreen'
import { InversionsScreen } from './InversionsScreen'
import { ChordPlayModeScreen } from './ChordPlayModeScreen'
import { RangeScreen } from './RangeScreen'
import { DrillsScreen } from './DrillsScreen'
import { StatisticsScreen } from './StatisticsScreen'

/**
 * Hamburger menu for any exercise built on chords, and the Customize screen it
 * pushes. Both live inside the same `ModalSheet` navigation stack.
 *
 * Shared by the chord and chord-root exercises, which need exactly the same
 * four settings. They pass different stores, so their selections stay
 * independent — the two are practised differently, and one shared selection
 * would have to serve both badly.
 */
export function ChordSettingsMenu({
  store,
  statsStore,
  statsView,
  about,
  onStartDrill,
  onResetScore,
  availableChords = CHORDS,
}: {
  store: PersistedStore<ChordSettings>
  statsStore: PersistedStore<ExerciseStats>
  /** Chords and chord root record the same namespaces but read differently. */
  statsView: StatsView
  /**
   * This exercise's About page. Passed in for the same reason `statsView` is:
   * two exercises share this menu and neither's manual is the other's.
   */
  about: AboutContent
  /**
   * Start a drill, when this exercise has them.
   *
   * Only the chord exercise does. Chord root shares this menu and has no
   * drills — the two chords of a pair have the same root, so a drill would be
   * asking one question with one answer.
   */
  onStartDrill?: (drillId: string) => void
  onResetScore: () => void
  /** Narrower for the root exercise, which cannot use ambiguous chords. */
  availableChords?: readonly Chord[]
}) {
  const { push } = useModalNav()

  return (
    <div className="p-4">
      <ListCard>
        <ListRow
          label="Customization"
          chevron
          onClick={() =>
            push({
              title: 'Customize',
              content: (
                <CustomizeScreen
                  store={store}
                  availableChords={availableChords}
                />
              ),
            })
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
                  store={statsStore}
                  view={statsView}
                  onReset={() => statsStore.reset()}
                />
              ),
            })
          }
        />
        {onStartDrill && (
          <ListRow
            label="Drills"
            chevron
            onClick={() =>
              push({
                title: 'Drills',
                content: <DrillsScreen onStart={onStartDrill} />,
              })
            }
          />
        )}
        <ListRow
          label="About this exercise"
          chevron
          onClick={() =>
            push({
              title: 'About',
              content: <AboutPage content={about} />,
            })
          }
        />
        <ListRow label="Reset Score" destructive onClick={onResetScore} />
      </ListCard>
    </div>
  )
}

function CustomizeScreen({
  store,
  availableChords,
}: {
  store: PersistedStore<ChordSettings>
  availableChords: readonly Chord[]
}) {
  const { push } = useModalNav()
  const [settings] = usePersisted(store)

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard>
        <ListRow
          label="Chords"
          value={`${settings.chords.length} selected`}
          chevron
          onClick={() =>
            push({
              title: 'Chords',
              content: (
                <ChordsScreen store={store} available={availableChords} />
              ),
            })
          }
        />
        <ListRow
          label="Inversions"
          value={`${settings.inversions.length} selected`}
          chevron
          onClick={() =>
            push({
              title: 'Inversions',
              content: <InversionsScreen store={store} />,
            })
          }
        />
        <ListRow
          label="Range"
          value={`${midiToName(settings.range.low)}–${midiToName(settings.range.high)}`}
          chevron
          onClick={() =>
            push({
              title: 'Range',
              content: <ChordRangeScreen store={store} />,
            })
          }
        />
        <ListRow
          label="Play Mode"
          value={`${settings.playModes.length} selected`}
          chevron
          onClick={() =>
            push({
              title: 'Play Mode',
              content: <ChordPlayModeScreen store={store} />,
            })
          }
        />
      </ListCard>

      <ListCard footer="Questions favour the chords going worst, within the ones you have selected. It never turns a chord on or off — that stays yours.">
        <CheckRow
          label="Focus on weak spots"
          checked={settings.adaptive}
          onChange={(adaptive) => store.write({ ...settings, adaptive })}
        />
      </ListCard>

      {isChordStuck(settings) && (
        <p className="px-4 text-center text-sm text-incorrect">
          Nothing can be played with these settings. Widen the range, or enable
          a chord one of the selected inversions can be applied to — a Major
          Triad in root position is always safe.
        </p>
      )}
    </div>
  )
}

function ChordRangeScreen({ store }: { store: PersistedStore<ChordSettings> }) {
  const [settings, setSettings] = usePersisted(store)

  return (
    <RangeScreen
      range={settings.range}
      onChange={(range) => setSettings({ ...settings, range })}
      footer="Range determines the available pitches for all notes of the chord."
      warning={chordRangeWarning(settings)}
    />
  )
}
