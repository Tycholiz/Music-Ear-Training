/**
 * Signal generators for the pitch tests.
 *
 * Kept beside the tests rather than inside them because the microphone module
 * will want the same fixtures to drive a fake input stream.
 */

export const TEST_SAMPLE_RATE = 44100

export interface ToneOptions {
  sampleRate?: number
  /** Peak amplitude, 0 to 1. */
  amplitude?: number
  /** 1 is a pure sine; more approximates an instrument. */
  harmonics?: number
}

/**
 * A tone at `frequency`, band-limited.
 *
 * Harmonics above Nyquist are dropped rather than generated: they cannot exist
 * in recorded audio, and synthesising them produces alias frequencies that are
 * nothing like what a microphone would deliver. Leaving them in makes the
 * fixture, not the detector, the thing under test.
 */
export function tone(
  frequency: number,
  length: number,
  {
    sampleRate = TEST_SAMPLE_RATE,
    amplitude = 0.3,
    harmonics = 1,
  }: ToneOptions = {},
): Float32Array {
  const nyquist = sampleRate / 2
  const samples = new Float32Array(length)

  for (let i = 0; i < length; i++) {
    let value = 0
    for (let h = 1; h <= harmonics; h++) {
      if (frequency * h >= nyquist) break
      // 1/h rolloff, roughly the shape of a bowed or blown note.
      value += Math.sin((2 * Math.PI * frequency * h * i) / sampleRate) / h
    }
    samples[i] = amplitude * value
  }

  return samples
}

/** Deterministic white noise, so a failure is reproducible. */
export function noise(length: number, amplitude = 0.3): Float32Array {
  const samples = new Float32Array(length)
  let seed = 12345
  for (let i = 0; i < length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    samples[i] = amplitude * ((seed / 0x7fffffff) * 2 - 1)
  }
  return samples
}

export function silence(length: number): Float32Array {
  return new Float32Array(length)
}

/**
 * A buffer long enough to resolve `frequency` — roughly four periods, which
 * gives the correlation two full periods to work with after the lag.
 */
export function windowFor(
  frequency: number,
  sampleRate = TEST_SAMPLE_RATE,
): number {
  return Math.min(
    32768,
    Math.max(4096, 2 ** Math.ceil(Math.log2((4 * sampleRate) / frequency))),
  )
}
