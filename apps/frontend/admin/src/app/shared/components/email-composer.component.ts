import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { EditorModule } from 'primeng/editor';
import { NotificationApiService } from '../../features/notifications/data/notification-api.service';
import { EmailTemplate } from '../../features/notifications/data/notification.models';
import { DialogModule } from 'primeng/dialog';

@Component({
  selector: 'app-email-composer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    SelectModule,
    ButtonModule,
    EditorModule,
    DialogModule
  ],
  templateUrl: './email-composer.component.html',
  styles: []
})
export class EmailComposerComponent {
  @Input() to = '';
  @Input() subject = '';
  @Input() body = '';
  // Note: We ignore incoming availableTemplates and fetch our own.
  @Input() availableTemplates: any[] = [];
  
  @Output() toChange = new EventEmitter<string>();
  @Output() subjectChange = new EventEmitter<string>();
  @Output() bodyChange = new EventEmitter<string>();
  @Output() templateSelect = new EventEmitter<EmailTemplate>();
  @Output() send = new EventEmitter<void>();

  private readonly notificationApi = inject(NotificationApiService);
  
  readonly templates = signal<EmailTemplate[]>([]);
  readonly selectedTemplate = signal<EmailTemplate | null>(null);

  // Save template dialog
  showSaveDialog = false;
  newTemplateName = '';

  constructor() {
    this.loadTemplates();
  }

  loadTemplates() {
    this.notificationApi.getTemplates().subscribe((res: any) => {
      this.templates.set(res.data);
    });
  }

  onTemplateChange(tmpl: EmailTemplate) {
    this.selectedTemplate.set(tmpl);
    if (tmpl.subject) {
      this.subject = tmpl.subject;
      this.subjectChange.emit(this.subject);
    }
    if (tmpl.body) {
      this.body = tmpl.body;
      this.bodyChange.emit(this.body);
    }
    this.templateSelect.emit(tmpl);
  }

  saveTemplate() {
    if (!this.newTemplateName) return;
    const isUpdate = this.selectedTemplate() && this.selectedTemplate()?.name === this.newTemplateName;

    const payload = {
      name: this.newTemplateName,
      kind: 'custom' as any, // using string mapped to TemplateKind
      subject: this.subject,
      body: this.body
    };

    if (isUpdate) {
      this.notificationApi.updateTemplate(this.selectedTemplate()!.id, payload).subscribe(() => {
        this.loadTemplates();
        this.showSaveDialog = false;
      });
    } else {
      this.notificationApi.createTemplate(payload).subscribe(() => {
        this.loadTemplates();
        this.showSaveDialog = false;
      });
    }
  }

  onSend() {
    this.send.emit();
  }
}
