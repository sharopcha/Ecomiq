import { Route } from '@angular/router';
import { guestGuard } from '../../core/auth/auth.guard';

export const authRoutes: Route[] = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./register/register').then((m) => m.Register),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: 'verify-2fa',
    loadComponent: () => import('./verify-2fa/verify-2fa').then((m) => m.Verify2fa),
  },
  {
    path: 'select-store',
    loadComponent: () =>
      import('./select-store/select-store').then((m) => m.SelectStore),
  },
  {
    path: 'setup-store',
    loadComponent: () =>
      import('./setup-store/setup-store').then((m) => m.SetupStore),
  },
  {
    path: 'accept-invite',
    loadComponent: () =>
      import('./accept-invite/accept-invite').then((m) => m.AcceptInvite),
  },
  {
    path: 'oauth-callback',
    loadComponent: () =>
      import('./oauth-callback/oauth-callback').then((m) => m.OauthCallback),
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
];
