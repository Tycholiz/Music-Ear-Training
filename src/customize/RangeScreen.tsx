import { DEFAULT_RANGE, type NoteRange } from '../settings'
import { NotePicker } from './NotePicker'

/**
 * Lowest and highest pitch the exercise may use.
 *
 * The two pickers constrain each other, so the range can never be inverted —
 * there is no state where low sits above high to recover from.
 *
 * Shared by both exercises; the caller supplies the value, the footer wording
 * and any warning, since what the bounds apply to differs (both notes of an
 * interval, every voice of a chord).
 */
export function RangeScreen({
  range,
  onChange,
  footer,
  warning,
}: {
  range: NoteRange
  onChange: (range: NoteRange) => void
  footer: string
  warning: string | null
}) {
  const { low, high } = range

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="overflow-hidden rounded-xl bg-surface">
        <NotePicker
          label="Lowest note"
          value={low}
          max={high}
          onChange={(midi) => onChange({ low: midi, high })}
        />
        <div className="border-t border-separator" />
        <NotePicker
          label="Highest note"
          value={high}
          min={low}
          onChange={(midi) => onChange({ low, high: midi })}
        />
      </div>

      <button
        type="button"
        onClick={() => onChange(DEFAULT_RANGE)}
        className="self-center px-4 py-1 text-accent"
      >
        Reset
      </button>

      <p className="px-4 text-center text-sm text-content-muted">{footer}</p>

      {warning && (
        <p className="px-4 text-center text-sm text-incorrect">{warning}</p>
      )}
    </div>
  )
}
