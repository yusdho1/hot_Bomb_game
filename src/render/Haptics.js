// Thin navigator.vibrate() wrapper — no-ops silently on desktop / unsupported browsers.
function vibrate(pattern) {
  if (!navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore — vibration is pure feedback, never worth failing over
  }
}

export const Haptics = {
  pulseLow: () => vibrate(80),
  pulseMid: () => vibrate(120),
  pulseHigh: () => vibrate(200),
  explode: () => vibrate([100, 50, 100, 50, 250]),
};
