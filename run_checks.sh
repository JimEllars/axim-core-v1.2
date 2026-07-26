#!/bin/bash
set -e
echo "Running test suite..."
npm test -- --run tests/api-gateway.test.js tests/ui-smoke.test.jsx
echo "All pre-commit checks passed."
