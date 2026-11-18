/* Serializable function executed in the active TV page via chrome.scripting. */
function logoMuteProbePlayer(logoCenter = null) {
  const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
  const fs = document.fullscreenElement || document.webkitFullscreenElement;
  const points = [];
  function collect(el, role, priority) {
    if (!el || !el.getBoundingClientRect) return;
    const b = el.getBoundingClientRect();
    const x = Math.max(0,b.left), y = Math.max(0,b.top);
    const right = Math.min(W,b.right), bottom = Math.min(H,b.bottom);
    const w = Math.max(0,right-x), h = Math.max(0,bottom-y);
    if (w < W*.20 || h < H*.18) return;
    const rect = { x:x/W, y:y/H, w:w/W, h:h/H };
    const coversLogo = logoCenter && logoCenter.x >= rect.x && logoCenter.x <= rect.x + rect.w &&
      logoCenter.y >= rect.y && logoCenter.y <= rect.y + rect.h;
    const coverage = rect.w * rect.h;
    const ratio = w/h;
    let score = priority + Math.min(20,coverage*20);
    if (coversLogo) score += 70;
    if (logoCenter && !coversLogo && !fs) score -= 90;
    if (ratio >= 1.2 && ratio <= 2.7) score += 8;
    if (coverage > .97 && !fs) score -= 50;
    points.push({ rect, source:role, score });
  }
  if (fs) collect(fs, 'fullscreen', 160);
  for (const el of document.querySelectorAll('video')) collect(el, 'video', 110);
  for (const el of document.querySelectorAll('iframe')) collect(el, 'iframe', 75);
  for (const el of document.querySelectorAll('[class*="player"], [id*="player"], [class*="video-player"], [id*="video-player"]')) collect(el, 'player-container', 47);
  points.sort((a,b) => b.score - a.score);
  return { player: points[0] || null, fullscreen: Boolean(fs), width:W, height:H };
}
