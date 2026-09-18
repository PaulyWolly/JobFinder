import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Jobs } from './jobs';

describe('Jobs', () => {
  let component: Jobs;
  let fixture: ComponentFixture<Jobs>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Jobs],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Jobs);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('toggles job site filters', () => {
    expect(component.isSourceSelected('Himalayas')).toBe(false);
    component.toggleSource('Himalayas');
    expect(component.isSourceSelected('Himalayas')).toBe(true);
    component.toggleSource('The Muse');
    expect(component.selectedSources()).toEqual(['Himalayas', 'The Muse']);
    component.clearFilters();
    expect(component.selectedSources()).toEqual([]);
  });
});
