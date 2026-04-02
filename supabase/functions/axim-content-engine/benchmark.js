// We will test performance using a modified standalone version of the code snippet.
const start = performance.now();
const urls = Array.from({length: 10}, (_, i) => `url${i}`);
async function processSequential() {
    for (const url of urls) {
        await new Promise(r => setTimeout(r, 100)); // Simulate work
    }
}
await processSequential();
const end = performance.now();
console.log(`Sequential: ${end - start}ms`);

const start2 = performance.now();
async function processParallel() {
    await Promise.all(urls.map(async (url) => {
        await new Promise(r => setTimeout(r, 100)); // Simulate work
    }));
}
await processParallel();
const end2 = performance.now();
console.log(`Parallel: ${end2 - start2}ms`);
