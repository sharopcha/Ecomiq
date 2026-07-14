import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { FileItem, ReturnProof } from './returns.models';

/**
 * Mocks the media-service interactions for return proofs and the file library modal.
 * media-service does not exist yet.
 */
@Injectable({ providedIn: 'root' })
export class ReturnsMockService {

  // Mocked File Library data
  getMockFiles(): Observable<FileItem[]> {
    return of([
      {
        id: 'file-1',
        name: 'damage_proof_1.jpg',
        owner: 'System',
        last_modified: new Date().toISOString(),
        size: '1.2 MB',
        url: 'https://images.unsplash.com/photo-1594222634351-e374d6c6d056?auto=format&fit=crop&w=300&q=80',
        type: 'image'
      },
      {
        id: 'file-2',
        name: 'unboxing_video.mp4',
        owner: 'Customer',
        last_modified: new Date().toISOString(),
        size: '15.4 MB',
        url: 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4',
        type: 'video'
      },
      {
        id: 'file-3',
        name: 'scratched_screen.png',
        owner: 'Support Agent',
        last_modified: new Date(Date.now() - 86400000).toISOString(),
        size: '4.5 MB',
        url: 'https://images.unsplash.com/photo-1588622146468-16e6d1c9fb8b?auto=format&fit=crop&w=300&q=80',
        type: 'image'
      }
    ] as FileItem[]).pipe(delay(400));
  }

  // Mock returning proofs for a specific return request
  getMockProofsForReturn(returnId: string): Observable<ReturnProof[]> {
    return of([
      {
        id: 'p-1',
        url: 'https://images.unsplash.com/photo-1588622146468-16e6d1c9fb8b?auto=format&fit=crop&w=300&q=80',
        thumbnail_url: 'https://images.unsplash.com/photo-1588622146468-16e6d1c9fb8b?auto=format&fit=crop&w=150&q=80',
        type: 'image'
      },
      {
        id: 'p-2',
        url: 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1594222634351-e374d6c6d056?auto=format&fit=crop&w=150&q=80',
        type: 'video'
      }
    ] as ReturnProof[]).pipe(delay(200));
  }
}
