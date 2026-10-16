import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Device, TelemetryService } from '../../../core/telemetry.service';
import { Sparkline } from '../../../shared/sparkline';

/** Demand-controlled ventilation: the backend's PI loop drives the fan from room CO₂. */
@Component({
  selector: 'app-dcv-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Sparkline],
  template: `
    <div class="row">
      <div><span class="big" [class]="co2Class()">{{ device().last?.co2 }}</span>&nbsp;<span class="u">ppm CO₂</span></div>
      <div class="u">{{ device().last?.occupancy }} Personen im Raum</div>
    </div>
    <app-sparkline [values]="co2Series()" [min]="400" [max]="1600" [thresholds]="[{ value: target(), level: 'target' }, { value: 1400, level: 'critical' }]" color="var(--ok)" label="CO₂-Verlauf" />
    <div class="controls">
      <label class="switch">
        <input type="checkbox" [checked]="enabled()" (change)="toggle($any($event.target).checked)" [disabled]="!backendOnline()" />
        Auto (DCV)
      </label>
      <label class="target">
        Ziel {{ target() }} ppm
        <input type="range" min="600" max="1200" step="50" [value]="target()" (change)="setTarget(+$any($event.target).value)" [disabled]="!enabled()" />
      </label>
    </div>
    @if (!backendOnline()) { <p class="u">Backend offline: Der Regler läuft im Backend, ohne ihn bleibt DCV aus.</p> }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px }
    p.u { margin: 0 }
    .row { display: flex; justify-content: space-between; align-items: baseline }
    .big { font-size: 22px; font-weight: 650; font-variant-numeric: tabular-nums }
    .u { font-size: 12px; color: var(--muted) }
    .good { color: var(--ok) } .mid { color: var(--warn) } .bad { color: var(--crit) }
    .controls { display: flex; gap: 12px; align-items: end }
    .switch { display: flex; gap: 6px; align-items: center; font-size: 13px; white-space: nowrap }
    .target { flex: 1; display: flex; flex-direction: column; font-size: 12px; color: var(--muted) }
    input[type=range] { accent-color: var(--ok) }
    input:disabled { opacity: .4 }
  `,
})
export class DcvPanel {
  private readonly telemetry = inject(TelemetryService);
  readonly device = input.required<Device>();
  readonly backendOnline = input(true);

  protected readonly enabled = computed(() => this.device().dcv?.enabled ?? false);
  protected readonly target = computed(() => this.device().dcv?.targetCo2 ?? 800);
  protected readonly co2Series = computed(() => this.device().history.map(t => t.co2 ?? 0));
  // Pettenkofer: < 1000 ppm good, > 1400 ppm poor indoor air
  protected readonly co2Class = computed(() => {
    const c = this.device().last?.co2 ?? 0;
    return c < 1000 ? 'big good' : c < 1400 ? 'big mid' : 'big bad';
  });

  protected toggle(enabled: boolean): void {
    this.telemetry.setDcv(this.device().id, { enabled, targetCo2: this.target() });
  }
  protected setTarget(targetCo2: number): void {
    this.telemetry.setDcv(this.device().id, { enabled: true, targetCo2 });
  }
}
