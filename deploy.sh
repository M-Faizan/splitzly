#!/bin/bash
set -e

# Run from the project root
cd "$(dirname "$0")"

echo "Building web app..."
npx expo export --platform web

echo "Patching overflow..."
node -e "
const fs = require('fs');
const f = 'dist/index.html';
fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('overflow: hidden;', 'overflow: auto;'));
"

echo "Flattening icon fonts (fixes Surge node_modules block)..."
mkdir -p dist/fonts
cp dist/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/*.ttf dist/fonts/

JS=$(ls dist/_expo/static/js/web/index-*.js)
node -e "
const fs = require('fs');
const f = process.argv[1];
fs.writeFileSync(f, fs.readFileSync(f, 'utf8').split('/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/').join('/fonts/'));
" "$JS"

echo "Deploying to Surge..."
npx surge dist splitzely.surge.sh

echo "Done! https://splitzely.surge.sh"
