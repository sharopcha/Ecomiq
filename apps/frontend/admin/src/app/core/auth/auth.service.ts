import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import {
  AuthUser,
  LoginResponse,
  MeResponse,
  Setup2faResponse,
  StoreSummary,
} from './auth.models';

const API_BASE = '/api/auth';

/** Reads claims out of a JWT without verifying its signature — display only, never trust this for authorization (the backend re-verifies on every request). */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

/**
 * Holds the RS256 access token in memory only (never localStorage — XSS
 * would otherwise be able to exfiltrate it). The refresh token lives in an
 * httpOnly cookie set by identity-service (via the gateway's auth proxy) and
 * is never visible to JS at all. See ADR-5 / Conversations/2026-07-05-ecomiq-auth-implementation.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly accessTokenSig = signal<string | null>(null);
  private readonly userSig = signal<AuthUser | null>(null);
  private readonly storeSig = signal<StoreSummary | null>(null);
  private readonly pendingMfaTokenSig = signal<string | null>(null);
  private readonly pendingStoresSig = signal<StoreSummary[] | null>(null);
  private readonly pendingSelectionTokenSig = signal<string | null>(null);
  private readonly pendingSetupTokenSig = signal<string | null>(null);

  readonly accessToken = this.accessTokenSig.asReadonly();
  readonly user = this.userSig.asReadonly();
  readonly store = this.storeSig.asReadonly();
  readonly isAuthenticated = computed(() => this.accessTokenSig() !== null);
  /** Set by login()/register() when the account has 2FA enabled — consumed by VerifyTwoFaComponent. */
  readonly pendingMfaToken = this.pendingMfaTokenSig.asReadonly();
  /** Set when the user belongs to more than one store — consumed by SelectStoreComponent. */
  readonly pendingStores = this.pendingStoresSig.asReadonly();
  readonly pendingSelectionToken = this.pendingSelectionTokenSig.asReadonly();
  readonly pendingSetupToken = this.pendingSetupTokenSig.asReadonly();

  constructor(private readonly http: HttpClient) {}

  setSession(accessToken: string, user?: AuthUser, store?: StoreSummary) {
    this.accessTokenSig.set(accessToken);
    if (user) this.userSig.set(user);
    if (store) this.storeSig.set(store);
  }

  clearSession() {
    this.accessTokenSig.set(null);
    this.userSig.set(null);
    this.storeSig.set(null);
  }

  /** Used by SelectStoreComponent when it arrives via the Google OAuth redirect (query params) rather than the in-app login flow. */
  setPendingStoreSelection(selectionToken: string, stores: StoreSummary[]) {
    this.pendingSelectionTokenSig.set(selectionToken);
    this.pendingStoresSig.set(stores);
  }

  register(payload: {
    email: string;
    password: string;
  }): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${API_BASE}/register`, payload, {
        withCredentials: true,
      })
      .pipe(tap((res) => this.applyLoginResponse(res)));
  }

  login(payload: {
    email: string;
    password: string;
    storeId?: string;
  }): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${API_BASE}/login`, payload, {
        withCredentials: true,
      })
      .pipe(tap((res) => this.applyLoginResponse(res)));
  }

  verify2fa(payload: {
    mfaToken: string;
    code: string;
    storeId?: string;
  }): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${API_BASE}/2fa/verify`, payload, {
        withCredentials: true,
      })
      .pipe(tap((res) => this.applyLoginResponse(res)));
  }

  private applyLoginResponse(res: LoginResponse) {
    this.pendingMfaTokenSig.set(null);
    this.pendingStoresSig.set(null);
    this.pendingSelectionTokenSig.set(null);
    this.pendingSetupTokenSig.set(null);
    if (res.status === 'ok') {
      this.setSession(res.accessToken, res.user, res.store);
    } else if (res.status === 'mfa_required') {
      this.pendingMfaTokenSig.set(res.mfaToken);
    } else if (res.status === 'store_selection_required') {
      this.pendingStoresSig.set(res.stores);
      this.pendingSelectionTokenSig.set(res.selectionToken);
    } else if (res.status === 'setup_required') {
      this.pendingSetupTokenSig.set(res.setupToken);
    }
  }

  setPendingSetupSelection(setupToken: string) {
    this.pendingSetupTokenSig.set(setupToken);
  }

  setupStore(payload: {
    setupToken: string;
    fullName: string;
    countryCode?: string;
    language?: string;
    organizationName?: string;
    storeName: string;
    defaultCurrency?: string;
    category?: string;
  }): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${API_BASE}/setup-store`, payload, {
        withCredentials: true,
      })
      .pipe(tap((res) => this.applyLoginResponse(res)));
  }

  /** Redeems a store_selection_required outcome without re-entering password/2FA. */
  selectStore(storeId: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(
        `${API_BASE}/select-store`,
        { selectionToken: this.pendingSelectionTokenSig(), storeId },
        { withCredentials: true },
      )
      .pipe(tap((res) => this.applyLoginResponse(res)));
  }

  /** Used by OauthCallbackComponent — the Google redirect only carries the access token, so we hydrate user/store profile via /auth/me. */
  hydrateFromAccessToken(accessToken: string): Observable<MeResponse> {
    this.accessTokenSig.set(accessToken);
    const claims = decodeJwtPayload(accessToken);
    const storeId = claims['store_id'] as string | undefined;
    const role = claims['role'] as StoreSummary['role'] | undefined;
    return this.me().pipe(
      tap((me) => {
        this.userSig.set({ id: me.id, email: me.email, fullName: me.fullName });
        const matched = storeId ? me.stores.find((s) => s.id === storeId) : undefined;
        this.storeSig.set(
          matched ?? { id: storeId ?? '', name: '', role: role ?? 'staff' },
        );
      }),
    );
  }

  /** Called by the HTTP interceptor on a 401, and once on app bootstrap. */
  refresh(): Observable<{ accessToken: string }> {
    return this.http
      .post<{ accessToken: string }>(
        `${API_BASE}/refresh`,
        {},
        { withCredentials: true },
      )
      .pipe(tap((res) => this.accessTokenSig.set(res.accessToken)));
  }

  logout(): Observable<{ ok: boolean }> {
    return this.http
      .post<{ ok: boolean }>(`${API_BASE}/logout`, {}, { withCredentials: true })
      .pipe(tap(() => this.clearSession()));
  }

  me(): Observable<MeResponse> {
    return this.http.get<MeResponse>(`${API_BASE}/me`);
  }

  forgotPassword(email: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${API_BASE}/forgot-password`, {
      email,
    });
  }

  resetPassword(token: string, newPassword: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${API_BASE}/reset-password`, {
      token,
      newPassword,
    });
  }

  acceptInvitation(payload: {
    token: string;
    fullName?: string;
    password?: string;
  }): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${API_BASE}/invitations/accept`, payload, {
        withCredentials: true,
      })
      .pipe(tap((res) => this.applyLoginResponse(res)));
  }

  setup2fa(): Observable<Setup2faResponse> {
    return this.http.post<Setup2faResponse>(`${API_BASE}/2fa/setup`, {});
  }

  enable2fa(code: string): Observable<{ totpEnabled: boolean }> {
    return this.http.post<{ totpEnabled: boolean }>(`${API_BASE}/2fa/enable`, {
      code,
    });
  }

  disable2fa(code: string): Observable<{ totpEnabled: boolean }> {
    return this.http.post<{ totpEnabled: boolean }>(`${API_BASE}/2fa/disable`, {
      code,
    });
  }

  googleLoginUrl(): string {
    return `${API_BASE}/google`;
  }
}
