import { Routes } from '@angular/router';
import { Applications } from './pages/applications/applications';
import { Dashboard } from './pages/dashboard/dashboard';
import { Faq } from './pages/faq/faq';
import { HowItWorks } from './pages/how-it-works/how-it-works';
import { Inbox } from './pages/inbox/inbox';
import { Jobs } from './pages/jobs/jobs';
import { Profile } from './pages/profile/profile';
import { SearchSettings } from './pages/search-settings/search-settings';
import { Support } from './pages/support/support';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', component: Dashboard },
  { path: 'applications', component: Applications },
  { path: 'inbox', component: Inbox },
  { path: 'settings', component: SearchSettings },
  { path: 'profile', component: Profile },
  { path: 'how-it-works', component: HowItWorks },
  { path: 'jobs', component: Jobs },
  { path: 'faq', component: Faq },
  { path: 'support', component: Support },
];
