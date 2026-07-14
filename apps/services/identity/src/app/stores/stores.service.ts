import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from '../entities/store.entity';

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store) private readonly repo: Repository<Store>,
  ) {}

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  findAll() {
    return this.repo.find();
  }

  findBySlug(slug: string) {
    return this.repo.findOne({ where: { slug } });
  }

  async create(data: {
    name: string;
    defaultCurrency?: string;
    countryCode?: string | null;
    organizationName?: string | null;
    category?: string | null;
  }) {
    const slug = await this.uniqueSlug(data.name);
    const store = this.repo.create({
      name: data.name,
      slug,
      defaultCurrency: data.defaultCurrency ?? 'USD',
      countryCode: data.countryCode,
      organizationName: data.organizationName,
      category: data.category,
    });
    return this.repo.save(store);
  }

  private slugify(name: string) {
    return (
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'store'
    );
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = this.slugify(name);
    let candidate = base;
    let n = 1;
    // Small tables (one row per store) — a loop here is fine; revisit if
    // store creation ever becomes high-throughput.
    while (await this.findBySlug(candidate)) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    return candidate;
  }
}
