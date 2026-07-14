import { Component, signal, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, MessageModule],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <h1>Reset your password</h1>
        <p class="auth-subtitle">
          We'll email you a link to reset your password.
        </p>

        @if (sent()) {
          <p-message severity="success">
            If an account exists for that email, a reset link is on its way.
          </p-message>
          <p class="auth-footer">
            <a routerLink="/auth/login">Back to log in</a>
          </p>
        } @else {
          <form [formGroup]="form" (ngSubmit)="submit()" class="auth-form">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              pInputText
              formControlName="email"
              autocomplete="email"
              class="w-full"
            />

            <button
              pButton
              type="submit"
              label="Send reset link"
              [loading]="loading()"
              [disabled]="form.invalid || loading()"
              class="w-full"
            ></button>
          </form>
          <p class="auth-footer">
            <a routerLink="/auth/login">Back to log in</a>
          </p>
        }
      </div>
    </div>
  `,
  styleUrl: '../auth-shared.css',
})
export class ForgotPassword {
  readonly loading = signal(false);
  readonly sent = signal(false);

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  constructor() {}

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.auth.forgotPassword(this.form.getRawValue().email!).subscribe({
      next: () => {
        this.loading.set(false);
        this.sent.set(true);
      },
      error: () => {
        // Same UX either way — never reveal whether the email exists.
        this.loading.set(false);
        this.sent.set(true);
      },
    });
  }
}
