import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '@temp-nx/auth';
import { StorageService } from '../storage/storage.service';

@Controller()
export class HealthController {
  constructor(private readonly storage: StorageService) {}

  // The first health endpoint in this repo with a real dependency check —
  // every other service's is a static `{status:'ok'}` because Postgres
  // unreachability already fails app boot (TypeOrmModule.forRoot), but
  // MinIO reachability doesn't: the service boots fine even if the bucket
  // or the whole MinIO container is down, since nothing touches storage
  // until a request needs it. A HEAD-bucket check here surfaces that at
  // the health endpoint instead of the first upload silently failing.
  @Public()
  @Get('health')
  async health() {
    try {
      await this.storage.checkBucket();
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        service: 'media-service',
        bucket: 'unreachable',
      });
    }
    return { status: 'ok', service: 'media-service', bucket: 'ok' };
  }
}
