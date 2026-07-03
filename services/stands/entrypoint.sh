#!/bin/sh
# ROOOT stands — Fly entrypoint. Materializes the TxLINE token file from the
# two runtime secrets (TXLINE_JWT / TXLINE_APITOKEN) so the service's
# TXLINE_TOKEN_FILE contract holds unchanged in the container. Values are
# never echoed, never in argv (printf to a 0600 tmpfile only). JWTs are
# base64url+dots and the api token is opaque hex — JSON-safe via %s.
set -eu
if [ -n "${TXLINE_JWT:-}" ] && [ -n "${TXLINE_APITOKEN:-}" ]; then
  umask 077
  printf '{"jwt":"%s","apiToken":"%s"}' "$TXLINE_JWT" "$TXLINE_APITOKEN" > /tmp/txline-token.json
  export TXLINE_TOKEN_FILE=/tmp/txline-token.json
fi
exec tsx src/index.ts
