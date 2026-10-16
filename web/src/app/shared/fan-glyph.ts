import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Five-blade fan mark. Spins proportionally to rpm (visual only, capped so it stays readable). */
@Component({
  selector: 'app-fan-glyph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 40 40" aria-hidden="true" [class.spin]="rpm() > 3" [style.animation-duration]="duration()">
      @for (r of blades; track r) {
        <path d="M20 20C18 10 24 4 30 6 28 12 24 16 20 20Z" [attr.transform]="'rotate(' + r + ' 20 20)'" />
      }
      <circle cx="20" cy="20" r="3.5" />
    </svg>
  `,
  styles: `
    :host { display: inline-block; color: var(--accent); line-height: 0 }
    svg { width: 100%; height: 100%; fill: currentColor }
    .spin { animation: spin linear infinite }
    @keyframes spin { to { transform: rotate(360deg) } }
  `,
})
export class FanGlyph {
  readonly rpm = input(0);
  protected readonly blades = [0, 72, 144, 216, 288];
  protected readonly duration = computed(() => `${Math.max(0.18, 3 - this.rpm() / 100)}s`);
}
