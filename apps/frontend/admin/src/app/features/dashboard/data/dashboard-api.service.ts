import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DashboardMockService } from './dashboard.mock-service';
import { DashboardData } from './dashboard.models';

@Injectable({
  providedIn: 'root'
})
export class DashboardApiService {
  // We use the mock service directly here as the real analytics-service does not exist yet.
  private mockService = inject(DashboardMockService);

  getDashboardData(): Observable<DashboardData> {
    return this.mockService.getDashboardData();
  }
}
