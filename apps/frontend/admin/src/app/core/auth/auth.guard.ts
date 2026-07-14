import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Protects the dashboard shell. On a hard refresh there's no in-memory
 * access token yet, so we attempt one silent /auth/refresh (the httpOnly
 * refresh cookie survives reloads) before giving up and sending the user
 * to /auth/login.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  return auth.refresh().pipe(
    map(() => true),
    catchError(() => of(router.parseUrl('/auth/login'))),
  );
};

/** Keeps a logged-in user out of /auth/login, /auth/register, etc. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.parseUrl('/') : true;
};
