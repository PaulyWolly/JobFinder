import { Component, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { JobFinderStore } from '../../data/job-finder-store';

@Component({
  imports: [RouterLink, RouterLinkActive],
  selector: 'app-header',
  host: {
    style: 'display: flex; flex-direction: column;',
  },
  styleUrl: './header.css',
  templateUrl: './header.html',
})
export class Header {
  readonly title = input('JobFinder');
  readonly showPromo = signal(true);
  protected readonly store = inject(JobFinderStore);

  dismissPromo() {
    this.showPromo.set(false);
  }

}
