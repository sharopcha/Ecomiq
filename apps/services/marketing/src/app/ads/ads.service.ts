import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedCrudService, assertOwnedByStore } from '@temp-nx/typeorm';
import { Ad } from '../entities/ad.entity';
import { Campaign } from '../entities/campaign.entity';
import { AdPlatformPort } from './ad-platform.port';
import { CreateAdDto } from './dto/create-ad.dto';

@Injectable()
export class AdsService extends TenantScopedCrudService<Ad> {
  protected readonly alias = 'ad';

  constructor(
    @InjectRepository(Ad) repo: Repository<Ad>,
    @InjectRepository(Campaign) private readonly campaignRepo: Repository<Campaign>,
    private readonly adPlatform: AdPlatformPort,
  ) {
    super(repo);
  }

  /**
   * Creates the `Ad` row, then calls `AdPlatformPort.publish()` (the
   * logging stub today) and stashes the returned `externalRef` in `stats`
   * — there's no dedicated column for it (not in the plan's entity list),
   * and `stats` is already the loose catch-all jsonb field every other
   * marketing entity uses the same way.
   */
  override async create(storeId: string, dto: CreateAdDto): Promise<Ad> {
    const campaign = await this.campaignRepo.findOneBy({ id: dto.campaignId });
    const ownedCampaign = assertOwnedByStore(
      campaign,
      storeId,
      () => new NotFoundException(`Campaign ${dto.campaignId} not found`),
    );

    const ad = this.repo.create({
      storeId,
      campaign: ownedCampaign,
      platform: dto.platform,
      audience: dto.audience ?? null,
      budgetMinor: dto.budgetMinor ?? 0,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
    });
    const saved = await this.repo.save(ad);

    const publishResult = await this.adPlatform.publish({
      adId: saved.id,
      platform: saved.platform,
      title: ownedCampaign.title,
      budgetMinor: saved.budgetMinor,
      audience: saved.audience,
    });
    if (publishResult.ok) {
      saved.stats = { ...(saved.stats ?? {}), externalRef: publishResult.externalRef };
      return this.repo.save(saved);
    }
    return saved;
  }
}
