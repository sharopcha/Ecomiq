/** Staff/admin auth (identity-service). Distinct from crm's customer-facing auth (see ../crm). */

export type StaffRole = 'owner' | 'admin' | 'staff';

export interface StaffStoreSummaryDto {
  id: string;
  name: string;
  role: StaffRole;
}

export interface StaffAuthUserDto {
  id: string;
  email: string;
  fullName: string;
}

export interface StaffLoginOkResponseDto {
  status: 'ok';
  accessToken: string;
  user: StaffAuthUserDto;
  store: StaffStoreSummaryDto;
}

export interface StaffMfaRequiredResponseDto {
  status: 'mfa_required';
  mfaToken: string;
}

export interface StaffStoreSelectionRequiredResponseDto {
  status: 'store_selection_required';
  selectionToken: string;
  stores: StaffStoreSummaryDto[];
}

export interface StaffSetupRequiredResponseDto {
  status: 'setup_required';
  setupToken: string;
}

export type StaffLoginResponseDto =
  | StaffLoginOkResponseDto
  | StaffMfaRequiredResponseDto
  | StaffStoreSelectionRequiredResponseDto
  | StaffSetupRequiredResponseDto;

export interface StaffMeResponseDto {
  id: string;
  email: string;
  fullName: string;
  totpEnabled: boolean;
  stores: StaffStoreSummaryDto[];
}

export interface StaffSetup2faResponseDto {
  secret: string;
  otpauthUri: string;
  qrCode: string;
}
