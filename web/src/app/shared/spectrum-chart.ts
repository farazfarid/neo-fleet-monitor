import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Spectrum } from '../core/telemetry.service';

/** Vibration spectrum (FFT computed on the edge device) with rotation-order markers. */
@Component({
  selector: 'app-spectrum-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    @if (view(); as v) {
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" aria-label="Vibrationsspektrum">
        @for (m of v.markers; track m.label) {
          <line [attr.x1]="m.x" [attr.x2]="m.x" y1="0" [attr.y2]="H" class="marker" />
        }
        @for (b of v.bars; track $index) {
          <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="v.bw" [attr.height]="H - b.y" [class.peak]="b.peak" />
        }
      </svg>
      <div class="axis">
        <span>0 Hz</span>
        @for (m of v.markers; track m.label) {
          <span class="m" [style.left.%]="(m.x / W) * 100">{{ m.label }}</span>
        }
        <span>{{ v.maxHz | number: '1.0-0' }} Hz</span>
      </div>
      <p class="info">
        Peak <strong>{{ spectrum().peakHz | number: '1.1-1' }} Hz</strong> ≙ {{ spectrum().peakHz * 60 | number: '1.0-0' }} rpm
        · {{ spectrum().n }} Samples @ {{ spectrum().fs | number: '1.0-0' }} Hz
        @if (diagnosis(); as d) { · <span [class]="d.cls">{{ d.text }}</span> }
      </p>
    }
  `,
  styles: `
    :host { display: block }
    svg { width: 100%; height: 88px; display: block }
    rect { fill: var(--accent); opacity: .55 }
    rect.peak { fill: var(--warn); opacity: 1 }
    .marker { stroke: var(--muted); stroke-dasharray: 2 3; vector-effect: non-scaling-stroke }
    .axis { position: relative; display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); height: 16px; margin-top: 2px }
    .m { position: absolute; transform: translateX(-50%); color: var(--fg) }
    .info { margin: 4px 0 0; font-size: 12px; color: var(--muted) }
    .info strong { color: var(--fg) }
    .warn { color: var(--warn) }
    .ok { color: var(--ok) }
  `,
})
export class SpectrumChart {
  readonly spectrum = input.required<Spectrum>();
  readonly rpm = input(0);
  protected readonly W = 300;
  protected readonly H = 88;

  protected readonly view = computed(() => {
    const s = this.spectrum();
    const df = s.fs / s.n;
    const f1 = this.rpm() / 60;
    const maxHz = Math.min(s.fs / 2, Math.max(25, f1 * 6));
    const bins = s.bins.slice(0, Math.max(2, Math.ceil(maxHz / df)));
    const top = Math.max(0.05, ...bins);
    const bw = this.W / bins.length;
    const peakK = Math.round(s.peakHz / df);
    const bars = bins.map((a, k) => ({ x: k * bw, y: this.H - (a / top) * this.H, peak: k === peakK }));
    const markers = f1 > 1
      ? [{ f: f1, label: '1×' }, { f: 5 * f1, label: '5× BPF' }]
          .filter(m => m.f < maxHz)
          .map(m => ({ ...m, x: (m.f / maxHz) * this.W }))
      : [];
    return { bars, bw: Math.max(0.5, bw - 0.4), markers, maxHz };
  });

  /** Simple rule: dominant peak at 1× rotation frequency = imbalance. */
  protected readonly diagnosis = computed(() => {
    const f1 = this.rpm() / 60;
    const s = this.spectrum();
    if (f1 < 2) return null;
    const peakAmp = Math.max(...s.bins);
    if (Math.abs(s.peakHz - f1) < 1.5 && peakAmp > 0.5) return { text: 'Unwucht (Peak bei 1×)', cls: 'warn' };
    return { text: 'unauffällig', cls: 'ok' };
  });
}
