/**
 * Piano sample set.
 *
 * The samples in `public/samples/piano` come from the FluidR3_GM acoustic grand
 * piano, which samples the keyboard roughly every other semitone rather than
 * every one. Notes without their own sample are covered by resampling the
 * nearest neighbour, which is never more than a semitone away — inaudible for
 * ear training, and it keeps the bundled set to about 1.1 MB.
 */

/** MIDI notes that have a sample file, ascending. */
export const SAMPLED_NOTES: readonly number[] = [
  21, 23, 24, 26, 28, 29, 31, 33, 35, 36, 38, 40, 41, 43, 45, 47, 48, 50, 52,
  53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84,
  86, 88, 89, 91, 93, 95, 96, 98, 100, 101, 103, 105, 107, 108,
] as const

/** A0 — the lowest note on an 88-key piano. */
export const LOWEST_NOTE = SAMPLED_NOTES[0]

/** C8 — the highest note on an 88-key piano. */
export const HIGHEST_NOTE = SAMPLED_NOTES[SAMPLED_NOTES.length - 1]

export function sampleUrl(sampleMidi: number): string {
  return `${import.meta.env.BASE_URL}samples/piano/${sampleMidi}.mp3`
}

export function isPlayable(midi: number): boolean {
  return midi >= LOWEST_NOTE && midi <= HIGHEST_NOTE
}

/**
 * The sample to resample for a given note. Ties break downward, so a note
 * between two samples is pitched up rather than down — stretching a lower
 * sample keeps more high harmonics than squashing a higher one.
 */
export function nearestSample(midi: number): number {
  if (!isPlayable(midi)) {
    throw new RangeError(`Note ${midi} is outside the sampled piano range`)
  }

  let best = SAMPLED_NOTES[0]
  for (const sample of SAMPLED_NOTES) {
    if (Math.abs(sample - midi) < Math.abs(best - midi)) {
      best = sample
    }
  }
  return best
}

/** Playback rate that shifts `sampleMidi` to sound at `midi`. */
export function playbackRate(midi: number, sampleMidi: number): number {
  return 2 ** ((midi - sampleMidi) / 12)
}
