import { describe, expect, it } from 'vitest'
import {
  afterGroupToggle,
  groupDisabled,
  groupState,
  type Selectable,
} from './bulkSelect'

function item(
  id: string,
  checked: boolean,
  overrides: Partial<Selectable> = {},
): Selectable {
  return { id, checked, canEnable: true, canDisable: true, ...overrides }
}

describe('what the group checkbox shows', () => {
  it('is checked when everything is', () => {
    expect(groupState([item('a', true), item('b', true)])).toBe(true)
  })

  it('is unchecked when nothing is', () => {
    expect(groupState([item('a', false), item('b', false)])).toBe(false)
  })

  it('is mixed in between', () => {
    expect(groupState([item('a', true), item('b', false)])).toBe('mixed')
  })

  it('ignores rows that are off and cannot be turned on', () => {
    // A chord the range cannot build is not "unchecked" in any sense the user
    // can act on. Counted, it would leave a group that is as checked as it can
    // possibly be showing as partial forever, and the tap would do nothing.
    expect(
      groupState([item('a', true), item('b', false, { canEnable: false })]),
    ).toBe(true)
  })

  it('is unchecked when nothing in it can be acted on at all', () => {
    expect(groupState([item('a', false, { canEnable: false })])).toBe(false)
  })
})

describe('tapping the group checkbox', () => {
  it('turns a partial group fully on', () => {
    const group = [item('a', true), item('b', false)]
    expect(afterGroupToggle(group, ['a'])?.sort()).toEqual(['a', 'b'])
  })

  it('turns an empty group on rather than doing nothing', () => {
    const group = [item('a', false), item('b', false)]
    expect(afterGroupToggle(group, ['x'])?.sort()).toEqual(['a', 'b', 'x'])
  })

  it('turns a full group off', () => {
    const group = [item('a', true), item('b', true)]
    expect(afterGroupToggle(group, ['a', 'b', 'x'])).toEqual(['x'])
  })

  it('leaves everything outside the group alone', () => {
    const group = [item('a', false)]
    expect(afterGroupToggle(group, ['x', 'y'])?.sort()).toEqual(['a', 'x', 'y'])
  })

  it('does not switch on something that cannot be switched on', () => {
    // The rule an individual row already follows. A group checkbox that could
    // reach past it would be the way round it.
    const group = [item('a', false), item('b', false, { canEnable: false })]
    expect(afterGroupToggle(group, [])).toEqual(['a'])
  })

  it('does not switch off something that is locked', () => {
    // A numeral an enabled cadence depends on. Switching off every chord a
    // plagal cadence is made of would break the setting the lock protects.
    const group = [item('a', true), item('b', true, { canDisable: false })]
    expect(afterGroupToggle(group, ['a', 'b'])).toEqual(['b'])
  })

  it('refuses to empty the selection', () => {
    // Not merely unwise: `sanitizeSelection` reads an empty selection as
    // corrupt and returns the *defaults*, so the screen would look to the user
    // like it had reset itself to something they never chose.
    const group = [item('a', true), item('b', true)]
    expect(afterGroupToggle(group, ['a', 'b'])).toBeNull()
  })

  it('refuses a tap that would change nothing', () => {
    const group = [item('a', false, { canEnable: false })]
    expect(afterGroupToggle(group, ['x'])).toBeNull()
  })
})

describe('when the group checkbox is disabled', () => {
  it('is disabled exactly when the tap would do nothing', () => {
    // One source of truth, so the box cannot look tappable and then refuse.
    const wholeSelection = [item('a', true), item('b', true)]
    expect(groupDisabled(wholeSelection, ['a', 'b'])).toBe(true)

    const partial = [item('a', true), item('b', false)]
    expect(groupDisabled(partial, ['a'])).toBe(false)
  })

  it('stays tappable when something outside the group survives', () => {
    const group = [item('a', true)]
    expect(groupDisabled(group, ['a', 'x'])).toBe(false)
  })

  it('is disabled when every row in it is unavailable', () => {
    const group = [item('a', false, { canEnable: false })]
    expect(groupDisabled(group, ['x'])).toBe(true)
  })
})
