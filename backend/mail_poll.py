from __future__ import annotations

import asyncio
import email
import json
import os
import time
from datetime import datetime, timezone
from email.policy import default
from typing import Any
import imaplib

from db import SessionLocal, User, UserState
from jobs import load_dotenv


def _env_setting(*names: str, default: str = "") -> str:
    for name in names:
        val = os.environ.get(name)
        if val:
            return val.strip()
    return default


def _format_date(dt: datetime) -> tuple[str, str]:
    # returns (date, time)
    local = dt.astimezone() if dt.tzinfo else dt.replace(tzinfo=timezone.utc).astimezone()
    return local.strftime("%m-%d-%Y"), local.strftime("%-I:%M %p")


def _parse_message(raw: bytes) -> dict[str, Any] | None:
    try:
        msg = email.message_from_bytes(raw, policy=default)
        msg_id = msg.get('Message-ID') or msg.get('Message-Id')
        msg_id = (msg_id or '').strip()
        subj = (msg.get('Subject') or '').strip()
        sender = (msg.get('From') or '').strip()
        date_hdr = msg.get('Date') or ''
        try:
            dt = email.utils.parsedate_to_datetime(date_hdr) if date_hdr else datetime.now(timezone.utc)
        except Exception:
            dt = datetime.now(timezone.utc)
        date_s, time_s = _format_date(dt)
        category = subj or 'Application message'
        return {'id': msg_id or str(time.time_ns()), 'date': date_s, 'time': time_s, 'from': sender, 'category': category}
    except Exception:
        return None


def _add_inbox_items_for_user(db, user: User, items: list[dict[str, Any]]) -> None:
    # Load existing state JSON, merge inbox items (avoid dupes), and persist.
    state_row = user.state
    if state_row is None:
        state_obj: dict[str, Any] = {
            'profile': {},
            'searchCriteria': {},
            'searchMode': 'fast',
            'hiddenJobIds': [],
            'hiddenListingKeys': [],
            'jobs': [],
            'inbox': [],
            'pendingApplyIds': [],
        }
        state_row = UserState(user_id=user.id, state_json=json.dumps(state_obj))
        db.add(state_row)
        db.commit()
        db.refresh(state_row)

    try:
        state = json.loads(state_row.state_json or '{}')
    except Exception:
        state = {}

    inbox = state.get('inbox') if isinstance(state.get('inbox'), list) else []
    existing_ids = {item.get('id') for item in inbox if isinstance(item, dict) and item.get('id')}
    added = False
    for item in items:
        if item.get('id') not in existing_ids:
            inbox.insert(0, item)
            existing_ids.add(item.get('id'))
            added = True

    if added:
        state['inbox'] = inbox
        state_row.state_json = json.dumps(state)
        db.add(state_row)
        db.commit()


def _fetch_unseen(imap_host: str, imap_port: int, username: str, password: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    M = imaplib.IMAP4_SSL(imap_host, imap_port)
    try:
        M.login(username, password)
        M.select('INBOX')
        try:
            typ, data = M.search(None, 'UNSEEN')
        except imaplib.IMAP4.error as exc:
            msg = str(exc)
            # Some IMAP servers refuse SEARCH when the result would be very large.
            # Fall back to a recent SINCE window (last 7 days) to limit the result set.
            if 'got more than' in msg or 'more than' in msg:
                try:
                    from datetime import datetime, timedelta

                    since = (datetime.now() - timedelta(days=7)).strftime('%d-%b-%Y')
                    typ, data = M.search(None, 'UNSEEN', 'SINCE', since)
                except Exception:
                    return []
            else:
                return []
        if typ != 'OK':
            return []
        for num in data[0].split():
            try:
                typ, msg_data = M.fetch(num, '(RFC822)')
                if typ != 'OK' or not msg_data or not isinstance(msg_data[0], tuple):
                    continue
                raw = msg_data[0][1]
                parsed = _parse_message(raw)
                if parsed:
                    items.append(parsed)
            except Exception:
                continue
        return items
    finally:
        try:
            M.close()
        except Exception:
            pass
        try:
            M.logout()
        except Exception:
            pass


async def run_poll_loop() -> None:
    load_dotenv()
    imap_host = _env_setting('IMAP_HOST') or (_env_setting('SMTP_HOST').replace('smtp.', 'imap.') if _env_setting('SMTP_HOST') else 'imap.gmail.com')
    imap_port = int(_env_setting('IMAP_PORT') or '993')
    username = _env_setting('IMAP_USERNAME', 'SMTP_USERNAME')
    password = _env_setting('IMAP_PASSWORD', 'SMTP_PASSWORD')
    interval = int(_env_setting('MAIL_POLL_INTERVAL') or '60')

    if not username or not password:
        print('Mail poller skipped: IMAP/SMTP credentials missing', flush=True)
        return

    print(f'Mail poller starting for {username} (host={imap_host}) interval={interval}s', flush=True)
    while True:
        try:
            items = await asyncio.to_thread(_fetch_unseen, imap_host, imap_port, username, password)
            if items:
                db = SessionLocal()
                try:
                    user = db.query(User).filter(User.email == username.lower()).one_or_none()
                    if user:
                        _add_inbox_items_for_user(db, user, items)
                    else:
                        # No matching user; do nothing.
                        pass
                finally:
                    db.close()
        except Exception as exc:
            print(f'Mail poller error: {exc}', flush=True)
        await asyncio.sleep(interval)


def fetch_and_import_once() -> int:
    """Synchronous helper: fetch unseen messages and import them for the configured user.

    Returns the number of items imported.
    """
    load_dotenv()
    imap_host = _env_setting('IMAP_HOST') or (_env_setting('SMTP_HOST').replace('smtp.', 'imap.') if _env_setting('SMTP_HOST') else 'imap.gmail.com')
    imap_port = int(_env_setting('IMAP_PORT') or '993')
    username = _env_setting('IMAP_USERNAME', 'SMTP_USERNAME')
    password = _env_setting('IMAP_PASSWORD', 'SMTP_PASSWORD')

    if not username or not password:
        raise RuntimeError('IMAP/SMTP credentials missing')

    items = _fetch_unseen(imap_host, imap_port, username, password)
    if not items:
        return 0

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == username.lower()).one_or_none()
        if not user:
            return 0
        before = 0
        try:
            state_row = user.state
            if state_row and state_row.state_json:
                data = json.loads(state_row.state_json)
                before = len(data.get('inbox') or [])
        except Exception:
            before = 0
        _add_inbox_items_for_user(db, user, items)
        after = 0
        try:
            state_row = user.state
            if state_row and state_row.state_json:
                data = json.loads(state_row.state_json)
                after = len(data.get('inbox') or [])
        except Exception:
            after = before
        return max(0, after - before)
    finally:
        db.close()
