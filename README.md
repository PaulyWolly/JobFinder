# Job Finder

Angular 22 app that searches US job boards (Remotive, Himalayas, The Muse, Remote OK, Jobicy, and JSearch) and tracks applications locally.

## Run locally

Install frontend dependencies, then start the Angular app and FastAPI backend together:

```bash
npm install
cd backend && pip install -r requirements.txt && cd ..
npm run start:all
```

- App: http://localhost:4200
- API: http://127.0.0.1:8000/api/jobs

JSearch is optional. Copy `backend/.env.example` to `backend/.env` and add a RapidAPI key if you want those extra listings. Do not commit `backend/.env`.
