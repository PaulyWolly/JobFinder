import { FoundJob } from './job-finder-store';

const NON_US = new RegExp(
  [
    'deutschland',
    'germany',
    'berlin',
    'munich',
    'münchen',
    'hamburg',
    'frankfurt',
    'köln',
    'cologne',
    'amsterdam',
    'netherlands',
    'london',
    'united kingdom',
    '\\buk\\b',
    'india',
    'bangalore',
    'hyderabad',
    'poland',
    'portugal',
    'spain',
    'france',
    'sweden',
    'norway',
    'denmark',
    'austria',
    'switzerland',
    'europe',
    'european',
    'emea',
    'm/f/d',
    'm/w/d',
    '\\bgmbh\\b',
  ].join('|'),
  'i',
);

const US_POSITIVE = new RegExp(
  [
    'united states',
    'u\\.s\\.a?\\.?',
    '\\busa\\b',
    'remote[^\\n]{0,24}\\bus\\b',
    '\\bus\\b[^\\n]{0,16}remote',
    '(?:^|,\\s*)us(?:\\s*$|,)',
    '\\bnorth america\\b',
    '\\bamericas\\b',
    'new york',
    'san francisco',
    'los angeles',
    'seattle',
    'austin',
    'chicago',
    'boston',
    'denver',
    'california',
    'texas',
    'florida',
    'washington',
    'massachusetts',
    'fallbrook',
    ',\\s*(al|ak|az|ar|ca|co|ct|dc|de|fl|ga|hi|ia|id|il|in|ks|ky|la|ma|md|me|mi|mn|mo|ms|mt|nc|nd|ne|nh|nj|nm|nv|ny|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|va|vt|wa|wi|wv|wy)\\b',
  ].join('|'),
  'i',
);

export function isUsJob(job: Pick<FoundJob, 'title' | 'company' | 'location' | 'workType'>) {
  const text = `${job.location} ${job.workType} ${job.title} ${job.company}`;
  if (NON_US.test(text) && !US_POSITIVE.test(job.location)) {
    return false;
  }
  return US_POSITIVE.test(job.location) || US_POSITIVE.test(job.workType);
}
