import { Component, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TabsModule } from 'primeng/tabs';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { FileUploadModule } from 'primeng/fileupload';
import { ProgressBarModule } from 'primeng/progressbar';

@Component({
  selector: 'app-add-image-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    TabsModule,
    InputTextModule,
    TextareaModule,
    FileUploadModule,
    ProgressBarModule,
  ],
  templateUrl: './add-image-panel.component.html',
})
export class AddImagePanelComponent {
  @Output() imageAdded = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  // Content Library images
  readonly libraryImages = [
    'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=500&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=500&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=500&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=500&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=60',
    'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=500&auto=format&fit=crop&q=60',
  ];

  // Upload tab state
  readonly uploadProgress = signal<number>(0);
  readonly isUploading = signal<boolean>(false);

  // AI Tab state
  readonly aiPrompt = signal<string>('');
  readonly selectedStyle = signal<string>('Professional');
  readonly isGenerating = signal<boolean>(false);

  readonly aiStyles = [
    'Professional',
    'Photographic',
    'Digital Art',
    'Cinematic',
    'Minimalist',
    '3D Model',
  ];

  selectLibraryImage(url: string) {
    this.imageAdded.emit(url);
  }

  onUploadSimulate() {
    this.isUploading.set(true);
    this.uploadProgress.set(0);
    const interval = setInterval(() => {
      if (this.uploadProgress() >= 100) {
        clearInterval(interval);
        this.isUploading.set(false);
        // Add a random unsplash image as the uploaded file
        const randomImage = `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 1000000)}?w=500&auto=format&fit=crop&q=60`;
        this.imageAdded.emit(randomImage);
      } else {
        this.uploadProgress.update((v) => v + 25);
      }
    }, 400);
  }

  generateImageWithAI() {
    if (!this.aiPrompt()) return;
    this.isGenerating.set(true);
    
    // Simulate generation delay
    setTimeout(() => {
      this.isGenerating.set(false);
      // Mock generated image
      const generatedUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60';
      this.imageAdded.emit(generatedUrl);
      this.aiPrompt.set('');
    }, 2000);
  }
}
