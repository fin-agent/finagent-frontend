/**
 * Fundamentals Voice Webhook
 *
 * ElevenLabs tool endpoint for company fundamental data:
 * - overview: Company info, description, sector
 * - metric: Specific metrics (PE, market cap, beta, etc.)
 * - financials: Income statement, balance sheet, cash flow
 * - earnings: Earnings history and calendar
 * - dividend: Dividend history and yield
 */

import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol } from '@/src/lib/symbol-utils';
import { checkSymbolPresence } from '@/src/lib/symbol-lookup';
import {
  getCompanyOverview,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  getEarnings,
  getEarningsCalendar,
  getDividendHistory,
  getMetricValue,
  formatLargeNumber,
} from '@/src/services/alphaVantageApi';

// ============================================================================
// Types
// ============================================================================

type QueryType = 'overview' | 'metric' | 'financials' | 'earnings' | 'dividend';

interface FundamentalsRequest {
  query_type: QueryType;
  symbol: string;
  metric_type?: string;
  statement_type?: 'income' | 'balance' | 'cashflow';
}

interface CompanyOverviewUIData {
  type: 'company-overview';
  symbol: string;
  name: string;
  description: string;
  exchange: string;
  sector: string;
  industry: string;
  marketCap: number;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  beta: number | null;
}

interface MetricUIData {
  type: 'fundamental-metric';
  symbol: string;
  metricType: string;
  metricLabel: string;
  value: number | null;
  format: 'currency' | 'percentage' | 'number' | 'large_number';
}

interface FinancialsUIData {
  type: 'financials';
  symbol: string;
  statementType: 'income' | 'balance' | 'cashflow';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>[];
  latestPeriod: string;
}

interface EarningsUIData {
  type: 'earnings';
  symbol: string;
  nextEarningsDate?: string;
  lastEarningsDate?: string;
  lastReportedEPS?: number | null;
  lastEstimatedEPS?: number | null;
  surprise?: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  history?: Record<string, any>[];
}

interface DividendUIData {
  type: 'dividend';
  symbol: string;
  dividendYield: number | null;
  dividendPerShare: number | null;
  exDividendDate?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  history?: Record<string, any>[];
}

interface ErrorUIData {
  type: 'error';
  message: string;
  code?: string;
}

// ============================================================================
// Handler
// ============================================================================

export async function POST(req: NextRequest) {
  // Debug: Log raw request info
  console.log('📊 [Fundamentals] Incoming request');
  console.log('📊 [Fundamentals] Method:', req.method);
  console.log('📊 [Fundamentals] Content-Type:', req.headers.get('content-type'));

  let body: FundamentalsRequest;
  try {
    body = await req.json();
    console.log('📊 [Fundamentals] Request body:', JSON.stringify(body, null, 2));
  } catch (parseError) {
    console.error('📊 [Fundamentals] JSON parse error:', parseError);
    return NextResponse.json({
      response: 'Invalid request format. Please try again.',
      uiData: { type: 'error', message: 'JSON parse error' },
    }, { status: 400 });
  }

  try {
    // Defensive parameter extraction - ElevenLabs may nest params differently
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawBody = body as any;
    const query_type: QueryType = rawBody.query_type || rawBody.parameters?.query_type ||
                                   rawBody.body?.query_type || rawBody.body?.parameters?.query_type;
    const symbol: string = rawBody.symbol || rawBody.parameters?.symbol ||
                           rawBody.body?.symbol || rawBody.body?.parameters?.symbol;
    const metric_type: string | undefined = rawBody.metric_type || rawBody.parameters?.metric_type ||
                                             rawBody.body?.metric_type || rawBody.body?.parameters?.metric_type;
    const statement_type: 'income' | 'balance' | 'cashflow' | undefined =
                          rawBody.statement_type || rawBody.parameters?.statement_type ||
                          rawBody.body?.statement_type || rawBody.body?.parameters?.statement_type;

    console.log('📊 [Fundamentals] Extracted params:', { query_type, symbol, metric_type, statement_type });

    // Validate required parameters
    if (!query_type) {
      return NextResponse.json({
        response: 'I need to know what fundamental data you\'re looking for. You can ask about company overview, specific metrics, financials, earnings, or dividends.',
        uiData: { type: 'error', message: 'Missing query_type parameter' } as ErrorUIData,
      });
    }

    if (!symbol) {
      return NextResponse.json({
        response: 'Which company would you like fundamental data for?',
        uiData: { type: 'error', message: 'Symbol required' } as ErrorUIData,
      });
    }

    // Normalize symbol
    const normalizedSymbol = normalizeSymbol(symbol);

    // Route to appropriate handler
    switch (query_type) {
      case 'overview':
        return handleOverview(normalizedSymbol);

      case 'metric':
        return handleMetric(normalizedSymbol, metric_type);

      case 'financials':
        return handleFinancials(normalizedSymbol, statement_type);

      case 'earnings':
        return handleEarnings(normalizedSymbol);

      case 'dividend':
        return handleDividend(normalizedSymbol);

      default:
        return NextResponse.json({
          response: `I don't recognize the query type "${query_type}". I can help with company overview, metrics, financials, earnings, or dividends.`,
          uiData: { type: 'error', message: `Unknown query_type: ${query_type}` } as ErrorUIData,
        });
    }
  } catch (error) {
    console.error('Fundamentals error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      response: 'I encountered an error while fetching fundamental data. Please try again.',
      uiData: { type: 'error', message: errorMessage } as ErrorUIData,
    });
  }
}

// ============================================================================
// Company Overview Handler
// ============================================================================

async function handleOverview(symbol: string): Promise<NextResponse> {
  try {
    const overview = await getCompanyOverview(symbol);

    if (!overview) {
      // Check if user has trading history with this symbol
      const presence = await checkSymbolPresence(symbol);
      let responseText = `I couldn't find fundamental data for ${symbol}. Please check the symbol and try again. Note: The free tier has a limit of 25 API calls per day.`;
      if (presence.context) {
        const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
        responseText = `I couldn't find fundamental data for ${symbol}. However, ${contextLower} Would you like to see those instead?`;
      }
      return NextResponse.json({
        response: responseText,
        uiData: { type: 'error', message: `No data found for ${symbol}`, code: 'SYMBOL_NOT_FOUND' } as ErrorUIData,
      });
    }

    const uiData: CompanyOverviewUIData = {
      type: 'company-overview',
      symbol: overview.symbol,
      name: overview.name,
      description: overview.description,
      exchange: overview.exchange,
      sector: overview.sector,
      industry: overview.industry,
      marketCap: overview.marketCap,
      peRatio: overview.peRatio,
      eps: overview.eps,
      dividendYield: overview.dividendYield,
      fiftyTwoWeekHigh: overview.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: overview.fiftyTwoWeekLow,
      beta: overview.beta,
    };

    // Build voice response
    const marketCapStr = formatLargeNumber(overview.marketCap);
    const peStr = overview.peRatio ? `a P/E ratio of ${overview.peRatio.toFixed(2)}` : 'no P/E ratio available';
    const descriptionShort = overview.description.length > 200
      ? overview.description.substring(0, 200) + '...'
      : overview.description;

    const response = `${overview.name} is a ${overview.sector} company in the ${overview.industry} industry. ` +
      `It has a market cap of ${marketCapStr} and ${peStr}. ` +
      `${descriptionShort}`;

    return NextResponse.json({ response, uiData });

  } catch (error) {
    console.error(`Company overview error for ${symbol}:`, error);
    // Check if user has trading history with this symbol
    const presence = await checkSymbolPresence(symbol);
    let responseText = `I couldn't fetch the company overview for ${symbol}. The API may be rate limited or the symbol may be invalid.`;
    if (presence.context) {
      const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
      responseText = `I couldn't fetch fundamental data for ${symbol}, but ${contextLower} Would you like to see those instead?`;
    }
    return NextResponse.json({
      response: responseText,
      uiData: { type: 'error', message: `Failed to fetch ${symbol}` } as ErrorUIData,
    });
  }
}

// ============================================================================
// Metric Handler
// ============================================================================

async function handleMetric(symbol: string, metricType?: string): Promise<NextResponse> {
  if (!metricType) {
    return NextResponse.json({
      response: `Which metric would you like for ${symbol}? I can provide P/E ratio, market cap, beta, EPS, dividend yield, and many others.`,
      uiData: { type: 'error', message: 'Metric type required' } as ErrorUIData,
    });
  }

  try {
    const overview = await getCompanyOverview(symbol);

    if (!overview) {
      // Check if user has trading history with this symbol
      const presence = await checkSymbolPresence(symbol);
      let responseText = `I couldn't find fundamental data for ${symbol}. Please check the symbol.`;
      if (presence.context) {
        const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
        responseText = `I couldn't find fundamental data for ${symbol}. However, ${contextLower} Would you like to see those instead?`;
      }
      return NextResponse.json({
        response: responseText,
        uiData: { type: 'error', message: `No data found for ${symbol}` } as ErrorUIData,
      });
    }

    const metric = getMetricValue(overview, metricType);

    const uiData: MetricUIData = {
      type: 'fundamental-metric',
      symbol,
      metricType,
      metricLabel: metric.label,
      value: metric.value,
      format: metric.format,
    };

    // Build voice response
    let valueStr: string;
    if (metric.value === null) {
      valueStr = 'not available';
    } else {
      switch (metric.format) {
        case 'currency':
          valueStr = `$${metric.value.toFixed(2)}`;
          break;
        case 'percentage':
          valueStr = `${(metric.value * 100).toFixed(2)}%`;
          break;
        case 'large_number':
          valueStr = formatLargeNumber(metric.value);
          break;
        default:
          valueStr = metric.value.toFixed(2);
      }
    }

    const response = `The ${metric.label} for ${overview.name} is ${valueStr}.`;

    return NextResponse.json({ response, uiData });

  } catch (error) {
    console.error(`Metric error for ${symbol}:`, error);
    // Check if user has trading history with this symbol
    const presence = await checkSymbolPresence(symbol);
    let responseText = `I couldn't fetch the ${metricType} for ${symbol}. Please try again.`;
    if (presence.context) {
      const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
      responseText = `I couldn't fetch the ${metricType} for ${symbol}, but ${contextLower} Would you like to see those instead?`;
    }
    return NextResponse.json({
      response: responseText,
      uiData: { type: 'error', message: `Failed to fetch metric` } as ErrorUIData,
    });
  }
}

// ============================================================================
// Financials Handler
// ============================================================================

async function handleFinancials(symbol: string, statementType?: 'income' | 'balance' | 'cashflow'): Promise<NextResponse> {
  const type = statementType || 'income';

  try {
    let data;
    let statementName: string;

    switch (type) {
      case 'income':
        data = await getIncomeStatement(symbol, true);
        statementName = 'income statement';
        break;
      case 'balance':
        data = await getBalanceSheet(symbol, true);
        statementName = 'balance sheet';
        break;
      case 'cashflow':
        data = await getCashFlow(symbol, true);
        statementName = 'cash flow statement';
        break;
    }

    if (!data || data.length === 0) {
      // Check if user has trading history with this symbol
      const presence = await checkSymbolPresence(symbol);
      let responseText = `I couldn't find ${statementName} data for ${symbol}. Please check the symbol.`;
      if (presence.context) {
        const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
        responseText = `I couldn't find ${statementName} data for ${symbol}. However, ${contextLower} Would you like to see those instead?`;
      }
      return NextResponse.json({
        response: responseText,
        uiData: { type: 'error', message: `No data found for ${symbol}` } as ErrorUIData,
      });
    }

    const latest = data[0];
    const uiData: FinancialsUIData = {
      type: 'financials',
      symbol,
      statementType: type,
      data: data.slice(0, 4), // Last 4 periods
      latestPeriod: latest.fiscalDateEnding,
    };

    // Build voice response based on statement type
    let response: string;

    if (type === 'income') {
      const incomeData = latest as { totalRevenue: number; netIncome: number; grossProfit: number };
      response = `For ${symbol}'s fiscal year ending ${latest.fiscalDateEnding}: ` +
        `Total revenue was ${formatLargeNumber(incomeData.totalRevenue)}, ` +
        `gross profit was ${formatLargeNumber(incomeData.grossProfit)}, and ` +
        `net income was ${formatLargeNumber(incomeData.netIncome)}.`;
    } else if (type === 'balance') {
      const balanceData = latest as { totalAssets: number; totalLiabilities: number; totalShareholderEquity: number };
      response = `For ${symbol}'s fiscal year ending ${latest.fiscalDateEnding}: ` +
        `Total assets were ${formatLargeNumber(balanceData.totalAssets)}, ` +
        `total liabilities were ${formatLargeNumber(balanceData.totalLiabilities)}, and ` +
        `shareholder equity was ${formatLargeNumber(balanceData.totalShareholderEquity)}.`;
    } else {
      const cashData = latest as { operatingCashflow: number; freeCashFlow: number };
      response = `For ${symbol}'s fiscal year ending ${latest.fiscalDateEnding}: ` +
        `Operating cash flow was ${formatLargeNumber(cashData.operatingCashflow)} and ` +
        `free cash flow was ${formatLargeNumber(cashData.freeCashFlow)}.`;
    }

    return NextResponse.json({ response, uiData });

  } catch (error) {
    console.error(`Financials error for ${symbol}:`, error);
    // Check if user has trading history with this symbol
    const presence = await checkSymbolPresence(symbol);
    let responseText = `I couldn't fetch the financial statements for ${symbol}. Please try again.`;
    if (presence.context) {
      const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
      responseText = `I couldn't fetch financials for ${symbol}, but ${contextLower} Would you like to see those instead?`;
    }
    return NextResponse.json({
      response: responseText,
      uiData: { type: 'error', message: `Failed to fetch financials` } as ErrorUIData,
    });
  }
}

// ============================================================================
// Earnings Handler
// ============================================================================

async function handleEarnings(symbol: string): Promise<NextResponse> {
  try {
    // Get historical earnings and upcoming calendar
    const [earnings, calendar] = await Promise.all([
      getEarnings(symbol),
      getEarningsCalendar(symbol),
    ]);

    const uiData: EarningsUIData = {
      type: 'earnings',
      symbol,
    };

    // Find next earnings date from calendar
    const upcomingEarnings = calendar.find(e => e.symbol === symbol);
    if (upcomingEarnings) {
      uiData.nextEarningsDate = upcomingEarnings.reportDate;
    }

    // Get last earnings
    if (earnings.length > 0) {
      const lastEarnings = earnings[0];
      uiData.lastEarningsDate = lastEarnings.reportedDate;
      uiData.lastReportedEPS = lastEarnings.reportedEPS;
      uiData.lastEstimatedEPS = lastEarnings.estimatedEPS;
      uiData.surprise = lastEarnings.surprise;
      uiData.history = earnings.slice(0, 8); // Last 8 quarters
    }

    // Build voice response
    let response = '';

    if (uiData.nextEarningsDate) {
      response = `${symbol}'s next earnings report is scheduled for ${uiData.nextEarningsDate}. `;
    } else {
      response = `I don't have the next earnings date for ${symbol}. `;
    }

    if (uiData.lastEarningsDate && uiData.lastReportedEPS !== null) {
      response += `The last reported EPS was $${uiData.lastReportedEPS?.toFixed(2) || 'N/A'} `;
      if (uiData.surprise !== null && uiData.surprise !== undefined) {
        const surpriseDir = uiData.surprise >= 0 ? 'beat' : 'missed';
        response += `which ${surpriseDir} estimates by $${Math.abs(uiData.surprise).toFixed(2)}.`;
      }
    }

    if (!uiData.nextEarningsDate && earnings.length === 0) {
      // Check if user has trading history with this symbol
      const presence = await checkSymbolPresence(symbol);
      if (presence.context) {
        const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
        response = `I couldn't find earnings data for ${symbol}. However, ${contextLower} Would you like to see those instead?`;
      } else {
        response = `I couldn't find earnings data for ${symbol}. The symbol may be invalid or the API may be rate limited.`;
      }
    }

    return NextResponse.json({ response, uiData });

  } catch (error) {
    console.error(`Earnings error for ${symbol}:`, error);
    // Check if user has trading history with this symbol
    const presence = await checkSymbolPresence(symbol);
    let responseText = `I couldn't fetch the earnings data for ${symbol}. Please try again.`;
    if (presence.context) {
      const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
      responseText = `I couldn't fetch earnings data for ${symbol}, but ${contextLower} Would you like to see those instead?`;
    }
    return NextResponse.json({
      response: responseText,
      uiData: { type: 'error', message: `Failed to fetch earnings` } as ErrorUIData,
    });
  }
}

// ============================================================================
// Dividend Handler
// ============================================================================

async function handleDividend(symbol: string): Promise<NextResponse> {
  try {
    // Get overview for yield and current dividend, plus history
    const [overview, history] = await Promise.all([
      getCompanyOverview(symbol),
      getDividendHistory(symbol),
    ]);

    if (!overview && history.length === 0) {
      // Check if user has trading history with this symbol
      const presence = await checkSymbolPresence(symbol);
      let responseText = `I couldn't find dividend data for ${symbol}. This company may not pay dividends or the symbol may be invalid.`;
      if (presence.context) {
        const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
        responseText = `I couldn't find dividend data for ${symbol}. However, ${contextLower} Would you like to see those instead?`;
      }
      return NextResponse.json({
        response: responseText,
        uiData: { type: 'error', message: `No data found for ${symbol}` } as ErrorUIData,
      });
    }

    const uiData: DividendUIData = {
      type: 'dividend',
      symbol,
      dividendYield: overview?.dividendYield || null,
      dividendPerShare: overview?.dividendPerShare || null,
      exDividendDate: history.length > 0 ? history[0].exDividendDate : undefined,
      history: history.slice(0, 12), // Last 12 dividends
    };

    // Build voice response
    let response: string;

    if (overview?.dividendYield && overview.dividendYield > 0) {
      const yieldStr = (overview.dividendYield * 100).toFixed(2);
      const dpsStr = overview.dividendPerShare ? `$${overview.dividendPerShare.toFixed(2)}` : 'N/A';
      response = `${symbol} has a dividend yield of ${yieldStr}% with a dividend per share of ${dpsStr}. `;

      if (history.length > 0) {
        response += `The most recent ex-dividend date was ${history[0].exDividendDate}.`;
      }
    } else {
      response = `${symbol} does not currently pay a dividend, or dividend information is not available.`;
    }

    return NextResponse.json({ response, uiData });

  } catch (error) {
    console.error(`Dividend error for ${symbol}:`, error);
    // Check if user has trading history with this symbol
    const presence = await checkSymbolPresence(symbol);
    let responseText = `I couldn't fetch the dividend data for ${symbol}. Please try again.`;
    if (presence.context) {
      const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
      responseText = `I couldn't fetch dividend data for ${symbol}, but ${contextLower} Would you like to see those instead?`;
    }
    return NextResponse.json({
      response: responseText,
      uiData: { type: 'error', message: `Failed to fetch dividend` } as ErrorUIData,
    });
  }
}
