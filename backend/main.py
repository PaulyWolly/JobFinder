from __future__ import annotations

import json
from typing import Any

import os
import asyncio

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from auth import create_access_token, get_current_user, hash_password, verify_password
from db import User, UserState, get_db, init_db
from jobs import search_jobs

app = FastAPI(title="Job Finder API", version="1.4.0")
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


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    # Start mail poller only when explicitly enabled via env var.
    enabled = os.environ.get('MAIL_POLL_ENABLED', 'false').lower() in ('1', 'true', 'yes')
    if enabled:
        try:
            import mail_poll

            # Schedule background task; mail_poll.run_poll_loop is async
            try:
                asyncio.create_task(mail_poll.run_poll_loop())
            except RuntimeError:
                # If there's no running loop (unlikely under uvicorn), skip starting.
                print('Mail poller not started: event loop unavailable', flush=True)
        except Exception as exc:
            print(f'Failed to initialize mail poller: {exc}', flush=True)


class SearchRequest(BaseModel):
    titles: str = ""
    experience: str = ""
    skills: str = ""
    locations: str = ""
    salary: str = ""
    workTypes: list[str] = Field(default_factory=list)
    clearance: str = "none"
    mode: str = "fast"
    force: bool = False


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    email: str
    state: dict[str, Any] | None = None


def _state_dict(user: User, db: Session) -> dict[str, Any] | None:
    state = db.query(UserState).filter(UserState.user_id == user.id).one_or_none()
    if state is None:
        return None
    try:
        return json.loads(state.state_json)
    except ValueError:
        return None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": app.version}


@app.post("/auth/signup", response_model=AuthResponse)
def signup(body: SignupRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = body.email.strip().lower()
    existing = db.query(User).filter(User.email == email).one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists")
    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, user.email)
    return AuthResponse(token=token, email=user.email, state=None)


@app.post("/auth/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    token = create_access_token(user.id, user.email)
    return AuthResponse(token=token, email=user.email, state=_state_dict(user, db))


@app.get("/auth/me", response_model=AuthResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> AuthResponse:
    return AuthResponse(token="", email=user.email, state=_state_dict(user, db))


@app.get("/state")
def get_state(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    return {"state": _state_dict(user, db)}


@app.put("/state")
def put_state(
    body: dict[str, Any],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    encoded = json.dumps(body)
    row = db.query(UserState).filter(UserState.user_id == user.id).one_or_none()
    if row is None:
        row = UserState(user_id=user.id, state_json=encoded)
        db.add(row)
    else:
        row.state_json = encoded
    db.commit()
    return {"status": "ok"}


@app.post("/jobs/search")
async def jobs_search(body: SearchRequest) -> dict[str, Any]:
    return await search_jobs(body.model_dump())

