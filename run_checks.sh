#!/bin/bash
set -e
echo "Running ESLint..."
npm run lint
echo "Running test suite..."
npm test -- --run
echo "All pre-commit checks passed."
