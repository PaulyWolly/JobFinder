import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, afterNextRender, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const API_URL = 'http://127.0.0.1:8000';
const TOKEN_KEY = 'job-finder.auth-token';
const EMAIL_KEY = 'job-finder.auth-email';
const GUEST_KEY = 'job-finder.guest';
const GUEST_STATE_KEY = 'job-finder.state.guest@local';

/** Jobs a guest may save before being asked to create a free account. */
export const GUEST_SAVE_LIMIT = 10;

interface AuthResponse {
  token: string;
  email: string;
  state: Record<string, unknown> | null;
}

interface MessageResponse {
  message: string;
}

/**
 * Talks to the FastAPI backend for signup/login and syncing the user's full
 * app state (profile, search criteria, jobs, etc.) so it lives in a database
 * instead of per-browser-origin localStorage.
 */
@Service()
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly token = signal<string | null>(null);
  readonly email = signal<string | null>(null);
  /** Guests skip login entirely but are capped at GUEST_SAVE_LIMIT saved jobs. */
  readonly isGuest = signal(false);
  /** True once the initial token check (and state fetch, if any) has settled. */
  readonly ready = signal(false);
  /** State fetched on login/signup/boot, consumed once by JobFinderStore. */
  readonly initialState = signal<Record<string, unknown> | null>(null);
  readonly authError = signal<string | null>(null);
  readonly showOnboarding = signal(false);

  readonly isAuthenticated = computed(() => this.token() !== null);
  /** Either a real account or a guest session is active. */
  readonly isSignedIn = computed(() => this.isAuthenticated() || this.isGuest());

  /** Resolves once bootstrap() has settled; JobFinderStore awaits this before hydrating. */
  readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;

  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    if (this.browser) {
      // Read synchronously so isSignedIn() is correct before the first
      // route guard check runs; validate the token against the API afterward.
      const token = localStorage.getItem(TOKEN_KEY);
      const email = localStorage.getItem(EMAIL_KEY);
      if (token && email) {
        this.token.set(token);
        this.email.set(email);
      }
      this.isGuest.set(localStorage.getItem(GUEST_KEY) === '1');
    }
    afterNextRender(() => this.bootstrap());
  }

  private async bootstrap() {
    const token = this.token();
    if (!token) {
      this.ready.set(true);
      this.resolveReady();
      return;
    }
    try {
      const me = await firstValueFrom(
        this.http.get<AuthResponse>(`${API_URL}/auth/me`, this.authHeaders(token)),
      );
      this.initialState.set(me.state);
    } catch {
      // Token expired or invalid: sign the user out locally.
      this.clearSession();
    } finally {
      this.ready.set(true);
      this.resolveReady();
    }
  }

  /** Skip login/signup entirely with a capped, local-only guest session. */
  continueAsGuest() {
    this.clearSession();
    this.isGuest.set(true);
    this.initialState.set(null);
    if (this.browser) {
      localStorage.setItem(GUEST_KEY, '1');
      localStorage.removeItem(GUEST_STATE_KEY);
    }
  }

  private authHeaders(token = this.token()): { headers?: Record<string, string> } {
    return token ? { headers: { Authorization: 'Bearer ' + token } } : {};
  }

  async signup(email: string, password: string) {
    const ok = await this.authenticate('/auth/signup', email, password);
    if (ok) {
      this.showOnboarding.set(true);
    }
    return ok;
  }

  async login(email: string, password: string) {
    this.showOnboarding.set(false);
    return this.authenticate('/auth/login', email, password);
  }

  async requestPasswordReset(email: string) {
    this.authError.set(null);
    try {
      const response = await firstValueFrom(
        this.http.post<MessageResponse>(`${API_URL}/auth/password-reset/request`, { email }),
      );
      return response.message;
    } catch (error) {
      this.authError.set(this.messageFor(error));
      return null;
    }
  }

  /** Fetch current account state from the API and update `initialState`. */
  async fetchState() {
    try {
      const me = await firstValueFrom(this.http.get<AuthResponse>(`${API_URL}/auth/me`, this.authHeaders(this.token())));
      this.initialState.set(me.state);
      return true;
    } catch {
      return false;
    }
  }

  async confirmPasswordReset(token: string, password: string) {
    this.authError.set(null);
    try {
      const response = await firstValueFrom(
        this.http.post<MessageResponse>(`${API_URL}/auth/password-reset/confirm`, {
          token,
          password,
        }),
      );
      return response.message;
    } catch (error) {
      this.authError.set(this.messageFor(error));
      return null;
    }
  }

  private async authenticate(path: string, email: string, password: string) {
    this.authError.set(null);
    try {
      const res = await firstValueFrom(
        this.http.post<AuthResponse>(`${API_URL}${path}`, { email, password }),
      );
      this.token.set(res.token);
      this.email.set(res.email);
      this.isGuest.set(false);
      this.initialState.set(res.state);
      if (this.browser) {
        localStorage.setItem(TOKEN_KEY, res.token);
        localStorage.setItem(EMAIL_KEY, res.email);
        localStorage.removeItem(GUEST_KEY);
      }
      return true;
    } catch (error) {
      this.authError.set(this.messageFor(error));
      return false;
    }
  }

  private messageFor(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const detail = (error.error as { detail?: string } | undefined)?.detail;
      if (typeof detail === 'string') {
        return detail;
      }
      if (error.status === 0) {
        return 'Could not reach the API. Start FastAPI with npm run api.';
      }
    }
    return 'Something went wrong. Try again.';
  }

  logout() {
    this.clearSession();
    this.isGuest.set(false);
    if (this.browser) {
      localStorage.removeItem(GUEST_KEY);
    }
  }

  private clearSession() {
    this.token.set(null);
    this.email.set(null);
    this.initialState.set(null);
    if (this.browser) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
    }
  }

  /** Persists the full app state blob, debounced so rapid edits don't spam the API. */
  saveState(state: Record<string, unknown>) {
    if (!this.browser || !this.isAuthenticated()) {
      return;
    }
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      firstValueFrom(
        this.http.put(`${API_URL}/state`, state, this.authHeaders()),
      ).catch(() => {
        // Best-effort: a failed save will be retried on the next change.
      });
    }, 500);
  }
}
