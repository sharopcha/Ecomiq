import { BadRequestException, Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { EXTERNAL_SOURCE_REGISTRY, ExternalSourceRegistry } from './external-source-registry.token';
import { SearchSourceQueryDto } from './dto/search-source-query.dto';

@Controller('sources')
@UseGuards(PermissionsGuard)
export class ExternalSourcesController {
  constructor(@Inject(EXTERNAL_SOURCE_REGISTRY) private readonly registry: ExternalSourceRegistry) {}

  @Get(':source/search')
  @RequirePermissions('media:read')
  search(@Param('source') source: string, @Query() query: SearchSourceQueryDto) {
    const adapter = this.registry.get(source);
    if (!adapter) {
      throw new BadRequestException(
        `source "${source}" is not searchable (no adapter registered — content_library/ai_generated import via a direct URL instead)`,
      );
    }
    return adapter.search(query.q ?? '');
  }
}
