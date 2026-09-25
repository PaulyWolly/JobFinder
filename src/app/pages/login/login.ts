import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { form, FormField, required } from '@angular/forms/signals';
import { AuthApi, GUEST_SAVE_LIMIT } from '../../data/auth-api';
import { FormsModule } from '@angular/forms';

interface LoginFields {
  email: string;
  password: string;
}

@Component({
  imports: [FormField, FormsModule],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  protected readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly guestSaveLimit = GUEST_SAVE_LIMIT;
  readonly mode = signal<'login' | 'signup'>(
    this.route.snapshot.queryParamMap.get('mode') === 'signup' ? 'signup' : 'login',
  );
  readonly submitting = signal(false);
  protected readonly authError = this.authApi.authError;

  private readonly model = signal<LoginFields>({ email: '', password: '' });
  readonly loginForm = form(this.model, (schema) => {
    required(schema.email, { message: 'Enter your email' });
    required(schema.password, { message: 'Enter your password' });
  });

  // Password reset UI state
  readonly showResetRequest = signal(false);
  readonly resetSubmitting = signal(false);
  readonly resetMessage = signal<string | null>(null);
  // Use plain public objects so template `[(ngModel)]` can bind to them
  resetModel = { email: '' };
  confirmModel = { token: '', password: '' };

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.confirmModel.token = token;
      this.showResetRequest.set(false);
      this.showResetRequest.set(true);
    }
  }

  toggleMode() {
    this.authApi.authError.set(null);
    this.mode.set(this.mode() === 'login' ? 'signup' : 'login');
  }

  showForgot() {
    this.authApi.authError.set(null);
    this.resetMessage.set(null);
    this.showResetRequest.set(true);
  }

  async submitResetRequest(event: Event) {
    event.preventDefault();
    const email = this.resetModel.email.trim();
    if (!email) return;
    this.resetSubmitting.set(true);
    const res = await this.authApi.requestPasswordReset(email);
    this.resetSubmitting.set(false);
    if (res.ok) {
      this.resetMessage.set('If an account exists, a reset link was sent.');
    } else {
      this.resetMessage.set(res.error || 'Request failed');
    }
  }

  async submitResetConfirm(event: Event) {
    event.preventDefault();
    const { token, password } = this.confirmModel;
    if (!token || !password) return;
    this.resetSubmitting.set(true);
    const res = await this.authApi.confirmPasswordReset(token, password);
    this.resetSubmitting.set(false);
    if (res.ok) {
      this.resetMessage.set('Password updated. You can now log in.');
      this.showResetRequest.set(false);
    } else {
      this.resetMessage.set(res.error || 'Reset failed');
    }
  }

  continueAsGuest() {
    this.authApi.continueAsGuest();
    this.router.navigateByUrl(this.returnUrl());
  }

  async submit(event: Event) {
    event.preventDefault();
    const { email, password } = this.model();
    if (!email.trim() || !password.trim()) {
      return;
    }
    this.submitting.set(true);
    const ok =
      this.mode() === 'login'
        ? await this.authApi.login(email.trim(), password)
        : await this.authApi.signup(email.trim(), password);
    this.submitting.set(false);
    if (ok) {
      this.router.navigateByUrl(this.returnUrl());
    }
  }

  returnUrl() {
    return this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
  }
}
