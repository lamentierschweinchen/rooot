# ROOOT stands service — Fly.io image.
#
# The service is plain TS run through tsx (no build step; matches package.json's
# `start`). Contracts live one level up in the monorepo (../../contracts), so
# the build context MUST be the repo root, not services/stands — fly.toml sets
# that via `build.dockerfile` pointing here while the context stays at root.
# (Deploy from repo root:  flyctl deploy --config services/stands/fly.toml)
#
# Secrets (TXLINE token) are NEVER baked into the image — they arrive at runtime
# via `fly secrets set` (see fly.toml header). Nothing here reads .secrets/.
FROM node:22-slim

WORKDIR /app

# Root workspace manifests (tsx + typescript live at the repo root devDeps) and
# the service's own manifest. Copy manifests first for layer-cached installs.
COPY package.json package-lock.json* ./
COPY services/stands/package.json services/stands/package.json

# Install the service's runtime deps (ws, playwright) + tsx to run TS directly.
RUN npm install --prefix services/stands --omit=dev \
    && npm install -g tsx@4.22.4

# Chromium for the mint's headless keepsake capture (mint/scarf-capture.ts re-renders the fan's
# sealed loom off the deployed surfaces → the on-chain scarf PNG). --with-deps pulls the system
# libraries Playwright's chromium needs on Debian slim; launched with --no-sandbox at runtime.
RUN cd /app/services/stands && npx playwright install --with-deps chromium

# Source: the service, the frozen contracts it imports, and the base tsconfig.
COPY contracts ./contracts
COPY tsconfig.base.json ./tsconfig.base.json
COPY services/stands ./services/stands

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# tsx resolves @contracts/* via services/stands/tsconfig.json paths.
WORKDIR /app/services/stands
RUN chmod +x entrypoint.sh
# entrypoint materializes TXLINE_TOKEN_FILE from runtime secrets (see its header)
ENTRYPOINT ["./entrypoint.sh"]
