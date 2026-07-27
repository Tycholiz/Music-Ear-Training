/**
 * Monophonic pitch detection.
 *
 * Pure DSP: samples in, a frequency out. No microphone, no audio graph, no
 * React, and nothing that knows what the note is going to be used for — this is
 * the piece every pitch-listening exercise builds on.
 *
 * ## Method
 *
 * The McLeod Pitch Method: build a normalised square difference function
 * (NSDF) over lags, then pick a peak. It suits both of the sources this has to
 * handle — humming, which is close to a sine, and an instrument note, which is
 * full of harmonics — without needing to be tuned differently for each.
 *
 * Peak picking is what separates MPM from plain autocorrelation. Rather than
 * taking the tallest peak, it takes the *first* peak that comes within
 * `PEAK_TOLERANCE` of the tallest. The tallest peak is often at twice the true
 * period, and taking it is what makes naive autocorrelation report notes an
 * octave low.
 */

/** A0, the lowest note on a piano. */
const DEFAULT_MIN_FREQUENCY = 27.5

/** C8, the highest. */
const DEFAULT_MAX_FREQUENCY = 4186

/**
 * Below this RMS the buffer is silence as far as we are concerned. Room tone
 * through a phone microphone sits well under this; a hum sits well over it.
 */
const DEFAULT_MIN_RMS = 0.01

/**
 * How clear the winning peak has to be, from 0 to 1. Unpitched sound — a
 * cough, a consonant, a chair scraping — produces low, erratic peaks, and
 * without this gate it would be reported as some arbitrary note.
 */
const DEFAULT_MIN_CLARITY = 0.8

/** How close to the tallest peak an earlier peak has to be to win instead. */
const PEAK_TOLERANCE = 0.9

/**
 * Slack at the edges of the requested band, so a note sitting exactly on the
 * boundary isn't rejected by rounding.
 *
 * The lag search runs in whole samples, and interpolation then moves the answer
 * a fraction of a sample either way. At the bottom of the piano that fraction
 * is worth a couple of cents; at the top, where a period is only ten samples
 * long, it is worth a great deal more. Half a semitone of slack costs nothing
 * musically — the band is "roughly the piano", not a precise gate.
 */
const RANGE_SLACK = 2 ** (50 / 1200)

export interface DetectPitchOptions {
  /** Lowest frequency worth looking for. Defaults to A0. */
  minFrequency?: number
  /** Highest frequency worth looking for. Defaults to C8. */
  maxFrequency?: number
  /** Below this RMS the buffer is treated as silence. */
  minRms?: number
  /** Below this peak clarity the buffer is treated as unpitched. */
  minClarity?: number
}

/**
 * The fundamental frequency of `samples`, or `null` when there isn't one:
 * silence, noise, or anything too quiet or too ambiguous to call.
 *
 * Note that detecting a low frequency needs a long buffer — roughly two periods
 * of it. At 44.1 kHz that is about 3200 samples for A0. A buffer shorter than
 * that simply cannot resolve the bottom of the range, and this returns `null`
 * rather than guessing.
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  options: DetectPitchOptions = {},
): number | null {
  const {
    minFrequency = DEFAULT_MIN_FREQUENCY,
    maxFrequency = DEFAULT_MAX_FREQUENCY,
    minRms = DEFAULT_MIN_RMS,
    minClarity = DEFAULT_MIN_CLARITY,
  } = options

  if (rms(samples) < minRms) return null

  // A whole sample of headroom at each end: the peak for a note sitting exactly
  // on the boundary lands on the last usable lag, and interpolating it needs a
  // neighbour beyond that.
  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency) - 1)
  const maxLag = Math.min(
    Math.ceil(sampleRate / minFrequency) + 1,
    // Past half the buffer there are too few overlapping samples left for the
    // correlation to mean anything.
    Math.floor(samples.length / 2),
  )
  if (maxLag <= minLag) return null

  const curve = nsdf(samples, maxLag)
  const peak = pickPeak(curve, minLag, minClarity)
  if (peak === null) return null

  const frequency = sampleRate / peak
  return frequency >= minFrequency / RANGE_SLACK &&
    frequency <= maxFrequency * RANGE_SLACK
    ? frequency
    : null
}

function rms(samples: Float32Array): number {
  let total = 0
  for (const sample of samples) total += sample * sample
  return Math.sqrt(total / samples.length)
}

/**
 * Normalised square difference over lags 0..maxLag.
 *
 * Values run from -1 to 1, and the normalisation is what makes the result
 * independent of how loud the input is — the same note quiet and loud gives the
 * same curve.
 */
function nsdf(samples: Float32Array, maxLag: number): Float32Array {
  const length = samples.length
  const curve = new Float32Array(maxLag + 1)

  for (let lag = 0; lag <= maxLag; lag++) {
    let correlation = 0
    let energy = 0

    for (let i = 0; i < length - lag; i++) {
      const a = samples[i]
      const b = samples[i + lag]
      correlation += a * b
      energy += a * a + b * b
    }

    curve[lag] = energy > 0 ? (2 * correlation) / energy : 0
  }

  return curve
}

interface Peak {
  /** Interpolated lag, in fractional samples. */
  lag: number
  /** Interpolated height, which is the peak's true clarity. */
  value: number
}

/**
 * The lag of the winning peak, interpolated, or null if nothing qualifies.
 *
 * Peaks are compared by their *interpolated* height rather than the raw sample
 * they sit on. That matters more than it sounds: a note whose period is not a
 * whole number of samples never lines up exactly with any lag, so its raw peak
 * reads low — at the top of the piano, where a period is only ten samples, C8
 * reads 0.897 at its own period but 0.998 two periods along. Comparing raw
 * heights there picks the second one and reports the note an octave flat.
 */
function pickPeak(
  curve: Float32Array,
  minLag: number,
  minClarity: number,
): number | null {
  // Lag 0 is always 1 by definition. Skip past it, and past the descent that
  // follows, so the search starts at the first genuine candidate.
  let lag = 1
  while (lag < curve.length && curve[lag] > 0) lag++
  if (lag >= curve.length) return null

  const peaks: Peak[] = []
  while (lag < curve.length) {
    if (curve[lag] <= 0) {
      lag++
      continue
    }

    // A run of positive values; the tallest point in it is one candidate.
    let best = lag
    while (lag < curve.length && curve[lag] > 0) {
      if (curve[lag] > curve[best]) best = lag
      lag++
    }
    if (best >= minLag) peaks.push(interpolate(curve, best))
  }

  if (peaks.length === 0) return null

  const tallest = Math.max(...peaks.map((peak) => peak.value))
  if (tallest < minClarity) return null

  // The first peak that gets close to the tallest, not the tallest itself.
  // See the note on octave errors at the top of the file.
  const threshold = tallest * PEAK_TOLERANCE
  const chosen = peaks.find((peak) => peak.value >= threshold)
  return chosen ? chosen.lag : null
}

/**
 * Fit a parabola through a peak and its neighbours to find where the true
 * maximum lies between samples, and how tall it is.
 *
 * Without this, resolution at high frequencies is terrible — at 2 kHz a period
 * is only ~22 samples, so a whole-sample error is most of a semitone.
 */
function interpolate(curve: Float32Array, index: number): Peak {
  if (index <= 0 || index >= curve.length - 1) {
    return { lag: index, value: curve[index] }
  }

  const previous = curve[index - 1]
  const current = curve[index]
  const next = curve[index + 1]

  const curvature = previous + next - 2 * current
  if (curvature === 0) return { lag: index, value: current }

  const shift = (0.5 * (previous - next)) / curvature
  return {
    lag: index + shift,
    value: current - 0.25 * (previous - next) * shift,
  }
}
