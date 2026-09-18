You are working in an Angular 22 app that uses the 2025 style guide.

## Naming (required)

Do not use the old type suffixes. Match existing files such as `src/app/pages/header/header.ts`.

| Kind | Class | File | Import |
|---|---|---|---|
| Component | `Header` | `header.ts` | `import { Header } from './header'` |
| Not this | `HeaderComponent` | `header.component.ts` | `from './header.component'` |
| Service | `@Service()` class `JobsApi` | `jobs-api.ts` | not `JobsApiService` / `jobs.service.ts` |
| Pipe | `DatePipe` is an exception | `date-pipe.ts` | keep `Pipe` in the class name |

- Templates/styles share the same base name: `header.html`, `header.css`
- Selectors stay `app-header`; the class is still `Header`
- Put used components in the standalone `imports` array: `imports: [Header]`

## Other Angular 22 defaults

- Standalone components; do not set `standalone: true`
- Do not set `changeDetection: OnPush` (it is the default)
- Signals, `input()`, `output()`, `computed()`, `inject()`
- Native control flow: `@if`, `@for`, `@switch`
- New forms: Signal Forms (`form()`, `[formField]`)
