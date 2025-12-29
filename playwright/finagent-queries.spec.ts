import { expect, test, type Page } from '@playwright/test';

async function openAssistant(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('assistant-open')).toBeVisible();
  await page.getByTestId('assistant-open').click();
  const input = page.getByTestId('assistant-input');
  if (await input.count() === 0) {
    await expect(page.getByTestId('assistant-toggle-mode')).toBeVisible();
    await page.getByTestId('assistant-toggle-mode').click();
  }
  await expect(input).toBeVisible();
}

async function ask(page: Page, question: string) {
  await page.getByTestId('assistant-input').fill(question);
  await page.getByTestId('assistant-send').click();
}

test.beforeEach(async ({ page }) => {
  // Hard-disable any accidental calls to paid/external services during E2E.
  await page.route('**/api/classify-intent', (route) => route.fulfill({ json: { result: null } }));
  await page.route('**/api/conversations', async (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ json: { conversation: { id: 'conv_test', title: 'New Chat' } } });
    }
    return route.fulfill({ json: { conversations: [] } });
  });
  await page.route('**/api/messages**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { messages: [] } });
    }
    return route.fulfill({ json: { message: { id: 'msg_test' } } });
  });
  await page.route('https://*.supabase.co/**', (route) => route.abort());

  await page.route('**/api/account-balance-ui', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}') as { queryType?: string; timePeriod?: string };
    const queryType = body.queryType || 'account_summary';

    const base = {
      queryType,
      date: '2025-11-20',
      cashBalance: 12345.67,
      accountEquity: 23456.78,
      dayTradingBP: 99999.99,
      stockLMV: 1000,
      stockSMV: -200,
      optionsLMV: 300,
      optionsSMV: -50,
      houseRequirement: 50000,
      houseExcessDeficit: 1200,
      fedRequirement: 0,
      fedExcessDeficit: 0,
    };

    if (queryType === 'debit_balances') {
      return route.fulfill({
        json: {
          queryType,
          date: '2025-11-20',
          balanceTrend: {
            average: 2000,
            highest: 3500,
            highestDate: '2025-11-18',
            lowest: 1500,
            lowestDate: '2025-11-02',
            period: 'month of October',
            periodMonth: 'October',
            entries: [
              { date: '2025-11-02', amount: 1500 },
              { date: '2025-11-10', amount: 2000 },
              { date: '2025-11-18', amount: 3500 },
            ],
          },
        },
      });
    }

    if (queryType === 'credit_balances') {
      return route.fulfill({
        json: {
          queryType,
          date: '2025-11-20',
          balanceTrend: {
            average: 4000,
            highest: 6000,
            highestDate: '2025-11-19',
            lowest: 3000,
            lowestDate: '2025-11-05',
            period: 'month of October',
            periodMonth: 'October',
            entries: [
              { date: '2025-11-05', amount: 3000 },
              { date: '2025-11-12', amount: 4000 },
              { date: '2025-11-19', amount: 6000 },
            ],
          },
        },
      });
    }

    return route.fulfill({ json: base });
  });

  await page.route('**/api/fees-ui', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}') as { feeType?: string; timePeriod?: string; symbol?: string };
    const feeType = body.feeType || 'commission';

    if (feeType === 'commission') {
      return route.fulfill({
        json: {
          feeType,
          totalAmount: 12.34,
          transactionCount: 4,
          timePeriod: 'month of October',
          periodMonth: 'October',
          breakdown: [
            { date: '2025-11-19', amount: 3.21, symbol: 'AAPL' },
            { date: '2025-11-18', amount: 9.13, symbol: 'TSLA' },
          ],
        },
      });
    }

    if (feeType === 'credit_interest') {
      return route.fulfill({
        json: {
          feeType,
          totalAmount: 5.67,
          transactionCount: 2,
          timePeriod: 'month of November',
          periodMonth: 'November',
          breakdown: [
            { date: '2025-11-20', amount: 2.34 },
            { date: '2025-11-19', amount: 3.33 },
          ],
        },
      });
    }

    if (feeType === 'locate_fee') {
      return route.fulfill({
        json: {
          feeType,
          totalAmount: 8.9,
          transactionCount: 1,
          timePeriod: 'this year',
          symbol: (body.symbol || 'MTEN').toUpperCase(),
          breakdown: [
            { date: '2025-11-20', amount: 8.9, symbol: (body.symbol || 'MTEN').toUpperCase() },
          ],
        },
      });
    }

    // debit_interest
    return route.fulfill({
      json: {
        feeType,
        totalAmount: 1.23,
        transactionCount: 3,
        timePeriod: 'last week',
        breakdown: [
          { date: '2025-11-18', amount: 0.4 },
          { date: '2025-11-19', amount: 0.41 },
          { date: '2025-11-20', amount: 0.42 },
        ],
      },
    });
  });
});

test('account balance queries render matching text + card', async ({ page }) => {
  await openAssistant(page);

  // Cash balance (withdrawable)
  await ask(page, 'How much money can I withdraw?');
  const cashHeading = page.getByRole('heading', { name: 'Cash Balance' }).last();
  await expect(cashHeading).toBeVisible();
  const cashDate = await cashHeading.locator('xpath=following-sibling::*[1]').innerText();
  const cashCard = cashHeading.locator('xpath=ancestor::div[2]');
  await expect(cashCard).toContainText('$12,345.67');
  await expect(page.getByText(`Your account cash balance as of ${cashDate} is $12,345.67`).last()).toBeVisible();

  // Cash + equity
  await ask(page, 'How much money do I have?');
  const cashEquityHeading = page.getByRole('heading', { name: 'Cash & Equity' }).last();
  await expect(cashEquityHeading).toBeVisible();
  const cashEquityDate = await cashEquityHeading.locator('xpath=following-sibling::*[1]').innerText();
  const cashEquityCard = cashEquityHeading.locator('xpath=ancestor::div[2]');
  await expect(cashEquityCard).toContainText('$12,345.67');
  await expect(cashEquityCard).toContainText('$23,456.78');
  await expect(page.getByText(`Your account cash balance as of ${cashEquityDate} is $12,345.67, and your account equity is $23,456.78`).last()).toBeVisible();

  // Buying power
  await ask(page, 'What is my buying power?');
  const bpHeading = page.getByRole('heading', { name: 'Day Trading Buying Power' }).last();
  await expect(bpHeading).toBeVisible();
  const bpDate = await bpHeading.locator('xpath=following-sibling::*[1]').innerText();
  const bpCard = bpHeading.locator('xpath=ancestor::div[2]');
  await expect(bpCard).toContainText('$99,999.99');
  await expect(page.getByText(`Your day trading buying power as of ${bpDate} is $99,999.99`).last()).toBeVisible();

  // Overnight margin (house requirement/excess)
  await ask(page, "What's my overnight margin?");
  const marginHeading = page.getByRole('heading', { name: 'Overnight Margin' }).last();
  await expect(marginHeading).toBeVisible();
  const marginDate = await marginHeading.locator('xpath=following-sibling::*[1]').innerText();
  const marginCard = marginHeading.locator('xpath=ancestor::div[2]');
  await expect(marginCard).toContainText('$50,000.00');
  await expect(marginCard).toContainText('$1,200.00');
  await expect(page.getByText(`Your house requirement as of ${marginDate} is $50,000.00, and your house excess is $1,200.00`).last()).toBeVisible();

  // Account summary
  await ask(page, 'Show my account summary');
  const summaryHeading = page.getByRole('heading', { name: 'Account Summary' }).last();
  await expect(summaryHeading).toBeVisible();
  const summaryDate = await summaryHeading.locator('xpath=following-sibling::*[1]').innerText();
  const summaryMsg = page.getByText(`Your account summary as of ${summaryDate}:`).last();
  await expect(summaryMsg).toBeVisible();
  await expect(summaryMsg).toContainText('* Cash Balance: $12,345.67');
  await expect(summaryMsg).toContainText('* Account Equity: $23,456.78');
  await expect(summaryMsg).toContainText('* Day Trading Buying Power: $99,999.99');

  // NLV
  await ask(page, 'What is my NLV?');
  const nlvHeading = page.getByRole('heading', { name: 'Net Liquidation Value' }).last();
  await expect(nlvHeading).toBeVisible();
  const nlvDate = await nlvHeading.locator('xpath=following-sibling::*[1]').innerText();
  const nlvCard = nlvHeading.locator('xpath=ancestor::div[2]');
  await expect(nlvCard).toContainText('$23,456.78');
  await expect(page.getByText(`Your net liquidation value as of ${nlvDate} is $23,456.78`).last()).toBeVisible();

  // Market value of positions
  await ask(page, 'What is the market value of my positions?');
  const mvHeading = page.getByRole('heading', { name: 'Position Market Values' }).last();
  await expect(mvHeading).toBeVisible();
  const mvCard = mvHeading.locator('xpath=ancestor::div[2]');
  await expect(mvCard).toContainText('$1,000.00');
  await expect(mvCard).toContainText('$300.00');
  await expect(mvCard).toContainText('-$200.00');
  await expect(mvCard).toContainText('-$50.00');
  await expect(page.getByText('The market value of your long stock positions is $1,000.00, your long options positions is $300.00, your short stock positions is -$200.00, and your short options positions is -$50.00').last()).toBeVisible();

  // Debit balances for the month
  await ask(page, 'Debit balances for the month');
  const debitHeading = page.getByRole('heading', { name: 'Debit Balance Trend' }).last();
  await expect(debitHeading).toBeVisible();
  const debitCard = debitHeading.locator('xpath=ancestor::div[2]');
  await expect(debitCard).toContainText('month of October');
  const debitHighestLabel = await debitCard.getByText('Highest (').innerText();
  const debitLowestLabel = await debitCard.getByText('Lowest (').innerText();
  const debitHighestDate = debitHighestLabel.match(/\((.*)\)/)?.[1];
  const debitLowestDate = debitLowestLabel.match(/\((.*)\)/)?.[1];
  expect(debitHighestDate).toBeTruthy();
  expect(debitLowestDate).toBeTruthy();
  await expect(page.getByText('Your average debit balance for the month of October is $2,000.00.').last()).toBeVisible();
  await expect(page.getByText(`The highest debit balance was on ${debitHighestDate} at $3,500.00.`).last()).toBeVisible();
  await expect(page.getByText(`The lowest debit balance was on ${debitLowestDate} at $1,500.00.`).last()).toBeVisible();
});

test('fees and commissions queries render matching text + card', async ({ page }) => {
  await openAssistant(page);

  // Total commissions last month
  await ask(page, 'What were my total commissions last month?');
  const commissionHeading = page.getByRole('heading', { name: 'Trading Commissions' }).last();
  await expect(commissionHeading).toBeVisible();
  const commissionCard = commissionHeading.locator('xpath=ancestor-or-self::*[@data-testid="fees-summary-card"][1]');
  await expect(commissionCard.getByTestId('fees-card-period')).toHaveText('month of October');
  await expect(commissionCard).toContainText('$12.34');
  await expect(page.getByText('The total commission you paid in the month of October is $12.34').last()).toBeVisible();

  // Credit interest this month
  await ask(page, 'How much did I earn from credit interest this month?');
  const creditHeading = page.getByRole('heading', { name: 'Credit Interest' }).last();
  await expect(creditHeading).toBeVisible();
  const creditCard = creditHeading.locator('xpath=ancestor-or-self::*[@data-testid="fees-summary-card"][1]');
  await expect(creditCard.getByTestId('fees-card-period')).toHaveText('month of November');
  await expect(creditCard).toContainText('$5.67');
  await expect(page.getByText('The total credit interest you received for the month of November is $5.67').last()).toBeVisible();

  // Locate fees for MTEN this year
  await ask(page, 'How much did I pay to borrow MTEN stock this year?');
  const locateHeading = page.getByRole('heading', { name: 'Locate Fees — MTEN' }).last();
  await expect(locateHeading).toBeVisible();
  const locateCard = locateHeading.locator('xpath=ancestor-or-self::*[@data-testid="fees-summary-card"][1]');
  await expect(locateCard.getByTestId('fees-card-period')).toHaveText('this year');
  await expect(locateCard).toContainText('$8.90');
  await expect(page.getByText('The total locate fees you paid for stock MTEN this year is $8.90').last()).toBeVisible();

  // Debit interest last week
  await ask(page, 'How much did I pay in debit interest last week?');
  const debitHeading = page.getByRole('heading', { name: 'Debit Interest' }).last();
  await expect(debitHeading).toBeVisible();
  const debitIntCard = debitHeading.locator('xpath=ancestor-or-self::*[@data-testid="fees-summary-card"][1]');
  await expect(debitIntCard.getByTestId('fees-card-period')).toHaveText('last week');
  await expect(debitIntCard).toContainText('$1.23');
  await expect(page.getByText('The total debit interest you paid last week is $1.23').last()).toBeVisible();
});
