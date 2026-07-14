import { Controller, Get } from '@nestjs/common';
import { Public } from '@temp-nx/auth';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'payment-service' };
  }
}
