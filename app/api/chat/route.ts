import { streamText, convertToModelMessages } from 'ai';
import { createAzure } from '@ai-sdk/azure';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { normalizeSymbol, parseOptionSymbol } from '@/src/lib/symbol-utils';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';
import { suggestDataPeriod } from '@/src/lib/data-availability';
import { formatCalendarDate } from '@/src/lib/date-utils';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local explicitly to override any shell environment variables
// This is critical because shell env vars can override .env.local values
let envLocalConfig: Record<string, string> = {};

function loadEnvLocal(): Record<string, string> {
  if (Object.keys(envLocalConfig).length > 0) return envLocalConfig;

  try {
    const envLocalPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envLocalPath)) {
      const envContent = fs.readFileSync(envLocalPath, 'utf-8');
      const parsed = dotenv.parse(envContent);
      envLocalConfig = parsed;
      console.log('🔧 [Chat API] Loaded .env.local directly (bypassing shell env vars)');
    }
  } catch (error) {
    console.warn('⚠️ [Chat API] Could not load .env.local:', error);
  }
  return envLocalConfig;
}

// Force load env.local at module level
const envConfig = loadEnvLocal();
const resourceName = envConfig['AZURE_OPENAI_RESOURCE_NAME'] || 'finagent-dev-resource';
const deployment = envConfig['AZURE_OPENAI_DEPLOYMENT'] || 'gpt-5.1';
const apiKey = envConfig['AZURE_OPENAI_API_KEY'] || '';

console.log('🔧 [Chat API] Azure config:', {
  resourceName,
  apiKeyPrefix: apiKey?.substring(0, 10) + '...',
  deployment,
});

// Create Azure OpenAI provider for AI SDK
const azure = createAzure({
  resourceName: resourceName,
  apiKey: apiKey,
});

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

// Helper to format currency for voice
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export async function POST(req: Request) {
  const { messages, currentDate } = await req.json();

  // Convert messages before passing to streamText (AI SDK 6 requires await)
  const modelMessages = await convertToModelMessages(messages);

  // Format current date for system prompt
  const now = currentDate ? new Date(currentDate) : new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const currentDayName = dayNames[now.getDay()];
  const formattedDate = `${currentDayName}, ${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

  const result = streamText({
    model: azure(deployment),  // Use deployment name from .env.local
    system: `# Identity
You are FinAgent, a professional quantitative analyst assistant helping users understand their trading portfolio. You provide clear, accurate information about stock and option trades with a friendly, approachable demeanor.

# Current Date/Time Context
Today is ${formattedDate}. The current day of the week is ${currentDayName}.

# CRITICAL: Response Format
When tools return data, read the response WORD-FOR-WORD. Do NOT paraphrase, summarize, or round numbers.
Keep text responses brief - the UI will automatically render beautiful components showing the detailed data.

# CRITICAL: Day-of-Week Interpretation
- If user says "${currentDayName}" → interpret as TODAY
- If user says "last ${currentDayName}" → interpret as previous week's ${currentDayName}
- Other day names → most recent past occurrence

# Available Tools
- getTradeSummary: Count of trades for a symbol
- getDetailedTrades: Full trade history with details
- getFees: Commission, interest, locate fees, short interest
- getAccountBalance: Cash balance, equity, buying power, margin
- getTimeTrades: Trades for a time period (today, last week, etc.)
- getTradeStats: Highest/lowest prices for a symbol
- getProfitableTrades: FIFO-matched profitable trades

# Tool Usage
1. Convert company names to tickers (Apple → AAPL, Google → GOOGL)
2. Pass time periods EXACTLY as user says them
3. After tool results, provide brief acknowledgment - UI renders the data

Be professional, precise, and helpful. Always use tools to get accurate data.`,
    messages: modelMessages,
    tools: {
      getTradeSummary: {
        description: 'Get a summary count of trades for a stock symbol, separated by security type (stocks vs options)',
        inputSchema: z.object({
          symbol: z.string().describe('Stock ticker symbol (e.g., AAPL, GOOGL, NVDA)'),
        }),
        execute: async ({ symbol }: { symbol: string }) => {
          const normalizedSymbol = normalizeSymbol(symbol);

          const { data, error } = await supabase
            .from('TradeData')
            .select('SecurityType, TradeType')
            .eq('AccountCode', ACCOUNT_CODE)
            .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);

          if (error) {
            return { error: error.message, symbol: normalizedSymbol };
          }

          const stockTrades = data?.filter(t => t.SecurityType === 'S').length || 0;
          const optionTrades = data?.filter(t => t.SecurityType === 'O').length || 0;
          const warrantTrades = data?.filter(t => t.SecurityType === 'W').length || 0;

          return {
            symbol: normalizedSymbol,
            stockTrades,
            optionTrades,
            warrantTrades,
            totalTrades: stockTrades + optionTrades + warrantTrades,
          };
        },
      },

      getDetailedTrades: {
        description: 'Get detailed trade information for a symbol including all trades and calculated totals for shares purchased, total cost, and estimated current value',
        inputSchema: z.object({
          symbol: z.string().describe('Stock ticker symbol'),
        }),
        execute: async ({ symbol }: { symbol: string }) => {
          const normalizedSymbol = normalizeSymbol(symbol);

          const { data, error } = await supabase
            .from('TradeData')
            .select('*')
            .eq('AccountCode', ACCOUNT_CODE)
            .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
            .order('Date', { ascending: false });

          if (error) {
            return { error: error.message, symbol: normalizedSymbol };
          }

          // Calculate totals for stock trades
          const stockTrades = data?.filter(t => t.SecurityType === 'S') || [];
          const optionTrades = data?.filter(t => t.SecurityType === 'O') || [];
          const buyTrades = stockTrades.filter(t => t.TradeType === 'B');

          const totalSharesPurchased = buyTrades.reduce((sum, t) =>
            sum + parseFloat(t.StockShareQty || '0'), 0);
          const totalCost = buyTrades.reduce((sum, t) =>
            sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

          // Estimate current value using last trade price
          const lastPrice = stockTrades[0]?.StockTradePrice
            ? parseFloat(stockTrades[0].StockTradePrice)
            : 0;
          const currentValue = totalSharesPurchased * lastPrice;

          // Format trades for display
          const formattedStockTrades = stockTrades.map(t => ({
            tradeId: t.TradeID,
            date: t.Date,
            type: t.TradeType === 'B' ? 'Buy' : 'Sell',
            shares: parseFloat(t.StockShareQty || '0'),
            price: parseFloat(t.StockTradePrice || '0'),
            netAmount: parseFloat(t.NetAmount || '0'),
          }));

          const formattedOptionTrades = optionTrades.map(t => ({
            tradeId: t.TradeID,
            date: t.Date,
            type: t.TradeType === 'B' ? 'Buy' : 'Sell',
            callPut: t['Call/Put'] === 'C' ? 'Call' : 'Put',
            strike: parseFloat(t.Strike || '0'),
            expiration: t.Expiration,
            contracts: parseFloat(t.OptionContracts || '0'),
            premium: parseFloat(t.OptionTradePremium || '0'),
            netAmount: parseFloat(t.NetAmount || '0'),
          }));

          return {
            symbol: normalizedSymbol,
            summary: {
              totalSharesPurchased,
              totalCost,
              currentValue,
              lastTradePrice: lastPrice,
              profitLoss: currentValue - totalCost,
              profitLossPercent: totalCost > 0 ? ((currentValue - totalCost) / totalCost) * 100 : 0,
            },
            stockTrades: formattedStockTrades,
            optionTrades: formattedOptionTrades,
            stockTradeCount: stockTrades.length,
            optionTradeCount: optionTrades.length,
          };
        },
      },

      // ============================================
      // FEES TOOL - Commission, interest, locate fees
      // ============================================
      getFees: {
        description: 'Get fee information: commissions, credit/debit interest, locate fees, or short interest. Always specify the fee_type.',
        inputSchema: z.object({
          fee_type: z.enum(['commission', 'credit_interest', 'debit_interest', 'locate_fee', 'short_interest'])
            .describe('Type of fee to query'),
          time_period: z.string().optional()
            .describe('Time period like "last month", "this year", "October", etc.'),
          symbol: z.string().optional()
            .describe('Stock symbol for locate fees (e.g., MTEN, LCID)'),
        }),
        execute: async ({ fee_type, time_period, symbol }: { fee_type: string; time_period?: string; symbol?: string }) => {
          const timePeriod = time_period || 'this month';
          const resolved = parseTimePeriodToResolvedDates(timePeriod);

          if (!resolved) {
            return {
              error: `Couldn't understand time period "${timePeriod}"`,
              response: `I couldn't understand the time period "${timePeriod}". Please try "last month", "this year", or "June 1st to the 7th".`,
            };
          }

          const { startDate, endDate, dates, description } = resolved;
          const normalizedSymbol = symbol ? normalizeSymbol(symbol) : undefined;

          // Handle commissions from TradeData table
          if (fee_type === 'commission') {
            let query = supabase
              .from('TradeData')
              .select('Commission, Date, Symbol')
              .eq('AccountCode', ACCOUNT_CODE);

            if (resolved.type === 'discrete' && dates && dates.length > 0) {
              query = query.in('Date', dates);
            } else if (startDate && endDate) {
              query = query.gte('Date', startDate).lte('Date', endDate);
            }

            const { data, error } = await query.order('Date', { ascending: false });

            if (error) {
              return { error: error.message, feeType: 'commission', totalAmount: 0 };
            }

            const totalCommission = data?.reduce((sum, t) => sum + Math.abs(t.Commission || 0), 0) || 0;

            if (!data || data.length === 0 || totalCommission < 0.01) {
              const suggestion = await suggestDataPeriod('TradeData', description);
              return {
                feeType: 'commission',
                totalAmount: 0,
                transactionCount: 0,
                timePeriod: description,
                response: suggestion && suggestion.amount > 0
                  ? `No commission data found for ${description}. However, I found ${formatCurrency(suggestion.amount)} in commissions for ${suggestion.suggestedPeriod}. Would you like to know more about that?`
                  : `No commission data found for ${description}.`,
                suggestion: suggestion && suggestion.amount > 0 ? {
                  period: suggestion.suggestedPeriod,
                  amount: suggestion.amount,
                } : null,
              };
            }

            return {
              feeType: 'commission',
              totalAmount: totalCommission,
              transactionCount: data.length,
              timePeriod: description,
              response: `The total commission you paid in ${description} is ${formatCurrency(totalCommission)}`,
              breakdown: data.slice(0, 10).map(t => ({
                date: t.Date,
                amount: Math.abs(t.Commission || 0),
                symbol: parseOptionSymbol(t.Symbol),
              })),
            };
          }

          // Handle other fee types from FeesAndInterest table
          const feeTypeMap: Record<string, string> = {
            'credit_interest': 'CreditInt',
            'debit_interest': 'DebitInt',
            'locate_fee': 'LocateFee',
            'short_interest': 'LocateFee',
          };

          const dbFeeType = feeTypeMap[fee_type];

          let feesQuery = supabase
            .from('FeesAndInterest')
            .select('*')
            .eq('Type', dbFeeType);

          if (resolved.type === 'discrete' && dates && dates.length > 0) {
            feesQuery = feesQuery.in('Date', dates);
          } else if (startDate && endDate) {
            feesQuery = feesQuery.gte('Date', startDate).lte('Date', endDate);
          }

          if ((fee_type === 'locate_fee' || fee_type === 'short_interest') && normalizedSymbol) {
            feesQuery = feesQuery.eq('Symbol', normalizedSymbol);
          }

          const { data, error } = await feesQuery.order('Date', { ascending: false });

          if (error) {
            return { error: error.message, feeType: fee_type, totalAmount: 0 };
          }

          const totalAmount = data?.reduce((sum, f) => sum + Math.abs(f.Amount || 0), 0) || 0;

          if (!data || data.length === 0 || totalAmount < 0.01) {
            const suggestion = await suggestDataPeriod('FeesAndInterest', description, {
              feeType: dbFeeType,
              symbol: normalizedSymbol,
            });
            const feeTypeName = fee_type.replace('_', ' ');
            const symbolText = symbol ? ` for ${normalizedSymbol}` : '';

            return {
              feeType: fee_type,
              totalAmount: 0,
              transactionCount: 0,
              timePeriod: description,
              symbol: normalizedSymbol,
              response: suggestion && suggestion.amount > 0
                ? `No ${feeTypeName} found${symbolText} for ${description}. However, I found ${formatCurrency(suggestion.amount)} in ${feeTypeName} for ${suggestion.suggestedPeriod}. Would you like to know more about that?`
                : `No ${feeTypeName} data found${symbolText} for ${description}.`,
              suggestion: suggestion && suggestion.amount > 0 ? {
                period: suggestion.suggestedPeriod,
                amount: suggestion.amount,
              } : null,
            };
          }

          // Build response text
          const txCount = data.length;
          const txCountText = txCount > 1 ? ` across ${txCount} transactions` : '';
          const feeTypeNames: Record<string, string> = {
            'credit_interest': 'credit interest you received',
            'debit_interest': 'debit interest you paid',
            'locate_fee': 'locate fees you paid',
            'short_interest': 'short interest',
          };
          const symbolText = normalizedSymbol ? ` for ${normalizedSymbol}` : '';

          return {
            feeType: fee_type,
            totalAmount,
            transactionCount: data.length,
            timePeriod: description,
            symbol: normalizedSymbol,
            response: `The total ${feeTypeNames[fee_type] || fee_type}${symbolText} for ${description} is ${formatCurrency(totalAmount)}${txCountText}`,
            breakdown: data.slice(0, 10).map(f => ({
              date: f.Date,
              amount: Math.abs(f.Amount || 0),
              symbol: f.Symbol ? parseOptionSymbol(f.Symbol) : undefined,
            })),
          };
        },
      },

      // ============================================
      // ACCOUNT BALANCE TOOL - Cash, equity, buying power
      // ============================================
      getAccountBalance: {
        description: 'Get account balance information: cash balance, buying power, account summary, NLV, margin, or market value.',
        inputSchema: z.object({
          query_type: z.enum(['cash_balance', 'cash_and_equity', 'buying_power', 'account_summary', 'nlv', 'overnight_margin', 'market_value', 'debit_balances', 'credit_balances'])
            .describe('Type of balance information to retrieve'),
          time_period: z.string().optional()
            .describe('Time period for debit/credit balance trends'),
        }),
        execute: async ({ query_type, time_period }: { query_type: string; time_period?: string }) => {
          // For balance trends (debit/credit)
          if (query_type === 'debit_balances' || query_type === 'credit_balances') {
            const resolved = time_period ? parseTimePeriodToResolvedDates(time_period) : null;

            let query = supabase
              .from('AccountBalance')
              .select('Date, DebitBalance, CreditBalance')
              .eq('AccountCode', ACCOUNT_CODE)
              .order('Date', { ascending: false });

            if (resolved) {
              if (resolved.type === 'discrete' && resolved.dates && resolved.dates.length > 0) {
                query = query.in('Date', resolved.dates);
              } else if (resolved.startDate && resolved.endDate) {
                query = query.gte('Date', resolved.startDate).lte('Date', resolved.endDate);
              }
            }

            const { data, error } = await query;

            if (error) {
              return { error: error.message, queryType: query_type };
            }

            if (!data || data.length === 0) {
              const periodDescription = resolved?.description || time_period || 'the specified period';
              const suggestion = await suggestDataPeriod('AccountBalance', periodDescription);
              return {
                queryType: query_type,
                timePeriod: periodDescription,
                response: suggestion
                  ? `No balance data found for ${periodDescription}. However, I found balance data for ${suggestion.suggestedPeriod}. Would you like to know more?`
                  : `No balance data found for ${periodDescription}.`,
                suggestion: suggestion ? { period: suggestion.suggestedPeriod } : null,
              };
            }

            const balanceField = query_type === 'debit_balances' ? 'DebitBalance' : 'CreditBalance';
            const values = data.map(d => d[balanceField] || 0);
            const avg = values.reduce((a, b) => a + b, 0) / values.length;
            const max = Math.max(...values);
            const min = Math.min(...values);
            const maxDate = data.find(d => d[balanceField] === max)?.Date;
            const minDate = data.find(d => d[balanceField] === min)?.Date;

            const balanceType = query_type === 'debit_balances' ? 'debit' : 'credit';
            const periodLabel = resolved?.description || time_period || 'the period';

            return {
              queryType: query_type,
              timePeriod: periodLabel,
              avgBalance: avg,
              maxBalance: max,
              minBalance: min,
              maxBalanceDate: formatCalendarDate(maxDate || ''),
              minBalanceDate: formatCalendarDate(minDate || ''),
              response: `Your average ${balanceType} balance for ${periodLabel} is ${formatCurrency(avg)}. Highest was ${formatCurrency(max)} on ${formatCalendarDate(maxDate || '')}. Lowest was ${formatCurrency(min)} on ${formatCalendarDate(minDate || '')}.`,
            };
          }

          // For other queries, get latest record
          const { data, error } = await supabase
            .from('AccountBalance')
            .select('*')
            .eq('AccountCode', ACCOUNT_CODE)
            .order('Date', { ascending: false })
            .limit(1)
            .single();

          if (error) {
            return { error: error.message, queryType: query_type };
          }

          const balanceDate = formatCalendarDate(data.Date);

          const baseData = {
            queryType: query_type,
            asOfDate: balanceDate,
            cashBalance: data.CashBalance,
            accountEquity: data['Account Equity'],
            dayTradingBP: data.DayTradingBP,
            stockLMV: data['Stock LMV'] || 0,
            stockSMV: data['Stock SMV'] || 0,
            optionsLMV: data['Options LMV'] || 0,
            optionsSMV: data['Optons SMV'] || 0,
            houseRequirement: data.HouseRequirment,
            houseExcessDeficit: data.HouseExcessDeficit,
            debitBalance: data.DebitBalance,
            creditBalance: data.CreditBalance,
          };

          const responses: Record<string, string> = {
            'cash_balance': `Your account cash balance as of ${balanceDate} is ${formatCurrency(data.CashBalance)}`,
            'cash_and_equity': `Your account cash balance as of ${balanceDate} is ${formatCurrency(data.CashBalance)} and account equity is ${formatCurrency(data['Account Equity'])}`,
            'buying_power': `Your Day Trade Buying power as of ${balanceDate} is ${formatCurrency(data.DayTradingBP)}`,
            'nlv': `Your account Net Liquidation value as of ${balanceDate} is ${formatCurrency(data['Account Equity'])}`,
            'overnight_margin': `Your account House requirement as of ${balanceDate} is ${formatCurrency(data.HouseRequirment)} and ${data.HouseExcessDeficit >= 0 ? 'House Excess' : 'House Deficit'} is ${formatCurrency(Math.abs(data.HouseExcessDeficit || 0))}`,
            'market_value': `The market value of your long stock positions is ${formatCurrency(data['Stock LMV'] || 0)}, long options is ${formatCurrency(data['Options LMV'] || 0)}, short stock is ${formatCurrency(data['Stock SMV'] || 0)}, short options is ${formatCurrency(data['Optons SMV'] || 0)}`,
            'account_summary': `Your account summary as of ${balanceDate}: Cash Balance is ${formatCurrency(data.CashBalance)}, Account Equity is ${formatCurrency(data['Account Equity'])}, Day Trading BP is ${formatCurrency(data.DayTradingBP)}`,
          };

          return {
            ...baseData,
            response: responses[query_type] || responses['account_summary'],
          };
        },
      },

      // ============================================
      // TIME-BASED TRADES TOOL - Trades for a time period
      // ============================================
      getTimeTrades: {
        description: 'Get trades for a specific time period like "today", "yesterday", "last week", "last month", "October", etc.',
        inputSchema: z.object({
          time_period: z.string().describe('Time period like "today", "yesterday", "last week", "this month", "October"'),
          symbol: z.string().optional().describe('Optional stock symbol to filter by'),
          trade_type: z.enum(['buy', 'sell', 'all']).optional().describe('Filter by trade type'),
        }),
        execute: async ({ time_period, symbol, trade_type }: { time_period: string; symbol?: string; trade_type?: string }) => {
          const resolved = parseTimePeriodToResolvedDates(time_period);

          if (!resolved) {
            return {
              error: `Couldn't understand time period "${time_period}"`,
              response: `I couldn't understand the time period "${time_period}". Try "last week", "yesterday", "October", or "June 1st to the 7th".`,
            };
          }

          const { startDate, endDate, dates, description } = resolved;
          const normalizedSymbol = symbol ? normalizeSymbol(symbol) : null;

          let query = supabase
            .from('TradeData')
            .select('*')
            .eq('AccountCode', ACCOUNT_CODE);

          if (resolved.type === 'discrete' && dates && dates.length > 0) {
            query = query.in('Date', dates);
          } else if (startDate && endDate) {
            query = query.gte('Date', startDate).lte('Date', endDate);
          }

          if (normalizedSymbol) {
            query = query.or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);
          }

          if (trade_type && trade_type !== 'all') {
            const dbType = trade_type === 'sell' ? 'S' : 'B';
            query = query.eq('TradeType', dbType);
          }

          const { data, error } = await query.order('Date', { ascending: false });

          if (error) {
            return { error: error.message, timePeriod: description };
          }

          if (!data || data.length === 0) {
            const suggestion = await suggestDataPeriod('TradeData', description);
            const symbolText = normalizedSymbol ? ` for ${normalizedSymbol}` : '';
            return {
              timePeriod: description,
              symbol: normalizedSymbol,
              totalTrades: 0,
              response: suggestion
                ? `No trades found${symbolText} for ${description}. However, I found ${suggestion.count} trades for ${suggestion.suggestedPeriod}. Would you like to see those?`
                : `No trades found${symbolText} for ${description}.`,
              suggestion: suggestion ? { period: suggestion.suggestedPeriod, count: suggestion.count } : null,
            };
          }

          const stockTrades = data.filter(t => t.SecurityType === 'S');
          const optionTrades = data.filter(t => t.SecurityType === 'O');
          const totalValue = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);
          const symbolText = normalizedSymbol ? ` for ${normalizedSymbol}` : '';

          return {
            timePeriod: description,
            symbol: normalizedSymbol,
            totalTrades: data.length,
            stockCount: stockTrades.length,
            optionCount: optionTrades.length,
            totalValue,
            response: `You executed ${data.length} trades${symbolText} ${description}: ${stockTrades.length} stock trades and ${optionTrades.length} option trades with a total value of ${formatCurrency(totalValue)}.`,
            trades: data.slice(0, 50).map((t, index) => ({
              TradeID: t.TradeID || index,
              Date: formatCalendarDate(t.Date),
              Symbol: parseOptionSymbol(t.Symbol),
              TradeType: t.TradeType,
              SecurityType: t.SecurityType,
              StockShareQty: t.StockShareQty,
              OptionContracts: t.OptionContracts,
              StockTradePrice: t.StockTradePrice,
              OptionTradePremium: t.OptionTradePremium,
              NetAmount: t.NetAmount,
            })),
          };
        },
      },

      // ============================================
      // PROFITABLE TRADES TOOL - FIFO matched profits
      // ============================================
      getProfitableTrades: {
        description: 'Get profitable trades using FIFO (First-In-First-Out) matching for a symbol',
        inputSchema: z.object({
          symbol: z.string().describe('Stock ticker symbol'),
        }),
        execute: async ({ symbol }: { symbol: string }) => {
          const normalizedSymbol = normalizeSymbol(symbol);

          const { data, error } = await supabase
            .from('TradeData')
            .select('*')
            .eq('AccountCode', ACCOUNT_CODE)
            .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
            .order('Date', { ascending: true });

          if (error) {
            return { error: error.message, symbol: normalizedSymbol };
          }

          if (!data || data.length === 0) {
            return {
              symbol: normalizedSymbol,
              totalProfitableTrades: 0,
              totalProfit: 0,
              response: `No trades found for ${normalizedSymbol}.`,
            };
          }

          // FIFO matching for stocks
          const stockBuys = data.filter(t => t.SecurityType === 'S' && t.TradeType === 'B');
          const stockSells = data.filter(t => t.SecurityType === 'S' && t.TradeType === 'S');

          const profitableTrades: Array<{
            securityType: string;
            buyDate: string;
            sellDate: string;
            quantity: number;
            buyPrice: number;
            sellPrice: number;
            profitLoss: number;
          }> = [];

          const buyQueue = [...stockBuys];

          for (const sell of stockSells) {
            const sellShares = parseFloat(sell.StockShareQty || '0');
            const sellPrice = parseFloat(sell.StockTradePrice || '0');
            let remainingShares = sellShares;

            while (remainingShares > 0 && buyQueue.length > 0) {
              const buy = buyQueue[0];
              const buyShares = parseFloat(buy.StockShareQty || '0');
              const buyPrice = parseFloat(buy.StockTradePrice || '0');

              const matchedShares = Math.min(remainingShares, buyShares);
              const profit = matchedShares * (sellPrice - buyPrice);

              if (profit > 0) {
                profitableTrades.push({
                  securityType: 'S',
                  buyDate: formatCalendarDate(buy.Date),
                  sellDate: formatCalendarDate(sell.Date),
                  quantity: matchedShares,
                  buyPrice,
                  sellPrice,
                  profitLoss: profit,
                });
              }

              remainingShares -= matchedShares;
              if (matchedShares >= buyShares) {
                buyQueue.shift();
              } else {
                buy.StockShareQty = String(buyShares - matchedShares);
              }
            }
          }

          const totalProfit = profitableTrades.reduce((sum, t) => sum + t.profitLoss, 0);

          return {
            symbol: normalizedSymbol,
            totalProfitableTrades: profitableTrades.length,
            totalProfit,
            response: profitableTrades.length > 0
              ? `Found ${profitableTrades.length} profitable trades for ${normalizedSymbol} with total profit of ${formatCurrency(totalProfit)}.`
              : `No profitable trades found for ${normalizedSymbol}.`,
            trades: profitableTrades.slice(0, 20),
          };
        },
      },

      // ============================================
      // TRADE EXECUTION TOOLS - Require user approval
      // ============================================
      executeTrade: {
        description: 'Execute a stock or option trade. REQUIRES USER APPROVAL before execution.',
        inputSchema: z.object({
          symbol: z.string().describe('Stock ticker symbol (e.g., AAPL, GOOGL)'),
          quantity: z.number().describe('Number of shares or contracts'),
          side: z.enum(['buy', 'sell']).describe('Trade direction'),
          orderType: z.enum(['market', 'limit']).describe('Order type'),
          limitPrice: z.number().optional().describe('Limit price (required for limit orders)'),
          securityType: z.enum(['stock', 'option']).optional().describe('Security type (defaults to stock)'),
          optionDetails: z.object({
            strike: z.number(),
            expiration: z.string(),
            callPut: z.enum(['call', 'put']),
          }).optional().describe('Option details (required for option trades)'),
        }),
        needsApproval: true,
        execute: async ({ symbol, quantity, side, orderType, limitPrice, securityType = 'stock', optionDetails }: {
          symbol: string;
          quantity: number;
          side: 'buy' | 'sell';
          orderType: 'market' | 'limit';
          limitPrice?: number;
          securityType?: 'stock' | 'option';
          optionDetails?: { strike: number; expiration: string; callPut: 'call' | 'put' };
        }) => {
          const normalizedSymbol = normalizeSymbol(symbol);

          // This would integrate with a broker API in production
          // For now, we simulate the trade execution
          const estimatedPrice = orderType === 'limit' && limitPrice ? limitPrice : 100.00; // Placeholder
          const estimatedValue = quantity * estimatedPrice * (securityType === 'option' ? 100 : 1);

          // Log the trade attempt (in production, this would be an actual order submission)
          console.log(`Trade executed: ${side} ${quantity} ${normalizedSymbol} @ ${orderType} ${limitPrice || 'market'}`);

          return {
            status: 'executed',
            orderId: `ORD-${Date.now()}`,
            symbol: normalizedSymbol,
            quantity,
            side,
            orderType,
            limitPrice,
            securityType,
            optionDetails,
            estimatedValue,
            response: `Trade ${side === 'buy' ? 'purchase' : 'sale'} order for ${quantity} ${securityType === 'option' ? 'contracts of' : 'shares of'} ${normalizedSymbol} has been submitted. Order ID: ORD-${Date.now()}. Estimated value: ${formatCurrency(estimatedValue)}.`,
          };
        },
      },

      cancelOrder: {
        description: 'Cancel a pending order. REQUIRES USER APPROVAL before cancellation.',
        inputSchema: z.object({
          orderId: z.string().describe('The order ID to cancel'),
        }),
        needsApproval: true,
        execute: async ({ orderId }: { orderId: string }) => {
          // This would integrate with a broker API in production
          console.log(`Order cancelled: ${orderId}`);

          return {
            status: 'cancelled',
            orderId,
            response: `Order ${orderId} has been cancelled.`,
          };
        },
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
