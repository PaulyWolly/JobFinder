import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JobsApi } from '../../data/jobs-api';
import { FoundJob, JobFinderStore, WorkType } from '../../data/job-finder-store';
import { isUsJob } from '../../data/us-job';

const PLACE_FILTERS = ['Remote', 'Hybrid', 'On-site'] as const;
const TYPE_FILTERS = ['Full-time', 'Contract'] as const;

@Component({
  imports: [RouterLink],
  selector: 'app-jobs',
  styleUrl: './jobs.css',
  templateUrl: './jobs.html',
})
export class Jobs {
  private readonly jobsApi = inject(JobsApi);
  protected readonly store = inject(JobFinderStore);

  readonly placeFilters = PLACE_FILTERS;
  readonly typeFilters = TYPE_FILTERS;
  readonly query = signal('');
  readonly selected = signal<WorkType[]>([]);
  readonly selectedSources = signal<string[]>([]);
  readonly guestSaveLimitReached = signal(false);
  readonly remoteOnly = signal(false);
  readonly usOnly = signal(/us|united states|usa/i.test(this.store.searchCriteria().locations));

  readonly listings = this.jobsApi.listings;

  readonly remainingJobs = this.jobsApi.visibleJobs;

  readonly visibleJobs = computed(() => this.remainingJobs().filter((job) => this.matches(job)));

  readonly sourceOptions = computed(() => {
    if (this.listings.isLoading()) {
      return [];
    }
    const counts = new Map<string, number>();
    for (const job of this.remainingJobs()) {
      if (!this.matches(job, true)) {
        continue;
      }
      counts.set(job.source, (counts.get(job.source) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  });

  readonly visibleSources = computed(() => {
    const counts = new Map<string, number>();
    for (const job of this.visibleJobs()) {
      counts.set(job.source, (counts.get(job.source) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  });

  readonly hasFilters = computed(
    () =>
      this.query().trim().length > 0 ||
      this.selected().length > 0 ||
      this.selectedSources().length > 0 ||
      this.remoteOnly() ||
      this.usOnly(),
  );

  isSelected(filter: WorkType) {
    return this.selected().includes(filter);
  }

  isSourceSelected(source: string) {
    return this.selectedSources().includes(source);
  }

  toggle(filter: WorkType) {
    this.selected.update((current) =>
      current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter],
    );
  }

  toggleSource(source: string) {
    this.selectedSources.update((current) =>
      current.includes(source) ? current.filter((item) => item !== source) : [...current, source],
    );
  }

  clearFilters() {
    this.query.set('');
    this.selected.set([]);
    this.selectedSources.set([]);
    this.remoteOnly.set(false);
    this.usOnly.set(false);
  }

  refresh() {
    this.selectedSources.set([]);
    this.jobsApi.refresh();
  }

  saveJob(job: FoundJob) {
    if (!this.store.queueJob(job) && this.store.guestSaveLimitReached()) {
      this.guestSaveLimitReached.set(true);
    }
  }

  private matches(job: FoundJob, skipSource = false) {
    const q = this.query().trim().toLowerCase();
    if (q && !`${job.title} ${job.company} ${job.location} ${job.snippet} ${job.workType}`.toLowerCase().includes(q)) {
      return false;
    }

    const haystack = `${job.workType} ${job.location}`.toLowerCase();
    const selected = this.selected();
    const places = selected.filter((item): item is (typeof PLACE_FILTERS)[number] =>
      (PLACE_FILTERS as readonly string[]).includes(item),
    );
    const types = selected.filter((item): item is (typeof TYPE_FILTERS)[number] =>
      (TYPE_FILTERS as readonly string[]).includes(item),
    );

    if (places.length && !places.some((place) => this.matchesPlace(haystack, place))) {
      return false;
    }
    if (types.length && !types.some((type) => this.matchesType(haystack, type))) {
      return false;
    }
    if (this.usOnly() && !isUsJob(job)) {
      return false;
    }
    if (this.remoteOnly() && !this.matchesPlace(haystack, 'Remote')) {
      return false;
    }
    const sources = this.selectedSources();
    if (!skipSource && sources.length && !sources.includes(job.source)) {
      return false;
    }
    return true;
  }

  private matchesType(haystack: string, type: (typeof TYPE_FILTERS)[number]) {
    if (type === 'Full-time') {
      return (
        haystack.includes('full-time') ||
        haystack.includes('full time') ||
        haystack.includes('fulltime') ||
        haystack.includes('full_time') ||
        (!haystack.includes('contract') && !haystack.includes('freelance'))
      );
    }
    return haystack.includes('contract') || haystack.includes('freelance') || haystack.includes('contractor');
  }

  private matchesPlace(haystack: string, place: (typeof PLACE_FILTERS)[number]) {
    if (place === 'Remote') {
      return haystack.includes('remote') || haystack.includes('worldwide');
    }
    if (place === 'Hybrid') {
      return haystack.includes('hybrid');
    }
    return haystack.includes('on-site') || haystack.includes('onsite') || haystack.includes('on site');
  }
}
