import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Header } from './header';

describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Header);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show the app title and primary links', async () => {
    fixture.componentRef.setInput('title', 'Job Finder');
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Job Finder');
    expect(text).toContain('Dashboard');
    expect(text).toContain('Applications');
    expect(text).toContain('How Job Finder Works');
    expect(text).toContain('Profile');

    const mark = fixture.nativeElement.querySelector('.brand-mark') as HTMLImageElement | null;
    expect(mark?.getAttribute('src')).toBe('job-search-blue.svg?v=2');
  });
});
