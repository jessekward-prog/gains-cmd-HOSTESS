#!/bin/sh
set -e

echo "Setting up Gains_CMD frontend..."
mkdir -p frontend/src/components frontend/src/pages frontend/src/context frontend/src/hooks frontend/src/lib

for f in src__*; do
  if [ -f "$f" ]; then
    target="frontend/$(echo "$f" | sed 's|__|/|g')"
    mkdir -p "$(dirname "$target")"
    mv "$f" "$target"
  fi
done

[ -f "vite.config.js" ] && mv vite.config.js frontend/vite.config.js
[ -f "frontend.index.html" ] && mv frontend.index.html frontend/index.html
[ -f "frontend.public__boot-splash.html" ] && mkdir -p frontend/public && mv frontend.public__boot-splash.html frontend/public/boot-splash.html

cat > frontend/package.json << 'EOF'
{
  "name": "gains-cmd-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "framer-motion": "^11.15.0",
    "marked": "^18.0.5",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0"
  }
}
EOF

echo "Done."
