import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import {
  cloneProfile,
  JobFinderStore,
  Profile as ProfileData,
  WorkModels,
} from '../../data/job-finder-store';

export type ProfileTab = 'contact' | 'location' | 'work' | 'links' | 'demographics';
type ChipField =
  | 'workLocations'
  | 'skills'
  | 'education'
  | 'excludedCompanies'
  | 'values'
  | 'roleInterests'
  | 'industries';

@Component({
  imports: [FormField, RouterLink],
  selector: 'app-profile',
  styleUrl: './profile.css',
  templateUrl: './profile.html',
})
export class Profile {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(JobFinderStore);
  readonly tab = signal<ProfileTab>('contact');
  readonly saved = signal(false);
  readonly imageError = signal('');
  private savedTimer: ReturnType<typeof setTimeout> | undefined;
  readonly draft = signal<ProfileData>(cloneProfile(this.store.profile()));
  readonly profileForm = form(this.draft, (schema) => {
    required(schema.firstName, { message: 'Required' });
    required(schema.lastName, { message: 'Required' });
    email(schema.email, { message: 'Enter a valid email' });
  });

  readonly tabs: { id: ProfileTab; label: string; icon: string }[] = [
    { id: 'contact', label: 'Contact card', icon: 'person' },
    { id: 'location', label: 'Location', icon: 'pin' },
    { id: 'work', label: 'Work', icon: 'briefcase' },
    { id: 'links', label: 'Links and Files', icon: 'link' },
    { id: 'demographics', label: 'U.S. Standard Demographic Questions', icon: 'search' },
  ];

  readonly yesNo = ['Yes', 'No'];
  readonly timezones = [
    'Eastern (New York City)',
    'Central (Chicago)',
    'Mountain (Denver)',
    'Pacific (Los Angeles)',
    'Alaska',
    'Hawaii',
    'UTC',
  ];
  readonly relocateOptions = ['Yes', 'No', 'Open to it'];
  readonly educationLevels = [
    'High school',
    'Associate degree',
    'Bachelor degree',
    'Master degree',
    'Doctorate',
    'Professional degree',
    'Other',
  ];
  readonly workSchedules = ['Full-time', 'Part-time', 'Contract', 'Internship'];
  readonly clearanceAnswers = ['Yes', 'No'];
  readonly clearanceLevels = ['None', 'Confidential', 'Secret', 'Top Secret', 'Other'];
  readonly employmentStatuses = [
    'Employed',
    'Open to work',
    'Unemployed and really need a job',
    'Not looking',
  ];
  readonly targetLevels = [
    'Internship',
    'Entry-level',
    'Mid-level (2–5 years)',
    'Senior-level (5+ years)',
    'Staff / Principal',
    'Executive',
  ];
  readonly preferNot = [
    'Prefer not to say',
    'Yes',
    'No',
    'Decline to self-identify',
  ];
  readonly genderOptions = ['Prefer not to say', 'Woman', 'Man', 'Non-binary', 'Self-describe'];
  readonly pronounOptions = ['Prefer not to say', 'she/her', 'he/him', 'they/them', 'Self-describe'];
  readonly raceOptions = [
    'Prefer not to say',
    'American Indian or Alaska Native',
    'Asian',
    'Black or African American',
    'Hispanic or Latino',
    'Middle Eastern or North African',
    'Native Hawaiian or Other Pacific Islander',
    'White',
    'Two or more races',
    'Some other race',
  ];
  readonly valueOptions = [
    'Impactful work',
    'Independence and autonomy',
    'Innovative product and tech',
    'Progressive leadership',
    'Recognition and reward',
    'Role mobility',
    'Transparency and communication',
    'Work-life balance',
    'Mentorship',
    'Design',
  ];
  readonly roleInterestOptions = [
    'Accounting and Finance',
    'Arts and Entertainment',
    'Biotechnology and Pharmaceuticals',
    'Healthcare and Medical Services',
    'Information Technology and Software',
    'Media and Broadcasting',
    'Research and Development',
    'Science and technology',
    'Telecommunications',
  ];
  readonly industryOptions = [
    'Aerospace',
    'AI and Machine Learning',
    'Automotive and Transportation',
    'Biotechnology',
    'Consulting',
    'Consumer Goods',
    'Consumer Software',
    'Crypto and Web3',
    'Cybersecurity',
    'Data and Analytics',
    'Design',
    'Education',
    'Energy',
    'Enterprise Software',
    'Entertainment',
    'Financial Services',
    'Fintech',
    'Food and Agriculture',
    'Government and Public Sector',
    'Hardware',
    'Healthcare',
    'Industrial and Manufacturing',
    'Legal',
    'Quantitative Finance',
    'Real Estate',
    'Robotics and Automation',
    'Social Impact',
    'Venture Capital',
    'VR and AR',
  ];

  readonly contactCount = computed(() =>
    this.filledCount(['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'postal', 'dateOfBirth']),
  );
  readonly locationCount = computed(() =>
    this.filledCount(['livesInUs', 'workAuthorized', 'timezone', 'openToRelocate']) +
    (this.draft().workLocations.length ? 1 : 0),
  );
  readonly workCount = computed(() => {
    const profile = this.draft();
    return (
      this.filledCount([
        'qualification',
        'experienceSummary',
        'yearsExperience',
        'lastEmployer',
        'lastTitle',
        'educationLevel',
        'workSchedule',
        'hasClearance',
        'clearanceLevel',
        'employmentStatus',
        'minSalary',
        'targetLevel',
      ]) +
      (profile.skills.length ? 1 : 0) +
      (profile.education.length ? 1 : 0) +
      (profile.noExcludedCompanies || profile.excludedCompanies.length ? 1 : 0) +
      (profile.values.length ? 1 : 0) +
      (profile.roleInterests.length ? 1 : 0) +
      (profile.industries.length ? 1 : 0)
    );
  });
  readonly linksCount = computed(() => {
    const profile = this.draft();
    return (
      (profile.noLinkedIn || this.hasValue(profile.linkedIn) ? 1 : 0) +
      this.filledCount(['github', 'portfolio', 'resumeUrl', 'website'])
    );
  });
  readonly demographicsCount = computed(() =>
    this.filledCount(['gender', 'hispanicLatino', 'veteran', 'disability', 'race', 'pronouns', 'lgbtq']),
  );

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.savedTimer));
    effect(() => {
      const next = cloneProfile(this.store.profile());
      if (!this.raceOptions.includes(next.race)) {
        next.race = 'Prefer not to say';
      }
      this.draft.set(next);
    });
  }

  tabCount(id: ProfileTab) {
    switch (id) {
      case 'contact':
        return `${this.contactCount()}/9`;
      case 'location':
        return `${this.locationCount()}/5`;
      case 'work':
        return `${this.workCount()}/18`;
      case 'links':
        return `${this.linksCount()}/5`;
      case 'demographics':
        return `${this.demographicsCount()}/7`;
    }
  }

  remaining(options: string[], selected: string[]) {
    return options.filter((option) => !selected.includes(option));
  }

  addChip(event: Event, field: ChipField) {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    this.pushChip(field, input.value);
    input.value = '';
  }

  addPreset(event: Event, field: ChipField) {
    const select = event.target as HTMLSelectElement;
    this.pushChip(field, select.value);
    select.value = '';
  }

  removeChip(field: ChipField, value: string) {
    this.draft.update((profile) => ({
      ...profile,
      [field]: profile[field].filter((item) => item !== value),
    }));
  }

  toggleModel(key: keyof WorkModels) {
    this.draft.update((profile) => {
      const workModels = { ...profile.workModels, [key]: !profile.workModels[key] };
      if (key === 'remote' && !workModels.remote) {
        workModels.countryBased = false;
        workModels.stateBased = false;
      }
      if ((key === 'countryBased' || key === 'stateBased') && workModels[key]) {
        workModels.remote = true;
      }
      return { ...profile, workModels };
    });
  }

  toggleNoExcluded() {
    this.draft.update((profile) => ({
      ...profile,
      noExcludedCompanies: !profile.noExcludedCompanies,
      excludedCompanies: profile.noExcludedCompanies ? profile.excludedCompanies : [],
    }));
  }

  setRace(value: string) {
    const race = this.raceOptions.includes(value) ? value : 'Prefer not to say';
    this.draft.update((profile) => ({ ...profile, race }));
  }

  cancel() {
    this.draft.set(cloneProfile(this.store.profile()));
    this.saved.set(false);
    this.imageError.set('');
  }

  selectProfileImage(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.imageError.set('');
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.imageError.set('Choose an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.imageError.set('Choose an image smaller than 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        this.draft.update((profile) => ({ ...profile, photoUrl: result }));
      } else {
        this.imageError.set('The image could not be read.');
      }
    };
    reader.onerror = () => this.imageError.set('The image could not be read.');
    reader.readAsDataURL(file);
  }

  removeProfileImage() {
    this.draft.update((profile) => ({ ...profile, photoUrl: '' }));
    this.imageError.set('');
  }

  async save(event: Event) {
    event.preventDefault();
    this.saved.set(false);
    await submit(this.profileForm, {
      action: async (field) => {
        const value = field().value();
        this.store.updateProfile(
          value.hasClearance === 'Yes' ? value : { ...value, clearanceLevel: 'None' },
        );
        this.flashSaved();
        return undefined;
      },
    });
  }

  private flashSaved() {
    this.saved.set(true);
    clearTimeout(this.savedTimer);
    this.savedTimer = setTimeout(() => this.saved.set(false), 2500);
  }

  private pushChip(field: ChipField, raw: string) {
    const value = raw.trim();
    if (!value) {
      return;
    }
    this.draft.update((profile) => {
      if (profile[field].includes(value)) {
        return profile;
      }
      return { ...profile, [field]: [...profile[field], value] };
    });
  }

  private filledCount(keys: (keyof ProfileData)[]) {
    const profile = this.draft();
    return keys.reduce((count, key) => count + (this.hasValue(profile[key]) ? 1 : 0), 0);
  }

  private hasValue(value: ProfileData[keyof ProfileData]) {
    return typeof value === 'string' && value.trim().length > 0;
  }
}
