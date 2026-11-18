/* LogoMute 0.10.5: support a saved logo while initially absent (e.g. starting during a commercial). */
importScripts('shared.js', 'detector.js', 'geometry.js');
importScripts('layout-probe.js');

const { LogoDetector, edges } = globalThis.LogoMuteDetector;
const GEO = globalThis.LogoMuteGeometry;
const RATE_MS = 750; // Chrome captureVisibleTab limits calls to 2/s.
const LAYOUT_POLL_MS = 1000;
const RESIZE_SETTLE_MS = 1000; // Wait 1 second after a detected layout / screenshot resize.
const RELOCK_DEBUG_DELAY_MS = 2200; // Give the three-frame relock a chance before diagnostic mute.
const MAX_CONSECUTIVE_ERRORS = 3;
let monitor = null;
let generation = 0;
let lastIssue = '';
let testMuteTimer = null;
let armedCalibrationInProgress = false; // Prevent double capture across duplicate fullscreen events.


// Service workers cannot play sound directly. Use a short-lived offscreen
// extension document instead of trying to play through a (possibly muted) TV tab.
const CHIME_DOCUMENT_URL = chrome.runtime.getURL('chime.html');
let creatingChimeDocument = null;
async function ensureChimeDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [CHIME_DOCUMENT_URL]
  });
  if (existing.length) return;
  if (!creatingChimeDocument) {
    creatingChimeDocument = chrome.offscreen.createDocument({
      url: 'chime.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play a short notification when the channel logo is successfully detected.'
    }).finally(() => { creatingChimeDocument = null; });
  }
  await creatingChimeDocument;
}

async function soundCountdownBeep(secondsRemaining) {
  await ensureChimeDocument();
  const response = await withTimeout(chrome.runtime.sendMessage({
    target: 'logomute-chime', type: 'PLAY_COUNTDOWN_BEEP', secondsRemaining
  }), 2200, 'Playing calibration countdown');
  if (!response?.ok) throw new Error(response?.error || 'Could not play countdown beep.');
}

async function soundChime() {
  await ensureChimeDocument();
  const response = await withTimeout(chrome.runtime.sendMessage({
    target: 'logomute-chime', type: 'PLAY_CHIME'
  }), 2200, 'Playing monitoring confirmation');
  if (!response?.ok) throw new Error(response?.error || 'Could not play the confirmation sound.');
}

// Every new video layout gets one confirmation, but only after the actual
// logo detector has reached a VERIFIED lock (not just after Start is clicked).
function announceLogoLocked(s, mode) {
  if (monitor !== s || s.confirmedChimeSerial === s.acquisitionSerial) return;
  if (Date.now() - (s.lastChimeAt || 0) < 700) return;
  s.confirmedChimeSerial = s.acquisitionSerial;
  s.lastChimeAt = Date.now();
  s.lastChimeMode = mode;
  s.chimeCount = (s.chimeCount || 0) + 1;
  // The monitor must keep working even when a computer has audio notifications
  // disabled or Chrome refuses to create its offscreen playback document.
  void soundChime().catch(e => {
    if (monitor === s) s.chimeError = e?.message || String(e);
    console.warn('LogoMute monitoring chime unavailable:', e);
  });
}

// Toolbar icon is a status indicator; never let cosmetic API failures stop
// video detection or tab muting. Queue requests to prevent stale state updates.
const ICONS = Object.freeze({
  off: { 16: 'icons/off16.png', 32: 'icons/off32.png' },
  watching: { 16: 'icons/watching16.png', 32: 'icons/watching32.png' },
  muted: { 16: 'icons/muted16.png', 32: 'icons/muted32.png' }
});
const ICON_TITLES = Object.freeze({
  off: 'LogoMute — Off',
  watching: 'LogoMute — Monitoring TV',
  muted: 'LogoMute — Commercial muted'
});
let iconQueue = Promise.resolve();
let iconState = null;
function setToolbarState(state) {
  if (!ICONS[state] || iconState === state) return iconQueue;
  iconState = state;
  iconQueue = iconQueue.catch(() => {}).then(async () => {
    try {
      await chrome.action.setIcon({ path: ICONS[state] });
      await chrome.action.setTitle({ title: ICON_TITLES[state] });
    } catch (e) {
      // Status display must not interfere with the audio path.
      console.warn('LogoMute could not update toolbar icon:', e);
    }
  });
  return iconQueue;
}
// A worker restart loses the in-memory monitor; show Off, not stale green/red.
void setToolbarState('off');

function limit(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function keyFor(url) { return logoMutePageKey(url); }
function withTimeout(promise, milliseconds, label) {
  let handle;
  return Promise.race([
    promise,
    new Promise((_, reject) => { handle = setTimeout(() => reject(new Error(label + ' timed out.')), milliseconds); })
  ]).finally(() => clearTimeout(handle));
}
async function getProfile(url) {
  const { profiles = {} } = await chrome.storage.local.get('profiles');
  return profiles[keyFor(url)] || null;
}
const SENSITIVITY_OPTIONS = [0.75, 1, 1.25];
// CNN defaults to Tolerant, regardless of streaming host. A previously saved
// per-channel value (including Balanced or Strict) always takes priority.
function isCnnChannelUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const pathname = decodeURIComponent(u.pathname).toLowerCase();
    return host === 'cnn.com' || host.endsWith('.cnn.com') ||
      /(?:^|[^a-z])cnn(?:$|[^a-z])/.test(pathname);
  } catch (_) { return false; }
}
async function getSettings(url = null) {
  // Delay and diagnostic mode remain global, but sensitivity is saved for
  // EACH URL key in the same format used for logo profiles.
  const { settings = {}, channelSensitivities = {} } = await chrome.storage.local.get([
    'settings', 'channelSensitivities'
  ]);
  const defaults = { ...LOGOMUTE_DEFAULTS, debugMuteOnLostLogo: false, ...settings };
  if (url && /^https?:/i.test(url)) {
    const saved = channelSensitivities[keyFor(url)];
    if (SENSITIVITY_OPTIONS.includes(saved)) defaults.sensitivity = saved;
    else if (isCnnChannelUrl(url)) defaults.sensitivity = 0.75;
  }
  return defaults;
}
async function decodeImage(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}
function createProcessor(profile, bitmap) {
  const input = profile.rect;
  const sourceWidth = Math.max(3, bitmap.width);
  const sourceHeight = Math.max(3, bitmap.height);
  const shrink = Math.min(1.5, 90 / sourceWidth, 55 / sourceHeight);
  const width = Math.max(24, Math.round(sourceWidth * shrink));
  const height = Math.max(14, Math.round(sourceHeight * shrink));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Chrome could not create the image-analysis canvas.');
  const p = {
    canvas, ctx, width, height, reference: null, referenceMatcher: null,
    detector: null, learning: [], lockedRect: null, confidence: null,
    trigger: null, quality: 'unknown', initialized: false,
    frameCount: 0, sourceWidth: 0, sourceHeight: 0,
    anchor: profile.anchor || ((input.y + input.h/2 > 0.5 ? 'bottom' : 'top') + '-' + (input.x + input.w/2 > 0.5 ? 'right' : 'left')),
    videoBox: profile.videoBox || null, relativeLogo: profile.relativeLogo || null, relocating: false, relocationStartedAt: null,
    relockCandidate: null, lastLockedAt: null
  };
  p.reference = frame(p, bitmap, { x: 0, y: 0, w: bitmap.width, h: bitmap.height });
  p.referenceMatcher = makeReferenceMatcher(p.reference);
  return p;
}
function frame(p, bitmap, rect) {
  p.ctx.clearRect(0, 0, p.width, p.height);
  p.ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, p.width, p.height);
  const pixels = p.ctx.getImageData(0, 0, p.width, p.height).data;
  return edges(pixels, p.width, p.height);
}
function makeReferenceMatcher(reference) {
  const n = reference.gx.length;
  const weight = new Float32Array(n);
  let totalWeight = 0;
  for (let i = 0; i < n; i++) {
    const magnitude = Math.hypot(reference.gx[i], reference.gy[i]);
    weight[i] = limit(magnitude / 17, 0, 1);
    totalWeight += weight[i];
  }
  if (totalWeight < 4) throw new Error('The chosen logo looks blank. Please select a clearer, tighter area.');
  return {
    score(current) {
      let total = 0;
      for (let i = 0; i < n; i++) {
        const w = weight[i];
        if (w < 0.02) continue;
        const rx = reference.gx[i], ry = reference.gy[i];
        const cx = current.gx[i], cy = current.gy[i];
        const rmag = Math.hypot(rx, ry), cmag = Math.hypot(cx, cy);
        const cos = (rx*cx + ry*cy) / (rmag*cmag + 1e-7);
        total += w * cos * limit(cmag / (rmag * 0.6 + 2), 0, 1);
      }
      return limit(total / (totalWeight + 1e-7), -1, 1);
    }
  };
}
function pxRect(input, width, height) {
  const x = limit(Math.round(input.x * width), 0, width - 2);
  const y = limit(Math.round(input.y * height), 0, height - 2);
  const w = limit(Math.round(input.w * width), 2, width - x);
  const h = limit(Math.round(input.h * height), 2, height - y);
  return { x, y, w, h };
}
function range(a, b, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(Math.round(a + (b - a) * i / Math.max(1, count - 1)));
  return [...new Set(out)];
}
/*
 * Full-screen reacquisition: wider than the original corner-only search.
 * The first pass follows the predicted player-relative position; if it does
 * not confidently locate the ident, search the WHOLE visible screenshot at
 * several scales. Confirmations are still required before a position is armed.
 * This wider scan runs only during logo acquisition/relocation, not per-frame
 * commercial detection, to avoid matching unrelated on-screen graphics.
 */
function bestRegion(p, bitmap, scorer, broad, initialRect) {
  const width = bitmap.width, height = bitmap.height;
  const base = p.lockedRect || initialRect;
  const clampRect = (x,y,w,h) => ({
    x: limit(Math.round(x), 0, width-w),
    y: limit(Math.round(y), 0, height-h),
    w, h
  });
  let best = null;
  let examined = 0;
  const test = rect => {
    if (rect.w < 3 || rect.h < 3) return;
    const patch = frame(p, bitmap, rect);
    const score = scorer(patch);
    examined++;
    if (!best || score > best.score) best = { rect, patch, score };
  };
  const scan = (w, h, xs, ys) => {
    const seen = new Set();
    for (const x of xs) for (const y of ys) {
      const rect = clampRect(x, y, w, h);
      const key = rect.x + ':' + rect.y;
      if (seen.has(key)) continue;
      seen.add(key);
      test(rect);
    }
  };
  // Keep the inexpensive, tightly bounded search during normal playback.
  if (!broad) {
    for (const scale of [.93, 1, 1.07]) {
      const w = limit(Math.round(base.w*scale), 3, width);
      const h = limit(Math.round(base.h*scale), 3, height);
      const x = base.x + (base.w-w)/2, y = base.y + (base.h-h)/2;
      const dx = Math.max(8, w*.15), dy = Math.max(8, h*.15);
      scan(w, h, range(x-dx,x+dx,3),range(y-dy,y+dy,3));
    }
    p.lastSearchCandidates = examined;
    p.lastSearchScope = 'local';
    return best;
  }

  // Broader player-relative pass: the original radius was only about a logo
  // width or ~3% of the screen. This pass reaches +/- 30% of the viewport.
  for (const scale of [.57,.78,1,1.30,1.72,2.3,3.0]) {
    const w = limit(Math.round(base.w*scale), 3, width);
    const h = limit(Math.round(base.h*scale), 3, height);
    const x = base.x + (base.w-w)/2, y = base.y + (base.h-h)/2;
    const dx = Math.max(width*.30, w*2.3);
    const dy = Math.max(height*.30, h*2.3);
    scan(w,h,range(x-dx,x+dx,5),range(y-dy,y+dy,5));
  }
  let scope = 'expanded-60-percent';
  // Previously this fallback searched only the original corner. A new player
  // can place the channel logo anywhere; search the entire screenshot, rather
  // than stopping at the midpoint. Use a deliberately sparse first pass and
  // refine the strongest candidate below to control per-frame CPU load.
  if (p.relocating || !best || best.score < .36) {
    const scales = [.62,1,1.48,2.12,2.9];
    for (const scale of scales) {
      const w = limit(Math.round(base.w*scale), 3, width);
      const h = limit(Math.round(base.h*scale), 3, height);
      scan(w,h,range(0,width-w,11),range(0,height-h,9));
    }
    scope = 'whole-viewport';
  }
  // Zoom in on the best coarse candidate, including fractional size changes.
  // The center can be several hundred pixels from the preview position.
  if (best) {
    const coarse = best.rect;
    for (const scale of [.85,1,1.18]) {
      const w = limit(Math.round(coarse.w*scale), 3, width);
      const h = limit(Math.round(coarse.h*scale), 3, height);
      const x = coarse.x + (coarse.w-w)/2;
      const y = coarse.y + (coarse.h-h)/2;
      scan(w,h,
        range(x-Math.max(14,coarse.w*.55),x+Math.max(14,coarse.w*.55),7),
        range(y-Math.max(12,coarse.h*.65),y+Math.max(12,coarse.h*.65),7));
    }
  }
  p.lastSearchCandidates = examined;
  p.lastSearchScope = scope;
  p.lastSearchAt = Date.now();
  p.lastWideSearchCandidates = examined;
  p.lastWideSearchScope = scope;
  return best;
}

async function getLayout(tabId, logoCenter) {
  try {
    const result = await withTimeout(chrome.scripting.executeScript({
      target: { tabId }, func: logoMuteProbePlayer, args: [logoCenter || null]
    }), 2400, 'Reading TV player geometry');
    return result?.[0]?.result || null;
  } catch (_) { return null; }
}
/* A layout change is not a commercial. Always clear a diagnostic mute and
 * pause image analysis until the new player has finished resizing.  This
 * applies to player fullscreen events AND screenshot-dimension changes.
 * Subsequent geometry changes during the animation restart the 1-s timer.
 */
async function beginLayoutTransition(s, now = Date.now(), requestedMode = null) {
  if (monitor !== s) return;
  if (requestedMode && s.modeProcessors?.[requestedMode] && s.mode !== requestedMode) {
    s.mode = requestedMode;
    s.currentProfile = requestedMode === 'fullscreen' ? s.profile.fullscreenProfile : s.profile;
    s.processor = s.modeProcessors[requestedMode];
  }
  const p = s.processor;
  s.layoutChanges = (s.layoutChanges || 0) + 1;
  s.acquisitionSerial = (s.acquisitionSerial || 0) + 1;
  p.lockedRect = null;
  p.relockCandidate = null;
  p.relocating = true;
  p.relocationStartedAt = now;
  s.layoutGraceUntil = now + RESIZE_SETTLE_MS;
  s.layoutChangeAt = now;
  s.relockChecks = 0;
  s.logoState = 'unlocated';
  s.stage = 'resizing: waiting 1 second';
  s.absentSince = null;
  s.visibleSince = null;
  s.noMatchSince = null;
  s.reacquiredAfterLayout = false;
  // A new session starts muted until we recognize its saved logo.
  // Existing sessions retain the fail-open resize policy to avoid false mute.
  await changeMute(s, Boolean(s.awaitingFirstLogo));
}

async function refreshLayout(s, force=false) {
  let p = s.processor;
  const now = Date.now();
  if (!force && now - (s.lastLayoutCheck || 0) < LAYOUT_POLL_MS) return;
  s.lastLayoutCheck = now;
  const logoCenter = { x: s.profile.rect.x+s.profile.rect.w/2,
    y: s.profile.rect.y+s.profile.rect.h/2 };
  const layout = await getLayout(s.tabId, logoCenter);
  if (monitor !== s) return;
  s.lastLayoutFailure = !layout?.player?.rect;
  const fullscreenChanged = Boolean(layout && typeof layout.fullscreen === 'boolean' &&
    Boolean(layout.fullscreen) !== Boolean(s.fullscreen));
  const playerChanged = Boolean(layout?.player?.rect && p.videoBox &&
    !GEO.closeRect(p.videoBox, layout.player.rect));
  // Only apply transition once for the observed event even if both fullscreen
  // and player geometry change in the same DOM inspection.
  if (fullscreenChanged || playerChanged) {
    const requested = Boolean(layout?.fullscreen) ? 'fullscreen' : 'preview';
    await beginLayoutTransition(s, now, requested);
    p = s.processor;
  }
  if (layout && typeof layout.fullscreen === 'boolean') {
    s.fullscreen = Boolean(layout.fullscreen);
    if (s.fullscreen) s.fullscreenSeen = true;
  }
  if (layout?.player?.rect) {
    const newer = layout.player.rect;
    if (!p.relativeLogo) {
      // Older saved profiles can learn the player's bounds on their first run.
      const rel = GEO.relativeLogo(s.profile.rect, newer);
      if (rel && !layout.fullscreen) p.relativeLogo = rel;
    }
    p.videoBox = newer;
  }
}

function expectedRegion(s, bitmap) {
  const p = s.processor;
  const relative = p.relativeLogo;
  const currentBox = p.videoBox;
  // A direct full-screen calibration is more reliable than extrapolating the
  // preview player's geometry, particularly for cross-origin TV players.
  if (s.mode === 'fullscreen' && s.profile.fullscreenProfile) {
    return GEO.asPixels(s.currentProfile.rect, bitmap.width, bitmap.height);
  }
  const predicted = relative && currentBox && GEO.toViewportRect(relative, currentBox);
  return GEO.asPixels(predicted || s.currentProfile.rect, bitmap.width, bitmap.height);
}
async function changeMute(s, shouldMute) {
  if (s.ownedMute === shouldMute) return;
  if (monitor !== s) return;
  if (s.originalMute) return; // Never override the user's existing mute.
  await chrome.tabs.update(s.tabId, { muted: shouldMute });
  s.ownedMute = shouldMute;
  await setToolbarState(shouldMute ? 'muted' : 'watching');
  if (shouldMute) await chrome.storage.session.set({ ownedMutedTab: s.tabId });
  else await chrome.storage.session.remove('ownedMutedTab');
}
async function restoreMute(s) {
  if (s.ownedMute && !s.originalMute) {
    try { await chrome.tabs.update(s.tabId, { muted: false }); } catch (_) {}
    s.ownedMute = false;
    try { await chrome.storage.session.remove('ownedMutedTab'); } catch (_) {}
  }
}
// Safety: restore sound if Chrome terminates and restarts the service worker.
(async () => {
  try {
    const { ownedMutedTab } = await chrome.storage.session.get('ownedMutedTab');
    if (Number.isInteger(ownedMutedTab)) {
      const tab = await chrome.tabs.get(ownedMutedTab).catch(() => null);
      if (tab?.mutedInfo?.muted && tab.mutedInfo.reason === 'extension' &&
          tab.mutedInfo.extensionId === chrome.runtime.id) {
        await chrome.tabs.update(ownedMutedTab, { muted: false });
      }
      await chrome.storage.session.remove('ownedMutedTab');
    }
  } catch (_) {}
})();
async function stopMonitor(reason = '') {
  const old = monitor;
  ++generation;
  monitor = null;
  if (old?.timer) clearTimeout(old.timer);
  if (old) await restoreMute(old);
  await setToolbarState('off');
  if (reason) lastIssue = reason;
}
function screenshotMatches(reference, bitmap) {
  return reference &&
    Math.abs(bitmap.width - reference.width) / Math.max(1, reference.width) < 0.06 &&
    Math.abs(bitmap.height - reference.height) / Math.max(1, reference.height) < 0.06;
}
function requestedModeForScreenshot(s, bitmap) {
  if (!s.modeProcessors?.fullscreen) return 'preview';
  if (s.fullscreen) return 'fullscreen';
  const fullDims = s.profile.fullscreenProfile?.frameSize;
  const previewDims = s.previewFrameSize;
  // Browser F11 and some embedded cross-origin players don't propagate the
  // DOM Fullscreen API flag. Compare the calibrated screenshot dimensions.
  if (previewDims && screenshotMatches(fullDims, bitmap) &&
      !screenshotMatches(previewDims, bitmap)) return 'fullscreen';
  return 'preview';
}
async function handleFrame(s, bitmap) {
  const requestedMode = requestedModeForScreenshot(s, bitmap);
  if (requestedMode !== (s.mode || 'preview')) await beginLayoutTransition(s, Date.now(), requestedMode);
  let p = s.processor;
  p.frameCount++;
  const dimsChanged = p.sourceWidth && (p.sourceWidth !== bitmap.width || p.sourceHeight !== bitmap.height);
  if (dimsChanged) {
    await beginLayoutTransition(s);
    // Keep the learned logo appearance; only its coordinates changed.
    await refreshLayout(s, true);
    p = s.processor;
    if (p.relativeLogo && s.lastLayoutFailure && s.profile.videoBox) {
      const original = s.profile.viewport;
      if (original && Math.abs(bitmap.width/original.width - 1) < .06 &&
          Math.abs(bitmap.height/original.height - 1) < .06) {
        p.videoBox = s.profile.videoBox;
      } else {
        const guessed = GEO.guessFullViewport(original,
          { width:bitmap.width, height:bitmap.height }, s.profile.videoBox);
        if (guessed) p.videoBox = guessed;
      }
    }
  }

  p.sourceWidth = bitmap.width;
  p.sourceHeight = bitmap.height;
  if (s.mode === 'preview' && !s.previewFrameSize) {
    s.previewFrameSize = { width: bitmap.width, height: bitmap.height };
  }
  // A full-screen player can take several frames to finish resizing.  Do NOT
  // run logo absence/relocation or its debug mute during the first second.
  if (p.relocating && Date.now() < s.layoutGraceUntil) {
    s.stage = 'resizing: waiting 1 second';
    s.logoState = 'unlocated';
    p.confidence = null;
    await changeMute(s, Boolean(s.awaitingFirstLogo));
    return;
  }
  const origin = expectedRegion(s, bitmap);
  if (!p.detector) {
    const exactPatch = frame(p, bitmap, p.lockedRect || origin);
    const exactScore = p.referenceMatcher.score(exactPatch);
    let candidate = { rect: p.lockedRect || origin, patch: exactPatch, score: exactScore };
    const directlyCalibrated = s.mode === 'fullscreen' && Boolean(s.profile.fullscreenProfile);
    const minInitialScore = directlyCalibrated ? 0.18 : 0.16;
    if (exactScore < (directlyCalibrated ? 0.30 : 0.20) && p.frameCount % 2 === 0) {
      const found = bestRegion(p, bitmap, patch => p.referenceMatcher.score(patch), !directlyCalibrated, origin);
      if (found && found.score > candidate.score) candidate = found;
    }
    p.confidence = candidate.score;
    if (candidate.score >= minInitialScore) {
      p.lockedRect = candidate.rect;
      p.relocating = false;
      p.relocationStartedAt = null;
      p.lastLockedAt = Date.now();
      s.noMatchSince = null;
      p.learning.push(candidate.patch);
      if (p.learning.length >= 5) {
        p.detector = new LogoDetector(p.reference, p.learning);
        p.quality = p.detector.quality;
        p.trigger = p.detector.threshold(s.settings.sensitivity);
        p.learning = [];
        s.stage = 'watching';
        s.logoState = 'visible';
        s.awaitingFirstLogo = false;
        // Successful recognition proves the saved logo is visible.
        await changeMute(s, false);
        announceLogoLocked(s, s.fullscreen ? 'fullscreen' : 'preview');
      } else s.stage = 'learning logo';
    } else {
      // Never combine distant frames from unrelated pictures into a logo lock.
      // In particular, the first frames may be a commercial without a logo.
      p.learning = [];
      s.stage = s.awaitingFirstLogo ? 'waiting for saved logo' : 'finding logo';
      s.logoState = 'unlocated';
      if (!s.noMatchSince) s.noMatchSince = Date.now();
      if (s.awaitingFirstLogo) {
        // A calibrated channel can start during a commercial. Keep checking
        // indefinitely until the saved logo appears; never time out merely
        // because the advertisement break is long.
        await changeMute(s, true);
      } else {
        if (s.settings.debugMuteOnLostLogo &&
            Date.now() >= s.layoutGraceUntil + RELOCK_DEBUG_DELAY_MS &&
            Date.now() - s.noMatchSince >= s.settings.muteAfterMs) {
          await changeMute(s, true);
        }
        if (Date.now() - s.noMatchSince > 45000) throw new Error('Could not find the saved logo after the layout change. Try selecting it in fullscreen.');
      }
    }
    return;
  }
  s.noMatchSince = null;
  s.stage = 'watching';
  const threshold = p.detector.threshold(s.settings.sensitivity);
  const scorer = patch => p.detector.score(patch);
  let best;

  if (p.relocating || !p.lockedRect) {
    // An unlocated logo is NOT an absent logo. During a fullscreen transition
    // screenshots can show normal programming while its ident has moved.
    const expectedPatch = frame(p, bitmap, origin);
    best = { rect: origin, patch: expectedPatch, score: scorer(expectedPatch) };
    // When the previous frame has a plausible new location, search around
    // that position first to confirm it; don't start from the old corner.
    if (p.relockCandidate?.rect) {
      const recent = bestRegion(p, bitmap, scorer, false, p.relockCandidate.rect);
      if (recent && recent.score > best.score) best = recent;
    }
    if (p.relocating && (!p.relockCandidate || best.score < threshold + 0.06)) {
      const found = bestRegion(p, bitmap, scorer, true, origin);
      if (found && found.score > best.score) best = found;
    }
    const acquireThreshold = Math.max(threshold + 0.06,
      Math.min(0.52, p.detector.calibrationScore * 0.59));
    p.confidence = best.score;
    p.trigger = threshold;
    s.logoState = 'unlocated';
    s.absentSince = null;
    s.visibleSince = null;
    s.relockChecks = (s.relockChecks || 0) + 1;

    if (best.score >= acquireThreshold) {
      // A single look-alike frame is not enough. Confirm a visually stable
      // candidate in at least three separate screenshots before arming mute.
      const previous = p.relockCandidate;
      const r = best.rect, old = previous?.rect;
      const nearby = old &&
        Math.abs((r.x+r.w/2) - (old.x+old.w/2)) <= Math.max(9, old.w*.22) &&
        Math.abs((r.y+r.h/2) - (old.y+old.h/2)) <= Math.max(9, old.h*.22) &&
        Math.abs(r.w-old.w) <= Math.max(5,old.w*.18) &&
        Math.abs(r.h-old.h) <= Math.max(5,old.h*.18) &&
        Date.now() - previous.lastAt < 3500;
      p.relockCandidate = { rect:r, count: nearby ? previous.count+1 : 1, lastAt: Date.now() };
      s.stage = 'confirming fullscreen logo';
      if (p.relockCandidate.count >= 3) {
        p.lockedRect = r;
        p.relocating = false;
        p.relocationStartedAt = null;
        p.relockCandidate = null;
        p.lastLockedAt = Date.now();
        s.reacquiredAfterLayout = true;
        s.logoState = 'visible';
        s.stage = 'watching';
        s.visibleSince = Date.now();
        s.awaitingFirstLogo = false;
        await changeMute(s, false);
        announceLogoLocked(s, s.fullscreen ? 'fullscreen' : 'preview');
      }
    } else {
      p.relockCandidate = null;
      s.stage = 'finding fullscreen logo';
    }
    // In debug mode the failure remains audible, but only AFTER the one-second
    // screen settle and a few real full-screen search frames.  This prevents
    // the immediate, erroneous mute observed on CNN, OAN, and MS NOW.
    const trackingReallyLost = s.logoState === 'unlocated' &&
      Date.now() >= s.layoutGraceUntil + RELOCK_DEBUG_DELAY_MS &&
      s.relockChecks >= 2;
    await changeMute(s, Boolean(s.awaitingFirstLogo || (s.settings.debugMuteOnLostLogo && trackingReallyLost)));
    return;
  } else {
    // Stable-layout mode: prefer the last VERIFIED logo location.
    // Free-searching the entire corner on each frame can confuse CNN's
    // changing lower thirds and advertising graphics with its logo.
    const fixedPatch = frame(p, bitmap, p.lockedRect);
    best = { rect: p.lockedRect, patch: fixedPatch, score: scorer(fixedPatch) };
    if (best.score >= threshold * 0.78) {
      // Very small jitter tolerance, but never roam the corner during ads.
      const local = bestRegion(p, bitmap, scorer, false, p.lockedRect);
      if (local && local.score > best.score && local.score >= threshold) best = local;
    }
    if (best.score >= threshold) p.lockedRect = best.rect;
  }
  p.confidence = best.score;
  p.trigger = threshold;
  const now = Date.now();
  const visible = best.score >= threshold && !p.relocating;
  s.logoState = visible ? 'visible' : 'absent';
  // Only detect commercials with a positively locked logo position.
  // Relocation is handled above and deliberately leaves audio enabled.
  if (now < s.layoutGraceUntil) return;
  if (!visible) {
    s.visibleSince = null;
    if (s.absentSince == null) s.absentSince = now;
    if (now - s.absentSince >= s.settings.muteAfterMs) await changeMute(s, true);
  } else {
    s.absentSince = null;
    if (s.visibleSince == null) s.visibleSince = now;
    if (now - s.visibleSince >= s.settings.restoreAfterMs) await changeMute(s, false);
  }
}
async function takeScreenshot(s) {
  await refreshLayout(s);
  const [active] = await chrome.tabs.query({ active: true, windowId: s.windowId });
  if (!active || active.id !== s.tabId) {
    await stopMonitor('Monitoring stopped because you switched tabs. Start again when watching the TV tab.');
    return;
  }
  let screenshot;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      screenshot = await withTimeout(chrome.tabs.captureVisibleTab(s.windowId, { format: 'jpeg', quality: 72 }), 6000, 'Taking a TV snapshot');
      break;
    } catch (e) {
      if (attempt === 0 && /MAX_CAPTURE|too many calls|frequent/i.test(e.message)) {
        await new Promise(resolve => setTimeout(resolve, 850));
      } else {
        throw new Error('Chrome could not capture this tab: ' + e.message);
      }
    }
  }
  if (monitor !== s) return;
  const bitmap = await decodeImage(screenshot);
  try { await handleFrame(s, bitmap); }
  finally { bitmap.close?.(); }
}
async function tick(s) {
  if (monitor !== s) return;
  try {
    await takeScreenshot(s);
    s.errors = 0;
    s.error = null;
    s.lastFrameAt = Date.now();
  } catch (e) {
    s.errors++;
    s.error = e?.message || String(e);
    s.stage = 'capture error';
    if (s.errors >= MAX_CONSECUTIVE_ERRORS) {
      await stopMonitor(s.error);
      return;
    }
  }
  if (monitor === s) s.timer = setTimeout(() => tick(s), RATE_MS);
}
function status() {
  const s = monitor;
  if (!s) return { running: false, stage: 'off', lastIssue };
  return {
    running: true, tabId: s.tabId, stage: s.stage,
    muted: s.ownedMute || s.originalMute,
    score: s.processor.confidence, threshold: s.processor.trigger,
    quality: s.processor.quality, lastFrameAt: s.lastFrameAt,
    error: s.error, lastIssue, captureMethod: 'screenshots',
    fullscreen: s.fullscreen, fullscreenSeen: Boolean(s.fullscreenSeen),
    layoutChanges: s.layoutChanges || 0, reacquiredAfterLayout: Boolean(s.reacquiredAfterLayout),
    chimeCount: s.chimeCount || 0, lastChimeMode: s.lastChimeMode || null,
    lastChimeAt: s.lastChimeAt || null, chimeError: s.chimeError || null,
    layoutTracking: Boolean(s.processor.relativeLogo), logoRelocating: s.processor.relocating,
    profileMode: s.mode, hasFullscreenCalibration: Boolean(s.profile.fullscreenProfile),
    logoState: s.logoState || 'unknown',
    awaitingFirstLogo: Boolean(s.awaitingFirstLogo),
    diagnosticMuteOnLostLogo: Boolean(s.settings.debugMuteOnLostLogo),
    muteReason: s.ownedMute ? (s.awaitingFirstLogo ? 'awaiting-logo' : ((s.logoState === 'unlocated' && s.settings.debugMuteOnLostLogo) ? 'tracking-lost' : 'logo-absent')) : 'not-muted',
    absentForMs: s.absentSince === null ? 0 : Math.max(0, Date.now() - s.absentSince),
    graceRemainingMs: Math.max(0, s.layoutGraceUntil - Date.now()),
    layoutSettling: Boolean(s.processor.relocating && Date.now() < s.layoutGraceUntil),
    relockChecks: s.relockChecks || 0,
    msUntilDebugLostMute: Math.max(0, s.layoutGraceUntil + RELOCK_DEBUG_DELAY_MS - Date.now()),
    confirmedLogoPosition: Boolean(s.processor.lockedRect && !s.processor.relocating),
    fullscreenSafeMode: Boolean(s.processor.relocating),
    relockConfirmations: s.processor.relockCandidate?.count || 0,
    sampledFrameCount: s.processor.frameCount,
    lastSearchScope: s.processor.lastSearchScope || 'not-searched',
    lastSearchCandidates: s.processor.lastSearchCandidates || 0,
    lastSearchAt: s.processor.lastSearchAt || null,
    lastWideSearchScope: s.processor.lastWideSearchScope || 'not-searched',
    lastWideSearchCandidates: s.processor.lastWideSearchCandidates || 0
  };
}
async function start(msg, sender) {
  const tabId = Number(msg.tabId);
  if (!Number.isInteger(tabId)) throw new Error('No TV tab found.');
  const existing = monitor;
  if (existing?.tabId === tabId) return { ok: true, status: status() };
  if (existing) await stopMonitor('');
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url || !/^https?:/.test(tab.url)) throw new Error('Open the television website first.');
  const profile = await getProfile(tab.url);
  if (!profile) throw new Error('Choose a channel logo before starting.');
  const settings = await getSettings(tab.url);
  const referenceBitmap = await decodeImage(profile.reference);
  let processor;
  try { processor = createProcessor(profile, referenceBitmap); }
  finally { referenceBitmap.close?.(); }
  let fullscreenProcessor = null;
  if (profile.fullscreenProfile) {
    const fullBitmap = await decodeImage(profile.fullscreenProfile.reference);
    try { fullscreenProcessor = createProcessor(profile.fullscreenProfile, fullBitmap); }
    finally { fullBitmap.close?.(); }
  }
  const s = {
    tabId, windowId: tab.windowId, profile, settings, processor,
    channelUrl: tab.url,
    mode: 'preview', currentProfile: profile, previewFrameSize: null,
    modeProcessors: { preview: processor, ...(fullscreenProcessor ? { fullscreen: fullscreenProcessor } : {}) },
    stage: 'starting', timer: null, ownedMute: false, awaitingFirstLogo: true,
    originalMute: Boolean(tab.mutedInfo?.muted), absentSince: null,
    visibleSince: null, layoutGraceUntil: 0, layoutChangeAt: null, relockChecks: 0, noMatchSince: null,
    lastLayoutCheck: 0, lastLayoutFailure: false, fullscreen: false,
    fullscreenSeen: false, layoutChanges: 0, reacquiredAfterLayout: false,
    acquisitionSerial: 0, confirmedChimeSerial: -1, lastChimeAt: 0, chimeCount: 0,
    lastFrameAt: null, errors: 0, error: null, generation: ++generation, logoState: 'unknown'
  };
  monitor = s;
  lastIssue = '';
  // Begin muted immediately. The saved logo, not the button click, decides
  // when it is safe to restore programme audio. This also handles commercials
  // already playing when monitoring starts.
  try {
    await changeMute(s, true);
    await refreshLayout(s, true);
  } catch (e) {
    await stopMonitor('Start failed: ' + (e?.message || String(e)));
    throw e;
  }
  // Verify screenshot permission and feed detector before reporting success.
  // Do not block START on several seconds of logo learning.
  try {
    await takeScreenshot(s);
    if (monitor !== s) throw new Error(lastIssue || 'Monitoring was stopped.');
  } catch (e) {
    await stopMonitor('Start failed: ' + (e?.message || String(e)));
    throw e;
  }
  if (monitor === s) {
    await setToolbarState(s.ownedMute ? 'muted' : 'watching');
    s.timer = setTimeout(() => tick(s), RATE_MS);
  }
  return { ok: true, status: status() };
}
async function testMute(tabId) {
  if (monitor) throw new Error('Stop monitoring before testing mute.');
  if (testMuteTimer) throw new Error('Mute test already running.');
  const tab = await chrome.tabs.get(tabId);
  const wasMuted = Boolean(tab.mutedInfo?.muted);
  if (wasMuted) throw new Error('This tab is already muted. Unmute it before testing.');
  await chrome.tabs.update(tabId, { muted: true });
  await setToolbarState('muted');
  testMuteTimer = setTimeout(async () => {
    testMuteTimer = null;
    try { await chrome.tabs.update(tabId, { muted: false }); } catch (_) {}
    await setToolbarState('off');
  }, 2200);
  return { ok: true };
}
// Capture the live full-screen picture BEFORE opening a wizard. Showing an
// extension window can itself exit browser/player full-screen mode.
async function captureFullscreenCalibration(tab) {
  const stored = await getProfile(tab.url);
  if (!stored) throw new Error('Choose and save this channel’s preview logo first.');
  // Stop periodic screenshot polling before this one-off calibration capture.
  // Chrome limits captureVisibleTab to two calls per second.
  if (monitor) {
    await stopMonitor('');
    await new Promise(resolve => setTimeout(resolve, RATE_MS + 100));
  }
  const screenshot = await withTimeout(
    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 84 }),
    6000, 'Capturing full-screen picture');
  const bitmap = await decodeImage(screenshot);
  const width = bitmap.width, height = bitmap.height;
  bitmap.close?.();
  const token = crypto.randomUUID();
  const entry = { image: screenshot, tabId: tab.id, url: tab.url, width, height };
  // Keep the latest screenshot only; it is never uploaded to a server.
  await chrome.storage.session.set({ pendingFullscreenCalibrations: { [token]: entry } });
  const wizardWindow = await chrome.windows.create({
    url: chrome.runtime.getURL('calibrate.html?token=' + encodeURIComponent(token)),
    type: 'popup', width: 1160, height: 850, focused: true
  });
  // The ID is recorded with the screenshot so saving the logo can trigger
  // monitoring only when THIS calibration window actually closes.
  entry.calibrationWindowId = wizardWindow.id;
  await chrome.storage.session.set({ pendingFullscreenCalibrations: { [token]: entry } });
  return { ok: true };
}
// Arm a *future* full-screen capture from the popup. User enters full-screen
// afterward; the injected listener waits for the layout to settle, and takes
// the screenshot before opening the calibration window. This avoids keyboard
// shortcut conflicts and keeps all controls off the television picture.
async function armFullscreenCalibration(tabId) {
  if (!Number.isInteger(tabId)) throw new Error('Open a TV tab to calibrate.');
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url || !/^https?:/.test(tab.url)) throw new Error('Open the TV website first.');
  if (!await getProfile(tab.url)) throw new Error('First save the preview logo for this channel.');
  if (monitor) await stopMonitor('');
  await chrome.storage.session.set({
    armedFullscreenCalibration: {
      tabId, url: tab.url, expiresAt: Date.now() + 120000
    }
  });
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['fullscreen-arm.js'] });
  } catch (error) {
    await chrome.storage.session.remove('armedFullscreenCalibration');
    throw new Error('Could not watch for full-screen: ' + (error?.message || String(error)));
  }
  lastIssue = '';
  return { ok: true, armed: true };
}

async function handleArmedFullscreenReady(sender) {
  if (armedCalibrationInProgress) throw new Error('Full-screen capture is already running.');
  const { armedFullscreenCalibration: armed } = await chrome.storage.session.get('armedFullscreenCalibration');
  if (!armed || Date.now() > armed.expiresAt || !sender.tab?.id || sender.tab.id !== armed.tabId) {
    throw new Error('Full-screen calibration was not armed, or the two-minute window expired.');
  }
  const tab = await chrome.tabs.get(armed.tabId);
  if (keyFor(tab.url) !== keyFor(armed.url)) throw new Error('The TV channel changed. Arm calibration again.');
  armedCalibrationInProgress = true;
  try {
    // Remove the arm only after we have a live tab and are ready to capture.
    await chrome.storage.session.remove('armedFullscreenCalibration');
    return await captureFullscreenCalibration(tab);
  } catch (error) {
    lastIssue = 'Full-screen calibration: ' + (error?.message || String(error));
    throw error;
  } finally {
    armedCalibrationInProgress = false;
  }
}

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case 'GET_STATE': {
      const [profile, settings] = await Promise.all([
        msg.url ? getProfile(msg.url) : null, getSettings(msg.url)
      ]);
      return { ok: true, profile: profile ? {
        rect: profile.rect, savedAt: profile.savedAt,
        fullscreenSavedAt: profile.fullscreenProfile?.savedAt || null
      } : null, settings, status: status() };
    }
    case 'CHOOSE_LOGO': {
      if (!Number.isInteger(msg.tabId)) throw new Error('No TV tab selected.');
      if (monitor?.tabId === msg.tabId) throw new Error('Stop monitoring before selecting a different logo.');
      await chrome.scripting.executeScript({ target: { tabId: msg.tabId }, files: ['selector.js'] });
      return { ok: true };
    }
    case 'CAPTURE_LOGO': {
      if (!sender.tab?.id) throw new Error('Logo selection must come from the TV tab.');
      const image = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
      return { ok: true, image };
    }
    case 'SAVE_LOGO': {
      if (!sender.tab?.id || !msg.reference?.startsWith('data:image/png;base64,') || msg.reference.length > 500000) {
        throw new Error('Invalid saved logo.');
      }
      const r = msg.rect;
      if (!r || ![r.x,r.y,r.w,r.h].every(Number.isFinite) ||
          r.x < 0 || r.y < 0 || r.w <= 0 || r.h <= 0 || r.x+r.w > 1.001 || r.y+r.h > 1.001) throw new Error('Invalid logo rectangle.');
      const { profiles = {} } = await chrome.storage.local.get('profiles');
      const measured = await getLayout(sender.tab.id, { x:r.x+r.w/2, y:r.y+r.h/2 });
      const box = measured?.player?.rect || null;
      profiles[keyFor(sender.tab.url)] = {
        rect: r, reference: msg.reference, anchor: msg.anchor,
        viewport: msg.viewport, videoBox: box,
        relativeLogo: box ? GEO.relativeLogo(r, box) : null,
        savedAt: new Date().toISOString()
      };
      await chrome.storage.local.set({ profiles });
      return { ok: true };
    }
    case 'START': return start(msg, sender);
    case 'STOP': await stopMonitor(''); return { ok: true };
    case 'TEST_MUTE': return testMute(msg.tabId);
    case 'TEST_CHIME': await soundChime(); return { ok: true };
    case 'CALIBRATION_COUNTDOWN_BEEP': {
      const secondsRemaining = Number(msg.secondsRemaining);
      if (!Number.isInteger(secondsRemaining) || secondsRemaining < 1 || secondsRemaining > 8 || !sender.tab?.id) {
        throw new Error('Invalid calibration beep request.');
      }
      const { armedFullscreenCalibration: armed } = await chrome.storage.session.get('armedFullscreenCalibration');
      if (!armed || armed.tabId !== sender.tab.id || Date.now() > armed.expiresAt) {
        throw new Error('Full-screen calibration has not been armed.');
      }
      // Beeps are best-effort. They never delay the screenshot or commercial audio.
      await soundCountdownBeep(secondsRemaining);
      return { ok: true };
    }
    case 'ARM_FULLSCREEN_CALIBRATION': return armFullscreenCalibration(Number(msg.tabId));
    case 'ARMED_FULLSCREEN_READY': return handleArmedFullscreenReady(sender);
    case 'CAPTURE_FULLSCREEN_CALIBRATION': {
      const tabId = Number(msg.tabId);
      if (!Number.isInteger(tabId)) throw new Error('No TV tab selected.');
      const tab = await chrome.tabs.get(tabId);
      if (!tab?.url || !/^https?:/.test(tab.url)) throw new Error('Open the TV website first.');
      return captureFullscreenCalibration(tab);
    }
    case 'GET_FULLSCREEN_CALIBRATION': {
      if (!/^[a-f0-9-]{36}$/.test(msg.token || '')) throw new Error('Invalid calibration token.');
      const { pendingFullscreenCalibrations = {} } = await chrome.storage.session.get('pendingFullscreenCalibrations');
      const entry = pendingFullscreenCalibrations[msg.token];
      if (!entry) throw new Error('Calibration expired. Return to the full-screen TV and press Alt + Shift + L.');
      return { ok: true, image: entry.image, channel: new URL(entry.url).hostname };
    }
    case 'SAVE_FULLSCREEN_CALIBRATION': {
      if (!/^[a-f0-9-]{36}$/.test(msg.token || '')) throw new Error('Invalid calibration token.');
      const { pendingFullscreenCalibrations = {} } = await chrome.storage.session.get('pendingFullscreenCalibrations');
      const entry = pendingFullscreenCalibrations[msg.token];
      if (!entry) throw new Error('Calibration expired. Capture a new full-screen image.');
      const r = msg.rect;
      if (!r || ![r.x,r.y,r.w,r.h].every(Number.isFinite) ||
          r.x < 0 || r.y < 0 || r.w < 0.003 || r.h < 0.003 ||
          r.x+r.w > 1.001 || r.y+r.h > 1.001) throw new Error('Invalid logo selection.');
      if (!msg.reference?.startsWith('data:image/png;base64,') || msg.reference.length > 500000) {
        throw new Error('Invalid full-screen logo image.');
      }
      const key = keyFor(entry.url);
      const { profiles = {} } = await chrome.storage.local.get('profiles');
      if (!profiles[key]) throw new Error('Select the preview logo for this channel first.');
      profiles[key].fullscreenProfile = {
        rect: r, reference: msg.reference,
        viewport: { width: entry.width, height: entry.height },
        frameSize: { width: entry.width, height: entry.height },
        anchor: (r.y+r.h/2 > 0.5 ? 'bottom' : 'top') + '-' + (r.x+r.w/2 > 0.5 ? 'right' : 'left'),
        savedAt: new Date().toISOString()
      };
      await chrome.storage.local.set({ profiles });
      delete pendingFullscreenCalibrations[msg.token];
      await chrome.storage.session.set({ pendingFullscreenCalibrations });
      // The calibration popup is still focused here. Waiting for it to close
      // avoids capturing that window (or starting before the TV tab is visible).
      // Storage.session survives a Manifest V3 worker restart during handoff.
      if (Number.isInteger(entry.calibrationWindowId) && Number.isInteger(entry.tabId)) {
        await chrome.storage.session.set({ pendingCalibrationAutoStart: {
          calibrationWindowId: entry.calibrationWindowId,
          tabId: entry.tabId,
          urlKey: key,
          expiresAt: Date.now() + 30000
        }});
        return { ok: true, autoStartQueued: true };
      }
      // Older captures may lack a window ID. Never claim the monitor started.
      lastIssue = 'Full-screen logo saved. Click START to begin monitoring.';
      return { ok: true, autoStartQueued: false };
    }
    case 'SETTINGS': {
      const sensitivity = Number(msg.settings?.sensitivity);
      const muteAfterMs = Number(msg.settings?.muteAfterMs);
      if (!SENSITIVITY_OPTIONS.includes(sensitivity) || ![1000,1700,3000].includes(muteAfterMs)) {
        throw new Error('Invalid settings.');
      }
      const url = msg.url;
      if (typeof url !== 'string' || !/^https?:/i.test(url)) {
        throw new Error('Open the TV channel before saving its sensitivity.');
      }
      // Require the URL to belong to the active tab; avoid silently writing
      // another channel's profile if the popup/tab has changed.
      const tabId = Number(msg.tabId);
      if (!Number.isInteger(tabId)) throw new Error('No TV tab selected.');
      const tab = await chrome.tabs.get(tabId);
      if (!tab?.url || keyFor(tab.url) !== keyFor(url)) {
        throw new Error('The TV channel changed. Reopen LogoMute and try again.');
      }
      const debugMuteOnLostLogo = msg.settings?.debugMuteOnLostLogo === true;
      const prior = await chrome.storage.local.get(['settings', 'channelSensitivities']);
      const channelSensitivities = prior.channelSensitivities || {};
      channelSensitivities[keyFor(url)] = sensitivity;
      // Keep legacy global sensitivity as a fallback for channels not yet
      // customized, but do not overwrite it when changing this channel.
      const settings = {
        ...(prior.settings || {}),
        muteAfterMs, restoreAfterMs: 900, debugMuteOnLostLogo
      };
      await chrome.storage.local.set({ settings, channelSensitivities });
      if (monitor) {
        monitor.settings = await getSettings(monitor.channelUrl);
        if (monitor.awaitingFirstLogo) {
          await changeMute(monitor, true);
        } else if (monitor.logoState === 'unlocated' &&
            Date.now() >= monitor.layoutGraceUntil + RELOCK_DEBUG_DELAY_MS &&
            monitor.relockChecks >= 2) {
          await changeMute(monitor, monitor.settings.debugMuteOnLostLogo);
        }
      }
      return { ok: true, settings: await getSettings(url) };
    }
    default: throw new Error('Unknown LogoMute request.');
  }
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.target !== 'background') return false;
  handleMessage(msg, sender).then(reply, e => reply({ ok: false, error: e?.message || String(e) }));
  return true;
});
chrome.tabs.onActivated.addListener(async info => {
  if (monitor && monitor.windowId === info.windowId && monitor.tabId !== info.tabId) {
    await stopMonitor('Monitoring stopped when you switched tabs.');
  }
});
chrome.tabs.onRemoved.addListener(async tabId => { if (monitor?.tabId === tabId) await stopMonitor(''); });

// Completing full-screen calibration automatically activates monitoring. Do
// this on the close event, not in SAVE_FULLSCREEN_CALIBRATION: Chrome must first
// return focus from the calibration popup to the original TV window.
chrome.windows.onRemoved.addListener(async closedWindowId => {
  try {
    const { pendingCalibrationAutoStart: pending } = await chrome.storage.session.get('pendingCalibrationAutoStart');
    if (!pending || pending.calibrationWindowId !== closedWindowId) return;
    await chrome.storage.session.remove('pendingCalibrationAutoStart');
    if (Date.now() > pending.expiresAt) return;
    const tab = await chrome.tabs.get(pending.tabId);
    if (!tab?.url || keyFor(tab.url) !== pending.urlKey) {
      lastIssue = 'Full-screen logo saved, but the TV channel changed. Click START on the channel tab.';
      return;
    }
    // Re-select the original TV. A calibration popup can break player fullscreen;
    // automatic monitoring still starts in the mode currently displayed.
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    await new Promise(resolve => setTimeout(resolve, 350));
    await start({ tabId: tab.id }, null);
  } catch (error) {
    lastIssue = 'Automatic monitoring could not start: ' + (error?.message || String(error)) +
      '. Open LogoMute and click START.';
    console.warn('LogoMute calibration auto-start:', error);
    await setToolbarState('off');
  }
});
chrome.tabs.onUpdated.addListener(async (tabId, changes) => {
  if (monitor?.tabId === tabId && changes.status === 'loading') {
    await stopMonitor('Monitoring stopped because the TV page navigated or reloaded.');
  }
});

// Chrome's keyboard shortcut grants activeTab access while the player fills
// the screen, where the extension toolbar is normally inaccessible.
chrome.commands?.onCommand?.addListener((command, tab) => {
  if (command !== 'capture-fullscreen-logo') return;
  (async () => {
    const source = tab?.id ? tab : (await chrome.tabs.query({active:true,currentWindow:true}))[0];
    if (!source?.id) throw new Error('No TV tab is active.');
    await captureFullscreenCalibration(await chrome.tabs.get(source.id));
  })().catch(e => { lastIssue = 'Full-screen calibration: ' + (e?.message || String(e)); console.error(lastIssue); });
});
