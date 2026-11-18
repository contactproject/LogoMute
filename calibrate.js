'use strict';
/* Calibration supports two clicks (primary method) or click-and-drag (alternate).
 * Screenshot is captured in fullscreen before this window is opened.
 */
const el = id => document.getElementById(id);
const token = new URL(location.href).searchParams.get('token');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const surface = el('surface');
const selection = el('box');
const firstMarker = el('first-marker');
const picture = el('picture');
const saveButton = el('save');
let anchor = null;
let selected = null;
let pointerStart = null;
let dragging = false;
let busy = false;
let loaded = false;
const MIN_W = 8, MIN_H = 7, DRAG_THRESHOLD = 5;
let lastPointerUpAt = 0;
const show = (message, error = false) => {
  el('status').textContent = message;
  el('status').className = error ? 'error' : '';
};
async function send(type, payload = {}) {
  const answer = await chrome.runtime.sendMessage({ target: 'background', type, token, ...payload });
  if (!answer?.ok) throw new Error(answer?.error || 'LogoMute did not respond.');
  return answer;
}
function point(event) {
  const b = surface.getBoundingClientRect();
  return {
    x: clamp(event.clientX - b.left, 0, b.width),
    y: clamp(event.clientY - b.top, 0, b.height)
  };
}
function rectBetween(a, b) {
  return {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y)
  };
}
function draw(rect) {
  if (!rect) { selection.style.display = 'none'; return; }
  selection.style.display = 'block';
  for (const [key, value] of Object.entries({ left: rect.x, top: rect.y, width: rect.w, height: rect.h })) {
    selection.style[key] = value + 'px';
  }
}
function markFirst(pt) {
  firstMarker.style.display = pt ? 'block' : 'none';
  if (pt) {
    firstMarker.style.left = pt.x + 'px';
    firstMarker.style.top = pt.y + 'px';
  }
}
function beginNew() {
  anchor = null;
  selected = null;
  dragging = false;
  pointerStart = null;
  saveButton.disabled = true;
  draw(null);
  markFirst(null);
  show('Click one corner of the logo, then its opposite corner. Or click and drag around it.');
}
function populateCoordinates(rect) {
  const bounds = surface.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const pct = (value) => String(Math.round(value * 10) / 10);
  el('crop-x').value = pct(100 * rect.x / bounds.width);
  el('crop-y').value = pct(100 * rect.y / bounds.height);
  el('crop-w').value = pct(100 * rect.w / bounds.width);
  el('crop-h').value = pct(100 * rect.h / bounds.height);
}
function finalize(rect) {
  if (rect.w < MIN_W || rect.h < MIN_H) {
    beginNew();
    show('Selection too small. Click the two opposite corners, a little farther apart.', true);
    return;
  }
  selected = rect;
  anchor = null;
  markFirst(null);
  draw(rect);
  populateCoordinates(rect);
  saveButton.disabled = false;
  show('Rectangle ready. If it surrounds only the channel logo, click Save full-screen logo.');
}
// Use pointer events for both mouse dragging and touchscreen selection.
// The first short click marks a corner; the second short click finishes.
surface.addEventListener('pointerdown', event => {
  if (!loaded || busy || event.button > 0) return;
  event.preventDefault();
  pointerStart = point(event);
  dragging = false;
  try { surface.setPointerCapture(event.pointerId); } catch (_) {}
  if (!anchor) {
    selected = null;
    saveButton.disabled = true;
    draw(null);
  }
});
surface.addEventListener('pointermove', event => {
  if (!loaded || busy) return;
  const current = point(event);
  if (pointerStart) {
    if (Math.hypot(current.x - pointerStart.x, current.y - pointerStart.y) >= DRAG_THRESHOLD) dragging = true;
    if (dragging) draw(rectBetween(anchor || pointerStart, current));
  } else if (anchor) {
    // Preview the box before the second click, making two-click selection obvious.
    draw(rectBetween(anchor, current));
  }
});
surface.addEventListener('pointerup', event => {
  if (!pointerStart || busy || !loaded) return;
  event.preventDefault();
  const current = point(event);
  if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
  if (dragging) {
    finalize(rectBetween(anchor || pointerStart, current));
  } else if (!anchor) {
    anchor = current;
    selected = null;
    markFirst(anchor);
    draw(null);
    show('First corner set. Now click the opposite corner of the logo.');
  } else {
    finalize(rectBetween(anchor, current));
  }
  pointerStart = null;
  dragging = false;
  lastPointerUpAt = performance.now();
});
// Browser accessibility/remote mouse environments sometimes dispatch click but
// not a complete pointer pair. Fall back to ordinary clicks in that case.
surface.addEventListener('click', event => {
  if (!loaded || busy || performance.now() - lastPointerUpAt < 250) return;
  const current = point(event);
  if (!anchor) {
    anchor = current;
    selected = null;
    saveButton.disabled = true;
    markFirst(anchor);
    draw(null);
    show('First corner selected. Click the opposite logo corner.');
  } else {
    finalize(rectBetween(anchor, current));
  }
});
surface.addEventListener('pointercancel', () => {
  pointerStart = null;
  dragging = false;
  if (!selected) draw(null);
});
window.addEventListener('pointerup', () => {
  // A pointerup outside the image should not leave the UI permanently dragging.
  if (pointerStart && !dragging) pointerStart = null;
});
// Mouse-independent selection: use a corner preset, then edit percentages.
// No controls are ever inserted into the broadcast page itself.
function manualRectangle(x, y, w, h) {
  const b = surface.getBoundingClientRect();
  const values = [x,y,w,h];
  if (b.width <= 0 || b.height <= 0 || !values.every(Number.isFinite) ||
      w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > 100.001 || y + h > 100.001) {
    show('Enter valid percentages. X + Width and Y + Height must not exceed 100.', true);
    return;
  }
  finalize({ x:x*b.width/100, y:y*b.height/100, w:w*b.width/100, h:h*b.height/100 });
}
el('use-preset').addEventListener('click', () => {
  if (!loaded || busy) return;
  const corner = el('preset').value;
  const w=12, h=16, margin=4;
  const x=corner.endsWith('right')?100-w-margin:margin;
  const y=corner.startsWith('bottom')?100-h-margin:margin;
  manualRectangle(x,y,w,h);
  if (selected) show('Preset box placed. Adjust X, Y, W, H below the picture, then Update box.');
});
el('apply-coordinates').addEventListener('click', () => {
  if (!loaded || busy) return;
  manualRectangle(...['crop-x','crop-y','crop-w','crop-h'].map(id => Number(el(id).value)));
});
// Re-position the saved selection when the calibration window is resized;
// normalized percentages remain stable as the screenshot scales.
let windowResizeTimer;
window.addEventListener('resize', () => {
  if (!selected || busy) return;
  const oldRect = selected;
  const x=Number(el('crop-x').value),y=Number(el('crop-y').value),
        w=Number(el('crop-w').value),h=Number(el('crop-h').value);
  clearTimeout(windowResizeTimer);
  windowResizeTimer = setTimeout(() => manualRectangle(x,y,w,h), 80);
});
el('reset').addEventListener('click', beginNew);
el('cancel').addEventListener('click', () => window.close());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (anchor || selected) beginNew(); else window.close();
  } else if (event.key === 'Enter' && selected && !busy && !saveButton.disabled) {
    event.preventDefault(); saveButton.click();
  }
});
saveButton.addEventListener('click', async () => {
  if (!selected || busy || !loaded) return;
  const bounds = surface.getBoundingClientRect();
  const rect = {
    x: selected.x / bounds.width,
    y: selected.y / bounds.height,
    w: selected.w / bounds.width,
    h: selected.h / bounds.height
  };
  const scale = Math.min(1, 280 / (rect.w * picture.naturalWidth), 180 / (rect.h * picture.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(20, Math.round(rect.w * picture.naturalWidth * scale));
  canvas.height = Math.max(14, Math.round(rect.h * picture.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(picture,
      rect.x * picture.naturalWidth, rect.y * picture.naturalHeight,
      rect.w * picture.naturalWidth, rect.h * picture.naturalHeight,
      0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const value = pixels[i] * .299 + pixels[i+1] * .587 + pixels[i+2] * .114;
      sum += value; sumSq += value * value;
    }
    const count = pixels.length / 4;
    if (sumSq / count - (sum / count) ** 2 < 3) {
      show('Selected image is almost blank. Press Reselect and include the visible channel logo.', true);
      return;
    }
    busy = true;
    saveButton.disabled = true;
    show('Saving full-screen logo…');
    const result = await send('SAVE_FULLSCREEN_CALIBRATION', { rect, reference: canvas.toDataURL('image/png') });
    show(result.autoStartQueued
      ? 'Logo saved! Closing this window and starting monitoring automatically on the TV tab…'
      : 'Full-screen logo saved. Return to the TV and click START to monitor.');
    saveButton.textContent = 'Saved';
    setTimeout(() => window.close(), 900);
  } catch (error) {
    busy = false;
    saveButton.disabled = false;
    show('Could not save: ' + error.message, true);
  }
});
(async () => {
  try {
    if (!token) throw new Error('Missing calibration token. Use Alt + Shift + L from the television tab.');
    const result = await send('GET_FULLSCREEN_CALIBRATION');
    picture.onload = () => {
      if (!picture.naturalWidth || !picture.naturalHeight) return show('The captured image is empty.', true);
      loaded = true;
      beginNew();
    };
    picture.onerror = () => show('Could not load the captured picture. Try the shortcut again.', true);
    picture.src = result.image;
  } catch (error) { show(error.message, true); }
})();
