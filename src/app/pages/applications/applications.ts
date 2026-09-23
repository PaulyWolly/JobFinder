import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApplicationTab, JobFinderStore, JobPosting } from '../../data/job-finder-store';

@Component({
  imports: [RouterLink],
  selector: 'app-applications',
  styleUrl: './applications.css',
  templateUrl: './applications.html',
})
export class Applications {
  private readonly document = inject(DOCUMENT);
  protected readonly store = inject(JobFinderStore);
  readonly tab = signal<ApplicationTab>('action');
  readonly query = signal('');
  readonly remoteOnly = signal(false);
  readonly askApplied = signal(false);
  private leftPage = false;

  readonly promptJob = computed(() => (this.askApplied() ? this.store.pendingApplyJob() : null));

  readonly visibleJobs = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.store.jobs().filter((job) => {
      if (this.store.isHidden(job.id) || job.tab !== this.tab()) {
        return false;
      }
      if (this.remoteOnly() && !job.location.toLowerCase().includes('remote')) {
        return false;
      }
      if (!q) {
        return true;
      }
      return `${job.title} ${job.company}`.toLowerCase().includes(q);
    });
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (this.store.pendingApplyJob()) {
        this.askApplied.set(true);
      }
      const onHidden = () => {
        this.leftPage = true;
      };
      const onReturn = () => {
        if (this.document.visibilityState === 'hidden') {
          onHidden();
          return;
        }
        if (!this.leftPage) {
          return;
        }
        this.leftPage = false;
        if (this.store.pendingApplyJob()) {
          this.askApplied.set(true);
        }
      };
      const view = this.document.defaultView;
      this.document.addEventListener('visibilitychange', onReturn);
      view?.addEventListener('blur', onHidden);
      view?.addEventListener('focus', onReturn);
      destroyRef.onDestroy(() => {
        this.document.removeEventListener('visibilitychange', onReturn);
        view?.removeEventListener('blur', onHidden);
        view?.removeEventListener('focus', onReturn);
      });
    });
  }

  setTab(tab: ApplicationTab) {
    this.tab.set(tab);
  }

  beginApply(job: JobPosting) {
    this.askApplied.set(false);
    this.leftPage = false;
    this.store.startApply(job.id);
    const opened = job.url
      ? this.document.defaultView?.open(job.url, '_blank', 'noopener,noreferrer')
      : null;
    if (!opened) {
      this.askApplied.set(true);
    }
  }

  confirmApplied() {
    const job = this.store.pendingApplyJob();
    if (!job) {
      this.askApplied.set(false);
      return;
    }
    this.store.confirmApplied(job.id);
    this.tab.set('applied');
    this.askApplied.set(Boolean(this.store.pendingApplyJob()));
  }

  skipPrompt() {
    const job = this.store.pendingApplyJob();
    if (job) {
      this.store.skipApplyPrompt(job.id);
    }
    this.askApplied.set(Boolean(this.store.pendingApplyJob()));
  }

  returnPromptToJobs() {
    const job = this.store.pendingApplyJob();
    if (job) {
      this.store.unqueueJob(job.id);
    }
    this.askApplied.set(Boolean(this.store.pendingApplyJob()));
  }
}
