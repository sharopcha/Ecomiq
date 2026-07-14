import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedResult, TenantScopedCrudService, paginate } from '@temp-nx/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { FindCategoriesQueryDto } from './dto/find-categories-query.dto';

@Injectable()
export class CategoriesService extends TenantScopedCrudService<Category> {
  protected readonly alias = 'category';

  constructor(@InjectRepository(Category) repo: Repository<Category>) {
    super(repo);
  }

  /**
   * Overrides the base findAll to add an optional `?parentId=` filter — used
   * to browse a specific level of the tree (e.g. children of a node). With
   * no parentId given, this behaves exactly like the base findAll (flat,
   * unfiltered list) — the common case for a management-UI table.
   */
  override async findAll(
    storeId: string,
    query: FindCategoriesQueryDto,
  ): Promise<PaginatedResult<Category>> {
    const qb = this.repo
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.store_id = :storeId`, { storeId });

    if (query.parentId) {
      qb.andWhere(`${this.alias}.parent_id = :parentId`, {
        parentId: query.parentId,
      });
    }

    return paginate(qb, this.alias, query);
  }

  override async create(
    storeId: string,
    data: CreateCategoryDto,
  ): Promise<Category> {
    const { parentId, ...rest } = data;
    const entity = this.repo.create({
      ...rest,
      storeId,
      parent: parentId ? ({ id: parentId } as Category) : null,
    });
    return this.repo.save(entity);
  }

  override async update(
    storeId: string,
    id: string,
    data: UpdateCategoryDto,
  ): Promise<Category> {
    const entity = await this.findOne(storeId, id);
    const { parentId, ...rest } = data;
    Object.assign(entity, rest);
    if (parentId !== undefined) {
      entity.parent = parentId ? ({ id: parentId } as Category) : null;
    }
    return this.repo.save(entity);
  }
}
