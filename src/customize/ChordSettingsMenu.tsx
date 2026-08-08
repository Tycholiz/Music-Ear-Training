import { useCallback, useEffect, useRef } from 'react'
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
  openDrills = false,
  onDrillsOpened,
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
  /**
   * Open straight onto the Drills list rather than the root menu.
   *
   * For the sheet opened by finishing a drill. "Done" means *back to where I
   * chose this one*, and landing on the root menu would make the user find
   * their way back down to the list they had just been in — with the bucket
   * the drill they finished has moved into being the thing they most want to
   * see.
   */
  openDrills?: boolean
  /**
   * Called once the list has been opened, so the caller can put the flag down.
   *
   * **The sheet renders a pushed screen _instead of_ its children**, so this
   * menu unmounts while the list is up and mounts again when Back pops it —
   * and anything that decides to open the list on mount gets a second go at it
   * on the way back. Guarding with a ref cannot help, because the ref goes
   * with the unmount.
   *
   * So the flag is spent rather than remembered: it means "open onto Drills
   * this once", and Back then lands on the menu like any other screen.
   */
  onDrillsOpened?: () => void
  onResetScore: () => void
  /** Narrower for the root exercise, which cannot use ambiguous chords. */
  availableChords?: readonly Chord[]
}) {
  const { push } = useModalNav()

  /** One way to reach the Drills list, whether it is tapped or arrived at. */
  const openDrillsScreen = useCallback(() => {
    if (!onStartDrill) return
    push({
      title: 'Drills',
      content: <DrillsScreen onStart={onStartDrill} />,
    })
  }, [onStartDrill, push])

  // Opened once and the flag put down — see `onDrillsOpened`. The ref is not
  // the thing that makes it once: it survives a re-render and not the unmount
  // that pushing a screen causes, which is exactly the case that matters. It
  // is here for StrictMode, which runs an effect twice on the same instance.
  const pushed = useRef(false)
  useEffect(() => {
    if (!openDrills || pushed.current) return
    pushed.current = true
    openDrillsScreen()
    onDrillsOpened?.()
  }, [openDrills, openDrillsScreen, onDrillsOpened])

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
          <ListRow label="Drills" chevron onClick={openDrillsScreen} />
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
          onChange={(adaptive) => store.write({ ...store.read(), adaptive })}
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
      onChange={(range) => setSettings((current) => ({ ...current, range }))}
      footer="Range determines the available pitches for all notes of the chord."
      warning={chordRangeWarning(settings)}
    />
  )
}
