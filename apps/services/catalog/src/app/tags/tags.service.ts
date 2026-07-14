import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, QueryFailedError, Repository } from 'typeorm';
import { TenantScopedCrudService } from '@temp-nx/typeorm';
import { Tag } from '../entities/tag.entity';

/** Postgres error code for `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class TagsService extends TenantScopedCrudService<Tag> {
  protected readonly alias = 'tag';

  constructor(@InjectRepository(Tag) repo: Repository<Tag>) {
    super(repo);
  }

  /**
   * `tag` has a real DB-level `UNIQUE(store_id, name)` constraint (citext, so
   * case-insensitive) — catch the resulting Postgres error and surface it as
   * a 409 instead of a raw 500.
   */
  override async create(storeId: string, data: DeepPartial<Tag>): Promise<Tag> {
    try {
      return await super.create(storeId, data);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException(`Tag "${data.name}" already exists`);
      }
      throw err;
    }
  }
}
