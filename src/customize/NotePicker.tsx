import { useEffect, useRef } from 'react'
import { HIGHEST_NOTE, LOWEST_NOTE } from '../audio'
import { midiToName, notesInRange } from '../theory'

/**
 * Horizontal note wheel.
 *
 * The reference design shows a scroll-snapping strip with the selected note
 * bright and centred and its neighbours fading out. Selection here is by tap
 * rather than by whatever happens to be centred when scrolling stops — tapping
 * is unambiguous, works with a keyboard, and doesn't fight momentum scrolling.
 * Scrolling still browses, and the selection is scrolled back into view.
 */
export function NotePicker({
  label,
  value,
  min = LOWEST_NOTE,
  max = HIGHEST_NOTE,
  onChange,
}: {
  label: string
  value: number
  /** Notes outside these bounds are shown but can't be selected. */
  min?: number
  max?: number
  onChange: (midi: number) => void
}) {
  const selectedRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
    })
  }, [value])

  return (
    <div
      role="group"
      aria-label={label}
      className="flex snap-x snap-mandatory overflow-x-auto px-[45%] py-3"
    >
      {notesInRange(LOWEST_NOTE, HIGHEST_NOTE).map((midi) => {
        const selected = midi === value
        const selectable = midi >= min && midi <= max

        return (
          <button
            key={midi}
            type="button"
            ref={selected ? selectedRef : undefined}
            aria-pressed={selected}
            disabled={!selectable}
            onClick={() => onChange(midi)}
            className={`w-14 shrink-0 snap-center py-1 text-center tabular-nums transition-[color,font-size] ${
              selected
                ? 'text-2xl font-semibold text-content'
                : selectable
                  ? 'text-base text-content-muted'
                  : 'text-base text-content-muted opacity-25'
            }`}
          >
            {formatNote(midi)}
          </button>
        )
      })}
    </div>
  )
}

/** `C#3` rendered with the octave as a subscript, as in the design. */
function formatNote(midi: number) {
  const name = midiToName(midi)
  const split = name.search(/-?\d/)
  return (
    <>
      {name.slice(0, split)}
      <sub className="text-[0.6em]">{name.slice(split)}</sub>
    </>
  )
}
