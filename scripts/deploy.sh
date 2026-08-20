#!/usr/bin/env sh

set -eu

# Publishing credentials live only in GitHub Actions. This legacy npm script is
# intentionally limited to the same local pre-deployment checks.
npm run check
npm run build
npm run verify

echo "Local build verified. Push master or run the GitHub Actions workflow to deploy."
