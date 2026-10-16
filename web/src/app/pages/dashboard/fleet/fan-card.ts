import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Device, TelemetryService } from '../../../core/telemetry.service';
import { Sparkline } from '../../../shared/sparkline';
import { SpectrumChart } from '../../../shared/spectrum-chart';
import { DcvPanel } from './dcv-panel';
import { FilterPanel } from './filter-panel';
import { FanGlyph } from '../../../shared/fan-glyph';

const RPM_MAX = 3000;

@Component({
  selector: 'app-fan-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Sparkline, SpectrumChart, DcvPanel, FilterPanel, FanGlyph, DecimalPipe],
  template: `
    <header>
      <app-fan-glyph class="fan" [class.stopped]="!live()" [rpm]="live() ? rpm() : 0" />
      <div class="title">
        <h2>{{ device().id }}</h2>
        <span class="meta">{{ device().model ?? 'unknown' }} · fw {{ device().fw ?? '–' }}</span>
      </div>
      @if (device().dcv?.enabled) { <span class="pill dcv">DCV auto</span> }
      <span class="pill" [class.on]="live()">{{ live() ? 'online' : 'offline' }}</span>
    </header>

    <div class="kpis">
      <div><span class="k">Drehzahl</span><span class="v">{{ rpm() }}</span><span class="u">rpm · Soll {{ reportedSetpoint() ?? '–' }}</span></div>
      <div><span class="k">Vibration</span><span class="v" [class]="'lvl-' + level()">{{ device().last?.vibRms ?? 0 | number: '1.2-2' }}</span><span class="u">m/s² RMS</span></div>
      @if (device().last?.powerW != null) {
        <div><span class="k">Leistung</span><span class="v">{{ device().last?.powerW | number: '1.0-0' }} W</span><span class="u">{{ powerVsMax() | number: '1.0-0' }} % von Volllast · {{ device().energyWh | number: '1.1-1' }} Wh</span></div>
      } @else {
        <div><span class="k">Neigung</span><span class="v">{{ device().last?.tilt ?? 0 | number: '1.0-0' }}°</span><span class="u">Einbaulage</span></div>
      }
      <div><span class="k">Zustand</span><span class="v badge" [class]="'lvl-' + level()">{{ level() }}</span><span class="u">Backend-Regel</span></div>
    </div>

    <div class="panels">
      <section>
        <h3>Drehzahl <small>letzte 30 s</small></h3>
        <app-sparkline [values]="rpmSeries()" label="Drehzahl-Verlauf" />
      </section>
      <section>
        <h3>Vibration <small>Schwellen 1,5 / 4,0 m/s² · Hysterese 70 %</small></h3>
        <app-sparkline [values]="vibSeries()" [thresholds]="thresholds" label="Vibrations-Verlauf" />
      </section>
      @if (device().spectrum; as s) {
        <section>
          <h3>Vibrationsanalyse <small>FFT auf dem Gerät</small></h3>
          <app-spectrum-chart [spectrum]="s" [rpm]="rpm()" />
        </section>
      }
      @if (device().last?.co2 != null) {
        <section>
          <h3>Bedarfsgeführte Lüftung <small>PI-Regler im Backend</small></h3>
          <app-dcv-panel [device]="device()" [backendOnline]="backendOnline()" />
        </section>
      }
      @if (device().last?.filterDp != null) {
        <section>
          <h3>Filterzustand <small>Predictive Maintenance</small></h3>
          <app-filter-panel [device]="device()" />
        </section>
      }
    </div>

    <footer>
      <label>
        Sollwert <strong>{{ setpoint() }} rpm</strong>
        @if (device().dcv?.enabled) { <em>vom DCV-Regler gesteuert</em> }
        <input type="range" min="0" [max]="rpmMax" step="100" [value]="setpoint()" (input)="setpoint.set(+$any($event.target).value)" (change)="sendSetpoint()" [disabled]="!live() || device().dcv?.enabled" />
      </label>
      <button type="button" (click)="identify()" [disabled]="!live()">Identify</button>
    </footer>
  `,
  styleUrl: './fan-card.css',
})
export class FanCard {
  private readonly telemetry = inject(TelemetryService);
  readonly device = input.required<Device>();

  protected readonly rpmMax = RPM_MAX;
  protected readonly thresholds = [{ value: 1.5, level: 'warning' as const }, { value: 4, level: 'critical' as const }];
  protected readonly backendOnline = this.telemetry.backendOnline;
  protected readonly live = computed(() => this.telemetry.isLive(this.device()));
  protected readonly rpm = computed(() => this.device().last?.rpm ?? 0);
  protected readonly reportedSetpoint = computed(() => this.device().last?.setpoint);
  /** Desired state: follows what the device reports, but the user can override it locally. */
  protected readonly setpoint = linkedSignal(() => this.reportedSetpoint() ?? 1200);
  protected readonly level = computed(() => this.device().alarm?.level ?? 'ok');
  protected readonly rpmSeries = computed(() => this.device().history.map(t => t.rpm));
  protected readonly vibSeries = computed(() => this.device().history.map(t => t.vibRms));
  /** Affinity law P ∝ n³: half speed ≈ 12.5 % power. */
  protected readonly powerVsMax = computed(() => (this.rpm() / RPM_MAX) ** 3 * 100);

  protected sendSetpoint(): void {
    this.telemetry.sendCommand(this.device().id, { type: 'setpoint', rpm: this.setpoint() });
  }
  protected identify(): void {
    this.telemetry.sendCommand(this.device().id, { type: 'identify' });
  }
}
