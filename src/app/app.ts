import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthApi } from './data/auth-api';
import { JobFinderStore } from './data/job-finder-store';
import { Header } from './pages/header/header';

@Component({
  imports: [RouterLink, RouterOutlet, Header],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  protected readonly authApi = inject(AuthApi);
  protected readonly store = inject(JobFinderStore);
  protected readonly title = signal('JobFinder');
  protected readonly profileMenuOpen = signal(false);
  protected readonly isLoginPage = computed(() => this.activeUrl().startsWith('/login'));
  protected readonly activeUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  toggleProfileMenu() {
    this.profileMenuOpen.update((open) => !open);
  }

  closeProfileMenu() {
    this.profileMenuOpen.set(false);
  }

  closeOnboarding() {
    this.authApi.showOnboarding.set(false);
  }

  logout() {
    this.closeProfileMenu();
    this.authApi.logout();
    void this.router.navigateByUrl('/login');
  }

  @HostListener('document:keydown.escape')
  closeProfileMenuOnEscape() {
    this.closeProfileMenu();
  }
}
