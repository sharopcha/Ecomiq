export interface PublicMarketDto {
  id: string;
  name: string;
  slug: string;
  logoFileId: string | null;
  defaultCurrency: string;
  countryCode: string | null;
}

/** `GET /markets` wraps the list — it is not a bare array. */
export interface MarketsListResponse {
  markets: PublicMarketDto[];
}
