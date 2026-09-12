#!/usr/bin/env python3
"""Gmail/SMTP डिलीवरी (send_mail.py) — केवल GitHub Actions secrets के साथ चलता है।
env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_TO (default gondwanaroots@gmail.com)
/tmp/gw_newpw.json पढ़कर नए पासवर्ड ईमेल करता है, फिर फ़ाइल मिटा देता है।
लोकल रन में पासवर्ड कभी न भेजें — यह केवल CI हेतु है।"""
import json, os, smtplib, ssl, sys
from email.mime.text import MIMEText

TMP = '/tmp/gw_newpw.json'
PANEL = 'https://saiyyamdeveloper.github.io/Gondwana-Saiyyam-calendar-/admin.html'

def main():
    host = os.environ.get('SMTP_HOST'); port = int(os.environ.get('SMTP_PORT', '587'))
    user = os.environ.get('SMTP_USER'); pw = os.environ.get('SMTP_PASS')
    to = os.environ.get('MAIL_TO', 'gondwanaroots@gmail.com')
    if not (host and user and pw):
        print('SMTP secrets नहीं मिले — ईमेल नहीं भेजा जा रहा (रोटेशन workflow इस चरण से पहले ही रोक देता है)')
        return 1
    if not os.path.exists(TMP):
        print('newpw फ़ाइल नहीं — कुछ नहीं भेजना'); return 1
    data = json.load(open(TMP, encoding='utf-8'))
    lines = ['🛡️ गोंडवाना एडमिन पैनल — मासिक पासवर्ड-रोटेशन', '',
             'नए पासवर्ड (31 दिन वैध):', '']
    for email, d in data.items():
        lines += [f"  खाता: {email}", f"  भूमिका: {d['role']}", f"  पासवर्ड: {d['password']}", f"  वैध: {d['expires']} तक", '']
    lines += [f'पैनल: {PANEL}', '',
              'सुरक्षा-नियम:',
              '· यह पासवर्ड केवल इसी ईमेल में है — repo में कभी plaintext नहीं जाता',
              '· सुपर-एडमिन पैनल से कभी भी मैन्युअल रोटेशन कर सकता/सकती है',
              '· संदेह हो तो पैनल खोलकर "सभी पासवर्ड बदलें" दबाएँ', '',
              '— स्वचालित प्रेषक: GitHub Actions (rotate-admin-password.yml)']
    msg = MIMEText('\n'.join(lines), 'plain', 'utf-8')
    msg['Subject'] = '🛡️ गोंडवाना एडमिन — नए मासिक पासवर्ड (गोपनीय)'
    msg['From'] = user; msg['To'] = to
    ctx = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=30) as s:
        s.starttls(context=ctx)
        s.login(user, pw)
        s.sendmail(user, [x.strip() for x in to.split(',')], msg.as_string())
    os.remove(TMP)
    print(f'ईमेल भेजा गया → {to} (plaintext फ़ाइल मिटाई)')
    return 0

if __name__ == '__main__':
    sys.exit(main())
