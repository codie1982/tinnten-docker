#!/bin/bash
#
# logs.sh — tinnten-docker için Docker Compose log yardımcısı
#
# Kullanım:
#   ./scripts/logs.sh                 # mevcut servisleri listele
#   ./scripts/logs.sh <servis>        # logları takip et (son 200 satir + canli)
#   ./scripts/logs.sh <servis> -n N   # son N satir (varsayilan 200)
#   ./scripts/logs.sh <servis> -e     # sadece error/warn/fail/exception satirlari
#   ./scripts/logs.sh <servis> -s T   # T'den beri (ornek: 30m, 1h, 2026-06-13T09:00)
#   ./scripts/logs.sh <servis> -t     # zaman damgali
#   ./scripts/logs.sh <servis> -1     # takip etme, tek seferlik dok (dosyaya yazmak icin)
#   ./scripts/logs.sh all             # TUM servisleri takip et
#
# Kisa takma adlar: server/api, cron, fetcher, embedding, search, file, company,
#   email, analytics, wallet, subscription, categorization, productization,
#   catalog, catalog-worker, mongo, mongo-public, redis, rabbit, es, clamav
# (Bilinmeyen ad dogrudan compose servis adi olarak gecirilir.)
#
# Compose dosyasini degistir: COMPOSE_FILE env (varsayilan: docker-compose.yml)
#   COMPOSE_FILE=docker-compose.preprod.yml ./scripts/logs.sh server

set -euo pipefail

# Script scripts/ altinda; repo koklerine gec
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

# docker compose (v2) varsa onu, yoksa docker-compose (v1) kullan
if docker compose version >/dev/null 2>&1; then
  DC="docker compose -f $COMPOSE_FILE"
else
  DC="docker-compose -f $COMPOSE_FILE"
fi

# kisa takma ad -> gercek compose servis adi
alias_to_service() {
  case "$1" in
    server|api)               echo "tinnten-server" ;;
    cron)                     echo "tinnten-cron" ;;
    fetcher)                  echo "tinnten-fetcher" ;;
    embedding|embed)          echo "tinnten-embedding" ;;
    mongo|mongodb)            echo "mongodb" ;;
    mongo-public)             echo "tinnten-mongodb-public" ;;
    redis)                    echo "redis" ;;
    rabbit|rabbitmq)          echo "rabbitmq" ;;
    es|elastic|elasticsearch) echo "elasticsearch" ;;
    clamav)                   echo "clamav" ;;
    catalog)                  echo "product-catalog" ;;
    catalog-worker)           echo "product-catalog-worker" ;;
    analytics)                echo "analytics-worker" ;;
    email)                    echo "email-worker" ;;
    db-worker|dbworker)       echo "db-worker" ;;
    productization)           echo "productization-worker" ;;
    categorization)           echo "user-product-categorization-worker" ;;
    search)                   echo "search-worker" ;;
    wallet)                   echo "wallet-log-worker" ;;
    file|file-intelligence)   echo "file-intelligence-worker" ;;
    company)                  echo "company-information-worker" ;;
    subscription)             echo "subscription-worker" ;;
    *)                        echo "$1" ;;   # zaten gercek servis adi
  esac
}

# argumansiz -> servisleri listele
if [ $# -eq 0 ]; then
  echo "Servisler ($COMPOSE_FILE):"
  $DC config --services | sort | sed 's/^/  /'
  echo ""
  echo "Kullanim: ./scripts/logs.sh <servis> [-n N] [-e] [-s SURE] [-t] [-1]"
  echo "Ornek:    ./scripts/logs.sh server -n 500 -e"
  exit 0
fi

# argumanlari ayristir
TARGET=""
TAIL="200"
SINCE_ARG=""
ERRORS_ONLY="0"
FOLLOW="-f"
TS=""

while [ $# -gt 0 ]; do
  case "$1" in
    -n)            TAIL="$2"; shift 2 ;;
    -e)            ERRORS_ONLY="1"; shift ;;
    -s)            SINCE_ARG="--since $2"; shift 2 ;;
    -t)            TS="--timestamps"; shift ;;
    -1|--no-follow) FOLLOW=""; shift ;;
    -h|--help)     sed -n '2,28p' "$0"; exit 0 ;;
    *)             TARGET="$1"; shift ;;
  esac
done

# tum servisler
if [ "$TARGET" = "all" ]; then
  exec $DC logs $FOLLOW $TS --tail "$TAIL" $SINCE_ARG
fi

SERVICE="$(alias_to_service "$TARGET")"

# -e: Node uygulamalari stderr'e yazar -> 2>&1 sart, yoksa grep bos doner
if [ "$ERRORS_ONLY" = "1" ]; then
  $DC logs $FOLLOW $TS --tail "$TAIL" $SINCE_ARG "$SERVICE" 2>&1 \
    | grep -Ei --line-buffered 'error|warn|fail|exception|fatal'
else
  exec $DC logs $FOLLOW $TS --tail "$TAIL" $SINCE_ARG "$SERVICE"
fi
