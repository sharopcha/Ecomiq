import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductOption } from '../entities/product-option.entity';
import { ProductOptionValue } from '../entities/product-option-value.entity';
import { assertProductOwned } from '../products/product-ownership.util';
import { CreateProductOptionDto } from './dto/create-product-option.dto';
import { UpdateProductOptionDto } from './dto/update-product-option.dto';
import { CreateOptionValueDto } from './dto/create-option-value.dto';
import { UpdateOptionValueDto } from './dto/update-option-value.dto';

/** Postgres error codes this service translates into meaningful HTTP errors. */
const FOREIGN_KEY_VIOLATION = '23503';

@Injectable()
export class ProductOptionsService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductOption) private readonly optionRepo: Repository<ProductOption>,
    @InjectRepository(ProductOptionValue)
    private readonly valueRepo: Repository<ProductOptionValue>,
  ) {}

  /** A product typically has 1-3 options — a bounded child collection, so no pagination (unlike the top-level Product list). */
  async findAll(storeId: string, productId: string): Promise<ProductOption[]> {
    await assertProductOwned(this.productRepo, storeId, productId);
    return this.optionRepo.find({
      where: { product: { id: productId } },
      relations: { values: true } as never,
      order: { position: 'ASC' },
    });
  }

  async create(
    storeId: string,
    productId: string,
    dto: CreateProductOptionDto,
  ): Promise<ProductOption> {
    const product = await assertProductOwned(this.productRepo, storeId, productId);
    const { values, ...rest } = dto;

    const option = this.optionRepo.create({ ...rest, product });
    const saved = await this.optionRepo.save(option);

    if (values?.length) {
      const rows = values.map((v) => this.valueRepo.create({ ...v, option: saved }));
      saved.values = await this.valueRepo.save(rows);
    } else {
      saved.values = [];
    }
    return saved;
  }

  async update(
    storeId: string,
    productId: string,
    optionId: string,
    dto: UpdateProductOptionDto,
  ): Promise<ProductOption> {
    const option = await this.findOwnedOption(storeId, productId, optionId);
    Object.assign(option, dto);
    return this.optionRepo.save(option);
  }

  async remove(storeId: string, productId: string, optionId: string): Promise<void> {
    const option = await this.findOwnedOption(storeId, productId, optionId);
    try {
      await this.optionRepo.remove(option);
    } catch (err) {
      throw this.translateForeignKeyViolation(err, 'option');
    }
  }

  async addValue(
    storeId: string,
    productId: string,
    optionId: string,
    dto: CreateOptionValueDto,
  ): Promise<ProductOptionValue> {
    const option = await this.findOwnedOption(storeId, productId, optionId);
    const value = this.valueRepo.create({ ...dto, option });
    return this.valueRepo.save(value);
  }

  async updateValue(
    storeId: string,
    productId: string,
    optionId: string,
    valueId: string,
    dto: UpdateOptionValueDto,
  ): Promise<ProductOptionValue> {
    await this.findOwnedOption(storeId, productId, optionId);
    const value = await this.valueRepo.findOne({ where: { id: valueId, option: { id: optionId } } });
    if (!value) throw new NotFoundException(`Option value ${valueId} not found`);
    Object.assign(value, dto);
    return this.valueRepo.save(value);
  }

  async removeValue(
    storeId: string,
    productId: string,
    optionId: string,
    valueId: string,
  ): Promise<void> {
    await this.findOwnedOption(storeId, productId, optionId);
    const value = await this.valueRepo.findOne({ where: { id: valueId, option: { id: optionId } } });
    if (!value) throw new NotFoundException(`Option value ${valueId} not found`);
    try {
      await this.valueRepo.remove(value);
    } catch (err) {
      throw this.translateForeignKeyViolation(err, 'option value');
    }
  }

  private async findOwnedOption(
    storeId: string,
    productId: string,
    optionId: string,
  ): Promise<ProductOption> {
    await assertProductOwned(this.productRepo, storeId, productId);
    const option = await this.optionRepo.findOne({
      where: { id: optionId, product: { id: productId } },
      relations: { values: true } as never,
    });
    if (!option) {
      throw new NotFoundException(`Option ${optionId} not found on product ${productId}`);
    }
    return option;
  }

  /**
   * `variant_option_value.option_value_id` has no `ON DELETE CASCADE` back to
   * `product_option_value` (only the option→value link cascades) — deleting
   * an option or value that a variant still points at is meant to fail, so
   * surface it as a clear 409 instead of a raw 500.
   */
  private translateForeignKeyViolation(err: unknown, label: string): Error {
    if (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === FOREIGN_KEY_VIOLATION
    ) {
      return new ConflictException(
        `Cannot delete this ${label} — it's still used by an existing variant`,
      );
    }
    return err as Error;
  }
}
