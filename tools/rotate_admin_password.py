#!/usr/bin/env python3
"""मासिक पासवर्ड-रोटेशन (rotate_admin_password.py)
admin-credentials.json के सभी खातों के पासवर्ड बदलता है।
- plaintext पासवर्ड केवल /tmp/gw_newpw.json (0600) में → send_mail.py उसे Gmail पर भेजकर मिटा देता है
- stdout/logs में पासवर्ड कभी नहीं छपता (सुरक्षा)
- repo में केवल नया hash + expires जाता है"""
import json, secrets, hashlib, os, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
CRED = os.path.join(APP, 'admin-credentials.json')
TMP = '/tmp/gw_newpw.json'

ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"

def gen_pw(n=14):
    return ''.join(secrets.choice(ALPHA) for _ in range(n)) + secrets.choice("!@#$%*") + str(secrets.randbelow(90) + 10)

def main():
    creds = json.load(open(CRED, encoding='utf-8'))
    salt = secrets.token_hex(16)          # नया salt भी
    today = datetime.date.today()
    exp = (today + datetime.timedelta(days=31)).isoformat()
    out = {}
    for a in creds['accounts']:
        pw = gen_pw()
        a['hash'] = hashlib.sha256((salt + pw).encode()).hexdigest()
        a['expires'] = exp
        a['rotated'] = today.isoformat()
        out[a['email']] = {'role': a['role'], 'password': pw, 'expires': exp}
    creds['salt'] = salt
    creds.setdefault('rotation', {})
    creds['rotation']['last'] = today.isoformat()
    creds['rotation']['next'] = exp
    json.dump(creds, open(CRED, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    fd = os.open(TMP, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"rotated {len(out)} accounts; expires {exp}; plaintext → {TMP} (0600)")

if __name__ == '__main__':
    sys.exit(main())
