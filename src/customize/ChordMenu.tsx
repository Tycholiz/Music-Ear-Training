import { ListCard, ListRow, useModalNav } from '../components'
import { chordSettingsStore, usePersisted } from '../settings'
import { midiToName } from '../theory'
import { chordRangeWarning, isChordStuck } from '../exercises'
import { ChordsScreen } from './ChordsScreen'
import { InversionsScreen } from './InversionsScreen'
import { ChordPlayModeScreen } from './ChordPlayModeScreen'
import { RangeScreen } from './RangeScreen'

/**
 * Root of the chord exercise's hamburger menu, and the Customize screen it
 * pushes. Both live inside the same `ModalSheet` navigation stack.
 */
export function ChordMenu({ onResetScore }: { onResetScore: () => void }) {
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
  const [settings] = usePersisted(chordSettingsStore)

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard>
        <ListRow
          label="Chords"
          value={`${settings.chords.length} selected`}
          chevron
          onClick={() => push({ title: 'Chords', content: <ChordsScreen /> })}
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
            push({ title: 'Range', content: <ChordRangeScreen /> })
          }
        />
        <ListRow
          label="Play Mode"
          value={`${settings.playModes.length} selected`}
          chevron
          onClick={() =>
            push({ title: 'Play Mode', content: <ChordPlayModeScreen /> })
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

function ChordRangeScreen() {
  const [settings, setSettings] = usePersisted(chordSettingsStore)

  return (
    <RangeScreen
      range={settings.range}
      onChange={(range) => setSettings({ ...settings, range })}
      footer="Range determines the available pitches for all notes of the chord."
      warning={chordRangeWarning(settings)}
    />
  )
}
