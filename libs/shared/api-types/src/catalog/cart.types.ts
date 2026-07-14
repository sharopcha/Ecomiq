export interface CartLineRequestDto {
  variantId: string;
  qty: number;
  expectedPriceMinor?: number;
}

export interface CartLineResponseDto {
  variantId: string;
  qty: number;
  unitPriceMinor: number;
  currency: string;
  productId: string;
  name: string;
  optionSummary: string;
  imageUrl: string | null;
  storeId: string;
  problems: string[];
}

/**
 * `lineVariantIds` references entries in the sibling `lines` array by
 * `variantId` — this response does NOT nest full line objects per group.
 */
export interface CartGroupResponseDto {
  storeId: string;
  lineVariantIds: string[];
  subtotalMinor: number;
}

export interface CartValidateResponseDto {
  lines: CartLineResponseDto[];
  groups: CartGroupResponseDto[];
}
