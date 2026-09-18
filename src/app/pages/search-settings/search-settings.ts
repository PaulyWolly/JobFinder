import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { form, FormField, required, submit } from '@angular/forms/signals';
import {
  EXPERIENCE_LEVELS,
  JobFinderStore,
  SearchMode,
  WORK_TYPES,
  WorkType,
} from '../../data/job-finder-store';

@Component({
  imports: [FormField, RouterLink],
  selector: 'app-search-settings',
  styleUrl: './search-settings.css',
  templateUrl: './search-settings.html',
})
export class SearchSettings {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(JobFinderStore);
  readonly experienceLevels = EXPERIENCE_LEVELS;
  readonly workTypes = WORK_TYPES;
  readonly saved = signal(false);
  private savedTimer: ReturnType<typeof setTimeout> | undefined;
  readonly searchForm = form(this.store.searchCriteria, (schema) => {
    required(schema.titles, { message: 'Add the titles you want' });
    required(schema.locations, { message: 'Add at least one location' });
  });

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.savedTimer));
  }

  choose(mode: SearchMode) {
    this.store.setSearchMode(mode);
  }

  hasWorkType(type: WorkType) {
    return this.store.searchCriteria().workTypes.includes(type);
  }

  toggleWorkType(type: WorkType) {
    this.store.toggleWorkType(type);
  }

  async save(event: Event) {
    event.preventDefault();
    this.saved.set(false);
    await submit(this.searchForm, {
      action: async (field) => {
        this.store.updateSearchCriteria(field().value());
        this.saved.set(true);
        clearTimeout(this.savedTimer);
        this.savedTimer = setTimeout(() => this.saved.set(false), 2500);
        return undefined;
      },
    });
  }
}
