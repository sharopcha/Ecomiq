export interface CustomerAddressDto {
  id: string;
  line1: string;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
}

export interface CreateAddressRequestDto {
  line1: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
  lat?: number;
  lng?: number;
  isDefaultShipping?: boolean;
  isDefaultBilling?: boolean;
}

export type UpdateAddressRequestDto = Partial<CreateAddressRequestDto>;
