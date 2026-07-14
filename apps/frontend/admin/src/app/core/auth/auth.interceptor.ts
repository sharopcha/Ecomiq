import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Requests where a 401 is a legitimate domain response, not "token expired". */
const NO_RETRY_PATTERNS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/2fa/verify',
  '/auth/invitations/accept',
];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.accessToken();
  const authedReq =
    token && req.url.startsWith('/api')
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authedReq).pipe(
    catchError((err: unknown) => {
      const shouldRetry =
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !NO_RETRY_PATTERNS.some((p) => req.url.includes(p));

      if (!shouldRetry) return throwError(() => err);

      return auth.refresh().pipe(
        switchMap((res) =>
          next(
            req.clone({
              setHeaders: { Authorization: `Bearer ${res.accessToken}` },
            }),
          ),
        ),
        catchError((refreshErr) => {
          auth.clearSession();
          router.navigate(['/auth/login']);
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
