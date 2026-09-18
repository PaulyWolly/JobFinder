import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Applications } from './applications';
import { JobFinderStore } from '../../data/job-finder-store';

describe('Applications', () => {
  let component: Applications;
  let fixture: ComponentFixture<Applications>;
  let store: JobFinderStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Applications],
      providers: [provideHttpClient(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Applications);
    component = fixture.componentInstance;
    store = TestBed.inject(JobFinderStore);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('asks whether the user applied after starting an application', () => {
    const job = store.jobs().find((item) => item.tab === 'action');
    expect(job).toBeTruthy();
    if (!job) {
      return;
    }

    component.beginApply(job);
    component.askApplied.set(true);

    expect(component.promptJob()?.id).toBe(job.id);

    const appliedBefore = store.appliedCount();
    component.confirmApplied();

    expect(store.isApplied(job.id)).toBe(true);
    expect(store.appliedCount()).toBe(appliedBefore + 1);
    expect(component.tab()).toBe('applied');
    expect(component.promptJob()).toBeNull();
  });

  it('returns an application to Jobs without hiding it', () => {
    const job = store.jobs().find((item) => item.tab === 'action');
    expect(job).toBeTruthy();
    if (!job) {
      return;
    }

    store.unqueueJob(job.id);

    expect(store.isQueued(job.id)).toBe(false);
    expect(store.isHidden(job.id)).toBe(false);
  });
});
