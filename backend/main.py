from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from jobs import search_jobs

app = FastAPI(title="Job Finder API", version="1.3.3")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        "http://localhost:4201",
        "http://127.0.0.1:4201",
        "http://localhost:4202",
        "http://127.0.0.1:4202",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    titles: str = ""
    experience: str = ""
    skills: str = ""
    locations: str = ""
    salary: str = ""
    workTypes: list[str] = Field(default_factory=list)
    clearance: str = "none"
    mode: str = "fast"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": app.version}


@app.post("/jobs/search")
async def jobs_search(body: SearchRequest) -> dict[str, Any]:
    return await search_jobs(body.model_dump())
