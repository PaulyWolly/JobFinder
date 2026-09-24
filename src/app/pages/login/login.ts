import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { form, FormField, required } from '@angular/forms/signals';
import { AuthApi, GUEST_APPLY_LIMIT } from '../../data/auth-api';

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

  readonly guestApplyLimit = GUEST_APPLY_LIMIT;
  readonly mode = signal<'login' | 'signup'>('login');
  readonly submitting = signal(false);
  protected readonly authError = this.authApi.authError;

  private readonly model = signal<LoginFields>({ email: '', password: '' });
  readonly loginForm = form(this.model, (schema) => {
    required(schema.email, { message: 'Enter your email' });
    required(schema.password, { message: 'Enter your password' });
  });

  toggleMode() {
    this.authApi.authError.set(null);
    this.mode.set(this.mode() === 'login' ? 'signup' : 'login');
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

  private returnUrl() {
    return this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
  }
}
