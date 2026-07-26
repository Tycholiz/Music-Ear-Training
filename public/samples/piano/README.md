# Piano samples

52 mp3 files, one per sampled note, named by MIDI number (`60.mp3` is middle C).
Together they cover A0–C8 — the full 88-key piano — in about 1.1 MB.

## Where they came from

Extracted from the **FluidR3_GM acoustic grand piano** soundfont, via
[gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts)
(`FluidR3_GM/acoustic_grand_piano-mp3.js`). That file ships the samples as
base64 data URIs inside a JavaScript wrapper; they're stored here as plain mp3
instead so the service worker can precache them individually and the browser
doesn't pay for base64's 33% size penalty.

## Licensing

FluidR3_GM is by Frank Wen, released under the MIT license. The
midi-js-soundfonts repository that packages it is likewise MIT.

## Why only 52 notes

FluidR3 samples the keyboard roughly every other semitone rather than every
one. Notes without their own sample are covered by resampling the nearest
neighbour, which is never more than a semitone away — see
`src/audio/samples.ts`. Shifting by a semitone via `playbackRate` is inaudible
for ear training and halves the download.

## Regenerating

These are checked in deliberately: the app must work offline from first launch,
so they can't be fetched from a CDN at runtime. If they ever need to be
regenerated, the source file above is the input, keyed by note name — convert
each key to its MIDI number and base64-decode the data URI.
