import { CheckRow, ListCard } from '../components'
import { CHORDS, CHORD_CATEGORIES, type Chord } from '../theory'
import { usePersisted } from '../settings'
import type { ChordSettings, PersistedStore } from '../settings'
import { chordsWarning, isChordUsable } from '../exercises'
import { afterGroupToggle, groupCanToggle, groupIsFull } from './bulkSelect'
import { SelectAll } from './SelectAll'

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

  /** Keep the stored order canonical so the answer grid is stable. */
  const inOrder = (ids: Iterable<string>) => {
    const chosen = new Set(ids)
    return available
      .filter((chord) => chosen.has(chord.id))
      .map((chord) => chord.id)
  }

  const toggle = (id: string, checked: boolean) => {
    const next = checked
      ? inOrder([...settings.chords, id])
      : settings.chords.filter((value) => value !== id)
    setSettings({ ...settings, chords: next })
  }

  /**
   * What a group checkbox needs to know about each chord: the same two rules
   * the individual rows follow, handed over rather than restated.
   */
  const selectable = (chords: readonly Chord[]) =>
    chords.map((chord) => ({
      id: chord.id,
      checked: enabled.has(chord.id),
      canEnable: isChordUsable(chord.id, settings),
      canDisable: true,
    }))

  const toggleGroup = (chords: readonly Chord[]) => {
    const next = afterGroupToggle(selectable(chords), settings.chords)
    setSettings({ ...settings, chords: inOrder(next) })
  }

  const shownCategories = CHORD_CATEGORIES.filter((category) =>
    available.some((chord) => chord.category === category),
  )

  return (
    <div className="flex flex-col gap-6 p-4">
      {/*
        The whole screen, above the sections it stands for. Someone who wants
        eighteen of the twenty chords has been tapping eighteen times to get
        there, and the shortest way to a large selection is to take all of them
        and put a few back.
      */}
      <div className="flex justify-end px-4">
        <SelectAll
          of="chords"
          full={groupIsFull(selectable(available))}
          disabled={!groupCanToggle(selectable(available))}
          onToggle={() => toggleGroup(available)}
        />
      </div>

      {shownCategories.map((category, index, shown) => {
        const inCategory = available.filter(
          (chord) => chord.category === category,
        )

        return (
          <ListCard
            key={category}
            title={category}
            action={
              <SelectAll
                full={groupIsFull(selectable(inCategory))}
                disabled={!groupCanToggle(selectable(inCategory))}
                onToggle={() => toggleGroup(inCategory)}
              />
            }
            // Attach the warning to the last card so it reads as a summary of
            // the whole screen rather than of one category.
            footer={index === shown.length - 1 ? warning : undefined}
          >
            {inCategory.map((chord) => {
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
                  // turning one on is blocked. Switching off the last one is
                  // allowed: the exercise says it has nothing to ask, which is
                  // a state it already shows when the range is too narrow.
                  disabled={!checked && !usable}
                  onChange={(next) => toggle(chord.id, next)}
                />
              )
            })}
          </ListCard>
        )
      })}
    </div>
  )
}
