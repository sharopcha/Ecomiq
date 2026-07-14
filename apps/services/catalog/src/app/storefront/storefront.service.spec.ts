import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StorefrontService } from './storefront.service';
import { Product, ProductStatus } from '../entities/product.entity';
import { Category } from '../entities/category.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { ProductOption } from '../entities/product-option.entity';
import { StorefrontSort } from './dto/storefront-query.dto';
import { CartValidateDto } from './dto/cart-validate.dto';

describe('StorefrontService', () => {
  let service: StorefrontService;
  let mockProductQueryBuilder: any;
  let mockCategoryQueryBuilder: any;
  let productRepository: any;
  let productVariantRepository: any;

  beforeEach(async () => {
    mockProductQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getOne: jest.fn().mockResolvedValue(null),
    };

    mockCategoryQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorefrontService,
        {
          provide: getRepositoryToken(Product),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(mockProductQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(Category),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(mockCategoryQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(ProductVariant),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(ProductOption),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<StorefrontService>(StorefrontService);
    productRepository = module.get(getRepositoryToken(Product));
    productVariantRepository = module.get(getRepositoryToken(ProductVariant));
  });
  describe('findAllProducts', () => {
    it('should apply visibility predicate', async () => {
      await service.findAllProducts({ limit: 10, offset: 0 });

      expect(mockProductQueryBuilder.andWhere).toHaveBeenCalledWith(
        'product.status = :status',
        { status: ProductStatus.Active }
      );
      expect(mockProductQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('EXISTS (SELECT 1 FROM product_variant')
      );
    });

    it('should apply filters and sort correctly', async () => {
      await service.findAllProducts({
        limit: 20,
        offset: 0,
        storeId: 'store-1',
        sort: StorefrontSort.PriceDesc,
      });

      expect(mockProductQueryBuilder.andWhere).toHaveBeenCalledWith(
        'product.store_id = :storeId',
        { storeId: 'store-1' }
      );
      expect(mockProductQueryBuilder.orderBy).toHaveBeenCalledWith(
        'product.price_minor',
        'DESC',
        'NULLS LAST'
      );
    });
  });

  describe('validateCart', () => {
    it('should validate cart lines and group them', async () => {
      const mockVariant = Object.assign(new ProductVariant(), {
        id: 'v1',
        isActive: true,
        priceMinor: 100,
        product: Object.assign(new Product(), { id: 'p1', name: 'Prod 1', status: ProductStatus.Active, storeId: 'store-1' }),
        optionValues: []
      });

      productVariantRepository.find.mockResolvedValue([mockVariant]);

      const dto: CartValidateDto = {
        lines: [
          { variantId: 'v1', qty: 2 },
          { variantId: 'v2', qty: 1 }
        ]
      };

      const result = await service.validateCart(dto);

      expect(result.lines).toHaveLength(2);
      expect(result.lines[0].problems).toEqual([]); // valid
      expect(result.lines[0].unitPriceMinor).toBe(100);
      
      expect(result.lines[1].problems).toEqual(['not_found']);

      expect(result.groups).toHaveLength(2); // store-1 and ''
      const store1Group = result.groups.find(g => g.storeId === 'store-1');
      expect(store1Group?.subtotalMinor).toBe(200);
      expect(store1Group?.lineVariantIds).toContain('v1');
    });

    it('should detect price drift', async () => {
      const mockVariant = Object.assign(new ProductVariant(), {
        id: 'v1',
        isActive: true,
        priceMinor: 200,
        product: Object.assign(new Product(), { id: 'p1', name: 'Prod 1', status: ProductStatus.Active, storeId: 'store-1' }),
        optionValues: []
      });

      productVariantRepository.find.mockResolvedValue([mockVariant]);

      const dto: CartValidateDto = {
        lines: [{ variantId: 'v1', qty: 1, expectedPriceMinor: 150 }]
      };

      const result = await service.validateCart(dto);

      expect(result.lines[0].problems).toEqual(['price_changed']);
      expect(result.lines[0].unitPriceMinor).toBe(200);
      expect(result.groups[0].subtotalMinor).toBe(200);
    });

    it('should detect inactive variants', async () => {
      const mockVariant = Object.assign(new ProductVariant(), {
        id: 'v1',
        isActive: false,
        priceMinor: 200,
        product: Object.assign(new Product(), { id: 'p1', name: 'Prod 1', status: ProductStatus.Active, storeId: 'store-1' }),
        optionValues: []
      });

      productVariantRepository.find.mockResolvedValue([mockVariant]);

      const dto: CartValidateDto = {
        lines: [{ variantId: 'v1', qty: 1 }]
      };

      const result = await service.validateCart(dto);

      expect(result.lines[0].problems).toEqual(['inactive']);
      expect(result.groups[0].subtotalMinor).toBe(0);
    });
  });
});
