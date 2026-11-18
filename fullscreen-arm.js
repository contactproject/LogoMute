/* LogoMute — one-time, shortcut-free full-screen calibration capture.
 * This isolated content script is injected by the extension popup after a
 * deliberate user action. It never inserts UI into the television picture.
 */
(() => {
  'use strict';
  try { window.__logoMuteFullscreenArm?.cancel(); } catch (_) {}

  const expiresAt = Date.now() + 120000;
  const CALIBRATION_CAPTURE_DELAY_MS = 8000; // Allow TV player controls to fade.
  let settleTimer = null;
  let countdownTimers = [];
  let countdownSerial = 0;
  let lastViewport = null;
  let expiryTimer = null;
  let pollingTimer = null;
  let finished = false;
  let lastWasFullscreen = false;
  // Explain the next step on the preview page after Chrome closes the popup.
  // Hide the banner as soon as fullscreen begins; it is never in the capture.
  const notice = document.createElement('div');
  notice.id = 'logomute-fullscreen-instructions';
  notice.textContent = 'LogoMute: Click the TV full-screen button. Move the mouse away. An audible 8-second countdown begins in full-screen, then a calibration image opens.';
  notice.style.cssText = [
    'position:fixed','top:12px','left:50%','transform:translateX(-50%)',
    'max-width:min(680px,92vw)','padding:11px 16px','z-index:2147483646',
    'background:#10283e','color:#fff','border:1px solid #83c6ef',
    'border-radius:9px','box-shadow:0 3px 14px #0009',
    'font:600 13px/1.45 system-ui,sans-serif',
    'pointer-events:none','text-align:center'
  ].join(';');
  (document.documentElement || document.body).append(notice);

  const isFullscreen = () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) return true;
    // F11 / native browser full-screen has no DOM fullscreenElement. In a
    // maximized normal window, the tab bar typically leaves innerHeight lower.
    const screenW = screen.width || 0;
    const screenH = screen.height || 0;
    return screenW > 0 && screenH > 0 &&
      window.innerWidth >= screenW * 0.88 &&
      window.innerHeight >= screenH * 0.91;
  };

  function clearCountdown() {
    countdownSerial++;
    clearTimeout(settleTimer);
    settleTimer = null;
    for (const timer of countdownTimers) clearTimeout(timer);
    countdownTimers = [];
  }

  function countdownBeep(secondsRemaining) {
    // Use the extension's separate audio context: tab muting cannot silence it.
    // Never block the screenshot on audio permission or playback failures.
    void chrome.runtime.sendMessage({
      target: 'background', type: 'CALIBRATION_COUNTDOWN_BEEP',
      secondsRemaining
    }).catch(() => {});
  }

  function beginCountdown() {
    clearCountdown();
    const serial = countdownSerial;
    // Eight audible ticks, at 8,7,...,1 seconds remaining. Screenshot at 0.
    for (let elapsed = 0; elapsed < 8; elapsed++) {
      countdownTimers.push(setTimeout(() => {
        if (!finished && serial === countdownSerial && isFullscreen()) {
          countdownBeep(8 - elapsed);
        }
      }, elapsed * 1000));
    }
    settleTimer = setTimeout(() => {
      if (!finished && serial === countdownSerial) void capture();
    }, CALIBRATION_CAPTURE_DELAY_MS);
  }

  const cleanup = () => {
    if (finished) return;
    finished = true;
    notice.remove();
    clearCountdown();
    clearTimeout(expiryTimer);
    clearInterval(pollingTimer);
    document.removeEventListener('fullscreenchange', onChange, true);
    document.removeEventListener('webkitfullscreenchange', onChange, true);
    window.removeEventListener('resize', onChange, true);
    window.visualViewport?.removeEventListener('resize', onChange);
    if (window.__logoMuteFullscreenArm?.cancel === cleanup) delete window.__logoMuteFullscreenArm;
  };

  async function capture() {
    if (finished || !isFullscreen() || Date.now() >= expiresAt) return;
    // Only one request; if capture fails, the background records an error
    // visible in the normal toolbar popup after returning from fullscreen.
    cleanup();
    try {
      const reply = await chrome.runtime.sendMessage({
        target: 'background', type: 'ARMED_FULLSCREEN_READY'
      });
      if (!reply?.ok) throw new Error(reply?.error || 'Full-screen screenshot failed.');
    } catch (error) {
      console.warn('LogoMute full-screen calibration:', error?.message || error);
    }
  }

  function onChange() {
    if (finished || Date.now() >= expiresAt) { cleanup(); return; }
    const full = isFullscreen();
    notice.style.display = full ? 'none' : 'block';
    if (!full) {
      clearCountdown();
      lastWasFullscreen = false;
      lastViewport = null;
      return;
    }
    // Duplicate DOM full-screen and resize events must not restart the clock.
    const viewport = window.innerWidth + 'x' + window.innerHeight;
    if (lastWasFullscreen && lastViewport === viewport) return;
    lastViewport = viewport;
    lastWasFullscreen = true;
    // Restart the full eight seconds after each genuine viewport resize.
    // Unlike the page reminder, no overlay is displayed over the picture.
    beginCountdown();
  }

  window.__logoMuteFullscreenArm = { cancel: cleanup };
  document.addEventListener('fullscreenchange', onChange, true);
  document.addEventListener('webkitfullscreenchange', onChange, true);
  window.addEventListener('resize', onChange, true);
  window.visualViewport?.addEventListener('resize', onChange);
  pollingTimer = setInterval(() => {
    if (finished) return;
    const full = isFullscreen();
    // Poll for players that omit a fullscreen event in the top document.
    if (full && !lastWasFullscreen) onChange();
    else if (!full && lastWasFullscreen) onChange();
  }, 300);
  expiryTimer = setTimeout(cleanup, Math.max(100, expiresAt - Date.now()));
  if (isFullscreen()) onChange();
})();
