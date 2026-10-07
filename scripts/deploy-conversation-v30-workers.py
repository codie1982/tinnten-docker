#!/usr/bin/env python3
"""Server-only V30 worker deployment; no secrets are printed or saved."""
import argparse
import json
from pathlib import Path
import subprocess

WORKERS = ("conversation-v30-turn-worker", "conversation-v30-outbox-worker")
CONNECTION_KEYS = (
    "NODE_ENV", "MONGO_URI", "DB_TINNTEN", "REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD",
    "ELASTICSEARCH_BASE_URL", "RABBITMQ_PROTOCOL", "RABBITMQ_HOST", "RABBITMQ_PORT",
    "RABBITMQ_USERNAME", "RABBITMQ_USER", "RABBITMQ_PASSWORD", "RABBITMQ_PASS",
    "RABBITMQ_VHOST", "RABBITMQ_AUTH_MECHANISM", "RABBIT_URL", "FETCHER_URL",
    "EMBEDDING_BASE_URL", "PRODUCT_CATALOG_SERVICE_URL", "CRON_SERVICE_URL", "CRON_URL",
)


def deploy(root, check=False):
    base = ["docker", "compose", "-f", str(root / "docker-compose.yml")]
    result = subprocess.run(base + ["config", "--format", "json"], check=True, capture_output=True, text=True)
    api_env = json.loads(result.stdout)["services"]["tinnten-server"].get("environment", {})
    if not api_env.get("MONGO_URI"):
        raise SystemExit("API MONGO_URI is missing; deployment stopped.")
    for key in ("V30_SURFACE_ASSERTION_SECRET", "V30_ACTION_TOKEN_SECRET"):
        if not api_env.get(key):
            raise SystemExit(f"Missing {key}; deployment stopped.")
    connections = {key: api_env[key] for key in CONNECTION_KEYS if api_env.get(key) is not None}
    override = {"services": {name: {"environment": connections} for name in WORKERS}}
    encoded = json.dumps(override)
    compose = base + ["-f", str(root / "docker-compose.conversation-v30.yml"), "-f", "-"]
    resolved = subprocess.run(compose + ["config", "--format", "json"], input=encoded, check=True, capture_output=True, text=True)
    services = json.loads(resolved.stdout)["services"]
    for name in WORKERS:
        service = services[name]
        if service.get("ports") or service.get("build") or service.get("depends_on"):
            raise SystemExit(f"Unexpected API inheritance in {name}; deployment stopped.")
        if any(mount.get("target") != "/app/storage/conversation" for mount in service.get("volumes", [])):
            raise SystemExit(f"Unexpected worker mount in {name}; deployment stopped.")
        if any((network or {}).get("aliases") for network in service.get("networks", {}).values()):
            raise SystemExit(f"Unexpected worker DNS alias in {name}; deployment stopped.")
    print("V30 worker configuration validated; no API ports/socket/token mounts inherited.")
    if check:
        return
    subprocess.run(compose + ["up", "-d", "--no-deps", "--no-build", *WORKERS], input=encoded, check=True, text=True)
    subprocess.run(compose + ["ps", *WORKERS], input=encoded, check=True, text=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate only; do not start Docker containers.")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    if args.root.resolve() != Path("/root/tinnten"):
        raise SystemExit("This deployment script runs only on the authorized /root/tinnten server checkout.")
    deploy(args.root.resolve(), args.check)
