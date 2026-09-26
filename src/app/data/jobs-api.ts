import { Service, computed, inject, resource } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, map } from 'rxjs';
import { FoundJob, JobFinderStore, SearchCriteria, SearchMode } from './job-finder-store';
import { isUsJob } from './us-job';

export interface JobSearchResult {
  jobs: FoundJob[];
  sources: { name: string; count: number }[];
}

export interface SearchStats {
  found: number;
  screened: number;
  matched: number;
  queued: number;
  applied: number;
}

const API_URL = 'http://127.0.0.1:8000';
const STRONG_MATCH = 80;

function asSearchResult(payload: JobSearchResult | FoundJob[]): JobSearchResult {
  if (Array.isArray(payload)) {
    const counts = new Map<string, number>();
    for (const job of payload) {
      counts.set(job.source, (counts.get(job.source) ?? 0) + 1);
    }
    return {
      jobs: payload,
      sources: [...counts.entries()].map(([name, count]) => ({ name, count })),
    };
  }
  return payload;
}

function locationTokens(locations: string) {
  return locations
    .toLowerCase()
    .split(/[·,/|]+/)
    .flatMap((part) => part.replace(/[()]/g, ' ').split(/\s+/))
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function isScreened(job: FoundJob, criteria: SearchCriteria) {
  const wantsUs = /\b(us|usa|u\.s\.|united states)\b/i.test(criteria.locations);
  if (wantsUs && !isUsJob(job)) {
    return false;
  }
  const haystack = `${job.location} ${job.workType}`.toLowerCase();
  const tokens = locationTokens(criteria.locations).filter((token) => !['us', 'usa'].includes(token));
  if (tokens.length && !tokens.some((token) => haystack.includes(token))) {
    return false;
  }
  if (/\d/.test(criteria.salary) && !/\d/.test(job.salary)) {
    return false;
  }
  return true;
}

function sameSearchCriteria(left: SearchCriteria, right: SearchCriteria) {
  return (
    left.titles === right.titles &&
    left.experience === right.experience &&
    left.skills === right.skills &&
    left.locations === right.locations &&
    left.salary === right.salary &&
    left.clearance === right.clearance &&
    left.workTypes.length === right.workTypes.length &&
    left.workTypes.every((type, index) => type === right.workTypes[index])
  );
}

@Service()
export class JobsApi {
  private readonly http = inject(HttpClient);
  private readonly store = inject(JobFinderStore);

  private readonly searchParams = computed(
    () => ({
      criteria: this.store.searchCriteria(),
      mode: this.store.searchMode(),
    }),
    {
      equal: (left, right) =>
        left.mode === right.mode && sameSearchCriteria(left.criteria, right.criteria),
    },
  );

  readonly listings = resource({
    defaultValue: { jobs: [], sources: [] } as JobSearchResult,
    params: () => this.searchParams(),
    loader: ({ params }) => this.search(params.criteria, params.mode),
  });

  private forceNextSearch = false;

  readonly visibleJobs = computed(() => {
    return this.listings.value().jobs.filter((job) => !this.store.isTracked(job));
  });

  readonly stats = computed<SearchStats>(() => {
    const jobs = this.visibleJobs();
    return {
      found: jobs.length,
      screened: jobs.filter((job) => isScreened(job, this.store.searchCriteria())).length,
      matched: jobs.filter((job) => job.match >= STRONG_MATCH).length,
      queued: this.store.actionCount(),
      applied: this.store.appliedCount(),
    };
  });

  search(criteria: SearchCriteria, mode: SearchMode) {
    const force = this.forceNextSearch;
    this.forceNextSearch = false;
    return firstValueFrom(
      this.http
        .post<JobSearchResult | FoundJob[]>(`${API_URL}/jobs/search`, {
          titles: criteria.titles,
          experience: criteria.experience,
          skills: criteria.skills,
          locations: criteria.locations,
          salary: criteria.salary,
          workTypes: criteria.workTypes,
          mode,
          force,
        })
        .pipe(map(asSearchResult)),
    );
  }

  /** Forces the next search to bypass the backend cache, for explicit user-initiated refreshes. */
  refresh() {
    this.forceNextSearch = true;
    this.listings.reload();
  }
}
