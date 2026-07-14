import { Component, signal, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-accept-invite',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    MessageModule,
  ],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <h1>Accept your invitation</h1>
        <p class="auth-subtitle">
          Set up your account to join the store you were invited to.
        </p>

        @if (!token()) {
          <p-message severity="error">This invitation link is missing its token.</p-message>
        } @else {
          <form [formGroup]="form" (ngSubmit)="submit()" class="auth-form">
            <label for="fullName">Your name</label>
            <input id="fullName" pInputText formControlName="fullName" class="w-full" />

            <label for="password">Password</label>
            <p-password
              id="password"
              formControlName="password"
              [toggleMask]="true"
              autocomplete="new-password"
              styleClass="w-full"
              inputStyleClass="w-full"
            />
            <p class="auth-subtitle" style="margin:4px 0 0">
              Already have an Ecomiq account with this email? Leave these blank.
            </p>

            @if (error()) {
              <p-message severity="error">{{ error() }}</p-message>
            }

            <button
              pButton
              type="submit"
              label="Join store"
              [loading]="loading()"
              class="w-full"
            ></button>
          </form>
        }
      </div>
    </div>
  `,
  styleUrl: '../auth-shared.css',
})
export class AcceptInvite {
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly token = signal<string | null>(null);

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly form = this.fb.group({
    fullName: [''],
    password: ['', [Validators.minLength(8)]],
  });

  constructor() {
    this.token.set(this.route.snapshot.queryParamMap.get('token'));
  }

  submit() {
    if (!this.token()) return;
    this.loading.set(true);
    this.error.set(null);
    const { fullName, password } = this.form.getRawValue();
    this.auth
      .acceptInvitation({
        token: this.token()!,
        fullName: fullName || undefined,
        password: password || undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          if (res.status === 'ok') this.router.navigateByUrl('/');
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Could not accept this invitation');
        },
      });
  }
}
