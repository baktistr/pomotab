/**
 * Phase-completion chime, synthesised with WebAudio.
 *
 * Generating the tone instead of shipping an mp3 keeps the bundle small and
 * lets the CSP forbid every external source without an exception for media.
 */

let ctx: AudioContext | null = null

/** Must be called from a user gesture (the first Start click) to unlock audio. */
export function primeAudio(): void {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    // Audio is a nicety; never let it break the timer.
  }
}

function tone(at: number, freq: number, durationSec: number, gain: number): void {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, at)
  env.gain.setValueAtTime(0.0001, at)
  env.gain.exponentialRampToValueAtTime(gain, at + 0.015)
  env.gain.exponentialRampToValueAtTime(0.0001, at + durationSec)
  osc.connect(env).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + durationSec + 0.05)
}

/** Rising two-tone bell for work→break, falling for break→work. */
export function playChime(kind: 'work-done' | 'break-done'): void {
  primeAudio()
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime + 0.02
  const notes = kind === 'work-done' ? [660, 880] : [880, 660]
  tone(t, notes[0], 0.5, 0.18)
  tone(t + 0.18, notes[1], 0.7, 0.16)
}
