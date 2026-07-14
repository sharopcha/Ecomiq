import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Notification, EmailTemplate } from './notification.models';
import type { NotificationFeedResponse, EmailTemplateDto } from '@temp-nx/api-types/notification';
import type { CursorPaginatedResponse } from '@temp-nx/api-types';

@Injectable({ providedIn: 'root' })
export class NotificationApiService {
  private readonly http = inject(HttpClient);

  // --- Notifications Feed ---

  getFeed(): Observable<{ data: Notification[]; total: number }> {
    return this.http.get<NotificationFeedResponse>('/api/notifications').pipe(
      map((res) => ({
        data: (res.items || []).map((dto) => this.toAdminNotification(dto)),
        total: res.total,
      }))
    );
  }

  getUnreadCount(): Observable<number> {
    return this.http.get<{ count: number }>('/api/notifications/unread-count').pipe(
      map(res => res.count)
    );
  }

  markRead(id: string): Observable<void> {
    return this.http.post<void>(`/api/notifications/${id}/read`, {});
  }

  markAllRead(): Observable<void> {
    return this.http.post<void>('/api/notifications/read-all', {});
  }

  // --- Templates ---

  getTemplates(): Observable<{ data: EmailTemplate[]; nextCursor: string | null }> {
    return this.http.get<CursorPaginatedResponse<EmailTemplateDto>>('/api/notifications/templates').pipe(
      map((res) => ({
        data: (res.items || []).map((dto) => this.toAdminTemplate(dto)),
        nextCursor: res.nextCursor,
      }))
    );
  }

  createTemplate(payload: Partial<EmailTemplate>): Observable<EmailTemplate> {
    return this.http.post<EmailTemplateDto>('/api/notifications/templates', this.toApiPayload(payload)).pipe(
      map(res => this.toAdminTemplate(res))
    );
  }

  updateTemplate(id: string, payload: Partial<EmailTemplate>): Observable<EmailTemplate> {
    return this.http.patch<EmailTemplateDto>(`/api/notifications/templates/${id}`, this.toApiPayload(payload)).pipe(
      map(res => this.toAdminTemplate(res))
    );
  }

  // --- Mappers ---

  private toAdminNotification(dto: NotificationFeedResponse['items'][number]): Notification {
    return {
      id: dto.id,
      user_id: dto.userId || null,
      kind: dto.kind,
      title: dto.title || null,
      body: dto.body || null,
      ref_table: dto.refTable || null,
      ref_id: dto.refId || null,
      read_at: dto.readAt || null,
      created_at: dto.createdAt
    };
  }

  private toAdminTemplate(dto: EmailTemplateDto): EmailTemplate {
    return {
      id: dto.id,
      kind: dto.kind,
      name: dto.name,
      subject: dto.subject || null,
      body: dto.body || null,
      is_ai_recommended: !!dto.isAiRecommended,
      created_by: dto.createdBy || null,
      created_at: dto.createdAt
    };
  }

  private toApiPayload(model: Partial<EmailTemplate>): any {
    const payload: any = {};
    if (model.kind !== undefined) payload.kind = model.kind;
    if (model.name !== undefined) payload.name = model.name;
    if (model.subject !== undefined) payload.subject = model.subject;
    if (model.body !== undefined) payload.body = model.body;
    return payload;
  }
}
