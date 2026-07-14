import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantScopedCrudService } from '@temp-nx/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../entities/channel.entity';

@Injectable()
export class ChannelsService extends TenantScopedCrudService<Channel> {
  protected readonly alias = 'channel';

  constructor(@InjectRepository(Channel) repo: Repository<Channel>) {
    super(repo);
  }
}
