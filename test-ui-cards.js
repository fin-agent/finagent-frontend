const { chromium } = require('playwright');

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Click "Ask anything" button to open chat
  console.log('Clicking Ask anything...');
  try {
    await page.click('text=Ask anything', { timeout: 10000 });
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log('Could not find Ask anything button:', e.message);
    await page.screenshot({ path: '/tmp/error1.png' });
  }

  // Click "Chat" button to switch to text mode (if visible)
  console.log('Looking for Chat button...');
  try {
    // Wait for chat modal to be visible
    await page.waitForSelector('button:has-text("Chat")', { timeout: 5000 });
    await page.click('button:has-text("Chat")');
    await page.waitForTimeout(1500);
    console.log('Clicked Chat button');
  } catch (e) {
    console.log('Chat button not found, might already be in text mode');
  }

  // Now type and send message
  console.log('Typing query...');
  try {
    // Wait for input to be visible
    await page.waitForSelector('input[placeholder*="portfolio"], input[placeholder*="message"]', { timeout: 10000 });
    await page.fill('input[placeholder*="portfolio"], input[placeholder*="message"]', "Show the highest price I sold Apple at this year");
    await page.screenshot({ path: '/tmp/04_typed.png' });
    console.log('Typed message');

    // Click Send button
    await page.click('button:has-text("Send")', { timeout: 5000 });
    console.log('Clicked Send');

    // Wait for response
    console.log('Waiting 12 seconds for response...');
    await page.waitForTimeout(12000);
    await page.screenshot({ path: '/tmp/05_response.png' });
    console.log('Response screenshot saved to /tmp/05_response.png');

  } catch (e) {
    console.log('Error typing/sending:', e.message);
    await page.screenshot({ path: '/tmp/error3.png' });
  }

  console.log('Done!');
  await browser.close();
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
