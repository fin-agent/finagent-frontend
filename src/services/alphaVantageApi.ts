/**
 * Alpha Vantage API Service
 *
 * Provides fundamental data including:
 * - Company overview (description, sector, metrics)
 * - Financial statements (income, balance, cash flow)
 * - Earnings calendar
 * - Dividend history
 *
 * Note: Free tier is limited to 25 API calls per day
 * https://www.alphavantage.co/documentation/
 */

const AV_BASE_URL = 'https://www.alphavantage.co/query';

function getApiKey(): string {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) {
    throw new Error('ALPHA_VANTAGE_API_KEY environment variable is not set');
  }
  return key;
}

// ============================================================================
// Types
// ============================================================================

export interface CompanyOverview {
  symbol: string;
  name: string;
  description: string;
  exchange: string;
  currency: string;
  country: string;
  sector: string;
  industry: string;
  // Key metrics
  marketCap: number;
  peRatio: number | null;
  pegRatio: number | null;
  bookValue: number | null;
  dividendPerShare: number | null;
  dividendYield: number | null;
  eps: number | null;
  // Price metrics
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  fiftyDayMA: number | null;
  twoHundredDayMA: number | null;
  // Valuation
  priceToBookRatio: number | null;
  priceToSalesRatio: number | null;
  evToRevenue: number | null;
  evToEbitda: number | null;
  // Performance
  beta: number | null;
  profitMargin: number | null;
  operatingMargin: number | null;
  returnOnAssets: number | null;
  returnOnEquity: number | null;
  // Financial health
  revenuePerShare: number | null;
  quarterlyRevenueGrowth: number | null;
  quarterlyEarningsGrowth: number | null;
  // Additional
  sharesOutstanding: number | null;
  analystTargetPrice: number | null;
  forwardPE: number | null;
}

export interface IncomeStatementEntry {
  fiscalDateEnding: string;
  reportedCurrency: string;
  totalRevenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  ebitda: number;
  costOfRevenue: number;
  operatingExpenses: number;
  interestExpense: number;
  incomeTaxExpense: number;
}

export interface BalanceSheetEntry {
  fiscalDateEnding: string;
  reportedCurrency: string;
  totalAssets: number;
  totalCurrentAssets: number;
  totalLiabilities: number;
  totalCurrentLiabilities: number;
  totalShareholderEquity: number;
  cashAndEquivalents: number;
  shortTermDebt: number;
  longTermDebt: number;
  retainedEarnings: number;
}

export interface CashFlowEntry {
  fiscalDateEnding: string;
  reportedCurrency: string;
  operatingCashflow: number;
  capitalExpenditures: number;
  freeCashFlow: number;
  dividendPayout: number;
  changeInCash: number;
  netIncome: number;
  depreciation: number;
}

export interface EarningsEntry {
  fiscalDateEnding: string;
  reportedDate: string;
  reportedEPS: number | null;
  estimatedEPS: number | null;
  surprise: number | null;
  surprisePercentage: number | null;
}

export interface EarningsCalendarEntry {
  symbol: string;
  name: string;
  reportDate: string;
  fiscalDateEnding: string;
  estimate: number | null;
  currency: string;
}

export interface DividendEntry {
  exDividendDate: string;
  declarationDate: string;
  recordDate: string;
  paymentDate: string;
  amount: number;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get company overview and key metrics
 */
export async function getCompanyOverview(symbol: string): Promise<CompanyOverview | null> {
  const url = `${AV_BASE_URL}?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${getApiKey()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch company overview for ${symbol}: ${response.statusText}`);
  }

  const data = await response.json();

  // Check for API error or empty response
  if (data['Error Message'] || data['Note'] || !data.Symbol) {
    console.warn('Alpha Vantage API error or rate limit:', data);
    return null;
  }

  return {
    symbol: data.Symbol,
    name: data.Name,
    description: data.Description,
    exchange: data.Exchange,
    currency: data.Currency,
    country: data.Country,
    sector: data.Sector,
    industry: data.Industry,
    marketCap: parseFloat(data.MarketCapitalization) || 0,
    peRatio: parseNumber(data.PERatio),
    pegRatio: parseNumber(data.PEGRatio),
    bookValue: parseNumber(data.BookValue),
    dividendPerShare: parseNumber(data.DividendPerShare),
    dividendYield: parseNumber(data.DividendYield),
    eps: parseNumber(data.EPS),
    fiftyTwoWeekHigh: parseFloat(data['52WeekHigh']) || 0,
    fiftyTwoWeekLow: parseFloat(data['52WeekLow']) || 0,
    fiftyDayMA: parseNumber(data['50DayMovingAverage']),
    twoHundredDayMA: parseNumber(data['200DayMovingAverage']),
    priceToBookRatio: parseNumber(data.PriceToBookRatio),
    priceToSalesRatio: parseNumber(data.PriceToSalesRatioTTM),
    evToRevenue: parseNumber(data.EVToRevenue),
    evToEbitda: parseNumber(data.EVToEBITDA),
    beta: parseNumber(data.Beta),
    profitMargin: parseNumber(data.ProfitMargin),
    operatingMargin: parseNumber(data.OperatingMarginTTM),
    returnOnAssets: parseNumber(data.ReturnOnAssetsTTM),
    returnOnEquity: parseNumber(data.ReturnOnEquityTTM),
    revenuePerShare: parseNumber(data.RevenuePerShareTTM),
    quarterlyRevenueGrowth: parseNumber(data.QuarterlyRevenueGrowthYOY),
    quarterlyEarningsGrowth: parseNumber(data.QuarterlyEarningsGrowthYOY),
    sharesOutstanding: parseNumber(data.SharesOutstanding),
    analystTargetPrice: parseNumber(data.AnalystTargetPrice),
    forwardPE: parseNumber(data.ForwardPE),
  };
}

/**
 * Get income statement (annual and quarterly)
 */
export async function getIncomeStatement(
  symbol: string,
  annual: boolean = true
): Promise<IncomeStatementEntry[]> {
  const url = `${AV_BASE_URL}?function=INCOME_STATEMENT&symbol=${encodeURIComponent(symbol)}&apikey=${getApiKey()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch income statement for ${symbol}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data['Error Message'] || data['Note']) {
    console.warn('Alpha Vantage API error or rate limit:', data);
    return [];
  }

  const reports = annual ? data.annualReports : data.quarterlyReports;
  if (!reports) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return reports.map((report: Record<string, any>) => ({
    fiscalDateEnding: report.fiscalDateEnding,
    reportedCurrency: report.reportedCurrency,
    totalRevenue: parseFloat(report.totalRevenue) || 0,
    grossProfit: parseFloat(report.grossProfit) || 0,
    operatingIncome: parseFloat(report.operatingIncome) || 0,
    netIncome: parseFloat(report.netIncome) || 0,
    ebitda: parseFloat(report.ebitda) || 0,
    costOfRevenue: parseFloat(report.costOfRevenue) || 0,
    operatingExpenses: parseFloat(report.operatingExpense) || 0,
    interestExpense: parseFloat(report.interestExpense) || 0,
    incomeTaxExpense: parseFloat(report.incomeTaxExpense) || 0,
  }));
}

/**
 * Get balance sheet (annual and quarterly)
 */
export async function getBalanceSheet(
  symbol: string,
  annual: boolean = true
): Promise<BalanceSheetEntry[]> {
  const url = `${AV_BASE_URL}?function=BALANCE_SHEET&symbol=${encodeURIComponent(symbol)}&apikey=${getApiKey()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch balance sheet for ${symbol}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data['Error Message'] || data['Note']) {
    console.warn('Alpha Vantage API error or rate limit:', data);
    return [];
  }

  const reports = annual ? data.annualReports : data.quarterlyReports;
  if (!reports) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return reports.map((report: Record<string, any>) => ({
    fiscalDateEnding: report.fiscalDateEnding,
    reportedCurrency: report.reportedCurrency,
    totalAssets: parseFloat(report.totalAssets) || 0,
    totalCurrentAssets: parseFloat(report.totalCurrentAssets) || 0,
    totalLiabilities: parseFloat(report.totalLiabilities) || 0,
    totalCurrentLiabilities: parseFloat(report.totalCurrentLiabilities) || 0,
    totalShareholderEquity: parseFloat(report.totalShareholderEquity) || 0,
    cashAndEquivalents: parseFloat(report.cashAndCashEquivalentsAtCarryingValue) || 0,
    shortTermDebt: parseFloat(report.shortTermDebt) || 0,
    longTermDebt: parseFloat(report.longTermDebt) || 0,
    retainedEarnings: parseFloat(report.retainedEarnings) || 0,
  }));
}

/**
 * Get cash flow statement (annual and quarterly)
 */
export async function getCashFlow(
  symbol: string,
  annual: boolean = true
): Promise<CashFlowEntry[]> {
  const url = `${AV_BASE_URL}?function=CASH_FLOW&symbol=${encodeURIComponent(symbol)}&apikey=${getApiKey()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch cash flow for ${symbol}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data['Error Message'] || data['Note']) {
    console.warn('Alpha Vantage API error or rate limit:', data);
    return [];
  }

  const reports = annual ? data.annualReports : data.quarterlyReports;
  if (!reports) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return reports.map((report: Record<string, any>) => {
    const operatingCashflow = parseFloat(report.operatingCashflow) || 0;
    const capitalExpenditures = parseFloat(report.capitalExpenditures) || 0;

    return {
      fiscalDateEnding: report.fiscalDateEnding,
      reportedCurrency: report.reportedCurrency,
      operatingCashflow,
      capitalExpenditures,
      freeCashFlow: operatingCashflow - Math.abs(capitalExpenditures),
      dividendPayout: parseFloat(report.dividendPayout) || 0,
      changeInCash: parseFloat(report.changeInCash) || 0,
      netIncome: parseFloat(report.netIncome) || 0,
      depreciation: parseFloat(report.depreciation) || 0,
    };
  });
}

/**
 * Get historical earnings data
 */
export async function getEarnings(symbol: string): Promise<EarningsEntry[]> {
  const url = `${AV_BASE_URL}?function=EARNINGS&symbol=${encodeURIComponent(symbol)}&apikey=${getApiKey()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch earnings for ${symbol}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data['Error Message'] || data['Note']) {
    console.warn('Alpha Vantage API error or rate limit:', data);
    return [];
  }

  const reports = data.quarterlyEarnings;
  if (!reports) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return reports.map((report: Record<string, any>) => ({
    fiscalDateEnding: report.fiscalDateEnding,
    reportedDate: report.reportedDate,
    reportedEPS: parseNumber(report.reportedEPS),
    estimatedEPS: parseNumber(report.estimatedEPS),
    surprise: parseNumber(report.surprise),
    surprisePercentage: parseNumber(report.surprisePercentage),
  }));
}

/**
 * Get upcoming earnings calendar
 * Note: Returns all companies with upcoming earnings if no symbol provided
 */
export async function getEarningsCalendar(symbol?: string): Promise<EarningsCalendarEntry[]> {
  let url = `${AV_BASE_URL}?function=EARNINGS_CALENDAR&apikey=${getApiKey()}`;
  if (symbol) {
    url += `&symbol=${encodeURIComponent(symbol)}`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch earnings calendar: ${response.statusText}`);
  }

  // Earnings calendar returns CSV format
  const csvText = await response.text();

  // Check for API error
  if (csvText.includes('Error Message') || csvText.includes('premium')) {
    console.warn('Alpha Vantage API error or premium endpoint:', csvText);
    return [];
  }

  // Parse CSV
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const entries: EarningsCalendarEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length >= 5) {
      entries.push({
        symbol: cols[0],
        name: cols[1],
        reportDate: cols[2],
        fiscalDateEnding: cols[3],
        estimate: parseNumber(cols[4]),
        currency: cols[5] || 'USD',
      });
    }
  }

  return entries;
}

/**
 * Get dividend history
 */
export async function getDividendHistory(symbol: string): Promise<DividendEntry[]> {
  // Using TIME_SERIES_MONTHLY_ADJUSTED for dividend data
  // Alpha Vantage doesn't have a dedicated dividend endpoint in free tier
  const url = `${AV_BASE_URL}?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&apikey=${getApiKey()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch dividend history for ${symbol}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data['Error Message'] || data['Note']) {
    console.warn('Alpha Vantage API error or rate limit:', data);
    return [];
  }

  const timeSeries = data['Monthly Adjusted Time Series'];
  if (!timeSeries) return [];

  const dividends: DividendEntry[] = [];

  for (const [date, values] of Object.entries(timeSeries)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = values as Record<string, any>;
    const dividendAmount = parseFloat(v['7. dividend amount']) || 0;

    if (dividendAmount > 0) {
      dividends.push({
        exDividendDate: date,
        declarationDate: '', // Not available in this endpoint
        recordDate: '', // Not available in this endpoint
        paymentDate: '', // Not available in this endpoint
        amount: dividendAmount,
      });
    }
  }

  return dividends.slice(0, 20); // Return last 20 dividends
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse a value that might be "None" or empty to number | null
 */
function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === 'None' || value === '-') {
    return null;
  }
  const num = typeof value === 'number' ? value : parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Format large numbers for display
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number | null): string {
  if (value === null) return 'N/A';
  return (value * 100).toFixed(2) + '%';
}

/**
 * Get a specific metric from company overview
 */
export function getMetricValue(
  overview: CompanyOverview,
  metricType: string
): { value: number | null; label: string; format: 'currency' | 'percentage' | 'number' | 'large_number' } {
  const metricMap: Record<string, { key: keyof CompanyOverview; label: string; format: 'currency' | 'percentage' | 'number' | 'large_number' }> = {
    pe_ratio: { key: 'peRatio', label: 'P/E Ratio', format: 'number' },
    peg_ratio: { key: 'pegRatio', label: 'PEG Ratio', format: 'number' },
    market_cap: { key: 'marketCap', label: 'Market Cap', format: 'large_number' },
    beta: { key: 'beta', label: 'Beta', format: 'number' },
    eps: { key: 'eps', label: 'EPS', format: 'currency' },
    dividend_yield: { key: 'dividendYield', label: 'Dividend Yield', format: 'percentage' },
    dividend_per_share: { key: 'dividendPerShare', label: 'Dividend Per Share', format: 'currency' },
    '52_week_high': { key: 'fiftyTwoWeekHigh', label: '52 Week High', format: 'currency' },
    '52_week_low': { key: 'fiftyTwoWeekLow', label: '52 Week Low', format: 'currency' },
    book_value: { key: 'bookValue', label: 'Book Value', format: 'currency' },
    price_to_book: { key: 'priceToBookRatio', label: 'Price to Book', format: 'number' },
    price_to_sales: { key: 'priceToSalesRatio', label: 'Price to Sales', format: 'number' },
    profit_margin: { key: 'profitMargin', label: 'Profit Margin', format: 'percentage' },
    operating_margin: { key: 'operatingMargin', label: 'Operating Margin', format: 'percentage' },
    return_on_assets: { key: 'returnOnAssets', label: 'Return on Assets', format: 'percentage' },
    return_on_equity: { key: 'returnOnEquity', label: 'Return on Equity', format: 'percentage' },
    revenue_per_share: { key: 'revenuePerShare', label: 'Revenue Per Share', format: 'currency' },
    forward_pe: { key: 'forwardPE', label: 'Forward P/E', format: 'number' },
    analyst_target: { key: 'analystTargetPrice', label: 'Analyst Target', format: 'currency' },
    shares_outstanding: { key: 'sharesOutstanding', label: 'Shares Outstanding', format: 'large_number' },
    '50_day_ma': { key: 'fiftyDayMA', label: '50 Day MA', format: 'currency' },
    '200_day_ma': { key: 'twoHundredDayMA', label: '200 Day MA', format: 'currency' },
    ev_to_revenue: { key: 'evToRevenue', label: 'EV/Revenue', format: 'number' },
    ev_to_ebitda: { key: 'evToEbitda', label: 'EV/EBITDA', format: 'number' },
  };

  const metric = metricMap[metricType.toLowerCase()];
  if (!metric) {
    return { value: null, label: metricType, format: 'number' };
  }

  const value = overview[metric.key];
  return {
    value: typeof value === 'number' ? value : null,
    label: metric.label,
    format: metric.format,
  };
}
