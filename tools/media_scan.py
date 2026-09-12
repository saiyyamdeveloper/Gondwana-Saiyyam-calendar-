#!/usr/bin/env python3
"""मीडिया-इनबॉक्स स्कैनर (media_scan.py) — automation परत
media/inbox/ में डाली गई हर नई फ़ाइल (voice/गीत/इमेज/वीडियो/PDF) को:
  1. manifest.json में 'candidate' प्रविष्टि बनाता है — स्वचालित विवरण सहित
     (प्रकार, आकार, SHA-256, तारीख़) → पैनल में ⏳ सत्यापन-प्रतीक्षित दिखेगी
  2. SMTP secrets हों तो Gmail पर सूचना भेजता है ("बता दे")
सत्यापन व attach केवल एडमिन-पैनल से — बिना सत्यापन कुछ public नहीं।
Usage: python3 tools/media_scan.py"""
import json, os, sys, hashlib, datetime, smtplib, ssl
from email.mime.text import MIMEText

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
INBOX = os.path.join(APP, 'media', 'inbox')
MAN = os.path.join(APP, 'media', 'manifest.json')
PANEL = 'https://saiyyamdeveloper.github.io/Gondwana-Saiyyam-calendar-/admin.html'

EXT = {'.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.webp': 'image', '.gif': 'image',
       '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.m4a': 'audio', '.flac': 'audio',
       '.mp4': 'video', '.webm': 'video', '.pdf': 'doc'}

def human(n):
    for u in ('B', 'KB', 'MB'):
        if n < 1024: return f'{n:.0f}{u}' if u == 'B' else f'{n:.1f}{u}'
        n /= 1024
    return f'{n:.2f}GB'

def main():
    man = json.load(open(MAN, encoding='utf-8')) if os.path.exists(MAN) else \
        {'meta': {'title': 'गोंडवाना मीडिया-संग्रह (manifest)', 'policy': 'सत्यापन के बिना attach नहीं'}, 'items': []}
    known = {it.get('path') for it in man['items'] if it.get('path')}
    today = datetime.date.today().isoformat()
    new = []
    if os.path.isdir(INBOX):
        for root, _, files in os.walk(INBOX):
            for fn in sorted(files):
                if fn.startswith('.'): continue
                full = os.path.join(root, fn)
                rel = os.path.relpath(full, APP).replace(os.sep, '/')
                if rel in known: continue
                ext = os.path.splitext(fn)[1].lower()
                data = open(full, 'rb').read()
                sha = hashlib.sha256(data).hexdigest()
                typ = EXT.get(ext, 'other')
                new.append({
                    'id': f'media-inbox-{sha[:10]}', 'type': typ, 'title': fn,
                    'desc': (f'इनबॉक्स से स्वचालित विवरण: प्रकार={typ}, आकार={human(len(data))}, '
                             f'SHA-256={sha[:16]}…, प्राप्त={today}। शीर्षक/स्रोत/license पैनल में सत्यापित करें।'),
                    'path': rel, 'url': None, 'source': 'media/inbox (automation)',
                    'license': 'own' if typ in ('audio', 'video') else 'unknown',
                    'size': len(data), 'added': today, 'added_by': 'automation:media-scan',
                    'status': 'candidate', 'attach_to': None,
                    'verified_by': None, 'verified_at': None,
                    'note': '⏳ एडमिन-सत्यापन प्रतीक्षित' if len(data) <= 10 * 1024 * 1024
                            else '⚠ 10MB से बड़ी — repo/Pages सीमा हेतु संपीड़न/बाहरी-होस्टिंग विचारें'})
    if new:
        man['items'].extend(new)
        man['meta']['updated'] = today
        json.dump(man, open(MAN, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        notify_mail(new)
    print(f'media-scan: {len(new)} नई फ़ाइलें; कुल manifest = {len(man["items"])}')
    for it in new: print('  +', it['path'], f"({it['type']}, {human(it['size'])})")
    return 0

def notify_mail(new):
    host = os.environ.get('SMTP_HOST'); user = os.environ.get('SMTP_USER'); pw = os.environ.get('SMTP_PASS')
    if not (host and user and pw):
        print('mail: SMTP secrets नहीं — सूचना ईमेल छूटा (पैनल में दिखेगा ही)'); return
    to = os.environ.get('MAIL_TO', 'gondwanaroots@gmail.com')
    lines = ['🗄️ गोंडवाना मीडिया-संग्रह — नई फ़ाइलें आई हैं (सत्यापन प्रतीक्षित):', '']
    for it in new:
        lines.append(f"  · {it['title']} ({it['type']}, {human(it['size'])})")
    lines += ['', f'पैनल: {PANEL} → 🗄️ संग्रहण → विवरण जाँचकर ✓ सत्यापित करें।',
              'बिना सत्यापन कुछ भी ऐप में attach नहीं होगा।', '', '— स्वचालित प्रेषक: media-inbox.yml']
    msg = MIMEText('\n'.join(lines), 'plain', 'utf-8')
    msg['Subject'] = f"🗄️ गोंडवाना संग्रहण: {len(new)} नई मीडिया फ़ाइलें — सत्यापन प्रतीक्षित"
    msg['From'] = user; msg['To'] = to
    try:
        with smtplib.SMTP(host, int(os.environ.get('SMTP_PORT', '587')), timeout=30) as s:
            s.starttls(context=ssl.create_default_context()); s.login(user, pw)
            s.sendmail(user, [x.strip() for x in to.split(',')], msg.as_string())
        print(f'mail: सूचना भेजी → {to}')
    except Exception as e:
        print('mail: विफल (workflow जारी रहेगा):', e)

if __name__ == '__main__':
    sys.exit(main())
