import { Component, Input, Output, EventEmitter, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ShipmentsApiService } from '../data/shipments-api.service';
import { NotificationTemplate } from '../data/shipments.models';

@Component({
  selector: 'app-notify-customer-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    SelectModule,
    InputTextModule,
    TextareaModule
  ],
  templateUrl: './notify-customer-modal.component.html',
  styles: []
})
export class NotifyCustomerModalComponent implements OnInit {
  private readonly api = inject(ShipmentsApiService);

  @Input() visible = false;
  @Input() shipmentId = '';
  @Input() customerEmail = '';

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() notified = new EventEmitter<void>();

  channel = signal<'email' | 'sms' | 'whatsapp'>('email');
  submitting = signal(false);

  // Email state
  templates = signal<NotificationTemplate[]>([]);
  selectedTemplate = signal<NotificationTemplate | null>(null);
  subject = signal('');
  body = signal('');

  // SMS/WhatsApp state
  phoneMessage = signal('');

  ngOnInit() {
    this.api.getNotificationTemplates().subscribe(res => {
      this.templates.set(res.items);
    });
  }

  hide() {
    this.visibleChange.emit(false);
  }

  setChannel(c: 'email' | 'sms' | 'whatsapp') {
    this.channel.set(c);
  }

  onTemplateChange(t: NotificationTemplate) {
    if (t) {
      this.subject.set(t.subject);
      this.body.set(t.body);
    }
  }

  send() {
    this.submitting.set(true);

    let payload: any = { channel: this.channel() };

    if (this.channel() === 'email') {
      payload.subject = this.subject();
      payload.body = this.body();
    } else {
      payload.body = this.phoneMessage();
    }

    this.api.notifyCustomer(this.shipmentId, payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.notified.emit();
      },
      error: () => this.submitting.set(false)
    });
  }
}
