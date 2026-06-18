const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:5176');
  await page.waitForTimeout(1000);

  // It's likely showing a blank screen due to some Vite error or we need to login
  const content = await page.content();
  console.log(content.slice(0, 500));

  await browser.close();
})();
