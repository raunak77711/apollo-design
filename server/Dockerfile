# Debian slim (not alpine) so Sharp's prebuilt glibc binaries install cleanly.
FROM node:20-bookworm-slim

WORKDIR /app

# Install deps first for better layer caching.
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Storage is mounted as a volume in docker-compose so exports/uploads persist.
RUN mkdir -p storage/projects

EXPOSE 5010
CMD ["node", "src/index.js"]
