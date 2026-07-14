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
  selector: 'app-register',
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
            <i class="pi pi-shopping-bag"></i>
          </div>
          <h1>Create your store</h1>
          <p class="auth-subtitle">Set up your Ecomiq workspace in a minute</p>
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
                [toggleMask]="true"
                [feedback]="false"
                autocomplete="new-password"
                styleClass="w-full"
                inputStyleClass="w-full"
              />
              <label for="password">Password</label>
            </p-floatlabel>
            <div class="password-hint" [class.password-hint--met]="passwordLengthOk()">
              <i class="pi" [class.pi-check-circle]="passwordLengthOk()" [class.pi-circle]="!passwordLengthOk()"></i>
              <span>At least 8 characters</span>
            </div>
          </div>

          @if (error()) {
            <p-message severity="error" class="w-full">{{ error() }}</p-message>
          }

          <button
            pButton
            type="submit"
            label="Create account"
            [loading]="loading()"
            [disabled]="form.invalid || loading()"
            class="w-full"
          ></button>
        </form>

        <p class="auth-footer">
          Already have an account?
          <a routerLink="/auth/login">Log in</a>
        </p>
      </p-card>
    </div>
  `,
  styleUrl: '../auth-shared.css',
 })
 export class Register {
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {}

  passwordLengthOk(): boolean {
    return (this.form.controls.password.value?.length ?? 0) >= 8;
  }

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);

    const value = this.form.getRawValue();
    this.auth
      .register({
        email: value.email!,
        password: value.password!,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          if (res.status === 'ok') {
            this.router.navigateByUrl('/');
          } else if (res.status === 'setup_required') {
            this.router.navigate(['/auth/setup-store']);
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Could not create your account');
        },
      });
  }
}
