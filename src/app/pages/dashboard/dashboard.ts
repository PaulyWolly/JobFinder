import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JobsApi } from '../../data/jobs-api';
import { JobFinderStore } from '../../data/job-finder-store';

@Component({
  imports: [RouterLink],
  selector: 'app-dashboard',
  styleUrl: './dashboard.css',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  protected readonly store = inject(JobFinderStore);
  protected readonly jobsApi = inject(JobsApi);

  barWidth(value: number) {
    const max = Math.max(this.jobsApi.stats().found, 1);
    if (!value) {
      return '0%';
    }
    return `${Math.min(100, Math.max(8, (value / max) * 100))}%`;
  }
}
