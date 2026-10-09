FROM node:22-trixie-slim

# The original App is downloaded on first run, not redistributed in the image.
RUN apt-get update -o APT::Update::Error-Mode=any && apt-get install -y --no-install-recommends \
    python3 ca-certificates curl xz-utils git openssh-client \
    libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 \
    libcups2t64 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0t64 libnss3 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 \
    libxrandr2 libxshmfence1 fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -c 'import ssl,lzma,fcntl,tarfile; assert hasattr(tarfile,"data_filter")'

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && sha256sum package-lock.json | cut -d ' ' -f 1 > node_modules/.chatgpt-webui-lock \
    && npm cache clean --force
COPY bridge/ ./bridge/
COPY scripts/ ./scripts/
COPY deploy/docker-entrypoint.sh ./deploy/docker-entrypoint.sh
RUN mkdir -p /data/home /workspace \
    && for name in .deps .runtime .profile .logs .uploads .downloads; do \
         mkdir -p "/data/$name"; ln -s "/data/$name" "/app/$name"; \
       done \
    && ln -s /data/prepare-manifest.json /app/prepare-manifest.json \
    && chown -R node:node /app /data /workspace

ENV HOME=/data/home \
    CODEX_HOME=/data/home/.codex \
    CHATGPT_WEB_HOST=0.0.0.0
USER node
EXPOSE 18765
ENTRYPOINT ["sh", "/app/deploy/docker-entrypoint.sh"]
CMD ["--ozone-platform=headless", "--disable-gpu", "--no-sandbox", "--password-store=basic"]
