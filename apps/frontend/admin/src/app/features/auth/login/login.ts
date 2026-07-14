import { Component, signal, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';
import { CardModule } from 'primeng/card';
import { FloatLabelModule } from 'primeng/floatlabel';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    MessageModule,
    CardModule,
    FloatLabelModule,
  ],
  template: `
    <div class="auth-page">
      <p-card styleClass="auth-card">
        <div class="auth-header">
          <div class="auth-logo">
            <i class="pi pi-bolt"></i>
          </div>
          <h1>Log in to Ecomiq</h1>
          <p class="auth-subtitle">Manage your store from one dashboard</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="auth-form">
          <div class="field">
            <p-floatlabel variant="on">
              <input
                id="email"
                type="email"
                pInputText
                formControlName="email"
                autocomplete="email"
                class="w-full"
              />
              <label for="email">Email</label>
            </p-floatlabel>
          </div>

          <div class="field">
            <p-floatlabel variant="on">
              <p-password
                id="password"
                formControlName="password"
                [feedback]="false"
                [toggleMask]="true"
                autocomplete="current-password"
                styleClass="w-full"
                inputStyleClass="w-full"
              />
              <label for="password">Password</label>
            </p-floatlabel>
          </div>

          @if (error()) {
            <p-message severity="error" class="w-full">{{ error() }}</p-message>
          }

          <button
            pButton
            type="submit"
            label="Log in"
            [loading]="loading()"
            [disabled]="form.invalid || loading()"
            class="w-full"
          ></button>
        </form>

        <div class="text-right">
          <a class="auth-link" routerLink="/auth/forgot-password">Forgot password?</a>
        </div>

        <div class="auth-divider">
          <span>or</span>
        </div>

        <a class="auth-google-btn" href="/api/auth/google">
          <i class="pi pi-google"></i>
          <span>Continue with Google</span>
        </a>

        <p class="auth-footer">
          Don't have an account?
          <a routerLink="/auth/register">Create one</a>
        </p>
      </p-card>
    </div>
  `,
  styleUrl: '../auth-shared.css',
})
export class Login {
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  constructor() {}

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);

    const { email, password } = this.form.getRawValue();
    this.auth.login({ email: email!, password: password! }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.status === 'ok') this.router.navigateByUrl('/');
        else if (res.status === 'mfa_required')
          this.router.navigate(['/auth/verify-2fa']);
        else if (res.status === 'setup_required')
          this.router.navigate(['/auth/setup-store']);
        else this.router.navigate(['/auth/select-store']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Invalid email or password');
      },
    });
  }
}
