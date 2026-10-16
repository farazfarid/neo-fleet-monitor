import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Device, TelemetryService } from '../../../core/telemetry.service';

// Reference characteristic of the unit: Δp at 1500 rpm with a clean filter.
// Affinity law Δp ∝ n² lets us compare readings taken at any speed.
const DP_REF = 120, RPM_REF = 1500, CLOG_REPLACE = 2.5;

/** Predictive maintenance: speed-normalised filter resistance + linear trend → time to replacement. */
@Component({
  selector: 'app-filter-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="row">
      <div><span class="big" [class]="cls()">{{ clogPct() | number: '1.0-0' }} %</span>&nbsp;<span class="u">zugesetzt</span></div>
      <div class="u">Δp {{ device().last?.filterDp | number: '1.0-0' }} Pa @ {{ device().last?.rpm }} rpm</div>
    </div>
    <div class="bar"><div [style.transform]="'scaleX(' + clogPct() / 100 + ')'" [class]="cls()"></div></div>
    <p class="u">
      @if (eta(); as s) {
        Wechsel fällig in <strong>~{{ s < 120 ? (s | number: '1.0-0') + ' s' : (s / 60 | number: '1.0-0') + ' min' }}</strong>
        <span class="hint">(Zeitraffer; lineare Regression über 30 s)</span>
      } @else if (clogPct() >= 100) {
        <strong class="bad">Filter jetzt wechseln</strong>
      } @else {
        Trend wird berechnet …
      }
    </p>
    <button type="button" (click)="replaced()">Filter getauscht</button>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px }
    .row { display: flex; justify-content: space-between; align-items: baseline }
    .big { font-size: 22px; font-weight: 650; font-variant-numeric: tabular-nums }
    .u { font-size: 12px; color: var(--muted); margin: 0 }
    .u strong { color: var(--fg) }
    .hint { opacity: .7 }
    .bar { height: 8px; border-radius: 4px; background: var(--chip); overflow: hidden }
    .bar div { height: 100%; transform-origin: left; transition: transform .3s var(--ease-out); background: var(--ok) }
    .bar .mid { background: var(--warn) } .bar .bad { background: var(--crit) }
    span.good { color: var(--ok) } span.mid { color: var(--warn) } .bad { color: var(--crit) }
    button { align-self: start; border: 1px solid var(--line); background: var(--chip); color: var(--fg); border-radius: 10px; padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer }
  `,
})
export class FilterPanel {
  private readonly telemetry = inject(TelemetryService);
  readonly device = input.required<Device>();

  /** (ts, clog %) for samples where the fan runs fast enough to measure reliably */
  private readonly samples = computed(() =>
    this.device().history
      .filter(t => t.filterDp != null && t.rpm > 300)
      .map(t => {
        const k = t.filterDp! / (DP_REF * (t.rpm / RPM_REF) ** 2);
        return [t.ts / 1000, Math.max(0, ((k - 1) / (CLOG_REPLACE - 1)) * 100)] as const;
      }));

  protected readonly clogPct = computed(() => {
    const s = this.samples().slice(-10);
    return s.length ? Math.min(100, s.reduce((a, [, v]) => a + v, 0) / s.length) : 0;
  });
  protected readonly cls = computed(() => (this.clogPct() < 60 ? 'good' : this.clogPct() < 85 ? 'mid' : 'bad'));

  /** Least-squares slope (%/s) → seconds until 100 %. */
  protected readonly eta = computed(() => {
    const s = this.samples();
    if (s.length < 20) return null;
    const n = s.length;
    const mx = s.reduce((a, [x]) => a + x, 0) / n;
    const my = s.reduce((a, [, y]) => a + y, 0) / n;
    const slope = s.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0) / s.reduce((a, [x]) => a + (x - mx) ** 2, 0);
    if (!(slope > 0.001) || this.clogPct() >= 100) return null;
    return (100 - this.clogPct()) / slope;
  });

  protected replaced(): void {
    this.telemetry.sendCommand(this.device().id, { type: 'replaceFilter' });
  }
}
