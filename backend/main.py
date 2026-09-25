from __future__ import annotations

import json
import hashlib
import os
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any

import asyncio

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from db import PasswordResetToken, User, UserState, get_db, init_db
from auth import create_access_token, get_current_user, hash_password, verify_password
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
async def on_startup() -> None:
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


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=32)
    password: str = Field(min_length=8)


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


def _smtp_setting(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _send_password_reset_email(email: str, token: str) -> None:
    host = _smtp_setting("SMTP_HOST")
    port = int(_smtp_setting("SMTP_PORT", "587"))
    username = _smtp_setting("SMTP_USERNAME")
    password = _smtp_setting("SMTP_PASSWORD")
    sender = _smtp_setting("SMTP_FROM", username)
    app_url = _smtp_setting("APP_URL", "http://localhost:4200")
    if not host or not sender:
        raise RuntimeError("SMTP_HOST and SMTP_FROM must be configured")
    message = EmailMessage()
    message["Subject"] = "Reset your JobFinder password"
    message["From"] = sender
    message["To"] = email
    message.set_content(
        f"Reset your JobFinder password here:\n\n"
        f"{app_url}/login?mode=reset&token={token}\n\n"
        "This link expires in 30 minutes and can only be used once."
    )
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.starttls()
        if username:
            smtp.login(username, password)
        smtp.send_message(message)


@app.post("/auth/password-reset/request")
def request_password_reset(body: PasswordResetRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    user = db.query(User).filter(User.email == body.email.strip().lower()).one_or_none()
    if user is not None:
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        # Invalidate existing unused tokens for user
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        ).update({"used_at": datetime.now(timezone.utc)})
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            )
        )
        db.commit()
        try:
            _send_password_reset_email(user.email, raw_token)
        except (OSError, smtplib.SMTPException, ValueError, RuntimeError) as exc:
            db.rollback()
            raise HTTPException(status_code=503, detail="Password reset email is not available") from exc
    return {"message": "If an account exists for that email, a reset link has been sent."}


@app.post("/auth/password-reset/confirm")
def confirm_password_reset(body: PasswordResetConfirm, db: Session = Depends(get_db)) -> dict[str, str]:
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    reset = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == token_hash, PasswordResetToken.used_at.is_(None))
        .one_or_none()
    )
    now = datetime.now(timezone.utc)
    if reset is None or reset.expires_at.replace(tzinfo=timezone.utc) <= now:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or expired")
    user = db.get(User, reset.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or expired")
    user.password_hash = hash_password(body.password)
    reset.used_at = now
    db.commit()
    return {"message": "Password updated. You can now log in."}


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


@app.post("/mail/fetch")
def mail_fetch() -> dict[str, Any]:
    try:
        import mail_poll

        count = mail_poll.fetch_and_import_once()
        return {"imported": count}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
