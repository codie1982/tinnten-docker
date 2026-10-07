import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const overlay = readFileSync(new URL("../../docker-compose.conversation-v30.yml", import.meta.url), "utf8");
const serviceText = overlay.split("\nservices:\n")[1];
const deploy = readFileSync(new URL("../deploy-conversation-v30-workers.py", import.meta.url), "utf8");

test("overlay exposes only the two opt-in V30 worker services", () => {
  assert.deepEqual([...serviceText.matchAll(/^  ([a-z0-9-]+):$/gm)].map((m) => m[1]), [
    "conversation-v30-turn-worker", "conversation-v30-outbox-worker",
  ]);
  assert.match(overlay, /conversationV30TurnWorker\.js/);
  assert.match(overlay, /conversationV30OutboxWorker\.js/);
  assert.doesNotMatch(overlay, /conversationV20.*\.js/);
});

test("workers do not inherit API ports, socket mounts or aliases", () => {
  assert.doesNotMatch(overlay, /extends:|ports:|depends_on:|build:/);
  assert.match(overlay, /volumes:/);
  assert.match(overlay, /networks:/);
  assert.doesNotMatch(overlay, /\/var\/run\/docker\.sock|\/app\/token|aliases:/);
});

test("workers reuse the release image and guard secret presence without values", () => {
  assert.match(overlay, /env_file:\n    - \.\/tinnten-server\/\.env/);
  assert.match(overlay, /\$\{V30_WORKER_IMAGE:-tinnten-tinnten-server:latest\}/);
  for (const key of ["V30_SURFACE_ASSERTION_SECRET", "V30_ACTION_TOKEN_SECRET"]) {
    assert.equal(overlay.split(`test -n "$$${key}"`).length - 1, 2);
  }
  assert.doesNotMatch(overlay, /mongodb:\/\/|api[_-]?key\s*[:=]/i);
});

test("workers have independent limits, bounded logs and no global enable override", () => {
  assert.match(overlay, /mem_limit: 1g/);
  assert.match(overlay, /mem_limit: 512m/);
  assert.match(overlay, /max-size: "20m"/);
  assert.match(overlay, /stop_grace_period: 60s/);
  assert.doesNotMatch(overlay, /V30_EXECUTION_ENABLED\s*[:=]/);
});

test("deployment validates resolved config and never starts unrelated services", () => {
  assert.match(deploy, /service\.get\("ports"\)/);
  assert.match(deploy, /network or \{\}/);
  assert.match(deploy, /"up", "-d", "--no-deps", "--no-build", \*WORKERS/);
  assert.match(deploy, /Path\("\/root\/tinnten"\)/);
  assert.doesNotMatch(deploy, /--remove-orphans|shell=True|write_text|write_bytes/);
});

test("helper accepts Compose null network configs and rejects ports before up", () => {
  execFileSync("python3", ["-c", `
import contextlib, io, json, runpy, sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
module = runpy.run_path(sys.argv[1])
api = {"services": {"tinnten-server": {"environment": {
    "MONGO_URI": "mongodb://test-db/test", "NODE_ENV": "production",
    "V30_SURFACE_ASSERTION_SECRET": "surface-test", "V30_ACTION_TOKEN_SECRET": "action-test"
}}}}
workers = module["WORKERS"]
good = {"services": {w: {"networks": {"tinnten-net": None}, "volumes": [{"target": "/app/storage/conversation"}]} for w in workers}}
def result(data): return SimpleNamespace(stdout=json.dumps(data))
with patch("subprocess.run", side_effect=[result(api), result(good), result({}), result({})]) as calls, contextlib.redirect_stdout(io.StringIO()):
    module["deploy"](Path("/root/tinnten"))
    assert calls.call_count == 4
    assert "surface-test" not in calls.call_args_list[1].kwargs["input"]
    assert calls.call_args_list[2].args[0][-2:] == list(workers)
good["services"][workers[0]]["ports"] = [{"published": "5001"}]
with patch("subprocess.run", side_effect=[result(api), result(good)]) as calls:
    try: module["deploy"](Path("/root/tinnten"))
    except SystemExit as error: assert "inheritance" in str(error)
    else: raise AssertionError("Unsafe inherited ports accepted")
    assert calls.call_count == 2
` , fileURLToPath(new URL("../deploy-conversation-v30-workers.py", import.meta.url))], { stdio: "pipe" });
});
