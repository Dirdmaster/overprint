FROM node:22.18.0-bookworm-slim@sha256:752ea8a2f758c34002a0461bd9f1cee4f9a3c36d48494586f60ffce1fc708e0e
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git python3 ripgrep bubblewrap \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/worker
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY run.mjs invoke.py prompt.md smoke.py ./
ENV PATH="/opt/worker/node_modules/.bin:${PATH}"
WORKDIR /workspace
ENTRYPOINT ["node", "/opt/worker/run.mjs"]
