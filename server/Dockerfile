# Debian slim (not alpine) so Sharp's prebuilt glibc binaries install cleanly.
FROM node:20-bookworm-slim

WORKDIR /app

# The same type families the editor offers (client/src/design/fonts.js),
# fetched as real TTFs so server-side SVG→raster export (exports, and the
# Layers panel's Merge/Flatten) renders actual glyphs — a base image has no
# fonts at all, so text would otherwise rasterize as blank tofu boxes.
# Georgia/Arial are system fonts with no free redistributable equivalent and
# fall back to Sharp/librsvg's default serif/sans-serif at export time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl fontconfig ca-certificates \
  && mkdir -p /usr/share/fonts/truetype/apollo \
  && for FAM in \
       "Inter:wght@400;500;600;700;800;900" \
       "Instrument+Sans:wght@400;500;600;700" \
       "Instrument+Serif:ital@0;1" \
       "Playfair+Display:wght@500;700;900" \
       "Bebas+Neue" \
       "JetBrains+Mono:wght@400;500" \
     ; do \
       curl -fsS "https://fonts.googleapis.com/css2?family=${FAM}&display=swap" \
         | grep -oE 'https://fonts\.gstatic\.com/[^)]+\.ttf' \
         | while read -r URL; do \
             curl -fsSL "$URL" -o "/usr/share/fonts/truetype/apollo/$(echo "$URL" | md5sum | cut -c1-16).ttf"; \
           done; \
     done \
  && fc-cache -f \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

# Install deps first for better layer caching.
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Storage is mounted as a volume in docker-compose so exports/uploads persist.
RUN mkdir -p storage/projects

EXPOSE 5010
CMD ["node", "src/index.js"]
