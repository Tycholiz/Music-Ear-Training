import { CheckRow, ListCard, ListRow, useModalNav } from '../components'
import {
  ROOT_INPUT_MODES,
  rootInputModeStore,
  usePersisted,
  type RootInputMode,
} from '../settings'

const LABELS: Record<RootInputMode, string> = {
  reveal: 'Reveal',
  microphone: 'Microphone',
}

const DESCRIPTIONS: Record<RootInputMode, string> = {
  reveal: 'Hear the root and mark yourself.',
  microphone: 'Hum or play the root and let the app listen.',
}

/**
 * How the chord root exercise takes its answer.
 *
 * Exactly one is active, so the current mode cannot be switched off — only the
 * other one switched on, which is the same "pin the last selection" behaviour
 * the multi-select screens use.
 */
export function InputModeScreen() {
  const [mode, setMode] = usePersisted(rootInputModeStore)

  return (
    <div className="flex flex-col gap-6 p-4">
      <ListCard footer="Microphone mode needs permission the first time you use it.">
        {ROOT_INPUT_MODES.map((option) => (
          <CheckRow
            key={option}
            label={
              <span className="flex flex-col">
                <span>{LABELS[option]}</span>
                <span className="text-sm text-content-muted">
                  {DESCRIPTIONS[option]}
                </span>
              </span>
            }
            checked={mode === option}
            disabled={mode === option}
            onChange={() => setMode(option)}
          />
        ))}
      </ListCard>
    </div>
  )
}

/** The row that opens the screen above, for the root exercise's Customize. */
export function InputModeRow() {
  const { push } = useModalNav()
  const [mode] = usePersisted(rootInputModeStore)

  return (
    <ListRow
      label="Input Mode"
      value={LABELS[mode]}
      chevron
      onClick={() =>
        push({ title: 'Input Mode', content: <InputModeScreen /> })
      }
    />
  )
}
