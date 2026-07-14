import { Injectable } from '@nestjs/common';
import { NotificationsService, PushNotificationInput } from '../notifications/notifications.service';

/**
 * Not a port — no external provider will ever exist for the in-app channel
 * (`ECOMIQ-NOTIFICATION-PLAN.md` §0 scope decision: "In-app = feed + REST
 * only"), so there's nothing to abstract behind an interface the way
 * email/SMS/WhatsApp need to be. Calls `NotificationsService.push()`
 * directly.
 */
@Injectable()
export class InAppChannel {
  constructor(private readonly notifications: NotificationsService) {}

  async send(storeId: string, input: PushNotificationInput): Promise<{ ok: true; notificationId: string }> {
    const notification = await this.notifications.push(storeId, input);
    return { ok: true, notificationId: notification.id };
  }
}
