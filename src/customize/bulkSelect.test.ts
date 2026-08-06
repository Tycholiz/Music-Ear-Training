import { describe, expect, it } from 'vitest'
import {
  afterGroupToggle,
  groupCanToggle,
  groupIsFull,
  type Selectable,
} from './bulkSelect'

function item(
  id: string,
  checked: boolean,
  overrides: Partial<Selectable> = {},
): Selectable {
  return { id, checked, canEnable: true, canDisable: true, ...overrides }
}

describe('whether the group reads as full', () => {
  it('is full when everything in it is on', () => {
    expect(groupIsFull([item('a', true), item('b', true)])).toBe(true)
  })

  it('is not full while anything is off', () => {
    expect(groupIsFull([item('a', true), item('b', false)])).toBe(false)
  })

  it('ignores rows that are off and cannot be turned on', () => {
    // A chord the range cannot build is not "unchecked" in any sense the user
    // can act on. Counted, a group as full as it can possibly be would keep
    // offering to fill it, and the tap would do nothing.
    expect(
      groupIsFull([item('a', true), item('b', false, { canEnable: false })]),
    ).toBe(true)
  })

  it('is not full when there is nothing in it to be full of', () => {
    expect(groupIsFull([item('a', false, { canEnable: false })])).toBe(false)
  })
})

describe('tapping the group control', () => {
  it('fills a partial group', () => {
    expect(
      afterGroupToggle([item('a', true), item('b', false)], ['a']).sort(),
    ).toEqual(['a', 'b'])
  })

  it('fills an empty group', () => {
    expect(
      afterGroupToggle([item('a', false), item('b', false)], ['x']).sort(),
    ).toEqual(['a', 'b', 'x'])
  })

  it('clears a full group', () => {
    expect(
      afterGroupToggle([item('a', true), item('b', true)], ['a', 'b', 'x']),
    ).toEqual(['x'])
  })

  it('clears a full group all the way to nothing', () => {
    // The whole complaint about the first version: the control said "select
    // all" and then refused to clear on some screens and not others, because
    // clearing was blocked whenever it would empty the selection — and whether
    // it did depended on what happened to be on in the *other* sections.
    expect(
      afterGroupToggle([item('a', true), item('b', true)], ['a', 'b']),
    ).toEqual([])
  })

  it('leaves everything outside the group alone', () => {
    expect(afterGroupToggle([item('a', false)], ['x', 'y']).sort()).toEqual([
      'a',
      'x',
      'y',
    ])
  })

  it('does not switch on something that cannot be switched on', () => {
    // The rule an individual row already follows. A group control that could
    // reach past it would be the way round it.
    expect(
      afterGroupToggle(
        [item('a', false), item('b', false, { canEnable: false })],
        [],
      ),
    ).toEqual(['a'])
  })

  it('does not switch off something that is locked', () => {
    // A numeral an enabled cadence depends on. Switching off every chord a
    // plagal cadence is made of would break the setting the lock protects.
    expect(
      afterGroupToggle(
        [item('a', true), item('b', true, { canDisable: false })],
        ['a', 'b'],
      ),
    ).toEqual(['b'])
  })
})

describe('when the control does nothing', () => {
  it('can always fill a group that is not full', () => {
    expect(groupCanToggle([item('a', true), item('b', false)])).toBe(true)
  })

  it('can clear a full group', () => {
    expect(groupCanToggle([item('a', true)])).toBe(true)
  })

  it('cannot clear a group that is entirely locked on', () => {
    expect(groupCanToggle([item('a', true, { canDisable: false })])).toBe(false)
  })

  it('cannot act on a group with no available rows at all', () => {
    expect(groupCanToggle([item('a', false, { canEnable: false })])).toBe(false)
  })
})
