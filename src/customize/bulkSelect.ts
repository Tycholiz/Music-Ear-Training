/**
 * Checking and unchecking a whole group of settings rows at once.
 *
 * Every multi-select screen already knows, per row, whether it may be switched
 * on and whether it may be switched off — a chord the range cannot build, a
 * numeral an enabled cadence depends on. A group control has to obey exactly
 * those rules rather than inventing its own, or it becomes the way round them.
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
 * Rows the group control can actually speak for.
 *
 * A row that is off and cannot be turned on is not "unchecked" in any sense the
 * user can act on — it is unavailable. Counting it would leave a group that is
 * as selected as it can possibly be still offering to select it, and the tap
 * would do nothing at all.
 */
function actionable(items: readonly Selectable[]): Selectable[] {
  return items.filter((item) => item.checked || item.canEnable)
}

/**
 * Whether tapping would clear the group rather than fill it.
 *
 * A group counts as full when everything in it that *can* be on is on, which is
 * what makes the control a straight toggle: press to take them all, press again
 * to give them all back. It said "select all" and then refused on some screens
 * and not others, because clearing used to be blocked whenever it would leave
 * the whole screen empty — and whether it did depended on what happened to be
 * selected in the *other* sections. One control, two behaviours, no way for the
 * user to tell which they were about to get.
 */
export function groupIsFull(items: readonly Selectable[]): boolean {
  const rows = actionable(items)
  return rows.length > 0 && rows.every((item) => item.checked)
}

/** Whether the group control does anything at all right now. */
export function groupCanToggle(items: readonly Selectable[]): boolean {
  const rows = actionable(items)
  if (rows.length === 0) return false
  return groupIsFull(rows) ? rows.some((item) => item.canDisable) : true
}

/**
 * The selection after tapping a group control.
 *
 * Emptying it is allowed. Every exercise already has a "nothing can be played
 * with the current settings" screen — reachable today by narrowing the range —
 * so an empty selection is a state the app knows how to show rather than one it
 * has to be protected from.
 */
export function afterGroupToggle(
  group: readonly Selectable[],
  selection: readonly string[],
): string[] {
  const rows = actionable(group)
  const chosen = new Set(selection)

  if (groupIsFull(rows)) {
    // `canDisable` is not symmetrical with `canEnable`: a row can be on, and
    // allowed to be on, and still not allowed to be turned off. That is what a
    // cadence's locked chords are, and the group has to stop where a single tap
    // on that row already stops.
    for (const item of rows) {
      if (item.canDisable) chosen.delete(item.id)
    }
  } else {
    // No `canEnable` check: `actionable` has already dropped everything that is
    // off and cannot be turned on, so what is left is either switchable or
    // already switched on.
    for (const item of rows) chosen.add(item.id)
  }

  return [...chosen]
}
