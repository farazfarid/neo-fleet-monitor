import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import QRCode from 'qrcode';

@Component({
  selector: 'app-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (src(); as s) { <img [src]="s" [width]="size()" [height]="size()" [alt]="'QR-Code für ' + value()" /> }`,
  styles: `:host { display: inline-block; line-height: 0 } img { border-radius: 14px; display: block }`,
})
export class QrCode {
  readonly value = input.required<string>();
  readonly size = input(200);
  protected readonly src = signal<string | null>(null);

  constructor() {
    effect(() => {
      QRCode.toDataURL(this.value(), { width: this.size() * 2, margin: 2, color: { dark: '#070a0fff', light: '#eaf3feff' } })
        .then(url => this.src.set(url));
    });
  }
}
