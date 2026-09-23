import { TestBed } from '@angular/core/testing';
import { FoundJob, JobFinderStore } from './job-finder-store';

describe('JobFinderStore', () => {
  it('removes a listing the user does not want to pursue', () => {
    TestBed.configureTestingModule({});
    const store = TestBed.inject(JobFinderStore);
    const job = store.jobs()[0];

    store.hideJob(job.id);

    expect(store.isHidden(job.id)).toBe(true);
    expect(store.jobs().some((item) => item.id === job.id)).toBe(false);
  });

  it('does not queue a hidden listing again', () => {
    TestBed.configureTestingModule({});
    const store = TestBed.inject(JobFinderStore);
    const listing: FoundJob = {
      id: 'live-1',
      title: 'Frontend Engineer',
      company: 'Example',
      match: 88,
      published: 'Sep 17, 2026',
      workType: 'Remote',
      location: 'Remote (US)',
      salary: '150K USD / year',
      source: 'Remotive',
      url: 'https://example.com/job',
      snippet: 'Angular role',
    };

    store.hideJob(listing.id);
    store.queueJob(listing);

    expect(store.isQueued(listing.id)).toBe(false);
  });

  it('counts queued applications and keeps them after save', () => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    const store = TestBed.inject(JobFinderStore);
    const before = store.applicationCount();
    const listing: FoundJob = {
      id: 'live-2',
      title: 'Angular Engineer',
      company: 'Example',
      match: 91,
      published: 'Sep 17, 2026',
      workType: 'Remote',
      location: 'Remote (US)',
      salary: '160K USD / year',
      source: 'Remotive',
      url: 'https://example.com/angular',
      snippet: 'Angular role',
    };

    store.queueJob(listing);

    expect(store.applicationCount()).toBe(before + 1);
    expect(store.isQueued(listing.id)).toBe(true);

    const saved = JSON.parse(localStorage.getItem('job-finder.state') ?? '{}') as {
      jobs?: { id: string }[];
    };
    expect(saved.jobs?.some((job) => job.id === listing.id)).toBe(true);
  });

  it('marks a queued job applied after the user confirms', () => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    const store = TestBed.inject(JobFinderStore);
    const listing: FoundJob = {
      id: 'live-3',
      title: 'Staff Frontend Engineer',
      company: 'Example',
      match: 94,
      published: 'Sep 17, 2026',
      workType: 'Remote',
      location: 'Remote (US)',
      salary: '180K USD / year',
      source: 'JSearch',
      url: 'https://example.com/apply',
      snippet: 'Angular role',
    };
    const appliedBefore = store.appliedCount();

    store.queueJob(listing);
    store.startApply(listing.id);
    expect(store.pendingApplyJob()?.id).toBe(listing.id);

    store.confirmApplied(listing.id);

    expect(store.isApplied(listing.id)).toBe(true);
    expect(store.appliedCount()).toBe(appliedBefore + 1);
    expect(store.pendingApplyJob()).toBeNull();
  });

  it('keeps the total application count aligned with the action and applied counts', () => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    const store = TestBed.inject(JobFinderStore);
    const listing: FoundJob = {
      id: 'live-total',
      title: 'Platform Engineer',
      company: 'Example',
      match: 92,
      published: 'Sep 18, 2026',
      workType: 'Remote',
      location: 'Remote (US)',
      salary: '170K USD / year',
      source: 'Remotive',
      url: 'https://example.com/platform',
      snippet: 'Angular role',
    };

    store.queueJob(listing);
    const expectedTotal = store.actionCount() + store.appliedCount();

    expect(store.applicationCount()).toBe(expectedTotal);

    store.startApply(listing.id);
    store.confirmApplied(listing.id);

    expect(store.applicationCount()).toBe(store.actionCount() + store.appliedCount());
    expect(store.applicationCount()).toBe(expectedTotal);
  });

  it('hides an applied listing after refresh even if the id changed', () => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    const store = TestBed.inject(JobFinderStore);
    const listing: FoundJob = {
      id: 'live-5',
      title: 'Staff Frontend Engineer',
      company: 'Harbor Analytics',
      match: 92,
      published: 'Sep 18, 2026',
      workType: 'Remote',
      location: 'Remote (US)',
      salary: '180K USD / year',
      source: 'ZipRecruiter',
      url: 'https://example.com/harbor',
      snippet: 'Angular role',
    };

    store.queueJob(listing);
    store.confirmApplied(listing.id);

    const refreshed: FoundJob = {
      ...listing,
      id: 'live-5-refresh',
      url: 'https://example.com/harbor?ref=2',
    };

    expect(store.isTracked(refreshed)).toBe(true);
    expect(store.isApplied(listing.id)).toBe(true);
  });

  it('returns a queued job to the listings instead of hiding it', () => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    const store = TestBed.inject(JobFinderStore);
    const listing: FoundJob = {
      id: 'live-4',
      title: 'Angular Engineer',
      company: 'Example',
      match: 90,
      published: 'Sep 18, 2026',
      workType: 'Remote',
      location: 'Remote (US)',
      salary: '170K USD / year',
      source: 'The Muse',
      url: 'https://example.com/return',
      snippet: 'Angular role',
    };

    store.queueJob(listing);
    store.unqueueJob(listing.id);

    expect(store.isQueued(listing.id)).toBe(false);
    expect(store.isHidden(listing.id)).toBe(false);

    store.queueJob(listing);
    expect(store.isQueued(listing.id)).toBe(true);
  });
});
