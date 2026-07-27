import { CheckRow, ListCard } from '../components'
import { usePersisted } from '../settings'
import type { ChordSettings, PersistedStore } from '../settings'
import {
  ALL_INVERSIONS,
  INVERSION_NAMES,
  inversionsWarning,
  isInversionUsable,
} from '../exercises'

/**
 * Which inversions the exercise may use.
 *
 * 3rd inversion only exists for chords with four or more voices. Enabling it
 * doesn't remove triads from the pool — they're simply generated in one of the
 * other enabled inversions instead.
 */
export function InversionsScreen({
  store,
}: {
  store: PersistedStore<ChordSettings>
}) {
  const [settings, setSettings] = usePersisted(store)
  const enabled = new Set(settings.inversions)
  const warning = inversionsWarning(settings)

  const toggle = (inversion: number, checked: boolean) => {
    const next = checked
      ? ALL_INVERSIONS.filter(
          (option) => enabled.has(option) || option === inversion,
        )
      : settings.inversions.filter((option) => option !== inversion)
    setSettings({ ...settings, inversions: next })
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard
        footer={
          warning ??
          '3rd inversion applies only to chords with four or more voices. Triads are generated in one of the other selected inversions.'
        }
      >
        {ALL_INVERSIONS.map((inversion) => {
          const checked = enabled.has(inversion)
          const usable = isInversionUsable(inversion, settings)

          return (
            <CheckRow
              key={inversion}
              label={
                <span
                  className={!checked && !usable ? 'text-content-muted' : ''}
                >
                  {INVERSION_NAMES[inversion]}
                </span>
              }
              checked={checked}
              disabled={
                (!checked && !usable) ||
                (checked && settings.inversions.length === 1)
              }
              onChange={(next) => toggle(inversion, next)}
            />
          )
        })}
      </ListCard>
    </div>
  )
}
