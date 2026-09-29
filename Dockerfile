FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
COPY requirements-optimizer.txt /tmp/requirements-optimizer.txt
RUN python3 -m venv /opt/optimizer \
    && /opt/optimizer/bin/pip install --no-cache-dir -r /tmp/requirements-optimizer.txt
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4317 \
    DATA_DIR=/var/lib/kontur ORTOOLS_PYTHON=/opt/optimizer/bin/python \
    NODE_OPTIONS=--max-old-space-size=384 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node src/shared/shift-kit.js src/shared/kit-shortage.js ./src/shared/
COPY --chown=node:node data/beeline ./data/beeline
COPY --chown=node:node data/sop ./data/sop
COPY --from=frontend --chown=node:node /build/dist ./dist
USER node
EXPOSE 4317
CMD ["node", "server/index.js", "--production"]
