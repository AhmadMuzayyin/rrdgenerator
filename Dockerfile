FROM oven/bun:1-slim

LABEL org.opencontainers.image.source="https://github.com/AhmadMuzayyin/rrdgenerator"

RUN apt-get update \
  && apt-get install -y --no-install-recommends rrdtool \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["bun", "index.js"]
