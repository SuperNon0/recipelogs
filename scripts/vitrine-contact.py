#!/usr/bin/env python3
"""vitrine-contact — reçoit le formulaire « Nous écrire » du site vitrine et l'envoie par e-mail.

Écoute sur 127.0.0.1:8090 (nginx lui passe /api/contact). Chaque message est d'abord gardé dans
/var/lib/recipelog-vitrine/messages.jsonl (rien n'est perdu si l'envoi échoue), puis envoyé
avec le compte e-mail réglé par « vitrine-reglage email » (/etc/recipelog-vitrine/smtp).
Uniquement la bibliothèque standard de Python : rien à installer.
"""
import json
import re
import smtplib
import ssl
import sys
import time
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CONF = Path("/etc/recipelog-vitrine")
STORE = Path("/var/lib/recipelog-vitrine/messages.jsonl")
TYPES = {"demo": "Demande de démonstration", "devis": "Demande de devis", "question": "Question"}
EMAIL_RE = re.compile(r"^[^\s@<>\"]+@[^\s@<>\"]+\.[^\s@<>\"]+$")
LIMITS = {"nom": 120, "etab": 160, "email": 200, "tel": 40, "msg": 5000}
RATE = {}  # ip -> [horodatages]
RATE_MAX, RATE_WINDOW = 5, 600  # 5 messages par 10 minutes et par visiteur


def read_smtp():
    conf = {}
    try:
        for line in (CONF / "smtp").read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                conf[k.strip()] = v.strip()
    except OSError:
        pass
    if not conf.get("MAIL_TO"):
        try:
            conf["MAIL_TO"] = (CONF / "contact").read_text(encoding="utf-8").strip()
        except OSError:
            pass
    return conf


def send_mail(conf, subject, body, reply_to):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr(("Site RecipeLog", conf.get("SMTP_FROM") or conf["SMTP_USER"]))
    msg["To"] = conf["MAIL_TO"]
    if reply_to:
        msg["Reply-To"] = reply_to
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="recipelog")
    msg.set_content(body)
    host, port = conf.get("SMTP_HOST", "smtp.gmail.com"), int(conf.get("SMTP_PORT", "587"))
    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as s:
            s.login(conf["SMTP_USER"], conf["SMTP_PASS"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls(context=ctx)
            s.login(conf["SMTP_USER"], conf["SMTP_PASS"])
            s.send_message(msg)


def clean(v, n):
    v = str(v or "").replace("\r", "").strip()
    return v[:n]


class Handler(BaseHTTPRequestHandler):
    server_version = "vitrine-contact"

    def log_message(self, fmt, *args):  # journal sans adresse IP ni contenu
        sys.stderr.write("%s\n" % (fmt % args))

    def reply(self, code, data):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/contact":
            return self.reply(404, {"ok": False})
        try:
            size = int(self.headers.get("Content-Length") or 0)
            if size <= 0 or size > 32768:
                return self.reply(413, {"ok": False, "error": "Message trop long."})
            data = json.loads(self.rfile.read(size).decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError
        except (ValueError, UnicodeDecodeError):
            return self.reply(400, {"ok": False, "error": "Demande illisible."})

        # Piège à robots : champ caché que les humains laissent vide.
        if clean(data.get("site"), 200):
            return self.reply(200, {"ok": True})

        f = {k: clean(data.get(k), n) for k, n in LIMITS.items()}
        for k in ("nom", "etab", "email", "tel"):  # une seule ligne (en-têtes de l'e-mail)
            f[k] = " ".join(f[k].split())
        kind = data.get("type") if data.get("type") in TYPES else "question"
        if not f["nom"] or not EMAIL_RE.match(f["email"]):
            return self.reply(400, {"ok": False, "error": "Merci d'indiquer votre nom et une adresse e-mail valide."})

        ip = self.headers.get("CF-Connecting-IP") or self.headers.get("X-Real-IP") or self.client_address[0]
        now = time.time()
        hits = [t for t in RATE.get(ip, []) if now - t < RATE_WINDOW]
        if len(hits) >= RATE_MAX:
            return self.reply(429, {"ok": False, "error": "Trop de messages d'un coup : réessayez dans quelques minutes."})
        hits.append(now)
        RATE[ip] = hits
        if len(RATE) > 5000:
            RATE.clear()

        record = {"date": time.strftime("%Y-%m-%d %H:%M:%S"), "type": kind, **f}
        try:
            STORE.parent.mkdir(parents=True, exist_ok=True)
            with STORE.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        except OSError as e:
            sys.stderr.write("stockage impossible : %s\n" % e)

        conf = read_smtp()
        if not (conf.get("SMTP_USER") and conf.get("SMTP_PASS") and conf.get("MAIL_TO")):
            sys.stderr.write("message gardé, mais aucun compte e-mail réglé (vitrine-reglage email)\n")
            return self.reply(503, {"ok": False, "error": "L'envoi n'est pas encore réglé."})

        subject = "%s — %s%s" % (TYPES[kind], f["nom"], (" (%s)" % f["etab"]) if f["etab"] else "")
        body = "\n".join([
            "Nouveau message depuis le site vitrine RecipeLog.",
            "",
            "Demande       : " + TYPES[kind],
            "Nom           : " + f["nom"],
            "Établissement : " + (f["etab"] or "—"),
            "E-mail        : " + f["email"],
            "Téléphone     : " + (f["tel"] or "—"),
            "Date          : " + record["date"],
            "",
            f["msg"] or "(pas de message)",
            "",
            "—",
            "Répondez directement à cet e-mail pour écrire à " + f["nom"] + ".",
        ])
        try:
            send_mail(conf, subject, body, f["email"])
        except Exception as e:  # noqa: BLE001 — on garde le message et on prévient le visiteur
            sys.stderr.write("envoi impossible : %s\n" % e)
            return self.reply(502, {"ok": False, "error": "L'envoi a échoué."})
        return self.reply(200, {"ok": True})


def test():
    conf = read_smtp()
    if not (conf.get("SMTP_USER") and conf.get("SMTP_PASS") and conf.get("MAIL_TO")):
        print("Aucun compte e-mail réglé : vitrine-reglage email")
        return 1
    send_mail(conf, "Test du formulaire RecipeLog",
              "Si tu lis ce message, le formulaire « Nous écrire » du site vitrine fonctionne.", "")
    print("E-mail de test envoyé à " + conf["MAIL_TO"])
    return 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        sys.exit(test())
    ThreadingHTTPServer(("127.0.0.1", 8090), Handler).serve_forever()
