import { Component, signal, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, PasswordModule, MessageModule],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <h1>Set a new password</h1>

        @if (!token()) {
          <p-message severity="error">
            This reset link is missing its token. Request a new one.
          </p-message>
        } @else {
          <form [formGroup]="form" (ngSubmit)="submit()" class="auth-form">
            <label for="newPassword">New password</label>
            <p-password
              id="newPassword"
              formControlName="newPassword"
              [toggleMask]="true"
              autocomplete="new-password"
              styleClass="w-full"
              inputStyleClass="w-full"
            />

            @if (error()) {
              <p-message severity="error">{{ error() }}</p-message>
            }

            <button
              pButton
              type="submit"
              label="Update password"
              [loading]="loading()"
              [disabled]="form.invalid || loading()"
              class="w-full"
            ></button>
          </form>
        }

        <p class="auth-footer">
          <a routerLink="/auth/login">Back to log in</a>
        </p>
      </div>
    </div>
  `,
  styleUrl: '../auth-shared.css',
})
export class ResetPassword {
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly token = signal<string | null>(null);

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly form = this.fb.group({
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    this.token.set(this.route.snapshot.queryParamMap.get('token'));
  }

  submit() {
    if (this.form.invalid || !this.token()) return;
    this.loading.set(true);
    this.error.set(null);
    this.auth
      .resetPassword(this.token()!, this.form.getRawValue().newPassword!)
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.router.navigate(['/auth/login']);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Could not reset your password');
        },
      });
  }
}
