import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

@Component({
  selector: 'app-page',
  styleUrl: './page.css',
  templateUrl: './page.html',
})
export class Page {
  private readonly route = inject(ActivatedRoute);
  readonly title = toSignal(
    this.route.data.pipe(map((data) => (data['title'] as string) ?? '')),
    { initialValue: '' },
  );
  readonly body = toSignal(
    this.route.data.pipe(map((data) => (data['body'] as string) ?? '')),
    { initialValue: '' },
  );
}
