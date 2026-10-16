import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TelemetryService } from '../../core/telemetry.service';
import { BrowserSimulator } from '../../core/browser-simulator.service';
import { FanCard } from './fleet/fan-card';
import { FanGlyph } from '../../shared/fan-glyph';
import { QrCode } from '../../shared/qr-code';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FanCard, FanGlyph, QrCode, DatePipe, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  protected readonly t = inject(TelemetryService);
  protected readonly sim = inject(BrowserSimulator);
  private readonly qrDialog = viewChild.required<ElementRef<HTMLDialogElement>>('qr');
  protected readonly deviceUrl = `${location.origin}/device`;

  constructor() { this.t.start(); }

  protected toggleSim(): void { this.sim.running() ? this.sim.stop() : this.sim.start(); }
  protected openQr(): void { this.qrDialog().nativeElement.showModal(); }
  protected closeQr(): void { this.qrDialog().nativeElement.close(); }
}
