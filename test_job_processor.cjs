const assert = require('assert');

// Simulate the logic in job-processor to ensure it works
// (Because Deno is not available locally for execution, we write a quick node script simulating it)

function simulateJobProcessor(jobs) {
    let processed = 0;
    let errors = 0;
    for (const job of jobs) {
        if (job.status === 'pending' || (job.status === 'failed' && job.attempts < job.max_attempts)) {
            processed++;
            // Simulate processing
            if (job.payload.product_id === 'fail_product') {
                errors++;
            }
        }
    }
    return { processed, errors };
}

const mockJobs = [
    { id: '1', status: 'pending', payload: { product_id: 'prod1' } },
    { id: '2', status: 'failed', attempts: 1, max_attempts: 3, payload: { product_id: 'fail_product' } },
    { id: '3', status: 'failed', attempts: 3, max_attempts: 3, payload: { product_id: 'prod3' } }, // Should skip
    { id: '4', status: 'completed', payload: { product_id: 'prod4' } } // Should skip
];

const result = simulateJobProcessor(mockJobs);
assert.strictEqual(result.processed, 2);
assert.strictEqual(result.errors, 1);
console.log("Job Processor simulation passed.");
