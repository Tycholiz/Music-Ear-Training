import { ListCard, ListRow, useModalNav } from '../components'
import { intervalSettingsStore, usePersisted } from '../settings'
import { intervalName } from '../theory'
import { isStuck, rangeWarning } from '../exercises'
import { IntervalsScreen } from './IntervalsScreen'
import { PlayModeScreen } from './PlayModeScreen'
import { RangeScreen } from './RangeScreen'
import { midiToName } from '../theory'

function IntervalRangeScreen() {
  const [settings, setSettings] = usePersisted(intervalSettingsStore)

  return (
    <RangeScreen
      range={settings.range}
      onChange={(range) => setSettings({ ...settings, range })}
      footer="Range determines the available pitches for both notes of the interval."
      warning={rangeWarning(settings)}
    />
  )
}

/**
 * Root of the interval exercise's hamburger menu, and the Customize screen it
 * pushes. Both live inside the same `ModalSheet` navigation stack.
 */
export function IntervalMenu({ onResetScore }: { onResetScore: () => void }) {
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
  const [settings] = usePersisted(intervalSettingsStore)

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard>
        <ListRow
          label="Intervals"
          value={`${settings.intervals.length} selected`}
          chevron
          onClick={() =>
            push({ title: 'Intervals', content: <IntervalsScreen /> })
          }
        />
        <ListRow
          label="Play Mode"
          value={`${settings.playModes.length} selected`}
          chevron
          onClick={() =>
            push({ title: 'Play Mode', content: <PlayModeScreen /> })
          }
        />
        <ListRow
          label="Range"
          value={`${midiToName(settings.range.low)}–${midiToName(settings.range.high)}`}
          chevron
          onClick={() =>
            push({ title: 'Range', content: <IntervalRangeScreen /> })
          }
        />
      </ListCard>

      {isStuck(settings) && (
        <p className="px-4 text-center text-sm text-incorrect">
          Nothing can be played with these settings. Widen the range, or enable
          an interval one of the selected play modes can reach —{' '}
          {intervalName(7)} is always safe.
        </p>
      )}
    </div>
  )
}
