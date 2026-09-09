#!/bin/sh
# Runs on every container start, before the server process. Applies any pending
# Prisma migrations, then hands off to the CMD (node dist/index.js).
#
# "No pending migrations to apply." is the normal output on an unchanged schema.
# If migrate deploy keeps failing, the script exits non-zero before `exec`; under
# `restart: unless-stopped` that crash-loops the container, which is deliberate —
# better no service than a server running against an un-migrated schema. Safe
# because there is exactly one back-end process (docs/ARCHITECTURE.md).
set -e

n=0
until npx --no-install prisma migrate deploy; do
  n=$((n + 1))
  if [ "$n" -ge 5 ]; then
    echo "[entrypoint] migrate deploy failed after $n attempts; giving up"
    exit 1
  fi
  echo "[entrypoint] migrate deploy failed (attempt $n); retrying in 5s"
  sleep 5
done

echo "[entrypoint] schema up to date; starting: $*"
exec "$@"
