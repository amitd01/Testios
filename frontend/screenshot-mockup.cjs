const { chromium } = require('playwright');
const path = require('path');

const HTML = `file://${path.resolve(__dirname, 'screenshots/mockup.html')}`;
const OUT = path.resolve(__dirname, 'screenshots');

async function capture() {
  const browser = await chromium.launch({ headless: true });

  // Full scrollable page
  const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page1 = await ctx1.newPage();
  await page1.goto(HTML, { waitUntil: 'load', timeout: 10000 });
  await page1.waitForTimeout(500);
  await page1.screenshot({ path: `${OUT}/full-app.png`, fullPage: true });
  console.log('  ✔ full-app.png (full scrollable page)');

  // Individual page screenshots
  const sections = [
    { id: 'page-welcome', name: 'welcome' },
    { id: 'page-dashboard', name: 'dashboard' },
    { id: 'page-transactions', name: 'transactions' },
    { id: 'page-budgets', name: 'budgets' },
    { id: 'page-insights', name: 'insights' },
    { id: 'page-accounts', name: 'accounts' },
  ];

  for (const s of sections) {
    const el = await page1.$(`#${s.id}`);
    if (el) {
      await el.screenshot({ path: `${OUT}/${s.name}.png` });
      console.log(`  ✔ ${s.name}.png`);
    }
  }

  await browser.close();
  console.log('\nAll screenshots saved to', OUT);
}

capture().catch(console.error);
