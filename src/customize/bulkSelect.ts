import type { CheckState } from '../components'

/**
 * Checking and unchecking a whole group of settings rows at once.
 *
 * Every multi-select screen already knows, per row, whether it may be switched
 * on and whether it may be switched off — a chord the range cannot build, a
 * numeral an enabled cadence depends on, the last remaining option on a screen
 * that needs one. A group checkbox has to obey exactly those rules rather than
 * inventing its own, or it becomes the way round them.
 *
 * So the screens hand over what they already computed and this decides what a
 * tap does. Nothing here knows what a chord is.
 */

export interface Selectable {
  id: string
  checked: boolean
  /** Whether it may be switched on right now. */
  canEnable: boolean
  /** Whether it may be switched off right now. */
  canDisable: boolean
}

/**
 * Rows the group checkbox can actually speak for.
 *
 * A row that is off and cannot be turned on is not "unchecked" in any sense the
 * user can act on — it is unavailable. Counting it would leave a group that is
 * as checked as it can possibly be showing as partial forever, and a tap on
 * that box would do nothing at all.
 */
function actionable(items: readonly Selectable[]): Selectable[] {
  return items.filter((item) => item.checked || item.canEnable)
}

/** What the group checkbox shows. */
export function groupState(items: readonly Selectable[]): CheckState {
  const rows = actionable(items)
  if (rows.length === 0) return false

  const checked = rows.filter((item) => item.checked).length
  if (checked === 0) return false
  return checked === rows.length ? true : 'mixed'
}

/**
 * The selection after tapping a group checkbox, or null when it cannot be.
 *
 * Null rather than an empty array, because those are different answers and the
 * store cannot tell them apart: `sanitizeSelection` reads an empty selection as
 * corrupt and hands back the *defaults*, so a bulk uncheck that emptied the list
 * would look to the user like the screen had reset itself to something they
 * never chose. Nothing is allowed to write one.
 *
 * A group already fully checked turns off, taking with it only the rows it is
 * allowed to. A group that is partial or empty turns on, for the same reason
 * `CheckRow` sends `true` from a mixed box: the tap means "I want these".
 */
export function afterGroupToggle(
  group: readonly Selectable[],
  selection: readonly string[],
): string[] | null {
  const rows = actionable(group)
  if (rows.length === 0) return null

  const turningOn = rows.some((item) => !item.checked)
  const chosen = new Set(selection)

  if (turningOn) {
    // No `canEnable` check: `actionable` has already dropped everything that
    // is off and cannot be turned on, so what is left is either switchable or
    // already switched on. A guard here would look load-bearing and never fire.
    for (const item of rows) chosen.add(item.id)
  } else {
    // `canDisable` *is* checked, and is not symmetrical with the above — a row
    // can be on, and allowed to be on, and still not allowed to be turned off.
    // That is what a cadence's locked chords are.
    for (const item of rows) {
      if (item.canDisable) chosen.delete(item.id)
    }
  }

  // The rule the individual rows already follow, applied to a group: the last
  // thing standing is pinned, so the exercise always has something to ask.
  if (chosen.size === 0) return null

  const next = [...chosen]
  // A tap that changes nothing is a tap the user should not have been offered.
  return sameMembers(next, selection) ? null : next
}

/** Whether the group checkbox should be tappable at all. */
export function groupDisabled(
  group: readonly Selectable[],
  selection: readonly string[],
): boolean {
  return afterGroupToggle(group, selection) === null
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const inB = new Set(b)
  return a.every((id) => inB.has(id))
}
