import { describe, expect, it } from 'vitest'
import { detectPitch } from './detectPitch'
import { centsOff, midiToFrequency, nearestMidi } from '../theory'
import {
  TEST_SAMPLE_RATE as SR,
  noise,
  silence,
  tone,
  windowFor,
} from './testTones'

/** How far the detected pitch sits from the note that was synthesised. */
function errorInCents(midi: number, options = {}): number {
  const frequency = midiToFrequency(midi)
  const detected = detectPitch(
    tone(frequency, windowFor(frequency), options),
    SR,
  )
  if (detected === null) return Number.NaN
  return centsOff(detected, midi)
}

describe('accuracy', () => {
  it.each([
    ['A0', 21],
    ['C2', 36],
    ['C3', 48],
    ['C4', 60],
    ['A4', 69],
    ['C6', 84],
    ['C7', 96],
    ['C8', 108],
  ])('detects a pure %s within a couple of cents', (_name, midi) => {
    expect(Math.abs(errorInCents(midi))).toBeLessThan(2)
  })

  it('detects every semitone across the singing range', () => {
    // C2 to C6 is where humming and most instruments live, so this is the part
    // that has to be right note-for-note.
    for (let midi = 36; midi <= 84; midi++) {
      expect(Math.abs(errorInCents(midi)), `midi ${midi}`).toBeLessThan(5)
    }
  })

  it('resolves to the correct note across the whole piano', () => {
    for (let midi = 21; midi <= 108; midi++) {
      const frequency = midiToFrequency(midi)
      const detected = detectPitch(tone(frequency, windowFor(frequency)), SR)
      expect(detected, `midi ${midi}`).not.toBeNull()
      expect(nearestMidi(detected!), `midi ${midi}`).toBe(midi)
    }
  })
})

describe('harmonic-rich input', () => {
  it.each([4, 8, 16])(
    'finds the fundamental, not a harmonic, with %i harmonics',
    (harmonics) => {
      for (const midi of [45, 57, 69, 81]) {
        expect(
          Math.abs(errorInCents(midi, { harmonics })),
          `midi ${midi}`,
        ).toBeLessThan(15)
      }
    },
  )

  it('does not drop an octave at the top of the range', () => {
    // Regression: C8's period is 10.54 samples, so its peak never lands on a
    // whole lag and reads lower than the peak two periods along. Comparing raw
    // peak heights picked that one and reported the note an octave flat.
    for (const midi of [105, 108]) {
      const detected = detectPitch(
        tone(midiToFrequency(midi), 4096, { harmonics: 4 }),
        SR,
      )
      expect(nearestMidi(detected!), `midi ${midi}`).toBe(midi)
    }
  })

  it('resolves the correct note for every semitone of a rich tone', () => {
    for (let midi = 36; midi <= 96; midi++) {
      const frequency = midiToFrequency(midi)
      const detected = detectPitch(
        tone(frequency, windowFor(frequency), { harmonics: 8 }),
        SR,
      )
      expect(nearestMidi(detected!), `midi ${midi}`).toBe(midi)
    }
  })
})

describe('rejecting what is not a note', () => {
  it('returns null for silence', () => {
    expect(detectPitch(silence(4096), SR)).toBeNull()
  })

  it('returns null for white noise', () => {
    expect(detectPitch(noise(4096), SR)).toBeNull()
  })

  it('returns null for a signal below the noise floor', () => {
    expect(detectPitch(tone(440, 4096, { amplitude: 0.003 }), SR)).toBeNull()
  })

  it('returns null rather than guessing when the buffer is too short', () => {
    // Two periods of A0 is ~3200 samples; 512 cannot resolve it.
    expect(detectPitch(tone(27.5, 512), SR)).toBeNull()
  })
})

describe('amplitude independence', () => {
  it('gives the same answer quiet and loud', () => {
    const quiet = detectPitch(tone(440, 4096, { amplitude: 0.05 }), SR)
    const loud = detectPitch(tone(440, 4096, { amplitude: 0.95 }), SR)

    expect(quiet).not.toBeNull()
    expect(quiet).toBeCloseTo(loud!, 6)
  })

  it('detects a quiet note as long as it clears the noise floor', () => {
    expect(detectPitch(tone(220, 4096, { amplitude: 0.02 }), SR)).not.toBeNull()
  })
})

describe('frequency bounds', () => {
  it('ignores a note below the requested floor', () => {
    const low = tone(midiToFrequency(40), windowFor(midiToFrequency(40)))
    expect(detectPitch(low, SR, { minFrequency: 400 })).toBeNull()
  })

  it('still finds a note sitting exactly on the floor', () => {
    const frequency = midiToFrequency(60)
    const detected = detectPitch(tone(frequency, windowFor(frequency)), SR, {
      minFrequency: frequency,
    })
    expect(nearestMidi(detected!)).toBe(60)
  })

  it('still finds a note sitting exactly on the ceiling', () => {
    const frequency = midiToFrequency(60)
    const detected = detectPitch(tone(frequency, windowFor(frequency)), SR, {
      maxFrequency: frequency,
    })
    expect(nearestMidi(detected!)).toBe(60)
  })

  it('returns null when the band is narrower than the buffer can resolve', () => {
    expect(detectPitch(tone(440, 4096), SR, { minFrequency: 4000 })).toBeNull()
  })
})

describe('sample rates other than 44.1 kHz', () => {
  it.each([22050, 48000])('works at %i Hz', (sampleRate) => {
    const frequency = midiToFrequency(60)
    const detected = detectPitch(
      tone(frequency, 4096, { sampleRate }),
      sampleRate,
    )
    expect(nearestMidi(detected!)).toBe(60)
  })
})
