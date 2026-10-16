import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TelemetryService } from '../../core/telemetry.service';
import { BrowserSimulator } from '../../core/browser-simulator.service';
import { FanGlyph } from '../../shared/fan-glyph';
import { Sparkline } from '../../shared/sparkline';

/** The hero's proof visual: a real fan from the live fleet, straight off the broker. */
@Component({
  selector: 'app-hero-live',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, FanGlyph, Sparkline],
  template: `
    <div class="frame">
      <div class="head">
        <span class="dot" [class.on]="!!fan()"></span>
        <span class="mono">{{ fan()?.id ?? 'warte auf Telemetrie' }}</span>
        <span class="mono tag">{{ t.msgRate() }} msg/s</span>
      </div>
      @if (fan(); as f) {
        <div class="body">
          <app-fan-glyph class="fan" [rpm]="f.last?.rpm ?? 0" />
          <div class="nums">
            <div><span class="k">Drehzahl</span><span class="v">{{ f.last?.rpm ?? 0 }}<small> rpm</small></span></div>
            <div><span class="k">Vibration</span><span class="v" [class]="'v lvl-' + (f.alarm?.level ?? 'ok')">{{ f.last?.vibRms ?? 0 | number: '1.2-2' }}<small> m/s²</small></span></div>
            @if (f.last?.co2 != null) {
              <div><span class="k">CO₂</span><span class="v">{{ f.last?.co2 }}<small> ppm</small></span></div>
            }
          </div>
        </div>
        <app-sparkline class="spark" [values]="rpmSeries()" label="Drehzahl der letzten 30 Sekunden" />
        <div class="foot mono">
          <span>{{ f.model ?? 'Edge-Gerät' }}</span>
          <span [class]="'lvl-' + (f.alarm?.level ?? 'ok')">Zustand {{ f.alarm?.level ?? 'ok' }}</span>
        </div>
      } @else {
        <div class="waiting">
          <app-fan-glyph class="fan idle" />
          <p>{{ t.connected() ? 'Gerade ist kein Lüfter online.' : 'Verbinde mit dem Broker …' }}</p>
          <button type="button" class="btn" (click)="sim.start()" [disabled]="!t.connected()">Lüfter im Browser simulieren</button>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block }
    .frame { background: linear-gradient(180deg, var(--surface-2), var(--surface)); border: 1px solid var(--line-strong); border-radius: var(--r-xl); padding: 20px; box-shadow: 0 30px 80px -40px rgb(50 118 191 / .45) }
    .head { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted) }
    .tag { margin-left: auto; padding: 4px 10px; border-radius: 999px; background: var(--chip); color: var(--primary-text); font-size: 12px }
    .body { display: flex; align-items: center; gap: 24px; margin: 28px 4px 20px }
    .fan { width: 120px; height: 120px; flex: none }
    .fan.idle { color: var(--muted); width: 64px; height: 64px }
    .nums { display: grid; gap: 12px }
    .nums div { display: flex; flex-direction: column }
    .k { font: 500 11px/1.4 var(--mono); text-transform: uppercase; letter-spacing: .06em; color: var(--muted) }
    .v { font-size: 30px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; line-height: 1.15 }
    .v small { font-size: 14px; color: var(--muted); font-weight: 500 }
    .spark { height: 64px }
    .foot { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); border-top: 1px solid var(--line); margin-top: 14px; padding-top: 12px }
    .waiting { display: grid; justify-items: center; gap: 12px; padding: 48px 8px; text-align: center; color: var(--muted) }
    .waiting p { margin: 0 }
    @media (max-width: 520px) { .fan { width: 84px; height: 84px } .body { gap: 16px } .v { font-size: 24px } }
  `,
})
export class HeroLive {
  protected readonly t = inject(TelemetryService);
  protected readonly sim = inject(BrowserSimulator);
  /** Prefer a real phone, then any live fan. */
  protected readonly fan = computed(() => {
    const live = this.t.devices().filter(d => this.t.isLive(d));
    return live.find(d => d.id.startsWith('iphone')) ?? live[0] ?? null;
  });
  protected readonly rpmSeries = computed(() => this.fan()?.history.map(h => h.rpm) ?? []);
}
