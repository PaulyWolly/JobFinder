import { Component, computed, inject, signal } from '@angular/core';
import { JobFinderStore } from '../../data/job-finder-store';

@Component({
  selector: 'app-inbox',
  styleUrl: './inbox.css',
  templateUrl: './inbox.html',
})
export class Inbox {
  protected readonly store = inject(JobFinderStore);
  readonly category = signal('All');

  readonly categories = computed(() => {
    const counts = new Map<string, number>();
    for (const item of this.store.inbox()) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return [
      { label: 'All', count: this.store.inbox().length },
      ...[...counts.entries()].map(([label, count]) => ({ label, count })),
    ];
  });

  readonly visible = computed(() => {
    const selected = this.category();
    if (selected === 'All') {
      return this.store.inbox();
    }
    return this.store.inbox().filter((item) => item.category === selected);
  });
}
