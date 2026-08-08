import { CheckRow, ListCard } from '../components'
import {
  CHORD_PLAY_MODES,
  usePersisted,
  type ChordPlayMode,
  type ChordSettings,
  type PersistedStore,
} from '../settings'
import { CHORD_PLAY_MODE_NAMES } from '../exercises'

/**
 * Block sounds every voice together; arpeggiated sounds them one at a time,
 * lowest first. Unlike the interval play modes, neither can ever be
 * unavailable — they don't interact with the range or the chord selection.
 */
export function ChordPlayModeScreen({
  store,
}: {
  store: PersistedStore<ChordSettings>
}) {
  const [settings, setSettings] = usePersisted(store)
  const enabled = new Set(settings.playModes)

  // Derived inside the updater, so two quick taps are two toggles rather than
  // whichever one landed last. See `usePersisted`.
  const toggle = (mode: ChordPlayMode, checked: boolean) => {
    setSettings((current) => ({
      ...current,
      playModes: checked
        ? [
            ...CHORD_PLAY_MODES.filter(
              (option) => current.playModes.includes(option) || option === mode,
            ),
          ]
        : current.playModes.filter((option) => option !== mode),
    }))
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard footer="With both selected, each question picks one at random.">
        {CHORD_PLAY_MODES.map((mode) => {
          const checked = enabled.has(mode)

          return (
            <CheckRow
              key={mode}
              label={CHORD_PLAY_MODE_NAMES[mode]}
              checked={checked}
              onChange={(next) => toggle(mode, next)}
            />
          )
        })}
      </ListCard>
    </div>
  )
}
