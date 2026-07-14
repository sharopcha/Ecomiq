import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ShipmentsMockService {
  /**
   * Stub for the live map pane. Currently returns a static placeholder image.
   * This is a UI-only mock since we do not integrate with a real mapping provider yet.
   */
  getMapPreviewUrl(origin: any, dest: any): Observable<string> {
    // Return a generic static map placeholder matching the aesthetics
    return of('https://maps.googleapis.com/maps/api/staticmap?center=New+York,NY&zoom=10&size=600x600&maptype=roadmap&markers=color:red%7Clabel:S%7CNew+York,NY&key=MOCK').pipe(delay(200));
  }
}
