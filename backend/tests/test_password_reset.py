import os
import sys
import pathlib
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient


from backend.main import app
from backend import db


class DummyMailer:
    def __init__(self):
        self.last = None

    def send(self, email, token):
        self.last = (email, token)


class PasswordResetTests(unittest.TestCase):
    def setUp(self):
        # Ensure DB tables exist
        db.init_db()
        # clear users and tokens
        s = db.SessionLocal()
        s.query(db.PasswordResetToken).delete()
        s.query(db.User).delete()
        s.commit()
        s.close()

    def test_request_and_confirm_flow(self):
        client = TestClient(app)
        s = db.SessionLocal()
        # create a user
        user = db.User(email='reset@example.com', password_hash='oldhash')
        s.add(user)
        s.commit()
        s.refresh(user)

        # monkeypatch the send function to capture token
        import backend.main as mainmod

        captured = {}

        def fake_send(email_addr, token):
            captured['email'] = email_addr
            captured['token'] = token

        mainmod._send_password_reset_email = fake_send

        resp = client.post('/auth/password-reset/request', json={'email': 'reset@example.com'})
        self.assertEqual(resp.status_code, 200)
        self.assertIn('message', resp.json())
        self.assertEqual(captured.get('email'), 'reset@example.com')
        raw_token = captured.get('token')
        self.assertIsNotNone(raw_token)

        # Confirm with the token
        resp2 = client.post('/auth/password-reset/confirm', json={'token': raw_token, 'password': 'newpass123'})
        self.assertEqual(resp2.status_code, 200)
        self.assertIn('message', resp2.json())

        # Verify token marked used
        s2 = db.SessionLocal()
        tokens = s2.query(db.PasswordResetToken).filter(db.PasswordResetToken.user_id == user.id).all()
        self.assertTrue(any(t.used_at is not None for t in tokens))
        s2.close()


if __name__ == '__main__':
    unittest.main()
