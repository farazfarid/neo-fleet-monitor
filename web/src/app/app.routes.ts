import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/landing/landing').then(m => m.Landing), title: 'Fleet Monitor · Ein iPhone als vernetzter Lüfter' },
  { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard), title: 'Dashboard · Fleet Monitor' },
  { path: 'device', loadComponent: () => import('./pages/device/device').then(m => m.DevicePage), title: 'Edge-Gerät · Fleet Monitor' },
  { path: '**', redirectTo: '' },
];
