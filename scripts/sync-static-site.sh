#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
source_root="${project_root}/static-site"
public_root="${project_root}/public"

# Remove retired standalone applications before copying canonical assets. This
# keeps local and Cloudflare builds from serving stale files left by an older
# checkout or build cache.
rm -rf "${public_root}/instantgpa"
rm -f \
  "${public_root}/assets/transcript-reader.js" \
  "${public_root}/assets/legal-page.js" \
  "${public_root}/assets/approved-v84.css"
rm -f \
  "${public_root}/data/translations/zh.json" \
  "${public_root}/data/translations/hi.json" \
  "${public_root}/data/translations/es.json" \
  "${public_root}/data/translations/fr.json" \
  "${public_root}/data/translations/pt.json" \
  "${public_root}/data/translations/id.json" \
  "${public_root}/data/translations/ru.json" \
  "${public_root}/data/translations/tr.json"

mkdir -p \
  "${public_root}/assets" \
  "${public_root}/data" \
  "${public_root}/vendor/tesseract-core" \
  "${public_root}/vendor/tesseract-lang"
cp -a "${source_root}/assets/." "${public_root}/assets/"
cp -a "${source_root}/data/." "${public_root}/data/"

# Keep the local OCR fallback self-contained so Content Security Policy and
# third-party CDN availability cannot break scanned-transcript imports.
cp "${project_root}/node_modules/tesseract.js/dist/tesseract.min.js" \
  "${public_root}/vendor/tesseract.min.js"
cp "${project_root}/node_modules/tesseract.js/dist/worker.min.js" \
  "${public_root}/vendor/tesseract-worker.min.js"
cp "${project_root}/node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz" \
  "${public_root}/vendor/tesseract-lang/eng.traineddata.gz"
cp "${project_root}/node_modules/@tesseract.js-data/ara/4.0.0_best_int/ara.traineddata.gz" \
  "${public_root}/vendor/tesseract-lang/ara.traineddata.gz"
find "${public_root}/vendor/tesseract-core" -maxdepth 1 -type f -name 'tesseract-core*' -delete
cp "${project_root}"/node_modules/tesseract.js-core/tesseract-core*-lstm.wasm.js \
  "${public_root}/vendor/tesseract-core/"

for file in firebase-config.js privacy.html robots.txt sitemap.xml terms.html disclaimer.html manifest.webmanifest service-worker.js; do
  cp "${source_root}/${file}" "${public_root}/${file}"
done

echo "Synchronized canonical static-site sources into public/."
