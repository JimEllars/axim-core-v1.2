#!/bin/bash
sed -i 's/import { describe, it, expect, vi, beforeEach } from '"'"'vitest'"'"';/import { describe, it, expect, vi, beforeEach, afterEach } from '"'"'vitest'"'"';/g' src/components/admin/ApiKeyManager.test.jsx
sed -i '/beforeEach(() => {/a \  afterEach(() => {\n    vi.clearAllTimers();\n  });' src/components/admin/ApiKeyManager.test.jsx
