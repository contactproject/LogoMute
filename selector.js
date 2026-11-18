(() => {
  if (window.__logoMuteSelectorActive) return;
  window.__logoMuteSelectorActive = true;
  const doc = document;
  const overlay = doc.createElement('div');
  overlay.id = 'logomute-selector-overlay';
  overlay.style.cssText = [
    'position:fixed','inset:0','z-index:2147483647',
    'background:rgba(4,12,25,.10)','cursor:crosshair',
    'user-select:none','touch-action:none',
    'font:14px system-ui,sans-serif','box-sizing:border-box'
  ].join(';');

  const intro = doc.createElement('div');
  intro.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:7px 12px;background:#152940ee;color:white;border:1px solid #508bbd;border-radius:8px;box-shadow:0 3px 10px #0005;max-width:80vw;text-align:center;pointer-events:none;line-height:1.3;font:600 12px system-ui';
  intro.textContent = 'Draw around the logo — a small margin is OK · Esc to cancel';

  const rectBox = doc.createElement('div');
  rectBox.style.cssText = 'display:none;position:absolute;box-sizing:border-box;border:3px solid #3ef4ac;background:rgba(44,227,154,.13);box-shadow:0 0 0 1px black;pointer-events:none';

  const controls = doc.createElement('div');
  controls.style.cssText = 'display:none;position:fixed;top:12px;left:12px;align-items:center;gap:7px;background:#14273c;border:1px solid #6b91b6;border-radius:9px;padding:7px;box-shadow:0 3px 14px #0009;cursor:auto;max-width:min(96vw,300px)';

  const hint = doc.createElement('div');
  hint.style.cssText = 'display:none;color:#dce8f6;font:600 11px system-ui;line-height:1.35;flex:1 1 auto;min-width:0';
  hint.textContent = '';

  const buttonGroup = doc.createElement('div');
  buttonGroup.style.cssText = 'display:flex;gap:8px;flex:0 0 auto';

  const saveButton = doc.createElement('button');
  const cancelButton = doc.createElement('button');
  function styleButton(el, color) {
    el.style.cssText = `background:${color};border:0;color:#fff;border-radius:6px;padding:8px 10px;font:700 12px system-ui;cursor:pointer;white-space:nowrap`;
  }
  saveButton.textContent = 'Save this logo';
  cancelButton.textContent = 'Cancel';
  styleButton(saveButton, '#168455');
  styleButton(cancelButton, '#41536b');
  saveButton.disabled = true;
  saveButton.style.opacity = '.45';
  buttonGroup.append(saveButton, cancelButton);
  controls.append(hint, buttonGroup);
  overlay.append(intro, rectBox, controls);
  (doc.documentElement || doc.body).append(overlay);

  let startPoint = null;
  let chosen = null;
  let inProgress = false;
  let finished = false;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function cleanup() {
    doc.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    overlay.remove();
    window.__logoMuteSelectorActive = false;
  }
  function updateBox(r) {
    rectBox.style.display = 'block';
    rectBox.style.left = r.x + 'px'; rectBox.style.top = r.y + 'px';
    rectBox.style.width = r.w + 'px'; rectBox.style.height = r.h + 'px';
  }

  function overlaps(a, b, pad = 10) {
    return !(a.x + a.w + pad < b.x || b.x + b.w + pad < a.x || a.y + a.h + pad < b.y || b.y + b.h + pad < a.y);
  }

  function candidatePositions() {
    const margin = 18;
    const w = controls.offsetWidth || 360;
    const h = controls.offsetHeight || 64;
    return [
      { name: 'tl', x: margin, y: margin, w, h },
      { name: 'tr', x: innerWidth - w - margin, y: margin, w, h },
      { name: 'bl', x: margin, y: innerHeight - h - margin, w, h },
      { name: 'br', x: innerWidth - w - margin, y: innerHeight - h - margin, w, h }
    ].map(p => ({ ...p, x: clamp(p.x, margin, Math.max(margin, innerWidth - w - margin)), y: clamp(p.y, margin, Math.max(margin, innerHeight - h - margin)) }));
  }

  function placeControls(avoidRect) {
    const candidates = candidatePositions();
    let chosenPos = candidates[0];
    if (avoidRect) {
      chosenPos = candidates.find(pos => !overlaps(pos, avoidRect, 24)) || candidates.reduce((best, pos) => {
        const dx = (pos.x + pos.w / 2) - (avoidRect.x + avoidRect.w / 2);
        const dy = (pos.y + pos.h / 2) - (avoidRect.y + avoidRect.h / 2);
        const dist = dx * dx + dy * dy;
        return !best || dist > best.dist ? { ...pos, dist } : best;
      }, null);
    }
    controls.style.left = chosenPos.x + 'px';
    controls.style.top = chosenPos.y + 'px';
    controls.style.right = 'auto';
    controls.style.bottom = 'auto';
  }

  // Keep controls completely hidden until the rectangle is chosen.
  // That way no button can prevent the user selecting a logo beneath it.
  const onResize = () => { if (chosen && controls.style.display !== 'none') placeControls(chosen); };
  window.addEventListener('resize', onResize, { passive: true });

  overlay.addEventListener('pointerdown', e => {
    if (finished || controls.contains(e.target)) return;
    startPoint = { x: clamp(e.clientX, 0, innerWidth), y: clamp(e.clientY, 0, innerHeight) };
    inProgress = true;
    chosen = null;
    controls.style.display = 'none';
    intro.style.display = 'none';
    overlay.setPointerCapture(e.pointerId);
    updateBox({ x: startPoint.x, y: startPoint.y, w: 1, h: 1 });
    saveButton.disabled = true;
    saveButton.style.opacity = '.45';

  });

  overlay.addEventListener('pointermove', e => {
    if (!inProgress || !startPoint) return;
    const x = clamp(e.clientX, 0, innerWidth), y = clamp(e.clientY, 0, innerHeight);
    const r = { x: Math.min(startPoint.x, x), y: Math.min(startPoint.y, y), w: Math.abs(x - startPoint.x), h: Math.abs(y - startPoint.y) };
    updateBox(r);
    chosen = r;
    // No controls are drawn over the video while the box is being dragged.
  });

  overlay.addEventListener('pointerup', e => {
    if (!inProgress) return;
    inProgress = false;
    if (overlay.hasPointerCapture(e.pointerId)) overlay.releasePointerCapture(e.pointerId);
    const okay = chosen && chosen.w >= 18 && chosen.h >= 12;
    saveButton.disabled = !okay;
    saveButton.style.opacity = okay ? '1' : '.45';
    intro.style.display = 'block';
    intro.textContent = okay ? 'Selected logo: Save or draw again · Enter to save' : 'Select a slightly larger area';
    if (okay) { controls.style.display = 'flex'; placeControls(chosen); }
  });

  overlay.addEventListener('pointercancel', () => { inProgress = false; intro.style.display = 'block'; });
  cancelButton.addEventListener('click', cleanup);

  function errorText(text) {
    intro.textContent = text;
    intro.style.background = '#632d39';
    intro.style.display = 'block';
    overlay.style.display = 'block';
    controls.style.display = 'flex';
    placeControls(chosen);
    finished = false;
    saveButton.disabled = false;
    saveButton.style.opacity = '1';
  }

  function determineAnchor(rect) {
    const horizontal = rect.x + rect.w / 2 < innerWidth / 2 ? 'left' : 'right';
    const vertical = rect.y + rect.h / 2 < innerHeight / 2 ? 'top' : 'bottom';
    return vertical + '-' + horizontal;
  }

  saveButton.addEventListener('click', async () => {
    if (!chosen || finished) return;
    finished = true;
    overlay.style.display = 'none';
    try {
      await new Promise(r => setTimeout(r, 220));
      const shot = await chrome.runtime.sendMessage({ target: 'background', type: 'CAPTURE_LOGO' });
      if (!shot?.ok) throw new Error(shot?.error || 'Screenshot failed.');
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve; img.onerror = reject;
        img.src = shot.image;
      });
      const ratioX = img.naturalWidth / innerWidth;
      const ratioY = img.naturalHeight / innerHeight;
      const canvas = doc.createElement('canvas');
      const cropW = Math.max(1, chosen.w * ratioX), cropH = Math.max(1, chosen.h * ratioY);
      const factor = Math.min(1, 280 / cropW, 180 / cropH);
      canvas.width = Math.max(1, Math.round(cropW * factor));
      canvas.height = Math.max(1, Math.round(cropH * factor));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img,
        chosen.x * ratioX, chosen.y * ratioY, cropW, cropH,
        0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0, sum2 = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const gray = pixels[i] * .299 + pixels[i+1] * .587 + pixels[i+2] * .114;
        sum += gray; sum2 += gray * gray;
      }
      const count = pixels.length / 4;
      const variance = sum2 / count - (sum / count) ** 2;
      if (variance < 3) throw new Error('Selected region is almost blank. Choose the logo while it is visible (protected streams may prevent capture).');
      const rect = {
        x: chosen.x / innerWidth, y: chosen.y / innerHeight,
        w: chosen.w / innerWidth, h: chosen.h / innerHeight
      };
      const result = await chrome.runtime.sendMessage({
        target: 'background', type: 'SAVE_LOGO', url: location.href,
        reference: canvas.toDataURL('image/png'), rect,
        anchor: determineAnchor(chosen),
        viewport: { width: innerWidth, height: innerHeight }
      });
      if (!result?.ok) throw new Error(result?.error || 'Could not save logo.');
      cleanup();
      // The tabCapture API is only supported after invoking the extension.
      // A webpage button cannot reliably supply that gesture. Give a brief
      // confirmation without leaving any persistent UI over the broadcast.
      const toast = doc.createElement('div');
      toast.setAttribute('role', 'status');
      toast.textContent = '✓ Logo saved. Click the LogoMute toolbar icon, then Start.';
      toast.style.cssText = 'position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);background:#0e4637;color:#fff;border:1px solid #29af7c;padding:9px 13px;border-radius:9px;box-shadow:0 4px 16px #0008;font:600 13px system-ui;max-width:90vw;text-align:center;pointer-events:none';
      (doc.documentElement || doc.body).append(toast);
      setTimeout(() => toast.remove(), 4400);
    } catch (e) {
      errorText('Could not save logo: ' + e.message);
    }
  });

  const onKey = e => {
    if (e.key === 'Escape') {
      cleanup();
    } else if (e.key === 'Enter' && !finished && chosen && !saveButton.disabled) {
      e.preventDefault();
      saveButton.click();
    }
  };
  doc.addEventListener('keydown', onKey, true);
})();
