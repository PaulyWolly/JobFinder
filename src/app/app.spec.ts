import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { AuthApi } from './data/auth-api';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should redirect the root route to login', () => {
    expect(routes.find((route) => route.path === '')?.redirectTo).toBe('login');
  });

  it('should hide the sidebar until a user is signed in', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const sidebar = compiled.querySelector('app-header');

    expect(sidebar).toBeNull();
  });

  it('should render the sidebar for a guest session', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(AuthApi).continueAsGuest();
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const sidebar = compiled.querySelector('app-header');

    expect(sidebar).toBeTruthy();
    expect(sidebar?.textContent).toContain('JobFinder');
    expect(sidebar?.textContent).toContain('Dashboard');
  });
});
