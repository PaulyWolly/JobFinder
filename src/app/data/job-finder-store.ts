import { isPlatformBrowser } from '@angular/common';
import { Service, afterNextRender, computed, effect, inject, PLATFORM_ID, signal } from '@angular/core';
import { AuthApi, GUEST_APPLY_LIMIT } from './auth-api';

const STORAGE_KEY = 'job-finder.state';
const USER_KEY = 'job-finder.user';
const LEGACY_PROFILE_KEY = 'job-finder.profile';

export const DEFAULT_PROFILE: Profile = {
  firstName: 'Alex',
  lastName: 'Chen',
  email: 'alex.chen@example.com',
  photoUrl: '',
  phone: '(555) 010-2048',
  address: '120 Market Street',
  city: 'Austin',
  state: 'TX',
  postal: '78701',
  dateOfBirth: '1992-04-18',
  livesInUs: 'Yes',
  workAuthorized: 'Yes',
  timezone: 'Central (Chicago)',
  openToRelocate: 'No',
  workModels: {
    remote: true,
    countryBased: true,
    stateBased: false,
    hybrid: false,
    onsite: false,
  },
  workLocations: ['Remote (US)', 'Austin, TX'],
  skills: [
    'Angular',
    'TypeScript',
    'HTML / CSS',
    'RxJS',
    'NgRx',
    'REST APIs',
    'Git',
    'Accessibility',
  ],
  education: ['B.S. Computer Science, Example University, 2014'],
  qualification: 'Senior Level',
  experienceSummary:
    'Senior frontend engineer focused on Angular, design systems, and accessible web apps. Comfortable owning UI architecture and partnering with backend teams.',
  yearsExperience: '8',
  lastEmployer: 'Northwind Labs',
  lastTitle: 'Frontend Software Engineer',
  educationLevel: 'Bachelor degree',
  excludedCompanies: [],
  noExcludedCompanies: true,
  noLinkedIn: false,
  workSchedule: 'Full-time',
  hasClearance: 'No',
  clearanceLevel: 'None',
  employmentStatus: 'Open to work',
  minSalary: '140000',
  values: ['Impactful work', 'Independence and autonomy', 'Work-life balance'],
  roleInterests: ['Information Technology and Software', 'Consulting'],
  targetLevel: 'Senior-level (5+ years)',
  industries: ['Enterprise Software', 'Consumer Software', 'Fintech'],
  linkedIn: 'https://www.linkedin.com/in/example',
  github: 'https://github.com/example',
  portfolio: '',
  resumeUrl: '',
  website: '',
  gender: 'Prefer not to say',
  hispanicLatino: 'Prefer not to say',
  veteran: 'Prefer not to say',
  disability: 'Prefer not to say',
  race: 'Prefer not to say',
  pronouns: 'Prefer not to say',
  lgbtq: 'Prefer not to say',
};

export type ClearancePreference = 'none' | 'eligible' | 'required';

export const DEFAULT_SEARCH_CRITERIA: SearchCriteria = {
  titles: 'Frontend Software Engineer',
  experience: 'Senior (5+ years)',
  skills: 'Angular, TypeScript, CSS',
  locations: 'Remote (US) · Austin, TX',
  salary: '140–180K USD / year',
  workTypes: ['Full-time', 'Remote'],
  clearance: 'none',
};

interface PersistedState {
  profile: Profile;
  searchCriteria: SearchCriteria;
  searchMode: SearchMode;
  hiddenJobIds: string[];
  hiddenListingKeys: string[];
  jobs: JobPosting[];
  inbox: InboxItem[];
  pendingApplyIds: string[];
}

export function cloneProfile(value: Profile): Profile {
  return structuredClone(value);
}

export function listingKeys(job: { id?: string; title: string; company: string; url?: string }): string[] {
  const keys: string[] = [];
  if (job.id) {
    keys.push(`id:${job.id}`);
  }
  const title = job.title.trim().toLowerCase();
  const company = (job.company || '').trim().toLowerCase();
  if (title && company) {
    keys.push(`role:${title}|${company}`);
  }
  const url = (job.url || '').trim().toLowerCase().replace(/\/+$/, '');
  if (url && !url.includes('google.com/search')) {
    keys.push(`url:${url}`);
  }
  return keys;
}

function stringList(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [...fallback];
}

function profileFromUnknown(value: unknown): Profile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const data = value as Record<string, unknown>;
  const next = cloneProfile(DEFAULT_PROFILE);
  for (const key of Object.keys(DEFAULT_PROFILE) as (keyof Profile)[]) {
    const incoming = data[key as string];
    if (typeof next[key] === 'string' && typeof incoming === 'string') {
      (next[key] as string) = incoming;
    } else if (typeof next[key] === 'boolean' && typeof incoming === 'boolean') {
      (next[key] as boolean) = incoming;
    } else if (Array.isArray(next[key])) {
      next[key] = stringList(incoming, next[key] as string[]) as never;
    }
  }
  const models = data['workModels'];
  if (models && typeof models === 'object') {
    const raw = models as Record<string, unknown>;
    next.workModels = {
      remote: raw['remote'] === true,
      countryBased: raw['countryBased'] === true,
      stateBased: raw['stateBased'] === true,
      hybrid: raw['hybrid'] === true,
      onsite: raw['onsite'] === true,
    };
  }
  return next;
}

function searchCriteriaFromUnknown(value: unknown): SearchCriteria | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const data = value as Record<string, unknown>;
  const next = { ...DEFAULT_SEARCH_CRITERIA, workTypes: [...DEFAULT_SEARCH_CRITERIA.workTypes] };
  for (const key of ['titles', 'experience', 'skills', 'locations', 'salary'] as const) {
    if (typeof data[key] === 'string') {
      next[key] = data[key];
    }
  }
  if (typeof data['clearance'] === 'string') {
    const value = data['clearance'];
    if (value === 'eligible' || value === 'required') {
      next.clearance = value;
    } else {
      next.clearance = 'none';
    }
  }
  if (Array.isArray(data['workTypes'])) {
    next.workTypes = data['workTypes'].filter((type): type is WorkType =>
      WORK_TYPES.includes(type as WorkType),
    );
  }
  return next;
}

function searchModeFromUnknown(value: unknown): SearchMode | null {
  return value === 'fast' || value === 'selective' ? value : null;
}

export type ApplicationTab = 'action' | 'applied';
export type SearchMode = 'fast' | 'selective';
export type WorkType = 'Full-time' | 'Contract' | 'Remote' | 'Hybrid' | 'On-site';

export const WORK_TYPES: WorkType[] = ['Full-time', 'Contract', 'Remote', 'Hybrid', 'On-site'];
export const EXPERIENCE_LEVELS = [
  'Internship',
  'Junior (0–2 years)',
  'Mid-level (2–5 years)',
  'Senior (5+ years)',
  'Staff / Principal',
] as const;

export interface WorkModels {
  remote: boolean;
  countryBased: boolean;
  stateBased: boolean;
  hybrid: boolean;
  onsite: boolean;
}

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  photoUrl: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postal: string;
  dateOfBirth: string;
  livesInUs: string;
  workAuthorized: string;
  timezone: string;
  openToRelocate: string;
  workModels: WorkModels;
  workLocations: string[];
  skills: string[];
  education: string[];
  qualification: string;
  experienceSummary: string;
  yearsExperience: string;
  lastEmployer: string;
  lastTitle: string;
  educationLevel: string;
  excludedCompanies: string[];
  noExcludedCompanies: boolean;
  noLinkedIn: boolean;
  workSchedule: string;
  hasClearance: string;
  clearanceLevel: string;
  employmentStatus: string;
  minSalary: string;
  values: string[];
  roleInterests: string[];
  targetLevel: string;
  industries: string[];
  linkedIn: string;
  github: string;
  portfolio: string;
  resumeUrl: string;
  website: string;
  gender: string;
  hispanicLatino: string;
  veteran: string;
  disability: string;
  race: string;
  pronouns: string;
  lgbtq: string;
}

export interface SearchCriteria {
  titles: string;
  experience: string;
  skills: string;
  locations: string;
  salary: string;
  workTypes: WorkType[];
  clearance: ClearancePreference;
}

export interface JobPosting {
  id: string;
  title: string;
  company: string;
  match: number;
  published: string;
  applicants: number;
  workType: string;
  location: string;
  salary: string;
  tab: ApplicationTab;
  note: string;
  url?: string;
  source?: string;
}

export interface FoundJob {
  id: string;
  title: string;
  company: string;
  match: number;
  published: string;
  workType: string;
  location: string;
  salary: string;
  source: string;
  url: string;
  snippet: string;
}

export interface InboxItem {
  id: string;
  date: string;
  time: string;
  from: string;
  category: string;
}

function jobFromUnknown(value: unknown): JobPosting | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  if (typeof data['id'] !== 'string' || typeof data['title'] !== 'string') {
    return null;
  }
  return {
    id: data['id'],
    title: data['title'],
    company: typeof data['company'] === 'string' ? data['company'] : '',
    match: typeof data['match'] === 'number' ? data['match'] : 0,
    published: typeof data['published'] === 'string' ? data['published'] : '',
    applicants: typeof data['applicants'] === 'number' ? data['applicants'] : 0,
    workType: typeof data['workType'] === 'string' ? data['workType'] : '',
    location: typeof data['location'] === 'string' ? data['location'] : '',
    salary: typeof data['salary'] === 'string' ? data['salary'] : '',
    tab: data['tab'] === 'applied' ? 'applied' : 'action',
    note: typeof data['note'] === 'string' ? data['note'] : '',
    url: typeof data['url'] === 'string' ? data['url'] : undefined,
    source: typeof data['source'] === 'string' ? data['source'] : undefined,
  };
}

function jobsFromUnknown(value: unknown, fallback: JobPosting[]): JobPosting[] {
  if (!Array.isArray(value)) {
    return fallback.map((job) => ({ ...job }));
  }
  return value.map(jobFromUnknown).filter((job): job is JobPosting => job !== null);
}

function inboxItemFromUnknown(value: unknown): InboxItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const data = value as Record<string, unknown>;
  if (typeof data['id'] !== 'string' || typeof data['from'] !== 'string') {
    return null;
  }
  return {
    id: data['id'],
    date: typeof data['date'] === 'string' ? data['date'] : '',
    time: typeof data['time'] === 'string' ? data['time'] : '',
    from: data['from'],
    category: typeof data['category'] === 'string' ? data['category'] : '',
  };
}

function inboxFromUnknown(value: unknown, fallback: InboxItem[]): InboxItem[] {
  if (!Array.isArray(value)) {
    return fallback.map((item) => ({ ...item }));
  }
  return value.map(inboxItemFromUnknown).filter((item): item is InboxItem => item !== null);
}

function userId(email: string) {
  return email.trim().toLowerCase() || 'local';
}

function userStateKey(email: string) {
  return `${STORAGE_KEY}.${userId(email)}`;
}

@Service()
export class JobFinderStore {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly authApi = inject(AuthApi);
  readonly profile = signal<Profile>(cloneProfile(DEFAULT_PROFILE));

  readonly searchCriteria = signal<SearchCriteria>({
    ...DEFAULT_SEARCH_CRITERIA,
    workTypes: [...DEFAULT_SEARCH_CRITERIA.workTypes],
  });

  readonly jobs = signal<JobPosting[]>([
    {
      id: '1',
      title: 'Software Engineer',
      company: 'Northwind Labs',
      match: 83,
      published: 'Sep 14, 2026',
      applicants: 50,
      workType: 'Contract / Freelance',
      location: 'Seattle, WA · Remote',
      salary: '68–72 USD / hour',
      tab: 'action',
      note: 'Review before applying',
    },
    {
      id: '2',
      title: 'Frontend Engineer',
      company: 'Cedar Health',
      match: 60,
      published: 'Sep 14, 2026',
      applicants: 10,
      workType: 'Full-time',
      location: 'Remote (US)',
      salary: '80–250K USD / year',
      tab: 'action',
      note: 'Review before applying',
    },
    {
      id: '3',
      title: 'UI Engineer',
      company: 'Harbor Analytics',
      match: 74,
      published: 'Sep 10, 2026',
      applicants: 28,
      workType: 'Full-time',
      location: 'Remote · New York',
      salary: '145–170K USD / year',
      tab: 'applied',
      note: 'Application sent',
    },
  ]);

  readonly inbox = signal<InboxItem[]>([
    {
      id: 'm1',
      date: '09-17-2026',
      time: '8:22 AM',
      from: 'no-reply@jobs.example.com',
      category: 'Rejection notification',
    },
    {
      id: 'm2',
      date: '09-16-2026',
      time: '11:44 PM',
      from: 'hiring@cedarhealth.example',
      category: 'Application acknowledgement',
    },
    {
      id: 'm3',
      date: '09-16-2026',
      time: '11:36 PM',
      from: 'notify@dayforce.example',
      category: 'Application acknowledgement',
    },
    {
      id: 'm4',
      date: '09-16-2026',
      time: '11:29 PM',
      from: 'recruiter@northwind.example',
      category: 'Additional info request',
    },
    {
      id: 'm5',
      date: '09-15-2026',
      time: '2:10 PM',
      from: 'talent@harbor.example',
      category: 'Interview invitation',
    },
  ]);

  readonly searchMode = signal<SearchMode>('fast');
  readonly hiddenJobIds = signal<string[]>([]);
  readonly hiddenListingKeys = signal<string[]>([]);
  readonly pendingApplyIds = signal<string[]>([]);
  readonly showReadyBanner = signal(true);
  readonly showSearchTip = signal(true);
  private readonly hydrated = signal(false);

  readonly displayName = computed(() => {
    if (this.authApi.isGuest()) {
      return 'Guest';
    }
    const profile = this.profile();
    if (this.authApi.isAuthenticated() && profile.email === DEFAULT_PROFILE.email) {
      return this.authApi.email()?.split('@')[0]?.split(/[._-]/)[0] || profile.firstName;
    }
    return profile.firstName;
  });
  readonly roleSummary = computed(() => {
    if (this.authApi.isGuest()) {
      return `Guest mode · ${this.guestApplyLimit} application limit`;
    }
    const role = this.searchCriteria();
    if (
      this.authApi.isAuthenticated() &&
      role.titles === DEFAULT_SEARCH_CRITERIA.titles &&
      role.locations === DEFAULT_SEARCH_CRITERIA.locations
    ) {
      return 'Set your search preferences to start finding matches';
    }
    return [role.titles, role.experience, role.locations].filter(Boolean).join(' · ');
  });
  readonly actionCount = computed(() => this.jobs().filter((job) => job.tab === 'action').length);
  readonly appliedCount = computed(() => this.jobs().filter((job) => job.tab === 'applied').length);
  readonly applicationCount = computed(() => this.actionCount() + this.appliedCount());
  readonly inboxCount = computed(() => this.inbox().length);
  readonly pendingApplyJob = computed(
    () =>
      this.jobs().find(
        (job) => job.tab === 'action' && this.pendingApplyIds().includes(job.id),
      ) ?? null,
  );
  /** Guests are capped at GUEST_APPLY_LIMIT applications; logged-in users are unlimited. */
  readonly guestApplyLimit = GUEST_APPLY_LIMIT;
  readonly applyLimitReached = computed(
    () => this.authApi.isGuest() && this.appliedCount() >= GUEST_APPLY_LIMIT,
  );

  constructor() {
    afterNextRender(async () => {
      await this.authApi.readyPromise;
      if (this.authApi.isAuthenticated()) {
        const remote = this.authApi.initialState();
        if (remote) {
          this.applyState(remote);
        } else {
          this.profile.update((profile) => ({
            ...profile,
            email: this.authApi.email() ?? profile.email,
          }));
        }
      } else {
        this.restore();
        this.clearDemoGuestState();
      }
      this.hydrated.set(true);
    });

    effect(() => {
      this.profile();
      this.searchCriteria();
      this.searchMode();
      this.hiddenJobIds();
      this.hiddenListingKeys();
      this.pendingApplyIds();
      this.jobs();
      this.inbox();
      if (this.hydrated()) {
        this.persist();
      }
    });
  }

  dismissReadyBanner() {
    this.showReadyBanner.set(false);
  }

  dismissSearchTip() {
    this.showSearchTip.set(false);
  }

  setSearchMode(mode: SearchMode) {
    this.searchMode.set(mode);
    this.persist();
  }

  toggleWorkType(type: WorkType) {
    this.searchCriteria.update((criteria) => {
      const selected = criteria.workTypes.includes(type)
        ? criteria.workTypes.filter((item) => item !== type)
        : [...criteria.workTypes, type];
      return { ...criteria, workTypes: selected };
    });
    this.persist();
  }

  updateSearchCriteria(value: SearchCriteria) {
    const next = searchCriteriaFromUnknown(value) ?? {
      ...DEFAULT_SEARCH_CRITERIA,
      workTypes: [...DEFAULT_SEARCH_CRITERIA.workTypes],
    };
    this.searchCriteria.set(next);
    this.persist();
  }

  applyToJob(id: string) {
    this.jobs.update((jobs) =>
      jobs.map((job) => (job.id === id ? { ...job, tab: 'applied', note: 'Application sent' } : job)),
    );
    this.clearPendingApply(id);
    this.persist();
  }

  startApply(id: string) {
    const job = this.jobs().find((item) => item.id === id);
    if (!job || job.tab === 'applied' || this.applyLimitReached()) {
      return;
    }
    if (!this.pendingApplyIds().includes(id)) {
      this.pendingApplyIds.update((ids) => [...ids, id]);
      this.persist();
    }
  }

  confirmApplied(id: string) {
    this.applyToJob(id);
  }

  skipApplyPrompt(id: string) {
    this.clearPendingApply(id);
    this.persist();
  }

  unqueueJob(id: string) {
    this.rejectJob(id);
  }

  isApplied(id: string) {
    return this.jobs().some((job) => job.id === id && job.tab === 'applied');
  }

  isQueued(id: string) {
    return this.jobs().some((job) => job.id === id);
  }

  isHidden(id: string) {
    return this.hiddenJobIds().includes(id);
  }

  isTracked(job: { id: string; title: string; company: string; url?: string }) {
    const seen = this.trackedKeys();
    return listingKeys(job).some((key) => seen.has(key));
  }

  rejectJob(id: string) {
    this.clearPendingApply(id);
    this.jobs.update((jobs) => jobs.filter((job) => job.id !== id));
    this.persist();
  }

  hideJob(job: FoundJob | JobPosting | string) {
    const listing = typeof job === 'string' ? this.jobs().find((item) => item.id === job) : job;
    const id = typeof job === 'string' ? job : job.id;
    if (!this.isHidden(id)) {
      this.hiddenJobIds.update((ids) => [...ids, id]);
    }
    if (listing) {
      const extra = listingKeys(listing);
      this.hiddenListingKeys.update((keys) => [...new Set([...keys, ...extra])]);
    }
    this.clearPendingApply(id);
    this.rejectJob(id);
    this.persist();
  }

  queueJob(job: FoundJob) {
    if (this.isTracked(job)) {
      return;
    }

    this.jobs.update((jobs) => [
      {
        id: job.id,
        title: job.title,
        company: job.company,
        match: job.match,
        published: job.published,
        applicants: 0,
        workType: job.workType,
        location: job.location,
        salary: job.salary,
        tab: 'action',
        note: `Queued from ${job.source}`,
        url: job.url,
        source: job.source,
      },
      ...jobs,
    ]);
    this.persist();
  }

  private trackedKeys() {
    const keys = new Set(this.hiddenListingKeys());
    for (const id of this.hiddenJobIds()) {
      keys.add(`id:${id}`);
    }
    for (const job of this.jobs()) {
      for (const key of listingKeys(job)) {
        keys.add(key);
      }
    }
    return keys;
  }

  private clearPendingApply(id: string) {
    if (!this.pendingApplyIds().includes(id)) {
      return;
    }
    this.pendingApplyIds.update((ids) => ids.filter((item) => item !== id));
  }

  updateProfile(value: Profile) {
    const next = profileFromUnknown(value) ?? cloneProfile(DEFAULT_PROFILE);
    this.profile.set(next);
    this.persist();
  }

  private restore() {
    const saved = this.readState();
    if (!saved) {
      return;
    }
    this.applySaved(saved);
  }

  /** Hydrates from the backend-provided state blob (authenticated users). */
  private applyState(remote: Record<string, unknown>) {
    this.applySaved(this.parseState(remote));
  }

  private applySaved(saved: PersistedState) {
    this.profile.set(saved.profile);
    this.searchCriteria.set(saved.searchCriteria);
    this.searchMode.set(saved.searchMode);
    this.hiddenJobIds.set(saved.hiddenJobIds);
    this.hiddenListingKeys.set(saved.hiddenListingKeys);
    this.jobs.set(saved.jobs.filter((job) => !saved.hiddenJobIds.includes(job.id)));
    this.inbox.set(saved.inbox);
    const openIds = new Set(this.jobs().filter((job) => job.tab === 'action').map((job) => job.id));
    this.pendingApplyIds.set(saved.pendingApplyIds.filter((id) => openIds.has(id)));
  }

  private clearDemoGuestState() {
    if (!this.authApi.isGuest() || this.profile().email !== DEFAULT_PROFILE.email) {
      return;
    }

    this.profile.update((profile) => ({
      ...profile,
      firstName: 'Guest',
      lastName: '',
      email: 'guest@local',
    }));
    this.searchCriteria.set({
      ...DEFAULT_SEARCH_CRITERIA,
      titles: '',
      locations: 'Remote (US)',
    });
    this.jobs.set([]);
    this.inbox.set([]);
    this.pendingApplyIds.set([]);
  }

  private persist() {
    if (!this.browser) {
      return;
    }

    const state: PersistedState = {
      profile: this.profile(),
      searchCriteria: this.searchCriteria(),
      searchMode: this.searchMode(),
      hiddenJobIds: this.hiddenJobIds(),
      hiddenListingKeys: this.hiddenListingKeys(),
      jobs: this.jobs(),
      inbox: this.inbox(),
      pendingApplyIds: this.pendingApplyIds(),
    };

    if (this.authApi.isAuthenticated()) {
      // Logged-in users: state lives server-side, tied to the account, not the browser origin.
      this.authApi.saveState(state as unknown as Record<string, unknown>);
      return;
    }

    const encoded = JSON.stringify(state);
    const key = userStateKey(this.profile().email);
    localStorage.setItem(USER_KEY, userId(this.profile().email));
    localStorage.setItem(key, encoded);
    localStorage.setItem(STORAGE_KEY, encoded);
    localStorage.removeItem(LEGACY_PROFILE_KEY);
  }

  private readState(): PersistedState | null {
    if (!this.browser) {
      return null;
    }

    try {
      const currentUser = localStorage.getItem(USER_KEY);
      const scoped = currentUser ? localStorage.getItem(`${STORAGE_KEY}.${currentUser}`) : null;
      const raw = scoped ?? localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return this.parseState(JSON.parse(raw) as Record<string, unknown>);
      }

      const legacy = localStorage.getItem(LEGACY_PROFILE_KEY);
      if (!legacy) {
        return null;
      }

      const profile = profileFromUnknown(JSON.parse(legacy));
      return profile
        ? {
            profile,
            searchCriteria: {
              ...DEFAULT_SEARCH_CRITERIA,
              workTypes: [...DEFAULT_SEARCH_CRITERIA.workTypes],
            },
            searchMode: 'fast',
            hiddenJobIds: [],
            hiddenListingKeys: [],
            jobs: this.jobs().map((job) => ({ ...job })),
            inbox: this.inbox().map((item) => ({ ...item })),
            pendingApplyIds: [],
          }
        : null;
    } catch {
      return null;
    }
  }

  private parseState(parsed: Record<string, unknown>): PersistedState {
    const hiddenJobIds = stringList(parsed['hiddenJobIds'], []);
    const fallbackJobs = this.jobs().filter((job) => !hiddenJobIds.includes(job.id));
    return {
      profile: profileFromUnknown(parsed['profile']) ?? cloneProfile(DEFAULT_PROFILE),
      searchCriteria: searchCriteriaFromUnknown(parsed['searchCriteria']) ?? {
        ...DEFAULT_SEARCH_CRITERIA,
        workTypes: [...DEFAULT_SEARCH_CRITERIA.workTypes],
      },
      searchMode: searchModeFromUnknown(parsed['searchMode']) ?? 'fast',
      hiddenJobIds,
      hiddenListingKeys: stringList(parsed['hiddenListingKeys'], []),
      jobs: jobsFromUnknown(parsed['jobs'], fallbackJobs),
      inbox: inboxFromUnknown(parsed['inbox'], this.inbox()),
      pendingApplyIds: stringList(parsed['pendingApplyIds'], []),
    };
  }
}
