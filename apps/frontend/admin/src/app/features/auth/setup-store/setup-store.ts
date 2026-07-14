import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-setup-store',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, SelectModule, MessageModule],
  template: `
    <div class="min-height-screen flex flex-col md:flex-row bg-[#fcfbfa]">
      <!-- LEFT PANE: SIDEBAR STEPPER -->
      <div class="w-full md:w-[35%] bg-[#faf9f6] border-b md:border-b-0 md:border-r border-[#e6e4df] p-8 md:p-12 flex flex-col justify-between md:min-h-screen">
        <div>
          <!-- Logo -->
          <div class="flex items-center gap-2 mb-16">
            <svg class="w-7 h-7 text-[#F16D22]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>
            </svg>
            <span class="text-xl font-bold tracking-tight text-slate-900">ecomiq</span>
          </div>

          <!-- Section Title -->
          <div class="mb-12">
            <h2 class="text-2xl font-bold tracking-tight text-slate-900 mb-2">Set up your account</h2>
            <p class="text-sm text-slate-500 leading-relaxed">
              Complete the minimum needed to enter the admin. You can adjust everything else later.
            </p>
          </div>

          <!-- Stepper -->
          <div class="flex flex-col gap-6">
            @for (stepItem of stepConfig; track stepItem.number) {
              <div class="flex items-center gap-4">
                <!-- Step Indicator Circle -->
                <div [ngClass]="{
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all': true,
                  'bg-[#2c2a29] text-white': currentStep() === stepItem.number,
                  'bg-emerald-100 text-emerald-700': currentStep() > stepItem.number,
                  'bg-[#f2efe9] text-slate-400 border border-[#e2dfd9]': currentStep() < stepItem.number
                }">
                  @if (currentStep() > stepItem.number) {
                    <i class="pi pi-check text-xs"></i>
                  } @else {
                    {{ stepItem.number }}
                  }
                </div>

                <!-- Step Label -->
                <span [ngClass]="{
                  'text-sm font-medium transition-all': true,
                  'text-slate-900 font-bold': currentStep() === stepItem.number,
                  'text-slate-650': currentStep() > stepItem.number,
                  'text-slate-400': currentStep() < stepItem.number
                }">
                  {{ stepItem.label }}
                </span>
              </div>
            }
          </div>
        </div>

        <!-- Left Pane Footer -->
        <div class="mt-12 text-xs text-slate-400">
          Step {{ currentStep() }} of 4
        </div>
      </div>

      <!-- RIGHT PANE: SETUP CONTENT -->
      <div class="flex-1 flex flex-col justify-between p-8 md:p-12 md:min-h-screen">
        <!-- Top Toolbar -->
        <div class="flex justify-end items-center gap-4 mb-8">
          <button class="w-9 h-9 rounded-lg hover:bg-[#f2efe9] border border-transparent hover:border-[#e2dfd9] flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all cursor-pointer">
            <i class="pi pi-globe text-sm"></i>
          </button>
          <button class="w-9 h-9 rounded-lg hover:bg-[#f2efe9] border border-transparent hover:border-[#e2dfd9] flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all cursor-pointer">
            <i class="pi pi-moon text-sm"></i>
          </button>
        </div>

        <!-- Wizard Card Container -->
        <div class="max-w-[560px] w-full mx-auto my-auto py-8">
          <span class="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-2">
            STEP {{ currentStep() }} OF 4
          </span>

          <!-- Display Errors -->
          @if (error()) {
            <p-message severity="error" styleClass="w-full mb-6">{{ error() }}</p-message>
          }

          <!-- STEP 1: Account Info -->
          @if (currentStep() === 1) {
            <div>
              <h1 class="text-3xl font-bold tracking-tight text-slate-900 mb-2">Account</h1>
              <p class="text-sm text-slate-500 mb-8 leading-relaxed">
                Confirm the details that affect your profile, language, currency and formats.
              </p>

              <div class="flex flex-col gap-5">
                <div>
                  <label class="block text-xs font-bold text-slate-650 uppercase tracking-wide mb-2">Your name</label>
                  <input
                    pInputText
                    type="text"
                    [(ngModel)]="fullName"
                    placeholder="e.g. Sharofiddin Azizmatov"
                    class="w-full"
                  />
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs font-bold text-slate-650 uppercase tracking-wide mb-2">Country</label>
                    <p-select
                      [(ngModel)]="country"
                      [options]="countries"
                      [filter]="true"
                      placeholder="Select country"
                      styleClass="w-full"
                    />
                  </div>

                  <div>
                    <label class="block text-xs font-bold text-slate-650 uppercase tracking-wide mb-2">Language</label>
                    <p-select
                      [(ngModel)]="language"
                      [options]="languages"
                      placeholder="Select language"
                      styleClass="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- STEP 2: Organization Info -->
          @if (currentStep() === 2) {
            <div>
              <h1 class="text-3xl font-bold tracking-tight text-slate-900 mb-2">Organization</h1>
              <p class="text-sm text-slate-500 mb-8 leading-relaxed">
                How you want to identify this account.
              </p>

              <div class="flex flex-col gap-5">
                <div>
                  <label class="block text-xs font-bold text-slate-650 uppercase tracking-wide mb-2">Organization name</label>
                  <input
                    pInputText
                    type="text"
                    [(ngModel)]="organizationName"
                    placeholder="Ex. Acme"
                    class="w-full"
                  />
                </div>
              </div>
            </div>
          }

          <!-- STEP 3: Store Info -->
          @if (currentStep() === 3) {
            <div>
              <h1 class="text-3xl font-bold tracking-tight text-slate-900 mb-2">Store</h1>
              <p class="text-sm text-slate-500 mb-8 leading-relaxed">
                Basic store details.
              </p>

              <div class="flex flex-col gap-5">
                <div>
                  <label class="block text-xs font-bold text-slate-650 uppercase tracking-wide mb-2">Store name</label>
                  <input
                    pInputText
                    type="text"
                    [(ngModel)]="storeName"
                    placeholder="Ex. Main store"
                    class="w-full"
                  />
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-650 uppercase tracking-wide mb-2">Default market</label>
                  <p-select
                    [(ngModel)]="defaultMarket"
                    [options]="markets"
                    optionLabel="label"
                    optionValue="label"
                    placeholder="Select market"
                    styleClass="w-full"
                  />
                </div>

                <div>
                  <label class="block text-xs font-bold text-slate-650 uppercase tracking-wide mb-2">Store category</label>
                  <p-select
                    [(ngModel)]="category"
                    [options]="categories"
                    placeholder="Select category"
                    styleClass="w-full"
                  />
                </div>
              </div>
            </div>
          }

          <!-- STEP 4: Summary & Launch -->
          @if (currentStep() === 4) {
            <div>
              <h1 class="text-3xl font-bold tracking-tight text-slate-900 mb-2">Ready to create</h1>
              <p class="text-sm text-slate-500 mb-8 leading-relaxed">
                This creates the account, store, base roles and currency. Catalog, payments and shipping are configured inside the admin.
              </p>

              <!-- Summary Card -->
              <div class="bg-[#faf9f6] border border-[#e6e4df] rounded-xl p-6 mb-6">
                <div class="grid grid-cols-2 gap-y-6 gap-x-4">
                  <div>
                    <span class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Your name</span>
                    <span class="text-sm font-semibold text-slate-900">{{ fullName }}</span>
                  </div>
                  <div>
                    <span class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Country</span>
                    <span class="text-sm font-semibold text-slate-900">{{ country }}</span>
                  </div>
                  <div>
                    <span class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Language</span>
                    <span class="text-sm font-semibold text-slate-900">{{ language }}</span>
                  </div>
                  <div>
                    <span class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Organization name</span>
                    <span class="text-sm font-semibold text-slate-900">{{ organizationName }}</span>
                  </div>
                  <div>
                    <span class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Store name</span>
                    <span class="text-sm font-semibold text-slate-900">{{ storeName }}</span>
                  </div>
                  <div>
                    <span class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Store category</span>
                    <span class="text-sm font-semibold text-slate-900">{{ category }}</span>
                  </div>
                  <div class="col-span-2">
                    <span class="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Default market</span>
                    <span class="text-sm font-semibold text-slate-900">{{ defaultMarket }}</span>
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- Actions Footer Row -->
          <div class="flex items-center justify-between border-t border-[#e6e4df] mt-8 pt-8">
            <div>
              @if (currentStep() > 1 && !loading()) {
                <button
                  pButton
                  type="button"
                  text
                  label="Back"
                  (click)="back()"
                ></button>
              }
            </div>

            <button
              pButton
              type="button"
              [label]="currentStep() === 4 ? 'Create store' : 'Next'"
              [loading]="loading()"
              [disabled]="isNextDisabled() || loading()"
              (click)="next()"
            ></button>
          </div>
        </div>

        <!-- Right Pane Footer -->
        <div class="flex flex-col sm:flex-row items-center gap-2 border-t border-[#e2dfd9]/60 pt-6 text-xs text-slate-400">
          <div>
            By continuing, you accept <a href="#" class="underline hover:text-slate-650">Terms of Service</a> &bull; <a href="#" class="underline hover:text-slate-650">Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .min-height-screen {
      min-height: 100vh;
    }
  `]
})
export class SetupStore {
  readonly currentStep = signal(1);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  // Form Fields
  fullName = '';
  country = 'United Kingdom';
  language = 'English';
  organizationName = '';
  storeName = '';
  defaultMarket = 'United Kingdom · GBP';
  category = 'Fashion and accessories';

  // Constants for selection
  readonly countries = [
    'United Kingdom',
    'Germany',
    'France',
    'Spain',
    'Italy',
    'Netherlands',
    'Belgium',
    'Ireland',
    'Portugal',
    'Poland',
    'Sweden',
    'Switzerland',
  ];
  readonly languages = ['English', 'Spanish', 'French', 'German'];
  readonly categories = ['Fashion and accessories', 'Electronics', 'Home and Kitchen', 'Beauty and Personal Care', 'Other'];
  readonly markets = [
    { label: 'United Kingdom · GBP', currency: 'GBP', code: 'GB' },
    { label: 'Germany · EUR', currency: 'EUR', code: 'DE' },
    { label: 'France · EUR', currency: 'EUR', code: 'FR' },
    { label: 'Spain · EUR', currency: 'EUR', code: 'ES' },
    { label: 'Italy · EUR', currency: 'EUR', code: 'IT' },
    { label: 'Netherlands · EUR', currency: 'EUR', code: 'NL' },
    { label: 'Belgium · EUR', currency: 'EUR', code: 'BE' },
    { label: 'Ireland · EUR', currency: 'EUR', code: 'IE' },
    { label: 'Portugal · EUR', currency: 'EUR', code: 'PT' },
    { label: 'Poland · PLN', currency: 'PLN', code: 'PL' },
    { label: 'Sweden · SEK', currency: 'SEK', code: 'SE' },
    { label: 'Switzerland · CHF', currency: 'CHF', code: 'CH' },
  ];

  readonly stepConfig = [
    { number: 1, label: 'Account' },
    { number: 2, label: 'Organization' },
    { number: 3, label: 'Store' },
    { number: 4, label: 'Start' }
  ];

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    const tokenFromRoute = this.route.snapshot.queryParamMap.get('setupToken');
    if (tokenFromRoute) {
      this.auth.setPendingSetupSelection(tokenFromRoute);
    }
  }

  isNextDisabled(): boolean {
    if (this.currentStep() === 1) {
      return !this.fullName.trim() || !this.country || !this.language;
    }
    if (this.currentStep() === 2) {
      return !this.organizationName.trim();
    }
    if (this.currentStep() === 3) {
      return !this.storeName.trim() || !this.defaultMarket || !this.category;
    }
    return false;
  }

  back() {
    if (this.currentStep() > 1) {
      this.currentStep.update(s => s - 1);
      this.error.set(null);
    }
  }

  next() {
    if (this.currentStep() < 4) {
      this.currentStep.update(s => s + 1);
      this.error.set(null);
      return;
    }

    // Launch Setup Store API call
    this.error.set(null);
    this.loading.set(true);

    const token = this.auth.pendingSetupToken();
    if (!token) {
      this.loading.set(false);
      this.error.set('No pending setup session found. Please register again.');
      return;
    }

    const marketConfig = this.markets.find(m => m.label === this.defaultMarket);
    const countryObj = this.countries.find(c => c === this.country);

    this.auth.setupStore({
      setupToken: token,
      fullName: this.fullName,
      countryCode: marketConfig?.code || countryObj?.slice(0, 2).toUpperCase() || 'GB',
      language: this.language,
      organizationName: this.organizationName,
      storeName: this.storeName,
      defaultCurrency: marketConfig?.currency || 'USD',
      category: this.category,
    }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.status === 'ok') {
          this.router.navigateByUrl('/');
        } else {
          this.error.set('Failed to set up store. Please try again.');
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Could not launch store setup.');
      }
    });
  }
}
