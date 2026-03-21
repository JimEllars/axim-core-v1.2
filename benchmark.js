import offlineManager from './src/services/offline.js';
import api from './src/services/onyxAI/api.js';

// Mock the API methods
api.testMethod1 = async () => new Promise(resolve => setTimeout(resolve, 50));
api.testMethod2 = async () => new Promise((resolve, reject) => setTimeout(() => reject(new Error("Fail")), 50));

// Mock global objects that might be missing in node environment
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

async function runBenchmark() {
  console.log("Setting up queues...");

  // Add 100 requests to the queue
  for (let i = 0; i < 50; i++) {
    offlineManager.queueRequest('testMethod1', []);
    offlineManager.queueRequest('testMethod2', []);
  }

  console.log(`Queued ${offlineManager.requestQueue.length} requests.`);

  const startTime = Date.now();

  await offlineManager._processRequestQueue();

  const endTime = Date.now();
  console.log(`Processing queue took ${endTime - startTime}ms.`);
  console.log(`Remaining in queue: ${offlineManager.requestQueue.length} (expected 50 due to failures)`);
}

runBenchmark().catch(console.error);
