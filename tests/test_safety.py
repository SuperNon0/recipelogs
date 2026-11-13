"""Tests locaux sans Proxmox, PostgreSQL, SMTP ni suppression de données réelles."""
import http.client
import threading
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
BASH = os.environ.get("BASH_TEST", "bash")

def posix(path):
    path = str(path).replace("\\", "/")
    if len(path) > 1 and path[1] == ":":
        return "/" + path[0].lower() + path[2:]
    return path

class ResetTests(unittest.TestCase):
    def run_reset(self, scenario):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "base.dump").write_text("mock")
            (folder / "uploads").mkdir()
            (folder / "uploads" / "original").write_text("preserved")
            upload_path = "/tmp/.." if scenario == "unsafe_uploads" else posix(folder / "uploads")
            (folder / "env").write_text("DATABASE_URL=postgresql://demo:secret@localhost/demo\nUPLOAD_DIR=" + upload_path + "\n")
            if scenario == "uploads_failure":
                (folder / "uploads.tar.gz").write_text("mock archive")
            source = (ROOT / "scripts/recipelog-demo-reset").read_text(encoding="utf-8")
            source = source.replace("ENV_FILE=/opt/recipelog/.env", 'ENV_FILE="' + posix(folder / "env") + '"')
            source = source.replace("SNAP=/var/lib/recipelog-demo", 'SNAP="' + posix(folder) + '"')
            harness = r'''
export SCENARIO="SCENARIO_VALUE"
export PATH="/usr/bin:$PATH"
export EVENTS="FOLDER/events"
flock() { return 0; }
systemctl() { echo "service $*" >> "$EVENTS"; }
chown() { return 0; }
tar() { return 0; }
mv() {
  if [[ "$SCENARIO" = uploads_failure && "$2" = *'.restore.'* ]]; then return 1; fi
  command mv "$@"
}
pg_restore() { echo restore >> "$EVENTS"; [ "$SCENARIO" != restore_failure ]; }
sudo() {
  shift 2
  echo "$*" >> "$EVENTS"
  case "$1" in
    bash) [ "$SCENARIO" != migration_failure ] ;;
    psql)
      if [[ "$SCENARIO" = switch_failure && "$*" = *'_restore_'*'RENAME TO "demo"'* ]]; then return 1; fi ;;
  esac
  return 0
}
'''.replace("SCENARIO_VALUE", scenario).replace("FOLDER", posix(folder))
            script = folder / "run.sh"
            script.write_text(harness + "\n" + source, encoding="utf-8", newline="\n")
            result = subprocess.run([BASH, posix(script)], capture_output=True, text=True)
            events = (folder / "events").read_text(encoding="utf-8").splitlines() if (folder / "events").exists() else []
            if scenario == "uploads_failure":
                self.assertEqual((folder / "uploads" / "original").read_text(encoding="utf-8"), "preserved")
            return result, events

    def test_failed_restore_never_stops_or_replaces_live_database(self):
        result, events = self.run_reset("restore_failure")
        self.assertNotEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any("service stop" in e or "ALTER DATABASE" in e for e in events), events)

    def test_failed_migration_preserves_live_database(self):
        result, events = self.run_reset("migration_failure")
        self.assertNotEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any("service stop" in e or "ALTER DATABASE" in e for e in events), events)

    def test_restore_and_migrate_before_stopping_application(self):
        result, events = self.run_reset("success")
        self.assertEqual(result.returncode, 0, result.stderr)
        restore = events.index("restore")
        migrate = next(i for i,e in enumerate(events) if e.startswith("bash "))
        stop = events.index("service stop recipelog")
        self.assertLess(restore, migrate)
        self.assertLess(migrate, stop)
        self.assertTrue(any(e.startswith("dropdb --if-exists --force demo_previous_") for e in events), events)

    def test_failed_switch_renames_old_database_back(self):
        result, events = self.run_reset("switch_failure")
        self.assertNotEqual(result.returncode, 0, result.stderr)
        self.assertTrue(any('ALTER DATABASE "demo_previous_' in e and 'RENAME TO "demo"' in e for e in events), events)
        self.assertIn("service start recipelog", events)
        self.assertFalse(any(e == "dropdb --if-exists --force demo" for e in events), events)

    def test_failed_upload_switch_restores_old_database_and_files(self):
        result, events = self.run_reset("uploads_failure")
        self.assertNotEqual(result.returncode, 0, result.stderr)
        self.assertTrue(any('ALTER DATABASE "demo_previous_' in e and 'RENAME TO "demo"' in e for e in events), events)
        self.assertIn("service start recipelog", events)

    def test_canonical_root_uploads_rejected_before_database_mutation(self):
        result, events = self.run_reset("unsafe_uploads")
        self.assertNotEqual(result.returncode, 0, result.stderr)
        self.assertEqual(events, [])

class ContactTests(unittest.TestCase):
    def test_forged_cloudflare_ips_share_real_client_limit(self):
        spec = importlib.util.spec_from_file_location("contact", ROOT / "scripts/vitrine-contact.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            module.STORE = Path(tmp) / "messages.jsonl"
            module.read_smtp = lambda: {"SMTP_USER": "demo", "SMTP_PASS": "fake", "MAIL_TO": "test@example.com"}
            module.send_mail = lambda *args: None
            server = module.ThreadingHTTPServer(("127.0.0.1", 0), module.Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                for n in range(6):
                    conn = http.client.HTTPConnection(*server.server_address)
                    body = json.dumps({"nom": "Test", "email": "test@example.com", "msg": "Bonjour"})
                    conn.request("POST", "/api/contact", body, {"X-Real-IP": "192.0.2.1", "CF-Connecting-IP": "198.51.100." + str(n)})
                    response = conn.getresponse()
                    self.assertEqual(response.status, 200 if n < 5 else 429)
                    response.read()
                    conn.close()
                conn = http.client.HTTPConnection(*server.server_address)
                body = json.dumps({"nom": "Test", "email": "test@example.com", "msg": "x" * 5001})
                conn.request("POST", "/api/contact", body)
                response = conn.getresponse()
                self.assertEqual(response.status, 400)
                response.read()
                conn.close()
                self.assertEqual(len(module.STORE.read_text(encoding="utf-8").splitlines()), 5)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()

    def test_message_journal_rotates_without_losing_new_message(self):
        spec = importlib.util.spec_from_file_location("contact", ROOT / "scripts/vitrine-contact.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            module.STORE = Path(tmp) / "messages.jsonl"
            module.STORE_MAX_BYTES = 40
            for n in range(4):
                module.store_message({"msg": str(n) * 15})
            current = json.loads(module.STORE.read_text(encoding="utf-8"))
            previous = json.loads(module.STORE.with_suffix(".previous.jsonl").read_text(encoding="utf-8"))
            self.assertEqual(current["msg"], "3" * 15)
            self.assertEqual(previous["msg"], "2" * 15)
            self.assertLessEqual(sum(p.stat().st_size for p in Path(tmp).iterdir()), 80)

class UpdateTests(unittest.TestCase):
    def test_container_options_update_only_requested_components(self):
        for args, want_demo, want_vitrine in [([], False, True), (["--demo"], True, True), (["--demo-seulement"], True, False)]:
            with self.subTest(args=args), tempfile.TemporaryDirectory() as tmp:
                folder = Path(tmp)
                (folder / ".git").mkdir()
                source = (ROOT / "mise-a-jour.sh").read_text(encoding="utf-8")
                source = source.replace("if command -v pct >/dev/null 2>&1; then", "if false; then")
                source = source.replace("[ -x /usr/local/sbin/recipelog-deploy ]", "true")
                source = source.replace("/usr/local/sbin/recipelog-deploy", "mock_deploy")
                source = source.replace("DIR=/opt/vitrine", 'DIR="' + posix(folder) + '"')
                source = source.replace("rm -f /usr/local/sbin/vitrine-adresse-demo", ":")
                harness = """
export PATH="/usr/bin:$PATH"
export EVENTS="FOLDER/events"
mock_deploy() { echo demo >> "$EVENTS"; }
curl() { return 0; }
bash() { echo setup >> "$EVENTS"; }
git() { echo vitrine >> "$EVENTS"; echo abc123; }
""".replace("FOLDER", posix(folder))
                script = folder / "run.sh"
                script.write_text(harness + source, encoding="utf-8", newline="\n")
                result = subprocess.run([BASH, posix(script), *args], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                events = (folder / "events").read_text(encoding="utf-8").splitlines()
                self.assertEqual("demo" in events, want_demo)
                self.assertEqual("vitrine" in events, want_vitrine)

if __name__ == "__main__":
    unittest.main()
