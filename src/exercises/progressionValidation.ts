import { CADENCES, cadenceNumerals, numeralById, type Cadence } from '../theory'
import {
  MAX_PROGRESSION_LENGTH,
  MIN_PROGRESSION_LENGTH,
  type ProgressionSettings,
} from '../settings'
import { canGenerateProgression, usableCadences } from './progressionQuestion'

/**
 * Live validation for the progression Customize screens.
 *
 * The interesting part here is not warning about bad states but making them
 * unreachable. A cadence needs its chords: a plagal cadence without `IV` is not
 * a stricter setting, it is an impossible one. So the two screens guard each
 * other — a cadence whose chords are switched off cannot be selected, and a
 * chord an enabled cadence depends on cannot be switched off.
 *
 * Prevention rather than silent repair, deliberately. The store does drop an
 * unreachable cadence on read, because a hand-edited blob has to land somewhere
 * sensible, but a setting quietly changing itself while the user is looking at
 * it is worse than a control that declines and says why.
 */

export const CADENCE_NAMES: Record<Cadence, string> = {
  authentic: 'Authentic',
  plagal: 'Plagal',
  half: 'Half',
  deceptive: 'Deceptive',
  secondary: 'Secondary',
}

/**
 * What each cadence sounds like, rather than what it is made of.
 *
 * The chords are already shown; what a user choosing between them needs is the
 * effect, since that is what they will be listening for.
 */
export const CADENCE_DESCRIPTIONS: Record<Cadence, string> = {
  authentic: 'V to I. The ordinary way home, and the most final.',
  plagal: 'IV to I. Home by a softer route — the "amen" ending.',
  half: 'Arrives on V and stops there, unresolved. Asks a question.',
  deceptive: 'Promises I after V and gives vi instead.',
  secondary:
    'III to vi. Borrows the dominant of vi and lands there — an authentic cadence in the relative minor.',
}

export const PROGRESSION_LENGTHS: readonly number[] = Array.from(
  { length: MAX_PROGRESSION_LENGTH - MIN_PROGRESSION_LENGTH + 1 },
  (_, i) => MIN_PROGRESSION_LENGTH + i,
)

/** Root position through 2nd: a triad has no third inversion. */
export const PROGRESSION_INVERSIONS: readonly number[] = [0, 1, 2]

/** How each numeral reads, for naming chords in a warning. */
function label(id: string): string {
  try {
    return numeralById(id).label
  } catch {
    return id
  }
}

function listNames(names: readonly string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * The chords a cadence needs that are not enabled.
 *
 * Empty means the cadence can be used. Anything else is what to switch on to
 * make it available.
 */
export function cadenceMissing(
  cadence: Cadence,
  settings: ProgressionSettings,
): string[] {
  return cadenceNumerals(cadence).filter(
    (id) => !settings.numerals.includes(id),
  )
}

/** Why a cadence cannot be chosen, or null when it can. */
export function cadenceWarning(
  cadence: Cadence,
  settings: ProgressionSettings,
): string | null {
  const missing = cadenceMissing(cadence, settings)
  if (missing.length === 0) return null

  const names = listNames(missing.map(label))
  return `Needs ${names}, which ${missing.length === 1 ? 'is' : 'are'} switched off.`
}

/**
 * Whether this chord can be switched off.
 *
 * Answered by asking rather than by reasoning about which cadence needs what:
 * take it away and see whether any cadence survives. A chord several cadences
 * share is free to lose while another still works, and the only locked chords
 * are the ones holding up the last cadence standing.
 */
export function canDisableNumeral(
  numeralId: string,
  settings: ProgressionSettings,
): boolean {
  if (!settings.numerals.includes(numeralId)) return true
  if (settings.numerals.length <= 1) return false

  const without = {
    ...settings,
    numerals: settings.numerals.filter((id) => id !== numeralId),
  }
  return usableCadences(without).length > 0
}

/**
 * Why a chord is locked on, or null when it is free.
 *
 * Total wherever `canDisableNumeral` says no, which matters now the row is
 * pressable: a locked chord that opened an empty explanation would be the
 * silent refusal this replaced, with an extra tap in front of it.
 */
export function numeralLockWarning(
  numeralId: string,
  settings: ProgressionSettings,
): string | null {
  if (canDisableNumeral(numeralId, settings)) return null

  const holding = usableCadences(settings).filter((cadence) =>
    cadenceNumerals(cadence).includes(numeralId),
  )

  // Nothing is holding it and it still cannot go, so it is the last chord
  // standing. Reachable while the exercise is already stuck — no cadence is
  // usable, so none of them is named as the reason.
  if (holding.length === 0) {
    return `${label(numeralId)} is the only chord left. A progression has to be made of something, so the last one cannot be switched off.`
  }

  return `${label(numeralId)} is the last chord holding the ${listNames(
    holding.map((cadence) => CADENCE_NAMES[cadence].toLowerCase()),
  )} cadence together. Enable another cadence to free it.`
}

/** Whether the range can hold the chords a progression is voiced across. */
export function progressionRangeWarning(
  settings: ProgressionSettings,
): string | null {
  const span = settings.range.high - settings.range.low
  if (span >= 12) return null

  return `Chords are voiced across an octave, but the range is only ${span} semitone${
    span === 1 ? '' : 's'
  } wide. Widen it by ${12 - span} more.`
}

/**
 * Why nothing can be generated, or null when everything works.
 *
 * Names the cause rather than reporting failure. Being told the range is too
 * narrow is actionable; being told "nothing can be played" is a puzzle.
 */
export function progressionStuckReason(
  settings: ProgressionSettings,
): string | null {
  if (canGenerateProgression(settings)) return null

  const range = progressionRangeWarning(settings)
  if (range) return range

  if (settings.numerals.length === 0) {
    return 'No chords are selected, so there is nothing to build a progression from.'
  }

  const unusable = CADENCES.filter(
    (cadence) =>
      settings.cadences.includes(cadence) &&
      cadenceMissing(cadence, settings).length > 0,
  )
  if (usableCadences(settings).length === 0) {
    return unusable.length > 0
      ? `No cadence can be played: ${listNames(
          unusable.map((cadence) => CADENCE_NAMES[cadence].toLowerCase()),
        )} ${unusable.length === 1 ? 'needs' : 'need'} chords that are switched off.`
      : 'No cadence is selected, so a progression has no way to end.'
  }

  // Reachability, which no single setting is to blame for: the chords are
  // enabled and the cadence is available, but the transition table cannot get
  // from one to the other in the number of chords asked for.
  //
  // With `upTo` on, no length in the whole range works, so naming the ceiling
  // alone would read as though a shorter one had not been tried.
  const lengths = settings.upTo
    ? `of any length up to ${settings.length} chords`
    : `of ${settings.length} chords`
  return `No progression ${lengths} can reach an enabled cadence from these chords. Try a different length, or enable more chords.`
}

/** Nothing at all can be generated; the exercise itself is stuck. */
export function isProgressionStuck(settings: ProgressionSettings): boolean {
  return !canGenerateProgression(settings)
}
