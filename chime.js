/* Clearly audible, short synthesized two-part bell. Does not touch the TV tab. */
'use strict';
let context;

async function playConfirmation() {
  if (!context || context.state === 'closed') context = new AudioContext({ latencyHint: 'interactive' });
  if (context.state === 'suspended') await context.resume();
  if (context.state !== 'running') throw new Error('Chrome did not allow notification audio to start.');
  const t = context.currentTime + 0.012;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, t);
  envelope.gain.exponentialRampToValueAtTime(0.36, t + 0.022);
  envelope.gain.exponentialRampToValueAtTime(0.0001, t + 0.52);
  envelope.connect(context.destination);
  for (const [frequency, strength] of [[880, 1], [1320, 0.27]]) {
    const tone = context.createOscillator();
    const volume = context.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(frequency, t);
    volume.gain.value = strength;
    tone.connect(volume);
    volume.connect(envelope);
    tone.start(t);
    tone.stop(t + 0.53);
    tone.onended = () => { tone.disconnect(); volume.disconnect(); };
  }
  // Audio is scheduled by this point; don't block image tracking for its duration.
  return { ok: true };
}

/* A clearly audible 8...1 countdown for full-screen calibration.
 * Separate from the monitoring-success chime. */
async function playCountdownBeep(secondsRemaining) {
  if (!context || context.state === 'closed') context = new AudioContext({ latencyHint: 'interactive' });
  if (context.state === 'suspended') await context.resume();
  if (context.state !== 'running') throw new Error('Chrome did not allow countdown sound.');
  const last = secondsRemaining === 1;
  const when = context.currentTime + 0.008;
  const duration = last ? 0.24 : 0.14;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(last ? 0.51 : 0.39, when + 0.013);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  gain.connect(context.destination);
  const oscillator = context.createOscillator();
  oscillator.type = 'sine';
  oscillator.frequency.value = last ? 1450 : 1075;
  oscillator.connect(gain);
  oscillator.start(when);
  oscillator.stop(when + duration + 0.01);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== 'logomute-chime') return false;
  const action = message.type === 'PLAY_CHIME' ? playConfirmation
    : message.type === 'PLAY_COUNTDOWN_BEEP' ? () => playCountdownBeep(message.secondsRemaining)
    : null;
  if (!action) return false;
  action().then(respond, error => respond({ ok: false, error: error?.message || String(error) }));
  return true;
});
