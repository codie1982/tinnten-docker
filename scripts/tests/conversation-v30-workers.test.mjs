import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const overlay = readFileSync(new URL("../../docker-compose.conversation-v30.yml", import.meta.url), "utf8");
const serviceText = overlay.split("\nservices:\n")[1];

test("overlay exposes only the two opt-in V30 worker services", () => {
  assert.deepEqual([...serviceText.matchAll(/^  ([a-z0-9-]+):$/gm)].map((m) => m[1]), [
    "conversation-v30-turn-worker", "conversation-v30-outbox-worker",
  ]);
  assert.match(overlay, /conversationV30TurnWorker\.js/);
  assert.match(overlay, /conversationV30OutboxWorker\.js/);
  assert.doesNotMatch(overlay, /conversationV20.*\.js/);
});

test("workers remove API ports, socket mounts and inherited aliases", () => {
  assert.match(overlay, /ports: !reset \[\]/);
  assert.match(overlay, /depends_on: !reset \[\]/);
  assert.match(overlay, /build: !reset null/);
  assert.match(overlay, /volumes: !override/);
  assert.match(overlay, /networks: !override/);
  assert.doesNotMatch(overlay, /\/var\/run\/docker\.sock|\/app\/token|aliases:/);
});

test("workers reuse the release image and guard secret presence without values", () => {
  assert.match(overlay, /extends:\n    file: \$\{V30_BASE_COMPOSE_FILE:-docker-compose.yml\}\n    service: tinnten-server/);
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
