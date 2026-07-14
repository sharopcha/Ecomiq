import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { EmailComposerComponent } from '../../../../shared/components/email-composer.component';

@Component({
  selector: 'app-approve-return-modal',
  standalone: true,
  imports: [CommonModule, DialogModule, EmailComposerComponent],
  templateUrl: './approve-return-modal.component.html',
  styles: []
})
export class ApproveReturnModalComponent {
  @Input() visible = false;
  @Input() returnId = '';
  @Input() customerEmail = '';
  
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() confirm = new EventEmitter<{ to: string, subject: string, body: string }>();

  readonly to = signal('');
  readonly subject = signal('Return Request Approved - Ecomiq');
  readonly body = signal('<p>Your return request has been approved. Please follow the instructions to send the items back.</p>');
  readonly templates = signal([{ name: 'Standard Approval' }, { name: 'Exception Approval' }]);

  ngOnChanges() {
    if (this.customerEmail) {
      this.to.set(this.customerEmail);
    }
  }

  onSend() {
    this.confirm.emit({
      to: this.to(),
      subject: this.subject(),
      body: this.body()
    });
  }

  close() {
    this.visibleChange.emit(false);
  }
}
