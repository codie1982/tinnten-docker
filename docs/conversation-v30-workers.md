# V30 conversation workers

This opt-in overlay adds only Runtime 30 turn and outbox processes. The API,
V20, other workers, databases and legacy channels are not recreated by the
commands below. Run Docker commands on the server, never on the local UI machine.

## Required environment

The workers read `./tinnten-server/.env`. The deployment helper forwards only
the API's effective infrastructure connection overrides, in memory, without
printing credentials or creating another secret file.
Configure the following in `/root/tinnten/tinnten-server/.env`:

```dotenv
V30_ENABLED=true
V30_EXECUTION_ENABLED=true
V30_SURFACE_ASSERTION_SECRET=<same-server-only-secret-as-Vercel>
V30_ACTION_TOKEN_SECRET=<separate-api-and-worker-secret>
V30_SANDBOX_WIDGET_ENABLED=false
```

Vercel Production needs `V30_ENABLED=true` and the **same**
`V30_SURFACE_ASSERTION_SECRET`. Do not use `NEXT_PUBLIC_` for secrets.
Generate two independent values with `openssl rand -hex 32`; never commit them.
Vercel needs a redeploy; API/workers need a recreate to load changed env values.

Build the API image before installing workers. By default they use
`tinnten-tinnten-server:latest`; use `V30_WORKER_IMAGE` for an immutable release
tag shared with the API. Do not rebuild the whole server source as part of this
worker-only installation.

## Install / update

```sh
cd /root/tinnten
python3 scripts/deploy-conversation-v30-workers.py --check
python3 scripts/deploy-conversation-v30-workers.py
docker compose -f docker-compose.yml -f docker-compose.conversation-v30.yml ps conversation-v30-turn-worker conversation-v30-outbox-worker
docker compose -f docker-compose.yml -f docker-compose.conversation-v30.yml logs --tail=50 conversation-v30-turn-worker conversation-v30-outbox-worker
```

Do not use `--remove-orphans` or a blanket `up`, `down`, or `restart`.
The overlay does not extend the API service: Compose extends may retain ports
even when reset tags are used. The helper validates resolved ports, mounts,
dependencies and DNS aliases before starting anything. It keeps only
conversation storage and existing required networks.
Each worker has independent memory/CPU and bounded logs. The turn worker is one
sequential consumer; do not scale it without verifying lease/concurrency fences.

Verify V30 unique indexes before first acceptance. The existing backend index
script can encounter legacy `expiresAt_1` non-TTL/TTL conflicts on conversation
and action nonce collections. Do not drop indexes or enable TTL automatically:
changing conversation TTL can delete production data. Audit the conflict
separately; retained unique scope/projection/reset indexes are required.

## Verification

- Both containers stay running without restart loops or missing-secret errors.
- API and workers have matching feature flags and secret configuration (verify
  presence/equality without printing their values).
- Only `runtimeVersion: 30` queued turns/outbox entries are claimed.
- A new standard-subdomain conversation receives 202 and reaches a terminal
  turn with canvas and latest stream; V20 still completes independently.
- Configuration readiness alone does not prove end-to-end behavior. Assistant
  surface policy projection, identity access and frontend deployment must also
  be verified before publishing a pilot.

## Rollback without deleting data

First disable new V30 acceptance on API/FE (`V30_ENABLED=false`). Disable new
claims (`V30_EXECUTION_ENABLED=false`) and recreate only the affected services
with their normal deployment workflow. Stop only the two V30 workers when safe:

```sh
docker compose -f docker-compose.yml -f docker-compose.conversation-v30.yml stop conversation-v30-turn-worker conversation-v30-outbox-worker
```

Keep Runtime 30 conversations/resources/messages. Do not reinterpret them as
V20. Expired leases are recovered by the V30 worker when execution resumes.
