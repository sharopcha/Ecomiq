import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Public } from '@temp-nx/auth';
import { StoresService } from './stores.service';
import { Store } from '../entities/store.entity';
import type { PublicMarketDto, MarketsListResponse } from '@temp-nx/api-types/identity';

@Controller('markets')
export class MarketsController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  @Public()
  async getMarkets(): Promise<MarketsListResponse> {
    const stores = await this.storesService.findAll();
    return { markets: stores.map(this.toDto) };
  }

  @Get(':slug')
  @Public()
  async getMarket(@Param('slug') slug: string): Promise<PublicMarketDto> {
    const store = await this.storesService.findBySlug(slug);
    if (!store) {
      throw new NotFoundException(`Market with slug ${slug} not found`);
    }
    return this.toDto(store);
  }

  private toDto(store: Store): PublicMarketDto {
    return {
      id: store.id,
      name: store.name,
      slug: store.slug,
      logoFileId: store.logoFileId,
      defaultCurrency: store.defaultCurrency,
      countryCode: store.countryCode,
    };
  }
}
