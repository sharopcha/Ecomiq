import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Product } from '../../entities/product.entity';
import { Category } from '../../entities/category.entity';
import { ProductVariant } from '../../entities/product-variant.entity';
import type {
  ProductDto,
  StorefrontCategoryDto,
  ProductVariantSummaryDto,
  ProductOptionDto,
} from '@temp-nx/api-types/catalog';

export enum StorefrontSort {
  Newest = 'newest',
  Rating = 'rating',
  PriceAsc = 'price_asc',
  PriceDesc = 'price_desc',
}

export class FindStorefrontProductsDto {
  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(StorefrontSort)
  sort?: StorefrontSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

// Pure response mapper functions to prevent DTO leaks
export function mapProductToStorefront(product: Product): ProductDto {
  return {
    id: product.id,
    storeId: product.storeId,
    name: product.name,
    description: product.description ?? null,
    kind: product.kind,
    sku: product.sku ?? '',
    priceMinor: product.priceMinor,
    compareAtMinor: product.compareAtMinor ?? null,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    vendorName: product.vendor ? product.vendor.name : null,
    category: product.category ? mapCategoryToStorefront(product.category) : null,
    variants: product['variants'] ? product['variants'].map(mapVariantToStorefront) : undefined,
    options: product['options'] ? product['options'].map(mapOptionToStorefront) : undefined,
    // Serialized to an ISO string at the HTTP boundary by Nest's JSON serializer.
    createdAt: product.createdAt as unknown as string,
    updatedAt: product.updatedAt as unknown as string,
  };
}

export function mapCategoryToStorefront(category: Category): StorefrontCategoryDto {
  return {
    id: category.id,
    name: category.name,
    parentId: category.parent ? category.parent.id : null,
  };
}

export function mapVariantToStorefront(variant: ProductVariant): ProductVariantSummaryDto {
  return {
    id: variant.id,
    sku: variant.sku,
    priceMinor: variant.priceMinor,
    isDefault: variant.isDefault,
    isActive: variant.isActive,
    optionsSummary: (variant as any).optionsSummary ?? '',
  };
}

export function mapOptionToStorefront(option: any): ProductOptionDto {
  return {
    id: option.id,
    name: option.name,
    position: option.position,
    values: option.values ? option.values.map((v: any) => ({
      id: v.id,
      name: v.value || v.name,
      position: v.position,
    })) : [],
  };
}
