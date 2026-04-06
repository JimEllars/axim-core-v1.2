const { performance } = require('perf_hooks');

// Mock operations
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateWithGeminiMock(topic) {
    // Simulate network delay for LLM API
    await wait(500);
    return `Article about ${topic}`;
}

async function processAndSaveArticleMock(topic) {
    // Simulate database save delay
    await wait(100);
}

const topics = [
    'Topic 1', 'Topic 2', 'Topic 3', 'Topic 4', 'Topic 5'
];

async function runSequential() {
    const results = [];
    const start = performance.now();
    for (const topic of topics) {
         try {
             await generateWithGeminiMock(topic);
             await processAndSaveArticleMock(topic);
             results.push({ source: topic, status: 'success' });
         } catch (err) {
             results.push({ source: topic, status: 'failed' });
         }
    }
    const end = performance.now();
    console.log(`Sequential execution time: ${(end - start).toFixed(2)} ms`);
    return end - start;
}

async function runConcurrent() {
    const results = [];
    const start = performance.now();
    await Promise.all(topics.map(async (topic) => {
         try {
             await generateWithGeminiMock(topic);
             await processAndSaveArticleMock(topic);
             results.push({ source: topic, status: 'success' });
         } catch (err) {
             results.push({ source: topic, status: 'failed' });
         }
    }));
    const end = performance.now();
    console.log(`Concurrent execution time: ${(end - start).toFixed(2)} ms`);
    return end - start;
}

async function runBenchmark() {
    console.log('Running benchmark...');
    const seqTime = await runSequential();
    const conTime = await runConcurrent();

    console.log(`\nImprovement: ${((seqTime - conTime) / seqTime * 100).toFixed(2)}% faster`);
}

runBenchmark();
