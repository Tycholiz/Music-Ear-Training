import { CheckRow, ListCard } from '../components'
import { CHORDS, CHORD_CATEGORIES, type Chord } from '../theory'
import { usePersisted } from '../settings'
import type { ChordSettings, PersistedStore } from '../settings'
import { chordsWarning, isChordUsable } from '../exercises'

/**
 * Which chords the user wants to be tested on, grouped by the categories from
 * the chord table. Chords that can't be built with the current range and
 * inversions are shown disabled rather than silently never appearing.
 */
export function ChordsScreen({
  store,
  available = CHORDS,
}: {
  store: PersistedStore<ChordSettings>
  /**
   * Which chords this exercise can ask about. The root exercise passes a
   * narrower list, since a chord whose root is ambiguous has no right answer
   * there — see `hasAmbiguousRoot`.
   */
  available?: readonly Chord[]
}) {
  const [settings, setSettings] = usePersisted(store)
  const enabled = new Set(settings.chords)
  const warning = chordsWarning(settings)

  const toggle = (id: string, checked: boolean) => {
    // Keep the stored order canonical so the answer grid is stable.
    const next = checked
      ? available
          .filter((chord) => enabled.has(chord.id) || chord.id === id)
          .map((chord) => chord.id)
      : settings.chords.filter((value) => value !== id)
    setSettings({ ...settings, chords: next })
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {CHORD_CATEGORIES.filter((category) =>
        available.some((chord) => chord.category === category),
      ).map((category, index, shown) => (
        <ListCard
          key={category}
          title={category}
          // Attach the warning to the last card so it reads as a summary of
          // the whole screen rather than of one category.
          footer={index === shown.length - 1 ? warning : undefined}
        >
          {available
            .filter((chord) => chord.category === category)
            .map((chord) => {
              const checked = enabled.has(chord.id)
              const usable = isChordUsable(chord.id, settings)

              return (
                <CheckRow
                  key={chord.id}
                  label={
                    <span
                      className={
                        !checked && !usable ? 'text-content-muted' : ''
                      }
                    >
                      {chord.name}
                    </span>
                  }
                  checked={checked}
                  // An unbuildable chord can still be switched off — only
                  // turning one on is blocked. The last remaining chord is
                  // pinned so the exercise always has something to ask.
                  disabled={
                    (!checked && !usable) ||
                    (checked && settings.chords.length === 1)
                  }
                  onChange={(next) => toggle(chord.id, next)}
                />
              )
            })}
        </ListCard>
      ))}
    </div>
  )
}
