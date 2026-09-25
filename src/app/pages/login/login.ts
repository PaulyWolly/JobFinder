import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { form, FormField, required } from '@angular/forms/signals';
import { AuthApi, GUEST_SAVE_LIMIT } from '../../data/auth-api';

interface LoginFields {
  email: string;
  password: string;
}

@Component({
  imports: [FormField],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  protected readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly guestSaveLimit = GUEST_SAVE_LIMIT;
  readonly mode = signal<'login' | 'signup' | 'forgot' | 'reset'>(
    this.route.snapshot.queryParamMap.get('mode') === 'signup'
      ? 'signup'
      : this.route.snapshot.queryParamMap.get('mode') === 'reset'
        ? 'reset'
        : 'login',
  );
  readonly submitting = signal(false);
  protected readonly authError = this.authApi.authError;

  private readonly model = signal<LoginFields>({ email: '', password: '' });
  readonly loginForm = form(this.model, (schema) => {
    required(schema.email, { message: 'Enter your email' });
    required(schema.password, { message: 'Enter your password' });
  });

  readonly resetMessage = signal<string | null>(null);

  toggleMode() {
    this.authApi.authError.set(null);
    this.mode.set(this.mode() === 'login' ? 'signup' : 'login');
    this.resetMessage.set(null);
  }

  showForgotPassword() {
    this.authApi.authError.set(null);
    this.resetMessage.set(null);
    this.mode.set('forgot');
  }

  continueAsGuest() {
    this.authApi.continueAsGuest();
    this.router.navigateByUrl(this.returnUrl());
  }

  async submit(event: Event) {
    event.preventDefault();
    const { email, password } = this.model();
    if (
      (this.mode() !== 'reset' && !email.trim()) ||
      (this.mode() !== 'forgot' && !password.trim())
    ) {
      return;
    }
    this.submitting.set(true);
    if (this.mode() === 'forgot') {
      const result = await this.authApi.requestPasswordReset(email.trim());
      if (result.ok) {
        this.resetMessage.set('If an account exists for that email, a reset link has been sent.');
      } else {
        this.authApi.authError.set(result.error ?? 'Could not request a password reset.');
      }
      this.submitting.set(false);
      return;
    }
    if (this.mode() === 'reset') {
      const token = this.route.snapshot.queryParamMap.get('token');
      if (!token) {
        this.authApi.authError.set('This password reset link is invalid or expired.');
        this.submitting.set(false);
        return;
      }
      const result = await this.authApi.confirmPasswordReset(token, password);
      if (result.ok) {
        this.resetMessage.set('Password updated. You can now log in.');
        this.mode.set('login');
      } else {
        this.authApi.authError.set(result.error ?? 'Could not reset the password.');
      }
      this.submitting.set(false);
      return;
    }
    const ok = this.mode() === 'login'
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
