#!/bin/sh
set -e

# The ./logs bind-mount is created by Docker as root on the host.
# This entrypoint runs as root, fixes ownership, then drops to the app user.
mkdir -p /app/logs
chown app:app /app/logs

exec gosu app "$@"
