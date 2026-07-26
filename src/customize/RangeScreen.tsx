import { DEFAULT_RANGE, intervalSettingsStore, usePersisted } from '../settings'
import { rangeWarning } from '../exercises'
import { NotePicker } from './NotePicker'

/**
 * The lowest and highest pitch either note of the interval may take.
 *
 * The two pickers constrain each other, so the range can never be inverted —
 * there is no state where low sits above high to recover from.
 */
export function RangeScreen() {
  const [settings, setSettings] = usePersisted(intervalSettingsStore)
  const { low, high } = settings.range
  const warning = rangeWarning(settings)

  const setRange = (next: { low: number; high: number }) => {
    setSettings({ ...settings, range: next })
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="overflow-hidden rounded-xl bg-surface">
        <NotePicker
          label="Lowest note"
          value={low}
          max={high}
          onChange={(midi) => setRange({ low: midi, high })}
        />
        <div className="border-t border-separator" />
        <NotePicker
          label="Highest note"
          value={high}
          min={low}
          onChange={(midi) => setRange({ low, high: midi })}
        />
      </div>

      <button
        type="button"
        onClick={() => setRange(DEFAULT_RANGE)}
        className="self-center px-4 py-1 text-accent"
      >
        Reset
      </button>

      <p className="px-4 text-center text-sm text-content-muted">
        Range determines the available pitches for both notes of the interval.
      </p>

      {warning && (
        <p className="px-4 text-center text-sm text-incorrect">{warning}</p>
      )}
    </div>
  )
}
