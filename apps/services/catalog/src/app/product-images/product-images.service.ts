import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductImage } from '../entities/product-image.entity';
import { assertProductOwned } from '../products/product-ownership.util';
import { AttachProductImageDto } from './dto/attach-product-image.dto';
import { ReorderProductImagesDto } from './dto/reorder-product-images.dto';

@Injectable()
export class ProductImagesService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductImage) private readonly imageRepo: Repository<ProductImage>,
  ) {}

  async findAll(storeId: string, productId: string): Promise<ProductImage[]> {
    await assertProductOwned(this.productRepo, storeId, productId);
    return this.imageRepo.find({
      where: { product: { id: productId } },
      order: { position: 'ASC' },
    });
  }

  async attach(
    storeId: string,
    productId: string,
    dto: AttachProductImageDto,
  ): Promise<ProductImage> {
    const product = await assertProductOwned(this.productRepo, storeId, productId);

    const position =
      dto.position ?? (await this.imageRepo.count({ where: { product: { id: productId } } }));

    const image = this.imageRepo.create({ product, fileId: dto.fileId, position });
    return this.imageRepo.save(image);
  }

  async remove(storeId: string, productId: string, imageId: string): Promise<void> {
    await assertProductOwned(this.productRepo, storeId, productId);
    const image = await this.imageRepo.findOne({
      where: { id: imageId, product: { id: productId } },
    });
    if (!image) {
      throw new NotFoundException(`Image ${imageId} not found on product ${productId}`);
    }
    await this.imageRepo.remove(image);

    // Re-compact remaining positions to a dense 0..n-1 sequence so gaps left
    // by the deleted row don't linger (position is meant to be a simple
    // front-to-back order, not a sparse/stable id).
    const remaining = await this.imageRepo.find({
      where: { product: { id: productId } },
      order: { position: 'ASC' },
    });
    await this.persistOrder(remaining.map((img) => img.id));
  }

  /** Replaces the full front-to-back order in one call — the drag-reorder-then-save UX. */
  async reorder(
    storeId: string,
    productId: string,
    dto: ReorderProductImagesDto,
  ): Promise<ProductImage[]> {
    await assertProductOwned(this.productRepo, storeId, productId);
    const current = await this.imageRepo.find({ where: { product: { id: productId } } });

    const currentIds = new Set(current.map((img) => img.id));
    const givenIds = new Set(dto.imageIds);
    const isSamePermutation =
      dto.imageIds.length === current.length &&
      currentIds.size === givenIds.size &&
      dto.imageIds.every((id) => currentIds.has(id));

    if (!isSamePermutation) {
      throw new BadRequestException(
        'imageIds must be exactly the product\'s current image ids, in the new order',
      );
    }

    await this.persistOrder(dto.imageIds);
    return this.findAll(storeId, productId);
  }

  private async persistOrder(orderedIds: string[]): Promise<void> {
    await this.imageRepo.manager.transaction(async (manager) => {
      for (const [index, id] of orderedIds.entries()) {
        await manager.update(ProductImage, { id }, { position: index });
      }
    });
  }
}
