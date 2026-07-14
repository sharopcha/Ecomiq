import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';

interface AlertCondition {
  prefix: string; // IF / AND / OR
  metric: string;
  operator: string;
  value: number;
}

interface AlertAction {
  type: string;
}

@Component({
  selector: 'app-configure-alert-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, SelectModule, InputTextModule, InputNumberModule],
  templateUrl: './configure-alert-dialog.component.html',
})
export class ConfigureAlertDialogComponent {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() alertSaved = new EventEmitter<void>();

  readonly prefixes = [
    { label: 'IF', value: 'IF' },
    { label: 'AND', value: 'AND' },
    { label: 'OR', value: 'OR' },
  ];

  readonly metrics = [
    { label: 'Total Sales', value: 'sales' },
    { label: 'Total Revenue', value: 'revenue' },
    { label: 'Units Sold', value: 'units' },
    { label: 'Average Order Value', value: 'aov' },
    { label: 'Conversion Rate', value: 'conversion' },
  ];

  readonly operators = [
    { label: 'Lower Than', value: 'lt' },
    { label: 'Greater Than', value: 'gt' },
    { label: 'Equal To', value: 'eq' },
  ];

  readonly actionTypes = [
    { label: 'Send Email Notification', value: 'email' },
    { label: 'Send Slack Message', value: 'slack' },
    { label: 'Create In-App Alert', value: 'inapp' },
    { label: 'Trigger Reorder', value: 'reorder' },
  ];

  readonly conditions = signal<AlertCondition[]>([
    { prefix: 'IF', metric: 'sales', operator: 'lt', value: 100 },
  ]);

  readonly actions = signal<AlertAction[]>([{ type: 'email' }]);

  addCondition() {
    this.conditions.update((conds) => [
      ...conds,
      { prefix: 'AND', metric: 'revenue', operator: 'lt', value: 0 },
    ]);
  }

  removeCondition(idx: number) {
    this.conditions.update((conds) => conds.filter((_, i) => i !== idx));
  }

  addAction() {
    this.actions.update((acts) => [...acts, { type: 'email' }]);
  }

  removeAction(idx: number) {
    this.actions.update((acts) => acts.filter((_, i) => i !== idx));
  }

  close() {
    this.visibleChange.emit(false);
  }

  save() {
    this.alertSaved.emit();
    this.close();
  }
}
