Mail poller
-----------

This directory includes an optional IMAP mail poller that can import unseen application-related
messages into a user's inbox state. The poller is disabled by default; enable it only after
verifying with a test account.

Quick safe enablement steps

- Add values to your `backend/.env` (copy `backend/.env.example`) and set:

```
MAIL_POLL_ENABLED=true
IMAP_USERNAME=you@example.com
IMAP_PASSWORD=yourpassword
MAIL_POLL_INTERVAL=60
```

- Start the backend and watch logs for the line "Mail poller starting...". If credentials are
  missing or invalid, the poller will skip start and print a reason.

Dry-run / local test without contacting an IMAP server

You can simulate a safe fetch without enabling the background loop by running a small
one-off script that monkeypatches `imaplib.IMAP4_SSL` (no network required):

```
python - <<'PY'
import imaplib
class Dummy:
    def __init__(*a, **k): pass
    def login(self,u,p): return ('OK', None)
    def select(self,n): return ('OK', None)
    def search(self,*a): return ('OK', [b''])
    def fetch(self,*a): return ('OK', [])
    def close(self): pass
    def logout(self): pass
imaplib.IMAP4_SSL = Dummy
import os
os.environ['IMAP_USERNAME'] = 'dummy@example.com'
os.environ['IMAP_PASSWORD'] = 'dummy'
from backend.mail_poll import fetch_and_import_once
print('imported:', fetch_and_import_once())
PY
```

Testing

Run the unit tests for the mail poller (uses the standard library `unittest`):

```
python -m unittest discover backend/tests
```

If you'd like, I can add CI steps to run these tests automatically.
