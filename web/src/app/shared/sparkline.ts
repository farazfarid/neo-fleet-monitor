import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface Threshold { value: number; level: 'warning' | 'critical' | 'target' }

/** Dependency-free SVG line chart with optional threshold lines. */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" [attr.aria-label]="label()">
      @for (t of thresholdLines(); track t.level) {
        <line x1="0" [attr.x2]="W" [attr.y1]="t.y" [attr.y2]="t.y" [class]="'th th-' + t.level" />
      }
      <path [attr.d]="area()" class="area" [style.fill]="color()" />
      <path [attr.d]="line()" class="line" [style.stroke]="color()" />
    </svg>
  `,
  styles: `
    :host { display: block; height: 72px }
    svg { width: 100%; height: 100%; overflow: visible }
    .line { fill: none; stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke }
    .area { fill: var(--accent); opacity: .12 }
    .th { stroke-dasharray: 4 4; stroke-width: 1; vector-effect: non-scaling-stroke }
    .th-warning { stroke: var(--warn) }
    .th-critical { stroke: var(--crit) }
    .th-target { stroke: var(--ok) }
  `,
})
export class Sparkline {
  readonly values = input.required<number[]>();
  readonly min = input(0);
  readonly max = input<number | undefined>(undefined);
  readonly thresholds = input<Threshold[]>([]);
  readonly label = input('');
  readonly capacity = input(150);
  readonly color = input('var(--accent)');

  protected readonly W = 300;
  protected readonly H = 72;

  private readonly top = computed(() =>
    this.max() ?? Math.max(1, ...this.values(), ...this.thresholds().map(t => t.value * 1.15)));
  private y = (v: number) => this.H - ((v - this.min()) / (this.top() - this.min())) * this.H;

  private readonly points = computed(() => {
    const v = this.values();
    const step = this.W / (this.capacity() - 1);
    const offset = (this.capacity() - v.length) * step;
    return v.map((val, i) => [offset + i * step, Math.max(0, this.y(val))] as const);
  });
  protected readonly line = computed(() => this.points().map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(''));
  protected readonly area = computed(() => {
    const p = this.points();
    return p.length ? `${this.line()}L${p[p.length - 1][0]},${this.H}L${p[0][0]},${this.H}Z` : '';
  });
  protected readonly thresholdLines = computed(() => this.thresholds().map(t => ({ ...t, y: this.y(t.value) })));
}
