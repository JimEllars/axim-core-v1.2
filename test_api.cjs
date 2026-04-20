async function test() {
  const api = (await import('./src/services/onyxAI/api.js')).default;
  console.log(api);
  console.log(typeof api.initialize);
}
test().catch(console.error);
