import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TelemetryService } from '../../core/telemetry.service';
import { BrowserSimulator } from '../../core/browser-simulator.service';
import { FanGlyph } from '../../shared/fan-glyph';
import { QrCode } from '../../shared/qr-code';
import { SpectrumChart } from '../../shared/spectrum-chart';
import { HeroLive } from './hero-live';
import { dcvRun, filterRun, path, sampleSpectrum } from './charts';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FanGlyph, QrCode, SpectrumChart, HeroLive],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  protected readonly t = inject(TelemetryService);
  protected readonly sim = inject(BrowserSimulator);
  private readonly router = inject(Router);
  protected readonly deviceUrl = `${location.origin}/device`;
  protected readonly repoUrl = 'https://github.com/farazfarid/neo-fleet-monitor';

  // Vibration: live spectrum when a fan streams one, otherwise a representative sample
  private readonly sample = sampleSpectrum();
  protected readonly spectrumSource = computed(() => {
    const live = this.t.devices().find(d => d.spectrum && this.t.isLive(d));
    return live?.spectrum
      ? { spectrum: live.spectrum, rpm: live.last?.rpm ?? 0, live: true, id: live.id }
      : { ...this.sample, live: false, id: '' };
  });

  // DCV chart: closed-loop run of the same PI controller the backend uses
  protected readonly dcv = (() => {
    const run = dcvRun();
    const W = 560, H = 200;
    return {
      W, H,
      co2: path(run.map(r => r.co2), 400, 1400, W, H),
      rpm: path(run.map(r => r.rpm), 0, 3000, W, H),
      targetY: H - ((800 - 400) / 1000) * H,
      arriveX: (40 / run.length) * W,
      leaveX: (160 / run.length) * W,
    };
  })();

  // Filter chart: noisy clog samples, least-squares fit, projected replacement point
  protected readonly filter = (() => {
    const f = filterRun();
    const W = 560, H = 200, xMax = Math.ceil(f.etaX + 4), y = (v: number) => H - (v / 110) * H, x = (v: number) => (v / xMax) * W;
    return {
      W, H,
      dots: f.samples.map(s => ({ cx: x(s.x), cy: y(s.y) })),
      fit: `M${x(0)},${y(f.intercept)}L${x(f.etaX)},${y(100)}`,
      limitY: y(100), etaX: x(f.etaX), lastX: x(f.samples.length - 1),
      etaSteps: Math.round(f.etaX - (f.samples.length - 1)),
    };
  })();

  // Affinity law P ∝ n³
  protected readonly affinity = (() => {
    const W = 400, H = 240, pts = Array.from({ length: 41 }, (_, i) => i / 40);
    return {
      W, H,
      cubic: path(pts.map(n => n ** 3), 0, 1, W, H),
      linear: `M0,${H}L${W},0`,
      mx: W / 2, my: H - 0.125 * H,
    };
  })();

  constructor() {
    this.t.start();
    const host = inject(ElementRef<HTMLElement>).nativeElement;
    let ctx: gsap.Context | undefined;
    afterNextRender(() => {
      ctx = gsap.context(() => {
        gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
          // The hero (LCP) is never animated: it must be readable before any script runs.
          gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach(el =>
            gsap.from(el, { y: 32, opacity: 0, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%' } }));
          gsap.utils.toArray<SVGPathElement>('[data-draw]').forEach(p => {
            const len = p.getTotalLength();
            gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, {
              strokeDashoffset: 0, ease: 'none',
              scrollTrigger: { trigger: p.closest('figure') ?? p, start: 'top 80%', end: 'bottom 55%', scrub: .6 },
            });
          });
          gsap.from('[data-stage]', {
            y: 24, opacity: 0, duration: .6, ease: 'power3.out', stagger: .14,
            scrollTrigger: { trigger: '.pipeline', start: 'top 75%' },
          });
        });
      }, host);
    });
    inject(DestroyRef).onDestroy(() => ctx?.revert());
  }

  protected simulate(): void {
    this.sim.start();
    this.router.navigate(['/dashboard']);
  }
}
