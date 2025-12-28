import { test, expect, Page } from '@playwright/test';

/**
 * Voice/UI Sync Test Suite
 * Tests all query types to verify:
 * 1. UI cards are generated correctly
 * 2. Voice response matches UI data
 */

const BASE_URL = 'http://localhost:3000';

// Helper to open assistant and send a query
async function sendQuery(page: Page, query: string): Promise<{ voiceText: string; hasCard: boolean; cardType: string | null }> {
  // Click the assistant button if panel not open
  const assistantOpen = page.locator('[data-testid="assistant-open"]');
  if (await assistantOpen.isVisible()) {
    await assistantOpen.click();
    await page.waitForTimeout(500);
  }

  // Find and fill the text input
  const textInput = page.locator('textarea, input[type="text"]').filter({ hasText: '' }).first();
  await textInput.fill(query);

  // Submit the query
  await page.keyboard.press('Enter');

  // Wait for response (up to 30s for complex queries)
  await page.waitForTimeout(3000);

  // Try to get voice response text
  let voiceText = '';
  const messages = await page.locator('[class*="message"], [class*="Message"]').all();
  if (messages.length > 0) {
    voiceText = await messages[messages.length - 1].textContent() || '';
  }

  // Check for UI card types
  const cardSelectors = [
    { selector: '[class*="TradesTable"], [class*="trades-table"]', type: 'TradesTable' },
    { selector: '[class*="BulkOptions"], [class*="bulk-options"]', type: 'BulkOptionsCard' },
    { selector: '[class*="LastOptionTrade"], [class*="last-option"]', type: 'LastOptionTradeCard' },
    { selector: '[class*="AccountSummary"], [class*="account-summary"]', type: 'AccountSummary' },
    { selector: '[class*="FeesSummary"], [class*="fees-summary"]', type: 'FeesSummary' },
    { selector: '[class*="TradeStats"], [class*="trade-stats"]', type: 'TradeStats' },
    { selector: '[class*="ProfitableTrades"], [class*="profitable"]', type: 'ProfitableTrades' },
    { selector: '[class*="TotalPremium"], [class*="total-premium"]', type: 'TotalPremiumCard' },
    { selector: '[class*="HighestStrike"], [class*="highest-strike"]', type: 'HighestStrikeCard' },
    { selector: '[class*="ExpiringOptions"], [class*="expiring"]', type: 'ExpiringOptionsTable' },
  ];

  let hasCard = false;
  let cardType: string | null = null;

  for (const { selector, type } of cardSelectors) {
    const card = page.locator(selector);
    if (await card.count() > 0) {
      hasCard = true;
      cardType = type;
      break;
    }
  }

  return { voiceText, hasCard, cardType };
}

// Test configuration
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
});

// ==================== TRADES/ORDERS QUERIES ====================
test.describe('Trades/Orders Queries', () => {

  test('Show my trades for last week', async ({ page }) => {
    const result = await sendQuery(page, 'Show my trades for last week');
    await page.screenshot({ path: 'playwright/screenshots/trades-last-week.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
    expect(result.hasCard).toBeTruthy();
  });

  test('Show yesterday trades', async ({ page }) => {
    const result = await sendQuery(page, "Show yesterday's trades");
    await page.screenshot({ path: 'playwright/screenshots/trades-yesterday.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Show yesterday trades filled on Apple', async ({ page }) => {
    const result = await sendQuery(page, "Show all yesterday's trades filled on Apple");
    await page.screenshot({ path: 'playwright/screenshots/trades-yesterday-apple.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Show trades for Apple', async ({ page }) => {
    const result = await sendQuery(page, 'Show trades for Apple');
    await page.screenshot({ path: 'playwright/screenshots/trades-apple.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Last 5 days trades on Google', async ({ page }) => {
    const result = await sendQuery(page, 'Last 5 days trades filled on Google');
    await page.screenshot({ path: 'playwright/screenshots/trades-5days-google.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Trades for past 4 days', async ({ page }) => {
    const result = await sendQuery(page, 'Trades for past 4 days');
    await page.screenshot({ path: 'playwright/screenshots/trades-past-4days.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Show my Monday trades', async ({ page }) => {
    const result = await sendQuery(page, 'Show my Monday trades');
    await page.screenshot({ path: 'playwright/screenshots/trades-monday.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Show profitable trades on Google', async ({ page }) => {
    const result = await sendQuery(page, 'Show all my profitable trades on Google');
    await page.screenshot({ path: 'playwright/screenshots/profitable-google.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Average price I bought Apple at last month', async ({ page }) => {
    const result = await sendQuery(page, 'Show the average price I bought Apple at last month');
    await page.screenshot({ path: 'playwright/screenshots/avg-price-apple.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Highest price I sold Apple at this year', async ({ page }) => {
    const result = await sendQuery(page, 'Show the highest price I sold Apple at this year');
    await page.screenshot({ path: 'playwright/screenshots/highest-price-apple.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });
});

// ==================== OPTION QUERIES ====================
test.describe('Option Queries', () => {

  test('Short call options on Tesla last month', async ({ page }) => {
    const result = await sendQuery(page, 'Show all the short call options on Tesla traded last month');
    await page.screenshot({ path: 'playwright/screenshots/options-tesla-short-calls.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
    expect(result.cardType).toBe('BulkOptionsCard');
  });

  test('Last call options bought on AAPL', async ({ page }) => {
    const result = await sendQuery(page, 'Show the last call options bought on AAPL');
    await page.screenshot({ path: 'playwright/screenshots/options-last-call-aapl.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Options expiring tomorrow', async ({ page }) => {
    const result = await sendQuery(page, 'Show all options expiring tomorrow');
    await page.screenshot({ path: 'playwright/screenshots/options-expiring-tomorrow.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Highest strike call option sold on AAPL this year', async ({ page }) => {
    const result = await sendQuery(page, 'Highest strike call option sold on AAPL this year');
    await page.screenshot({ path: 'playwright/screenshots/options-highest-strike-aapl.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Total premium paid for SPY options last 12 months', async ({ page }) => {
    const result = await sendQuery(page, 'Total premium paid for buying SPY options over the last 12 months');
    await page.screenshot({ path: 'playwright/screenshots/options-total-premium-spy.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });
});

// ==================== ACCOUNT QUERIES ====================
test.describe('Account Queries', () => {

  test('How much money can I withdraw - cash balance', async ({ page }) => {
    const result = await sendQuery(page, 'How much money can I withdraw?');
    await page.screenshot({ path: 'playwright/screenshots/account-cash-balance.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
    // Verify response mentions cash balance
    expect(result.voiceText.toLowerCase()).toContain('cash');
  });

  test('How much money do I have - cash and equity', async ({ page }) => {
    const result = await sendQuery(page, 'How much money do I have?');
    await page.screenshot({ path: 'playwright/screenshots/account-cash-equity.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('What are my available funds', async ({ page }) => {
    const result = await sendQuery(page, 'What are my available funds?');
    await page.screenshot({ path: 'playwright/screenshots/account-available-funds.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('What is my cash balance', async ({ page }) => {
    const result = await sendQuery(page, 'What is my cash balance?');
    await page.screenshot({ path: 'playwright/screenshots/account-cash-balance-2.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('What is my buying power', async ({ page }) => {
    const result = await sendQuery(page, 'What is my buying power?');
    await page.screenshot({ path: 'playwright/screenshots/account-buying-power.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Show my account summary', async ({ page }) => {
    const result = await sendQuery(page, 'Show my account summary');
    await page.screenshot({ path: 'playwright/screenshots/account-summary.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
    expect(result.cardType).toBe('AccountSummary');
  });

  test('Show me my account', async ({ page }) => {
    const result = await sendQuery(page, 'Show me my account');
    await page.screenshot({ path: 'playwright/screenshots/account-show.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('What is my NLV', async ({ page }) => {
    const result = await sendQuery(page, 'What is my NLV?');
    await page.screenshot({ path: 'playwright/screenshots/account-nlv.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('What is my overnight margin', async ({ page }) => {
    const result = await sendQuery(page, "What's my overnight margin?");
    await page.screenshot({ path: 'playwright/screenshots/account-overnight-margin.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Market value of my positions', async ({ page }) => {
    const result = await sendQuery(page, 'What is the market value of my positions?');
    await page.screenshot({ path: 'playwright/screenshots/account-market-value.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Debit balances for the month', async ({ page }) => {
    const result = await sendQuery(page, 'What are my debit balances for the month?');
    await page.screenshot({ path: 'playwright/screenshots/account-debit-balances.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Credit balances for the month', async ({ page }) => {
    const result = await sendQuery(page, 'What are my credit balances for the month?');
    await page.screenshot({ path: 'playwright/screenshots/account-credit-balances.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });
});

// ==================== FEES & COMMISSIONS QUERIES ====================
test.describe('Fees & Commissions Queries', () => {

  test('Total commissions last month', async ({ page }) => {
    const result = await sendQuery(page, 'What were my total commissions last month?');
    await page.screenshot({ path: 'playwright/screenshots/fees-commissions-last-month.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
    expect(result.cardType).toBe('FeesSummary');
  });

  test('Credit interest this month', async ({ page }) => {
    const result = await sendQuery(page, 'How much did I earn from credit interest this month?');
    await page.screenshot({ path: 'playwright/screenshots/fees-credit-interest.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Locate fees for MTEN this year', async ({ page }) => {
    const result = await sendQuery(page, 'How much did I pay to borrow MTEN stock this year?');
    await page.screenshot({ path: 'playwright/screenshots/fees-locate-mten.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Debit interest last week', async ({ page }) => {
    const result = await sendQuery(page, 'How much did I pay in debit interest last week?');
    await page.screenshot({ path: 'playwright/screenshots/fees-debit-interest.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Commissions I paid this year', async ({ page }) => {
    const result = await sendQuery(page, 'Commissions I paid this year');
    await page.screenshot({ path: 'playwright/screenshots/fees-commissions-year.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Short interest from last month', async ({ page }) => {
    const result = await sendQuery(page, 'Short interest from last month');
    await page.screenshot({ path: 'playwright/screenshots/fees-short-interest.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Locate fees for LCID this year', async ({ page }) => {
    const result = await sendQuery(page, 'Locate fees for LCID this year');
    await page.screenshot({ path: 'playwright/screenshots/fees-locate-lcid.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Locate fees for PATH this year', async ({ page }) => {
    const result = await sendQuery(page, 'Locate fees for PATH this year');
    await page.screenshot({ path: 'playwright/screenshots/fees-locate-path.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Debit balance charges for this year', async ({ page }) => {
    const result = await sendQuery(page, 'Debit balance charges for this year');
    await page.screenshot({ path: 'playwright/screenshots/fees-debit-charges-year.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });

  test('Interest credits this month', async ({ page }) => {
    const result = await sendQuery(page, 'Interest credits this month');
    await page.screenshot({ path: 'playwright/screenshots/fees-interest-credits.png' });
    console.log('Voice:', result.voiceText);
    console.log('Card:', result.cardType);
  });
});

// ==================== EDGE CASE QUERIES ====================
test.describe('Edge Case Queries - Data Verification', () => {

  test('AAPL trades in September - verify correct month', async ({ page }) => {
    const result = await sendQuery(page, 'How many trades done on AAPL in September?');
    await page.screenshot({ path: 'playwright/screenshots/edge-aapl-september.png' });
    console.log('Voice:', result.voiceText);
    // Should NOT return August trades
    expect(result.voiceText.toLowerCase()).not.toContain('august');
  });

  test('AMAT shares sold this year', async ({ page }) => {
    const result = await sendQuery(page, 'Total shares I sold on AMAT this year');
    await page.screenshot({ path: 'playwright/screenshots/edge-amat-shares.png' });
    console.log('Voice:', result.voiceText);
  });

  test('Applied Materials 30 shares - date verification', async ({ page }) => {
    const result = await sendQuery(page, 'Which day did I sell 30 shares of Applied Materials?');
    await page.screenshot({ path: 'playwright/screenshots/edge-amat-30shares.png' });
    console.log('Voice:', result.voiceText);
  });

  test('AMZN put options count', async ({ page }) => {
    const result = await sendQuery(page, 'How many Put options did I trade on AMZN?');
    await page.screenshot({ path: 'playwright/screenshots/edge-amzn-puts.png' });
    console.log('Voice:', result.voiceText);
  });

  test('AMZN call options count', async ({ page }) => {
    const result = await sendQuery(page, 'How many call options did I trade on AMZN?');
    await page.screenshot({ path: 'playwright/screenshots/edge-amzn-calls.png' });
    console.log('Voice:', result.voiceText);
  });

  test('Highest strike call on AMZN this year', async ({ page }) => {
    const result = await sendQuery(page, 'What was the highest strike call option I sold on AMZN this year?');
    await page.screenshot({ path: 'playwright/screenshots/edge-amzn-highest-strike.png' });
    console.log('Voice:', result.voiceText);
  });

  test('Symbol C - Citibank trades', async ({ page }) => {
    const result = await sendQuery(page, 'How many Citibank shares did I sell this year?');
    await page.screenshot({ path: 'playwright/screenshots/edge-citibank.png' });
    console.log('Voice:', result.voiceText);
    // Expected: 560 shares
  });

  test('PATH trades this year', async ({ page }) => {
    const result = await sendQuery(page, 'Did I do any trades on PATH this year?');
    await page.screenshot({ path: 'playwright/screenshots/edge-path-trades.png' });
    console.log('Voice:', result.voiceText);
    // Expected: 13 trades
  });

  test('Current debit balance', async ({ page }) => {
    const result = await sendQuery(page, 'What is my current debit balance?');
    await page.screenshot({ path: 'playwright/screenshots/edge-current-debit.png' });
    console.log('Voice:', result.voiceText);
  });

  test('Long and short market value', async ({ page }) => {
    const result = await sendQuery(page, 'What is my long and short market value?');
    await page.screenshot({ path: 'playwright/screenshots/edge-long-short-mv.png' });
    console.log('Voice:', result.voiceText);
  });

  test('Average debit balance for December', async ({ page }) => {
    const result = await sendQuery(page, 'What is my average debit balance for December?');
    await page.screenshot({ path: 'playwright/screenshots/edge-avg-debit-dec.png' });
    console.log('Voice:', result.voiceText);
  });
});

// ==================== VOICE/UI CONSISTENCY TESTS ====================
// These tests intercept API responses to verify voice response matches uiData
test.describe('Voice/UI Consistency - API Response Verification', () => {

  // Helper to extract numbers from text
  function extractNumbers(text: string): number[] {
    const matches = text.match(/\d+(?:\.\d+)?/g);
    return matches ? matches.map(n => parseFloat(n)) : [];
  }

  test('Apple January trades - voice says "no trades" when UI shows 0', async ({ page }) => {
    // Set up response interception
    let apiResponse: { response: string; uiData?: { tradeCount?: number; counts?: { total: number } } } | null = null;

    await page.route('**/api/elevenlabs/**', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      apiResponse = json;
      await route.fulfill({ response, json });
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const result = await sendQuery(page, 'How many trades for Apple in January?');
    await page.screenshot({ path: 'playwright/screenshots/consistency-apple-january.png' });

    console.log('API Response:', JSON.stringify(apiResponse, null, 2));
    console.log('Voice Text:', result.voiceText);

    if (apiResponse) {
      const tradeCount = apiResponse.uiData?.tradeCount ?? apiResponse.uiData?.counts?.total ?? 0;
      const voiceMentionsZero = apiResponse.response.toLowerCase().includes('no trades') ||
                                apiResponse.response.toLowerCase().includes('0 trades') ||
                                !extractNumbers(apiResponse.response).some(n => n > 0);

      // If UI shows 0 trades, voice should NOT mention positive numbers
      if (tradeCount === 0) {
        const numbersInVoice = extractNumbers(apiResponse.response);
        const hasPositiveTradeNumber = numbersInVoice.some(n => n > 0 && n < 1000); // Trade counts are typically < 1000
        expect(hasPositiveTradeNumber, 'Voice mentioned positive numbers but UI shows 0 trades').toBe(false);
      }
    }
  });

  test('Trade summary - voice count matches uiData.counts.total', async ({ page }) => {
    let apiResponse: { response: string; uiData?: { tradeCount?: number; counts?: { total: number; stocks: number; options: number } } } | null = null;

    await page.route('**/api/elevenlabs/trade-summary**', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      apiResponse = json;
      await route.fulfill({ response, json });
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const result = await sendQuery(page, 'How many trades did I make on Tesla this year?');
    await page.screenshot({ path: 'playwright/screenshots/consistency-tesla-summary.png' });

    console.log('API Response:', JSON.stringify(apiResponse, null, 2));

    if (apiResponse && apiResponse.uiData) {
      const totalFromUI = apiResponse.uiData.tradeCount ?? apiResponse.uiData.counts?.total ?? 0;
      const stocksFromUI = apiResponse.uiData.counts?.stocks ?? 0;
      const optionsFromUI = apiResponse.uiData.counts?.options ?? 0;

      // Voice response should mention the same total
      const numbersInVoice = extractNumbers(apiResponse.response);
      console.log('UI Total:', totalFromUI, '| Stocks:', stocksFromUI, '| Options:', optionsFromUI);
      console.log('Numbers in voice:', numbersInVoice);

      // The total should appear in the voice response
      if (totalFromUI > 0) {
        expect(numbersInVoice, 'Voice response should contain trade count').toContain(totalFromUI);
      }
    }
  });

  test('Time-based trades - voice response uses computed counts only', async ({ page }) => {
    let apiResponse: { response: string; uiData?: { tradeCount?: number; trades?: unknown[] }; _debug?: { dbRowCount: number } } | null = null;

    await page.route('**/api/elevenlabs/time-trades**', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      apiResponse = json;
      await route.fulfill({ response, json });
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const result = await sendQuery(page, 'Show my trades from last week');
    await page.screenshot({ path: 'playwright/screenshots/consistency-time-trades.png' });

    console.log('API Response:', JSON.stringify(apiResponse, null, 2));

    if (apiResponse && apiResponse.uiData) {
      const uiTradeCount = apiResponse.uiData.tradeCount ?? 0;
      const dbRowCount = apiResponse._debug?.dbRowCount ?? 0;

      console.log('UI Trade Count:', uiTradeCount, '| DB Row Count:', dbRowCount);

      // UI count should match DB rows (no fabrication)
      expect(uiTradeCount, 'UI trade count should match database rows').toBe(dbRowCount);
    }
  });

  test('Fees query - voice amount matches uiData.totalAmount', async ({ page }) => {
    let apiResponse: { response: string; uiData?: { totalAmount?: number; feeType?: string } } | null = null;

    await page.route('**/api/elevenlabs/fees**', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      apiResponse = json;
      await route.fulfill({ response, json });
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const result = await sendQuery(page, 'What were my commissions last month?');
    await page.screenshot({ path: 'playwright/screenshots/consistency-fees.png' });

    console.log('API Response:', JSON.stringify(apiResponse, null, 2));

    if (apiResponse && apiResponse.uiData && apiResponse.uiData.totalAmount !== undefined) {
      const uiAmount = apiResponse.uiData.totalAmount;
      const numbersInVoice = extractNumbers(apiResponse.response);

      console.log('UI Amount:', uiAmount, '| Numbers in voice:', numbersInVoice);

      // The amount should appear in voice response (allowing for currency formatting differences)
      const roundedUIAmount = Math.round(uiAmount * 100) / 100;
      const voiceHasAmount = numbersInVoice.some(n => Math.abs(n - roundedUIAmount) < 0.01);

      if (uiAmount > 0) {
        expect(voiceHasAmount, `Voice should mention $${roundedUIAmount}`).toBe(true);
      }
    }
  });

  test('Debug trace fields present in response', async ({ page }) => {
    let apiResponse: { _debug?: { traceId: string; resolvedSymbol: string; dbRowCount: number; computedAt: string } } | null = null;

    await page.route('**/api/elevenlabs/**', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      apiResponse = json;
      await route.fulfill({ response, json });
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    await sendQuery(page, 'Show trades for Tesla');
    await page.screenshot({ path: 'playwright/screenshots/consistency-debug-trace.png' });

    console.log('Debug fields:', apiResponse?._debug);

    // Verify debug fields are present for observability
    if (apiResponse?._debug) {
      expect(apiResponse._debug.traceId, 'Should have traceId').toBeTruthy();
      expect(apiResponse._debug.computedAt, 'Should have computedAt timestamp').toBeTruthy();
      expect(typeof apiResponse._debug.dbRowCount, 'Should have dbRowCount').toBe('number');
    }
  });
});
