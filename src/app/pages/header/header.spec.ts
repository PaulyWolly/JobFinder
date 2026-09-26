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
    fixture.componentRef.setInput('title', 'JobFinder');
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('JobFinder');
    expect(text).toContain('Dashboard');
    expect(text).toContain('Applications');
    expect(text).toContain('How JobFinder Works');
    expect(text).toContain('Profile');

    const brandLink = fixture.nativeElement.querySelector('.brand') as HTMLAnchorElement | null;
    expect(brandLink?.getAttribute('href')).toBe('/dashboard');

    const mark = fixture.nativeElement.querySelector('.brand-mark') as Element | null;
    // mark is now an inline SVG element; assert it's present and is an SVG
    expect(mark).not.toBeNull();
    expect(mark?.tagName.toLowerCase()).toBe('svg');
  });
});
