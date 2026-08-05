import { CheckRow, ListCard } from '../components'
import {
  INTERVAL_PLAY_MODES,
  intervalSettingsStore,
  usePersisted,
  type IntervalPlayMode,
} from '../settings'
import { isPlayModeUsable, playModeName, playModesWarning } from '../exercises'
import { StaffFigure } from './StaffFigure'

/**
 * How the two notes are played. Rows are identified by a staff figure rather
 * than a text label, as in the reference design — the name is still present for
 * screen readers.
 */
export function PlayModeScreen() {
  const [settings, setSettings] = usePersisted(intervalSettingsStore)
  const enabled = new Set(settings.playModes)
  const warning = playModesWarning(settings)

  const toggle = (mode: IntervalPlayMode, checked: boolean) => {
    const next = checked
      ? INTERVAL_PLAY_MODES.filter(
          (option) => enabled.has(option) || option === mode,
        )
      : settings.playModes.filter((option) => option !== mode)
    setSettings({ ...settings, playModes: [...next] })
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard footer={warning}>
        {INTERVAL_PLAY_MODES.map((mode) => {
          const checked = enabled.has(mode)
          const usable = isPlayModeUsable(mode, settings)

          return (
            <CheckRow
              key={mode}
              label={
                <span
                  className={`flex items-center ${
                    !checked && !usable ? 'opacity-40' : ''
                  }`}
                >
                  <span className="sr-only">{playModeName(mode)}</span>
                  <StaffFigure mode={mode} />
                </span>
              }
              checked={checked}
              // A mode that can't produce anything can still be switched
              // off, and so can the last one — the exercise then says it has
              // nothing to ask rather than the screen refusing the tap.
              disabled={!checked && !usable}
              onChange={(next) => toggle(mode, next)}
            />
          )
        })}
      </ListCard>
    </div>
  )
}
