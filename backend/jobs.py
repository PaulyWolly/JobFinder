from __future__ import annotations

import asyncio
import html
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

import httpx

HEADERS = {
    "User-Agent": "JobFinder/1.0 (personal job search)",
    "Accept": "application/json",
}

TAG = re.compile(r"<[^>]+>")
_ENV_LOADED = False


def load_dotenv() -> None:
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    _ENV_LOADED = True
    path = Path(__file__).resolve().parent / ".env"
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def tokens(*parts: str) -> list[str]:
    words: list[str] = []
    for part in parts:
        for raw in re.split(r"[,/·|]+", part):
            piece = raw.strip().lower()
            if len(piece) >= 2 and piece not in words:
                words.append(piece)
    extras: list[str] = []
    for word in words:
        for token in word.split():
            if len(token) >= 3 and token not in words and token not in extras:
                extras.append(token)
    return words + extras


def clean_text(value: Any) -> str:
    text = html.unescape(TAG.sub(" ", str(value or "")))
    return re.sub(r"\s+", " ", text).strip()


def format_date(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "Date unknown"
    if raw.isdigit():
        try:
            stamp = int(raw)
            if stamp > 10_000_000_000:
                stamp //= 1000
            return datetime.fromtimestamp(stamp).strftime("%b %d, %Y")
        except (ValueError, OSError):
            return raw[:12]
    stamp = raw[:19].replace("Z", "")
    for fmt, size in (("%Y-%m-%dT%H:%M:%S", 19), ("%Y-%m-%d", 10)):
        try:
            return datetime.strptime(stamp[:size], fmt).strftime("%b %d, %Y")
        except ValueError:
            continue
    return raw[:12]


GENERIC_TITLE_TERMS = {
    "developer",
    "engineer",
    "engineering",
    "principal",
    "senior",
    "software",
    "staff",
}

STACKS = {
    "angular": re.compile(r"\b(angular|ngrx)\b", re.I),
    "react": re.compile(r"\breact(\s*native|\.js)?\b|\bnext\.?js\b", re.I),
    "vue": re.compile(r"\bvue(\.js)?\b|\bnuxt\b", re.I),
    "svelte": re.compile(r"\bsvelte\b", re.I),
}


def as_job(
    *,
    job_id: str,
    title: str,
    company: str,
    published: Any,
    work_type: str,
    location: str,
    salary: str,
    source: str,
    url: str,
    snippet: str,
    rank_text: str = "",
) -> dict[str, Any] | None:
    title = clean_text(title)
    company = clean_text(company) or "Company hidden"
    if not title or not url:
        return None
    return {
        "id": job_id,
        "title": title,
        "company": company,
        "published": format_date(published),
        "workType": clean_text(work_type) or "Not specified",
        "location": clean_text(location) or "Location not listed",
        "salary": clean_text(salary) or "Not listed",
        "source": source,
        "url": url,
        "snippet": clean_text(snippet)[:220],
        "match": 0,
        "_rank": clean_text(rank_text),
    }


def wanted_stacks(terms: list[str]) -> set[str]:
    blob = " ".join(terms)
    return {name for name, pattern in STACKS.items() if pattern.search(blob)}


def score_job(
    job: dict[str, Any],
    title_terms: list[str],
    skill_terms: list[str],
    location_terms: list[str],
    want_remote: bool,
    mode: str = "fast",
) -> int:
    haystack = (
        f"{job['title']} {job['company']} {job['location']} {job['workType']} "
        f"{job['snippet']} {job.get('_rank', '')}"
    ).lower()
    title = job["title"].lower()
    points = 24
    for term in title_terms[:6]:
        if term in GENERIC_TITLE_TERMS:
            if term in title:
                points += 3
            continue
        if term in title:
            points += 12
        elif term in haystack:
            points += 5
    skill_hits = 0
    for term in skill_terms[:8]:
        if len(term) < 3:
            continue
        if term in haystack:
            skill_hits += 1
            points += 8
    if want_remote and "remote" in job["location"].lower():
        points += 8
    for term in location_terms[:5]:
        if term in job["location"].lower():
            points += 6

    wanted = wanted_stacks([*skill_terms, *title_terms])
    present = {name for name, pattern in STACKS.items() if pattern.search(haystack)}
    if wanted and not (wanted & present):
        points -= 18
        if present - wanted:
            points -= 16

    score = max(18, min(points, 99))
    if skill_hits == 0:
        score = min(score, 52 if mode == "fast" else 38)
    return score


NON_US = re.compile(
    r"deutschland|germany|berlin|munich|münchen|hamburg|frankfurt|köln|cologne|"
    r"amsterdam|netherlands|london|united kingdom|\buk\b|india|bangalore|"
    r"hyderabad|poland|portugal|spain|france|sweden|norway|denmark|austria|"
    r"switzerland|europe|european|emea|m/f/d|m/w/d|\bgmbh\b",
    re.I,
)
US_POSITIVE = re.compile(
    r"united states|u\.s\.a?\.?|\busa\b|remote[^\n]{0,24}\bus\b|\bus\b[^\n]{0,16}remote|"
    r"(?:^|,\s*)us(?:\s*$|,)|"
    r"\bnorth america\b|\bamericas\b|new york|san francisco|los angeles|seattle|"
    r"austin|chicago|boston|denver|california|texas|florida|washington|"
    r"massachusetts|fallbrook|"
    r",\s*(?:AL|AK|AZ|AR|CA|CO|CT|DC|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|"
    r"MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b",
    re.I,
)
WANT_US = re.compile(r"\b(us|usa|u\.s\.a?\.?|united states)\b", re.I)


def is_us_job(job: dict[str, Any]) -> bool:
    location = str(job.get("location") or "")
    work_type = str(job.get("workType") or "")
    text = f"{location} {work_type} {job.get('title')} {job.get('company')}"
    if NON_US.search(text) and not US_POSITIVE.search(location):
        return False
    return bool(US_POSITIVE.search(location) or US_POSITIVE.search(work_type))


def search_queries(titles: str, skills: str) -> list[str]:
    queries: list[str] = []
    primary = titles.split(",")[0].strip()
    if primary:
        queries.append(primary)
    blob = f"{titles} {skills}".lower()
    for extra in ("angular", "frontend"):
        if extra in blob and extra not in primary.lower():
            queries.append(extra)
    return queries or ["software engineer"]


async def fetch_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
) -> Any:
    try:
        response = await client.get(url, headers={**HEADERS, **(headers or {})}, params=params, timeout=18.0)
        response.raise_for_status()
        return response.json()
    except Exception:
        return {}


async def load_remotive(client: httpx.AsyncClient, query: str) -> list[dict[str, Any]]:
    payload = await fetch_json(client, f"https://remotive.com/api/remote-jobs?search={quote_plus(query)}")
    jobs: list[dict[str, Any]] = []
    for item in payload.get("jobs", []) if isinstance(payload, dict) else []:
        job = as_job(
            job_id=f"remotive-{item.get('id')}",
            title=item.get("title", ""),
            company=item.get("company_name", ""),
            published=item.get("publication_date", ""),
            work_type=item.get("job_type", "Remote"),
            location=item.get("candidate_required_location", "Remote"),
            salary=item.get("salary", ""),
            source="Remotive",
            url=item.get("url", ""),
            snippet=item.get("description", ""),
        )
        if job:
            jobs.append(job)
    return jobs


async def load_arbeitnow(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    seen: set[str] = set()
    page = 1
    while True:
        payload = await fetch_json(client, f"https://www.arbeitnow.com/api/job-board-api?page={page}")
        items = payload.get("data", []) if isinstance(payload, dict) else []
        if not items:
            break
        added = 0
        for item in items:
            slug = str(item.get("slug") or "")
            if slug in seen:
                continue
            seen.add(slug)
            job_types = item.get("job_types") or []
            job = as_job(
                job_id=f"arbeitnow-{slug}",
                title=item.get("title", ""),
                company=item.get("company_name", ""),
                published=item.get("created_at", ""),
                work_type=", ".join(job_types) if job_types else ("Remote" if item.get("remote") else "Not specified"),
                location="Remote" if item.get("remote") else item.get("location", ""),
                salary="",
                source="Arbeitnow",
                url=item.get("url", ""),
                snippet=item.get("description", ""),
            )
            if job:
                jobs.append(job)
                added += 1
        links = payload.get("links") if isinstance(payload, dict) else {}
        if added == 0 or (isinstance(links, dict) and not links.get("next")):
            break
        page += 1
    return jobs


async def load_muse(client: httpx.AsyncClient, query: str, want_us: bool) -> list[dict[str, Any]]:
    location = "&location=United%20States" if want_us else ""

    def url_for(page: int) -> str:
        return (
            "https://www.themuse.com/api/public/jobs"
            f"?page={page}&descending=true&category=Software%20Engineering{location}"
        )

    first = await fetch_json(client, url_for(0))
    page_count = int(first.get("page_count") or 1) if isinstance(first, dict) else 1
    payloads: list[Any] = [first]
    extra_pages = list(range(1, page_count))
    for start in range(0, len(extra_pages), 8):
        batch = extra_pages[start : start + 8]
        payloads.extend(
            await asyncio.gather(*[fetch_json(client, url_for(page)) for page in batch], return_exceptions=True)
        )
    jobs: list[dict[str, Any]] = []
    q = query.lower()
    for payload in payloads:
        if not isinstance(payload, dict):
            continue
        for item in payload.get("results", []):
            locations = ", ".join(loc.get("name", "") for loc in item.get("locations", []) if loc.get("name"))
            company = (item.get("company") or {}).get("name", "")
            title = item.get("name", "")
            blob = f"{title} {company} {locations}".lower()
            if q and q not in blob and not any(term in blob for term in q.split() if len(term) > 3):
                continue
            refs = item.get("refs") or {}
            job = as_job(
                job_id=f"muse-{item.get('id')}",
                title=title,
                company=company,
                published=item.get("publication_date", ""),
                work_type=(
                    ", ".join(item["type"])
                    if isinstance(item.get("type"), list)
                    else str(item.get("type") or "Not specified")
                ),
                location=locations or "Not listed",
                salary="",
                source="The Muse",
                url=refs.get("landing_page", ""),
                snippet=item.get("contents", ""),
            )
            if job:
                jobs.append(job)
    return jobs


async def load_jobicy(client: httpx.AsyncClient, want_us: bool) -> list[dict[str, Any]]:
    geo = "&geo=usa" if want_us else ""
    payload = await fetch_json(client, f"https://jobicy.com/api/v2/remote-jobs?count=1000{geo}")
    jobs: list[dict[str, Any]] = []
    for item in payload.get("jobs", []) if isinstance(payload, dict) else []:
        salary_bits = [item.get("salaryMin"), item.get("salaryMax"), item.get("salaryCurrency")]
        salary = " ".join(str(bit) for bit in salary_bits if bit)
        job = as_job(
            job_id=f"jobicy-{item.get('id')}",
            title=item.get("jobTitle", ""),
            company=item.get("companyName", ""),
            published=item.get("pubDate", ""),
            work_type=item.get("jobType", "Remote"),
            location=item.get("jobGeo", "Remote"),
            salary=salary,
            source="Jobicy",
            url=item.get("url", ""),
            snippet=item.get("jobExcerpt") or item.get("jobDescription", ""),
        )
        if job:
            jobs.append(job)
    return jobs


async def load_remoteok(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    payload = await fetch_json(client, "https://remoteok.com/api")
    jobs: list[dict[str, Any]] = []
    items = payload if isinstance(payload, list) else []
    for item in items:
        if not isinstance(item, dict) or not item.get("position"):
            continue
        job_id = item.get("id") or item.get("slug")
        url = item.get("url") or item.get("apply_url") or ""
        job = as_job(
            job_id=f"remoteok-{job_id}",
            title=item.get("position", ""),
            company=item.get("company", ""),
            published=item.get("date") or item.get("epoch"),
            work_type="Remote",
            location=item.get("location", "Remote"),
            salary=str(item.get("salary_max") or item.get("salary_min") or ""),
            source="Remote OK",
            url=url,
            snippet=" ".join(item.get("tags") or []),
        )
        if job:
            jobs.append(job)
    return jobs


async def load_himalayas(client: httpx.AsyncClient, query: str, want_us: bool) -> list[dict[str, Any]]:
    country = "&country=US" if want_us else ""
    jobs: list[dict[str, Any]] = []
    seen: set[str] = set()
    page = 1
    while True:
        payload = await fetch_json(
            client,
            f"https://himalayas.app/jobs/api/search?q={quote_plus(query)}&sort=recent&page={page}{country}",
        )
        items = payload.get("jobs", []) if isinstance(payload, dict) else []
        if not items:
            break
        added = 0
        for item in items:
            restrictions = item.get("locationRestrictions") or []
            if isinstance(restrictions, list):
                location = ", ".join(str(value) for value in restrictions if value) or (
                    "Remote (US)" if want_us else "Remote"
                )
            else:
                location = str(restrictions) or ("Remote (US)" if want_us else "Remote")
            salary_bits = [item.get("minSalary"), item.get("maxSalary"), item.get("currency")]
            salary = " ".join(str(bit) for bit in salary_bits if bit)
            categories = " ".join(str(value) for value in (item.get("categories") or []) if value)
            job = as_job(
                job_id=f"himalayas-{item.get('guid') or item.get('applicationLink')}",
                title=item.get("title", ""),
                company=item.get("companyName", ""),
                published=item.get("pubDate", ""),
                work_type=item.get("employmentType") or "Remote",
                location=location,
                salary=salary,
                source="Himalayas",
                url=item.get("applicationLink") or "",
                snippet=item.get("excerpt") or "",
                rank_text=f"{categories} {item.get('description') or ''}"[:1200],
            )
            if job:
                job_key = str(item.get("guid") or item.get("applicationLink") or job["id"])
                if job_key in seen:
                    continue
                seen.add(job_key)
                jobs.append(job)
                added += 1
        total = payload.get("totalCount") if isinstance(payload, dict) else None
        if added == 0 or (total is not None and len(jobs) >= int(total)):
            break
        page += 1
    return jobs


def jsearch_query(titles: str, skills: str, locations: str, want_us: bool, want_remote: bool) -> str:
    title = titles.split(",")[0].strip() or "software engineer"
    parts = [title]
    blob = f"{titles} {skills}".lower()
    if "angular" in blob and "angular" not in title.lower():
        parts.append("Angular")
    if want_remote:
        parts.append("remote")
    if want_us:
        parts.append("in United States")
    else:
        place = locations.split("·")[0].strip()
        if place and "remote" not in place.lower():
            parts.append(f"in {place}")
    return " ".join(parts)


def jsearch_items(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    data = payload.get("data")
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict) and isinstance(data.get("jobs"), list):
        return [item for item in data["jobs"] if isinstance(item, dict)]
    if isinstance(payload.get("jobs"), list):
        return [item for item in payload["jobs"] if isinstance(item, dict)]
    return []


async def load_jsearch(
    client: httpx.AsyncClient,
    query: str,
    *,
    want_us: bool,
    want_remote: bool,
) -> list[dict[str, Any]]:
    load_dotenv()
    key = os.environ.get("RAPIDAPI_KEY", "").strip()
    if not key:
        print("JSearch skipped: RAPIDAPI_KEY missing", flush=True)
        return []
    params = {
        "query": query,
        "num_pages": "1",
        "date_posted": "month",
    }
    if want_us:
        params["country"] = "us"
    if want_remote:
        params["work_from_home"] = "true"
    try:
        response = await client.get(
            "https://jsearch.p.rapidapi.com/search-v2",
            headers={
                **HEADERS,
                "x-rapidapi-key": key,
                "x-rapidapi-host": "jsearch.p.rapidapi.com",
            },
            params=params,
            timeout=18.0,
        )
        if response.status_code >= 400:
            print(f"JSearch HTTP {response.status_code}: {response.text[:180]}", flush=True)
            return []
        payload = response.json()
    except Exception as exc:
        print(f"JSearch failed: {exc}", flush=True)
        return []
    items = jsearch_items(payload)
    print(f"JSearch query={query!r} jobs={len(items)}", flush=True)
    jobs: list[dict[str, Any]] = []
    for item in items:
        country = str(item.get("job_country") or "")
        remote = bool(item.get("job_is_remote"))
        location = clean_text(item.get("job_location") or "")
        if not location:
            location = ", ".join(
                str(part)
                for part in (item.get("job_city"), item.get("job_state"), country)
                if part
            )
        if remote:
            location = "Remote (US)" if want_us or country.upper() == "US" else "Remote"
        elif country.upper() == "US" and "united states" not in location.lower():
            location = f"{location}, United States".strip(", ")
        salary_bits = [
            item.get("job_min_salary"),
            item.get("job_max_salary"),
            item.get("job_salary_currency"),
            item.get("job_salary_period"),
        ]
        work_type = str(item.get("job_employment_type") or "Not specified").replace("_", "-").title()
        if remote:
            work_type = f"{work_type} · Remote"
        publisher = clean_text(item.get("job_publisher") or "") or "JSearch"
        apply_url = item.get("job_apply_link") or item.get("job_google_link") or ""
        job = as_job(
            job_id=f"jsearch-{item.get('job_id')}",
            title=item.get("job_title", ""),
            company=item.get("employer_name", ""),
            published=item.get("job_posted_at_datetime_utc") or item.get("job_posted_at_timestamp"),
            work_type=work_type,
            location=location,
            salary=" ".join(str(bit) for bit in salary_bits if bit not in (None, "")),
            source=publisher,
            url=apply_url,
            snippet=item.get("job_description", ""),
            rank_text=item.get("job_description", ""),
        )
        if job:
            jobs.append(job)
    return jobs


async def search_jobs(payload: dict[str, Any]) -> dict[str, Any]:
    titles = str(payload.get("titles") or "")
    skills = str(payload.get("skills") or "")
    locations = str(payload.get("locations") or "")
    work_types = [str(item) for item in payload.get("workTypes") or []]
    mode = str(payload.get("mode") or "fast")
    queries = search_queries(titles, skills)
    query = queries[0]
    title_terms = tokens(titles)
    skill_terms = tokens(skills)
    location_terms = tokens(locations)
    want_remote = any("remote" in value.lower() for value in [*work_types, locations])
    want_us = bool(WANT_US.search(locations))

    async with httpx.AsyncClient(follow_redirects=True) as client:
        tasks = [
            *[load_remotive(client, item) for item in queries],
            *[load_himalayas(client, item, want_us) for item in queries],
            load_muse(client, query, want_us),
            load_remoteok(client),
            load_jobicy(client, want_us),
            load_jsearch(
                client,
                jsearch_query(titles, skills, locations, want_us, want_remote),
                want_us=want_us,
                want_remote=want_remote,
            ),
        ]
        if not want_us:
            tasks.append(load_arbeitnow(client))
        results = await asyncio.gather(*tasks, return_exceptions=True)

    merged: dict[str, dict[str, Any]] = {}
    for result in results:
        if isinstance(result, BaseException):
            continue
        for job in result:
            if want_us and not is_us_job(job):
                continue
            key = f"{job['title'].lower()}|{job['company'].lower()}"
            merged.setdefault(key, job)

    ranked: list[dict[str, Any]] = []
    for job in merged.values():
        match = score_job(job, title_terms, skill_terms, location_terms, want_remote, mode)
        if want_us and is_us_job(job):
            match = min(99, match + 6)
        job.pop("_rank", None)
        if mode == "selective" and match < 70:
            continue
        job["match"] = match
        ranked.append(job)
    ranked.sort(key=lambda job: job["match"], reverse=True)
    source_counts: dict[str, int] = {}
    for job in ranked:
        source_counts[job["source"]] = source_counts.get(job["source"], 0) + 1
    return {
        "jobs": ranked,
        "sources": [{"name": name, "count": count} for name, count in source_counts.items()],
    }
