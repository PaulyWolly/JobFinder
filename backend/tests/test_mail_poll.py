import os
import sys
import pathlib
import unittest

# Ensure backend/ is on sys.path so imports like `from db import ...` resolve when running
# tests from project root
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


class DummyIMAP:
    def __init__(self, *a, **k):
        pass

    def login(self, u, p):
        return ('OK', None)

    def select(self, mailbox):
        return ('OK', None)

    def search(self, *args):
        return ('OK', [b''])

    def fetch(self, *a, **k):
        return ('OK', [])

    def close(self):
        pass

    def logout(self):
        pass


class FakeQuery:
    def filter(self, *_a, **_k):
        return self

    def one_or_none(self):
        return None


class FakeDB:
    def query(self, _):
        return FakeQuery()

    def close(self):
        pass


class MailPollTests(unittest.TestCase):
    def test_fetch_without_credentials_raises(self):
        # Ensure missing credentials raise RuntimeError.
        # Set empty values so load_dotenv() does not override them (load_dotenv uses setdefault).
        # Also clear SMTP fallbacks so username/password are truly missing.
        os.environ['IMAP_USERNAME'] = ''
        os.environ['IMAP_PASSWORD'] = ''
        os.environ['SMTP_USERNAME'] = ''
        os.environ['SMTP_PASSWORD'] = ''
        from backend import mail_poll

        with self.assertRaises(RuntimeError):
            mail_poll.fetch_and_import_once()

    def test_fetch_with_dummy_imap_and_no_user_returns_zero(self):
        os.environ['IMAP_USERNAME'] = 'dummy@example.com'
        os.environ['IMAP_PASSWORD'] = 'dummy'
        # Patch imaplib and DB factory to avoid network and DB access
        from backend import mail_poll

        mail_poll.imaplib.IMAP4_SSL = DummyIMAP
        mail_poll.SessionLocal = lambda: FakeDB()

        result = mail_poll.fetch_and_import_once()
        self.assertEqual(result, 0)


if __name__ == '__main__':
    unittest.main()
