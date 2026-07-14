import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Product, ProductStatus } from '../entities/product.entity';
import { Category } from '../entities/category.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { ProductOption } from '../entities/product-option.entity';
import { FindStorefrontProductsDto, StorefrontSort, mapProductToStorefront, mapCategoryToStorefront } from './dto/storefront-query.dto';
import { CartValidateDto, CartValidateResponseDto, CartLineResponseDto } from './dto/cart-validate.dto';
import { groupCartLines } from './cart-grouping.util';
import { In } from 'typeorm';
import type { ProductDto, StorefrontProductsResponse, StorefrontCategoryDto } from '@temp-nx/api-types/catalog';

@Injectable()
export class StorefrontService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(ProductOption)
    private readonly optionRepo: Repository<ProductOption>,
  ) {}

  private applyVisibilityPredicate(qb: SelectQueryBuilder<Product>) {
    qb.andWhere('product.status = :status', { status: ProductStatus.Active })
      .andWhere(
        'EXISTS (SELECT 1 FROM product_variant WHERE product_variant.product_id = product.id AND product_variant.is_active = true)'
      );
    return qb;
  }

  async findAllProducts(query: FindStorefrontProductsDto): Promise<StorefrontProductsResponse> {
    const qb = this.productRepo.createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.vendor', 'vendor');

    this.applyVisibilityPredicate(qb);

    if (query.storeId) {
      qb.andWhere('product.store_id = :storeId', { storeId: query.storeId });
    }
    if (query.categoryId) {
      qb.andWhere('product.category_id = :categoryId', { categoryId: query.categoryId });
    }
    if (query.vendorId) {
      qb.andWhere('product.vendor_id = :vendorId', { vendorId: query.vendorId });
    }
    if (query.q) {
      qb.andWhere("product.name ILIKE :q", { q: `%${query.q}%` });
    }

    if (query.sort === StorefrontSort.Newest) {
      qb.orderBy('product.created_at', 'DESC');
    } else if (query.sort === StorefrontSort.Rating) {
      qb.orderBy('product.rating_avg', 'DESC', 'NULLS LAST');
    } else if (query.sort === StorefrontSort.PriceAsc) {
      qb.orderBy('product.price_minor', 'ASC', 'NULLS LAST');
    } else if (query.sort === StorefrontSort.PriceDesc) {
      qb.orderBy('product.price_minor', 'DESC', 'NULLS LAST');
    } else {
      qb.orderBy('product.created_at', 'DESC');
    }

    const [items, total] = await qb
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();

    return {
      items: items.map(mapProductToStorefront),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findProductById(id: string): Promise<ProductDto> {
    const qb = this.productRepo.createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.vendor', 'vendor')
      .leftJoinAndSelect('product.type', 'type')
      .leftJoinAndSelect('product.channels', 'channels')
      .leftJoinAndSelect('product.tags', 'tags')
      .where('product.id = :id', { id });

    this.applyVisibilityPredicate(qb);

    const product = await qb.getOne();
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    const variants = await this.variantRepo.find({
      where: { product: { id: product.id }, isActive: true },
      relations: { optionValues: { option: true } },
      order: { createdAt: 'ASC' },
    });

    const options = await this.optionRepo.find({
      where: { product: { id: product.id } },
      relations: { values: true },
      order: { position: 'ASC', values: { position: 'ASC' } },
    });

    // Map variant.optionValues -> optionsSummary dynamically for response mapping
    const mappedVariants = variants.map(v => {
      const summary = (v.optionValues || [])
        .sort((a, b) => (a.option?.position || 0) - (b.option?.position || 0))
        .map(val => val.value)
        .join(' / ');
      return Object.assign(v, { optionsSummary: summary });
    });

    Object.assign(product, { variants: mappedVariants, options });

    return mapProductToStorefront(product);
  }

  async validateCart(dto: CartValidateDto): Promise<CartValidateResponseDto> {
    const variantIds = dto.lines.map(l => l.variantId);
    
    // Fetch variants in bulk
    const variants = await this.variantRepo.find({
      where: { id: In(variantIds) },
      relations: {
        product: true,
        optionValues: { option: true }
      },
    });

    const variantMap = new Map(variants.map(v => [v.id, v]));
    const resolvedLines: CartLineResponseDto[] = [];

    for (const line of dto.lines) {
      const variant = variantMap.get(line.variantId);
      const problems: string[] = [];

      if (!variant) {
        problems.push('not_found');
      } else {
        if (!variant.isActive || variant.product.status !== ProductStatus.Active) {
          problems.push('inactive');
        }
        
        // Expected price check
        const actualPrice = variant.priceMinor ?? variant.product.priceMinor;
        if (line.expectedPriceMinor !== undefined && line.expectedPriceMinor !== actualPrice) {
          problems.push('price_changed');
        }
      }

      const optionSummary = variant?.optionValues
        ? variant.optionValues
            .sort((a, b) => (a.option?.position || 0) - (b.option?.position || 0))
            .map(val => val.value)
            .join(' / ')
        : '';

      resolvedLines.push({
        variantId: line.variantId,
        qty: line.qty,
        unitPriceMinor: variant ? (variant.priceMinor ?? variant.product.priceMinor) : 0,
        currency: 'USD',
        productId: variant?.product.id || '',
        name: variant?.product.name || 'Unknown Item',
        optionSummary,
        imageUrl: variant?.imageFileId || null,
        storeId: variant?.product.storeId || '',
        problems,
      });
    }

    const groups = groupCartLines(resolvedLines);

    return {
      lines: resolvedLines,
      groups,
    };
  }

  async findCategories(storeId?: string): Promise<StorefrontCategoryDto[]> {
    const qb = this.categoryRepo.createQueryBuilder('category');
    if (storeId) {
      qb.where('category.store_id = :storeId', { storeId });
    }
    qb.orderBy('category.name', 'ASC');
    const categories = await qb.getMany();
    return categories.map(mapCategoryToStorefront);
  }
}
