import { CheckRow, ListCard } from '../components'
import {
  COMPOUND_INTERVALS,
  INTERVALS,
  SIMPLE_INTERVALS,
  type Interval,
} from '../theory'
import { intervalSettingsStore, usePersisted } from '../settings'
import { intervalsWarning, isIntervalUsable } from '../exercises'
import { afterGroupToggle, groupCanToggle, groupIsFull } from './bulkSelect'
import { SelectAll } from './SelectAll'

/**
 * Which intervals the user wants to be tested on.
 *
 * Split into simple and compound, matching the two grouped cards in the
 * reference design. Intervals that can't be reached with the current range and
 * play modes are shown disabled rather than silently never appearing.
 */
export function IntervalsScreen() {
  const [settings, setSettings] = usePersisted(intervalSettingsStore)
  const enabled = new Set(settings.intervals)
  const warning = intervalsWarning(settings)

  const toggle = (semitones: number, checked: boolean) => {
    const next = checked
      ? [...settings.intervals, semitones].sort((a, b) => a - b)
      : settings.intervals.filter((value) => value !== semitones)
    setSettings({ ...settings, intervals: next })
  }

  /**
   * What a group checkbox needs about each interval: the same two rules the
   * individual rows follow, handed over rather than restated.
   */
  const selectable = (intervals: readonly Interval[]) =>
    intervals.map((interval) => ({
      id: String(interval.semitones),
      checked: enabled.has(interval.semitones),
      canEnable: isIntervalUsable(interval.semitones, settings),
      canDisable: true,
    }))

  const toggleGroup = (intervals: readonly Interval[]) => {
    const next = afterGroupToggle(
      selectable(intervals),
      settings.intervals.map(String),
    )
    setSettings({
      ...settings,
      intervals: next.map(Number).sort((a, b) => a - b),
    })
  }

  const selectAll = (intervals: readonly Interval[], of?: string) => (
    <SelectAll
      of={of}
      full={groupIsFull(selectable(intervals))}
      disabled={!groupCanToggle(selectable(intervals))}
      onToggle={() => toggleGroup(intervals)}
    />
  )

  const row = (interval: Interval) => {
    const checked = enabled.has(interval.semitones)
    const usable = isIntervalUsable(interval.semitones, settings)

    return (
      <CheckRow
        key={interval.semitones}
        label={
          <span className={!checked && !usable ? 'text-content-muted' : ''}>
            {interval.name}
          </span>
        }
        checked={checked}
        // An unreachable interval can still be switched off — only turning
        // one on is blocked. Switching off the last one is allowed; the
        // exercise then says it has nothing to ask.
        disabled={!checked && !usable}
        onChange={(next) => toggle(interval.semitones, next)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {/*
        The whole screen first. Twenty-four rows is a long way to tap to a large
        selection, and the shortest route to one is to take them all and put a
        few back.
      */}
      <div className="flex justify-end px-4">
        {selectAll(INTERVALS, 'intervals')}
      </div>

      <ListCard
        title="Simple"
        action={selectAll(SIMPLE_INTERVALS)}
        footer={warning}
      >
        {SIMPLE_INTERVALS.map(row)}
      </ListCard>
      <ListCard
        title="Compound"
        action={selectAll(COMPOUND_INTERVALS)}
        footer="Compound intervals are only offered ascending and harmonic — descending always resolves within an octave."
      >
        {COMPOUND_INTERVALS.map(row)}
      </ListCard>
    </div>
  )
}
