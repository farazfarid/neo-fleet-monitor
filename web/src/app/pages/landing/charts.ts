// Data for the landing page's explanatory charts. Generated from the same models the
// backend uses (PI controller, affinity laws), not hand-drawn curves.

/** Seeded PRNG so the charts look identical on every visit. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

/** Closed-loop run of the DCV controller: people arrive at t=40 s, the fan ramps, CO₂ settles. */
export function dcvRun(steps = 240) {
  const rand = rng(7);
  let co2 = 760, rpm = 900, integral = 0;
  const target = 800, out: { co2: number; rpm: number; people: number }[] = [];
  for (let t = 0; t < steps; t++) {
    const people = t < 40 ? 4 : t < 160 ? 14 : 8;
    co2 += (people * 3 - (rpm / 3000) * 0.15 * (co2 - 420)) * 1 + (rand() - 0.5) * 4;
    const error = co2 - target;
    const u = 1000 + 4 * error + 0.4 * (integral + error);
    if (u > 300 && u < 3000) integral += error;
    const sp = Math.min(3000, Math.max(300, 1000 + 4 * error + 0.4 * integral));
    rpm += (sp - rpm) * 0.35;
    out.push({ co2, rpm, people });
  }
  return out;
}

/** Filter clogging samples (% of replacement limit) with sensor noise, plus least-squares fit. */
export function filterRun(points = 36) {
  const rand = rng(11);
  const samples = Array.from({ length: points }, (_, i) => ({ x: i, y: 18 + i * 1.55 + (rand() - 0.5) * 7 }));
  const mx = samples.reduce((a, s) => a + s.x, 0) / points;
  const my = samples.reduce((a, s) => a + s.y, 0) / points;
  const slope = samples.reduce((a, s) => a + (s.x - mx) * (s.y - my), 0) / samples.reduce((a, s) => a + (s.x - mx) ** 2, 0);
  const intercept = my - slope * mx;
  return { samples, slope, intercept, etaX: (100 - intercept) / slope };
}

/** A representative spectrum for a fan at 1380 rpm with an imbalance (peak at 1×). */
export function sampleSpectrum() {
  const rand = rng(3);
  const fs = 400, n = 512, f1 = 1380 / 60;
  const peak = (f: number, fc: number, a: number) => a * Math.exp(-(((f - fc) / 0.8) ** 2));
  const bins = Array.from({ length: n / 2 }, (_, k) => {
    const f = (k * fs) / n;
    return 0.01 + rand() * 0.012 + peak(f, f1, 1.4) + peak(f, 2 * f1, 0.08) + peak(f, 5 * f1, 0.12);
  });
  bins[0] = 0;
  return { spectrum: { ts: 0, fs, n, bins, peakHz: +f1.toFixed(2) }, rpm: 1380 };
}

/** SVG path helper: maps data to a W×H box. */
export function path(values: number[], min: number, max: number, w: number, h: number, x0 = 0) {
  return values
    .map((v, i) => `${i ? 'L' : 'M'}${(x0 + (i / (values.length - 1)) * (w - x0)).toFixed(1)},${(h - ((v - min) / (max - min)) * h).toFixed(1)}`)
    .join('');
}
