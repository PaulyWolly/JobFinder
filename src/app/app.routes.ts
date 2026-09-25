import { Routes } from '@angular/router';
import { Applications } from './pages/applications/applications';
import { Dashboard } from './pages/dashboard/dashboard';
import { Faq } from './pages/faq/faq';
import { HowItWorks } from './pages/how-it-works/how-it-works';
import { Jobs } from './pages/jobs/jobs';
import { Login } from './pages/login/login';
import { Profile } from './pages/profile/profile';
import { SearchSettings } from './pages/search-settings/search-settings';
import { Support } from './pages/support/support';
import { authGuard } from './services/auth-guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'applications', component: Applications, canActivate: [authGuard] },
  { path: 'inbox', redirectTo: 'dashboard' },
  { path: 'settings', component: SearchSettings, canActivate: [authGuard] },
  { path: 'profile', component: Profile, canActivate: [authGuard] },
  { path: 'how-it-works', component: HowItWorks, canActivate: [authGuard] },
  { path: 'jobs', component: Jobs, canActivate: [authGuard] },
  { path: 'faq', component: Faq, canActivate: [authGuard] },
  { path: 'support', component: Support, canActivate: [authGuard] },
];
