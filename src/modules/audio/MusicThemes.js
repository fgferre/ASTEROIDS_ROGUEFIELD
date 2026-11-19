/** Frequency (Hz) of a MIDI note number (69 = A4 = 440 Hz). */
export function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Linear gain of a level in decibels (0 dB = 1, -6 dB = ~0.5). */
export function dbToGain(db) {
  return Math.pow(10, db / 20);
}
