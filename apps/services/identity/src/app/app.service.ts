import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getData(): { message: string; service: string } {
    return { message: 'ok', service: 'identity-service' };
  }
}
