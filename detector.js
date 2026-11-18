/*
 * LogoMute gradient-consistency detector (offline/local only).
 * A TV ident remains geometrically fixed while the picture beneath it moves.
 * Calibrate with several frames while the ident is present; keep gradient
 * features that agree between the captured reference and those frames.
 * Does not use OCR, network models, or video recordings.
 */
(function (root) {
  'use strict';
  const EPS = 1e-7;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function edges(rgba, width, height) {
    const n = width * height;
    const gray = new Float32Array(n);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
      gray[j] = rgba[i] * .299 + rgba[i + 1] * .587 + rgba[i + 2] * .114;
    }
    const gx = new Float32Array(n), gy = new Float32Array(n);
    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 1; x < width - 1; x++) {
        const p = row + x;
        gx[p] = (gray[p+1] - gray[p-1]) * .5;
        gy[p] = (gray[p+width] - gray[p-width]) * .5;
      }
    }
    return { gx, gy, width, height };
  }

  class LogoDetector {
    constructor(reference, liveFrames) {
      if (!reference || !liveFrames || liveFrames.length < 4) throw new Error('Not enough video frames for logo learning.');
      const n = reference.gx.length;
      this.n = n;
      const avgX = new Float32Array(n), avgY = new Float32Array(n), avgMagnitude = new Float32Array(n);
      for (const sample of liveFrames) {
        if (sample.gx.length !== n) throw new Error('Frame size mismatch.');
        for (let i = 0; i < n; i++) {
          avgX[i] += sample.gx[i];
          avgY[i] += sample.gy[i];
          avgMagnitude[i] += Math.hypot(sample.gx[i], sample.gy[i]);
        }
      }
      const k = liveFrames.length;
      this.tx = new Float32Array(n);
      this.ty = new Float32Array(n);
      this.weight = new Float32Array(n);
      this.weightTotal = 0;
      let features = 0;
      for (let i = 0; i < n; i++) {
        const x = avgX[i] / k, y = avgY[i] / k;
        const lm = Math.hypot(x, y);
        const rm = Math.hypot(reference.gx[i], reference.gy[i]);
        const meanMagnitude = avgMagnitude[i] / k;
        // A stable logo edge should be strong, consistent across frames,
        // and face the same direction in the initial screenshot.
        const stable = clamp(lm / (meanMagnitude + EPS), 0, 1);
        const agreement = clamp((x * reference.gx[i] + y * reference.gy[i]) /
          (lm * rm + EPS), 0, 1);
        const strength = clamp(Math.min(lm, rm) / 22, 0, 1);
        const w = strength * stable * stable * agreement * agreement;
        if (w > .12) features++;
        this.weight[i] = w;
        this.tx[i] = x;
        this.ty[i] = y;
        this.weightTotal += w;
      }
      this.featureCount = features;
      if (this.weightTotal < 4 || features < 7) throw new Error('Logo has too little stable detail. Choose a tighter, clearer logo and start during regular programming.');
      // Score the reference and learning frames; derive a local threshold.
      const values = liveFrames.map(s => this.score(s));
      const sorted = [...values].sort((a, b) => a - b);
      const base = sorted[Math.floor(sorted.length * .20)];
      this.calibrationScore = values.reduce((a, b) => a + b, 0) / values.length;
      this.defaultThreshold = clamp(base * .58, .16, .58);
      this.quality = this.calibrationScore < .35 || features < 20 ? 'weak' : 'good';
    }

    score(frame) {
      if (!frame || frame.gx.length !== this.n) return 0;
      let total = 0;
      for (let i = 0; i < this.n; i++) {
        const w = this.weight[i];
        if (w < .005) continue;
        const tx = this.tx[i], ty = this.ty[i];
        const fx = frame.gx[i], fy = frame.gy[i];
        const tMag = Math.hypot(tx, ty), fMag = Math.hypot(fx, fy);
        const cos = (tx * fx + ty * fy) / (tMag * fMag + EPS);
        // Prevent a completely flat frame from matching a vivid logo edge.
        const presence = clamp(fMag / (tMag * .6 + 2), 0, 1);
        total += w * cos * presence;
      }
      return clamp(total / (this.weightTotal + EPS), -1, 1);
    }
    threshold(sensitivity = 1) {
      return clamp(this.defaultThreshold * sensitivity, .12, .72);
    }
  }
  root.LogoMuteDetector = { LogoDetector, edges };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LogoMuteDetector;
})(typeof globalThis === 'object' ? globalThis : this);
