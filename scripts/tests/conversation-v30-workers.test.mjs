import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

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
  assert.match(deploy, /network\.get\("aliases"\)/);
  assert.match(deploy, /"up", "-d", "--no-deps", "--no-build", \*WORKERS/);
  assert.match(deploy, /Path\("\/root\/tinnten"\)/);
  assert.doesNotMatch(deploy, /--remove-orphans|shell=True|write_text|write_bytes/);
});
