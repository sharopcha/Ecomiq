// Catalog, cart, and review types now live in the shared contracts lib —
// see @temp-nx/api-types/catalog — since catalog-service, the storefront,
// and the admin app all need the same shapes.
export type {
  ProductDto,
  StorefrontProductsResponse,
  StorefrontCategoryDto,
  ProductOptionValueDto,
  ProductOptionDto,
  ProductVariantSummaryDto,
  ProductReviewDto,
  ProductReviewsResponse,
} from '@temp-nx/api-types/catalog';

export type { PublicMarketDto } from '@temp-nx/api-types/identity';
export type { CustomerAddressDto, CustomerProfileDto } from '@temp-nx/api-types/crm';
