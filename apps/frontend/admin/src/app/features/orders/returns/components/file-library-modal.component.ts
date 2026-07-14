import { Component, Input, Output, EventEmitter, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { ReturnsApiService } from '../data/returns-api.service';
import { FileItem } from '../data/returns.models';

@Component({
  selector: 'app-file-library-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule
  ],
  templateUrl: './file-library-modal.component.html',
  styles: []
})
export class FileLibraryModalComponent implements OnInit {
  private readonly api = inject(ReturnsApiService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() fileSelected = new EventEmitter<FileItem>();

  readonly files = signal<FileItem[]>([]);
  readonly loading = signal(false);
  readonly searchQuery = signal('');
  readonly viewMode = signal<'grid' | 'table'>('grid');
  readonly selectedFileId = signal<string | null>(null);

  ngOnInit() {
    this.loadFiles();
  }

  loadFiles() {
    this.loading.set(true);
    this.api.getFileLibrary().subscribe({
      next: (res) => {
        this.files.set(res);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  selectFile(id: string) {
    this.selectedFileId.set(id);
  }

  saveSelection() {
    const id = this.selectedFileId();
    if (id) {
      const file = this.files().find(f => f.id === id);
      if (file) {
        this.fileSelected.emit(file);
        this.close();
      }
    }
  }

  close() {
    this.visibleChange.emit(false);
    this.selectedFileId.set(null);
  }
}
