import { ListCard, ListRow, useModalNav } from '../components'
import {
  usePersisted,
  type ChordSettings,
  type PersistedStore,
} from '../settings'
import { midiToName } from '../theory'
import { chordRangeWarning, isChordStuck } from '../exercises'
import { ChordsScreen } from './ChordsScreen'
import { InversionsScreen } from './InversionsScreen'
import { ChordPlayModeScreen } from './ChordPlayModeScreen'
import { RangeScreen } from './RangeScreen'

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
  onResetScore,
}: {
  store: PersistedStore<ChordSettings>
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
            push({
              title: 'Customize',
              content: <CustomizeScreen store={store} />,
            })
          }
        />
      </ListCard>
    </div>
  )
}

function CustomizeScreen({ store }: { store: PersistedStore<ChordSettings> }) {
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
            push({ title: 'Chords', content: <ChordsScreen store={store} /> })
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
