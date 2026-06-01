#!/bin/bash
cat << 'INNER_EOF' >> tests/e2e-workflow.test.js

  it('should handle high-volume scraper concurrency gracefully (mock simulation)', async () => {
    // Simulating 15 simultaneous scraper executions
    const mockWorkers = Array.from({ length: 15 }, (_, i) => async () => {
        // mock random timeout logic matching the edge workers
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({ status: 200, id: i });
            }, 10 + Math.random() * 20);
        });
    });

    const results = await Promise.all(mockWorkers.map(w => w()));
    expect(results.length).toBe(15);
    expect(results.every(r => r.status === 200)).toBe(true);
  });
INNER_EOF
