import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  selector: 'app-faq',
  styleUrl: './faq.css',
  templateUrl: './faq.html',
})
export class Faq {
  readonly items = [
    {
      question: 'Where do the jobs come from?',
      answer:
        '<span class="brand-inline">Job<em>Finder</em></span> searches live boards in one pass: Himalayas, The Muse, Jobicy, Remotive, Remote OK, and JSearch publishers such as ZipRecruiter and Glassdoor. Listings are not scraped from Indeed or LinkedIn directly.',
    },
    {
      question: 'Does <span class="brand-inline">Job<em>Finder</em></span> apply for me?',
      answer:
        'No. Save a role to Applications, then click Apply to open the employer or board page. You submit there. When you return, <span class="brand-inline">Job<em>Finder</em></span> asks if you applied so the Applied tab and counts stay accurate.',
    },
    {
      question: 'What is the difference between Remove and Return to Jobs?',
      answer:
        'Return to Jobs sends a role back to the Jobs list so you can save it later. Remove on Jobs hides that listing for good. Applied roles also stay off Jobs after Refresh, even if the board sends a new listing ID.',
    },
    {
      question: 'Why do I only see Himalayas?',
      answer:
        'A site chip, plus Remote, Full-time, or US, can hide every other board. Click Clear or Refresh on Jobs, then turn filters on one at a time. Himalayas returns the most US remote roles, so it often looks like the only source until you clear filters.',
    },
    {
      question: 'Why did Refresh bring back a job I already applied to?',
      answer:
        '<span class="brand-inline">Job<em>Finder</em></span> now remembers applied roles by title and company as well as ID. Confirm Yes, I applied after you submit. Those roles stay on the Applied tab and are kept off Jobs on the next Refresh.',
    },
    {
      question: 'Search Settings vs the chips on Jobs?',
      answer:
        'Search Settings drive the live API query (titles, skills, location, work type). The chips on Jobs only narrow what is already loaded. Changing Search Settings, then Refresh, loads a new result set.',
    },
    {
      question: 'Where is my data stored?',
      answer:
        'For registered accounts, your profile, search settings, applications, hidden listings, and any resume information you upload are stored in the local SQLite database on the <span class="brand-inline">Job<em>Finder</em></span> API, in a separate state record linked to your account. Guest sessions are local-only and use browser storage; Guests may save up to 10 jobs but must create an account before applying. <span class="brand-inline">Job<em>Finder</em></span> does not submit applications for you.',
    },
    {
      question: 'Jobs says it cannot reach the API.',
      answer:
        'The Angular app talks to a local API at 127.0.0.1:8000. Start both with npm run start:all from the project folder. If only the web app is running, Jobs cannot load listings.',
    },
  ] as const;
}
