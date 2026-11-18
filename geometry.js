/* Player-relative logo geometry. No image capture or browser privileges. */
(function (root) {
  'use strict';
  const bound = (n, min, max) => Math.max(min, Math.min(max, n));
  function validRect(r) {
    return r && [r.x,r.y,r.w,r.h].every(Number.isFinite) && r.w > .01 && r.h > .01;
  }
  function relativeLogo(logoRect, playerRect) {
    if (!validRect(logoRect) || !validRect(playerRect)) return null;
    const result = {
      x: (logoRect.x - playerRect.x) / playerRect.w,
      y: (logoRect.y - playerRect.y) / playerRect.h,
      w: logoRect.w / playerRect.w,
      h: logoRect.h / playerRect.h
    };
    // A logo must be inside the video rectangle. Reject bad DOM guesses.
    if (result.x < -.015 || result.y < -.015 ||
        result.x + result.w > 1.015 || result.y + result.h > 1.015 ||
        result.w > .5 || result.h > .4) return null;
    return result;
  }
  function toViewportRect(relative, playerRect) {
    if (!validRect(relative) || !validRect(playerRect)) return null;
    return {
      x: playerRect.x + relative.x * playerRect.w,
      y: playerRect.y + relative.y * playerRect.h,
      w: relative.w * playerRect.w,
      h: relative.h * playerRect.h
    };
  }
  function asPixels(rect, width, height) {
    if (!validRect(rect)) return null;
    const x = bound(Math.round(rect.x * width), 0, Math.max(0,width - 2));
    const y = bound(Math.round(rect.y * height), 0, Math.max(0,height - 2));
    return { x, y,
      w: bound(Math.round(rect.w * width), 2, width - x),
      h: bound(Math.round(rect.h * height), 2, height - y) };
  }
  function closeRect(a,b,tolerance=.012) {
    return Boolean(validRect(a) && validRect(b) &&
      ['x','y','w','h'].every(k => Math.abs(a[k]-b[k]) <= tolerance));
  }
  function guessFullViewport(prev, next, originalPlayerBox) {
    // When a player can no longer be inspected (e.g. nested cross-origin iframe),
    // a large increase in visible screen height is a useful *hint*, not proof.
    if (!prev || !next || !validRect(originalPlayerBox)) return null;
    if (next.width <= 0 || next.height <= 0 || prev.width <= 0 || prev.height <= 0) return null;
    const oldAreaRatio = prev.height / prev.width;
    const newAreaRatio = next.height / next.width;
    if (newAreaRatio > oldAreaRatio * 1.20 && newAreaRatio > .52) return { x:0,y:0,w:1,h:1 };
    return null;
  }
  root.LogoMuteGeometry = { validRect, relativeLogo, toViewportRect, asPixels, closeRect, guessFullViewport };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LogoMuteGeometry;
})(typeof globalThis === 'object' ? globalThis : this);
