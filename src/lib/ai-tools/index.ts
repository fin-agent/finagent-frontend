/**
 * Shared AI SDK 6 Tool Definitions
 *
 * These tools are used by both:
 * - Custom LLM endpoint for ElevenLabs voice agent
 * - TextChat component for text-based interaction
 *
 * Tools execute Supabase queries directly and return formatted responses.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { normalizeSymbol } from '@/src/lib/symbol-utils';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

// Helper to format currency without commas (TTS-friendly)
function formatCurrency(value: number): string {
  return `$${Math.abs(value).toFixed(2)}`;
}

/**
 * Get trade summary - count of trades for a symbol
 */
export const getTradeSummary = tool({
  description: 'Get a summary count of trades for a stock symbol, separated by security type (stocks vs options)',
  inputSchema: z.object({
    symbol: z.string().describe('Stock ticker symbol or company name (e.g., AAPL, Apple, NVDA)'),
  }),
  execute: async ({ symbol }) => {
    const normalizedSymbol = normalizeSymbol(symbol);

    const { data, error } = await supabase
      .from('TradeData')
      .select('SecurityType, TradeType')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);

    if (error) {
      return `Error looking up trades for ${normalizedSymbol}: ${error.message}`;
    }

    const stockTrades = data?.filter(t => t.SecurityType === 'S').length || 0;
    const optionTrades = data?.filter(t => t.SecurityType === 'O').length || 0;
    const totalTrades = stockTrades + optionTrades;

    if (totalTrades === 0) {
      return `No trades found for ${normalizedSymbol}.`;
    }

    return `For ${normalizedSymbol}: Found ${stockTrades} stock trades and ${optionTrades} option trades. Total: ${totalTrades} trades.`;
  },
});

/**
 * Get fees - commissions, interest, locate fees
 */
export const getFees = tool({
  description: 'Get commissions, credit interest, debit interest, locate fees, or short interest for a time period',
  inputSchema: z.object({
    fee_type: z.enum(['commission', 'credit_interest', 'debit_interest', 'locate_fee', 'short_interest'])
      .describe('Type of fee to look up'),
    time_period: z.string().describe('Time period like "last month", "this year", "September"'),
    symbol: z.string().optional().describe('Stock symbol for locate_fee or short_interest queries'),
  }),
  execute: async ({ fee_type, time_period, symbol }) => {
    const resolved = parseTimePeriodToResolvedDates(time_period);
    if (!resolved) {
      return `I couldn't understand the time period "${time_period}". Please try something like "last month", "this year", or "September".`;
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
        return `Error retrieving commission data: ${error.message}`;
      }

      const totalCommission = data ? data.reduce((sum, trade) => sum + Math.abs(trade.Commission || 0), 0) : 0;

      if (!data || data.length === 0 || Math.abs(totalCommission) < 0.01) {
        return `No commission data found for ${description}.`;
      }

      return `The total commission you paid in ${description} is ${formatCurrency(totalCommission)}`;
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
      return `Error retrieving fee data: ${error.message}`;
    }

    const totalAmount = data ? data.reduce((sum, fee) => sum + Math.abs(fee.Amount || 0), 0) : 0;

    if (!data || data.length === 0 || Math.abs(totalAmount) < 0.01) {
      const feeTypeName = fee_type.replace('_', ' ');
      const symbolText = normalizedSymbol ? ` for ${normalizedSymbol}` : '';
      return `No ${feeTypeName} data found${symbolText} for ${description}.`;
    }

    const txCount = data.length;
    const txCountText = txCount > 1 ? ` across ${txCount} transactions` : '';

    switch (fee_type) {
      case 'credit_interest':
        return `The total credit interest you received for ${description} is ${formatCurrency(totalAmount)}${txCountText}`;
      case 'debit_interest':
        return `The total Debit interest you paid for ${description} is ${formatCurrency(totalAmount)}${txCountText}`;
      case 'locate_fee': {
        const symbolText = normalizedSymbol ? ` for stock ${normalizedSymbol}` : '';
        return `The total Locate fees you paid${symbolText} for ${description} is ${formatCurrency(totalAmount)}${txCountText}`;
      }
      case 'short_interest': {
        const symbolText = normalizedSymbol ? ` for ${normalizedSymbol}` : '';
        return `Your total short interest${symbolText} for ${description} is ${formatCurrency(totalAmount)}${txCountText}`;
      }
      default:
        return `Total ${fee_type} for ${description}: ${formatCurrency(totalAmount)}`;
    }
  },
});

/**
 * Get account balance information
 */
export const getAccountBalance = tool({
  description: 'Get account balance, equity, buying power, NLV, or margin information',
  inputSchema: z.object({
    query_type: z.enum([
      'cash_balance',
      'cash_and_equity',
      'buying_power',
      'account_summary',
      'nlv',
      'overnight_margin',
      'market_value',
    ]).describe('Type of account information to retrieve'),
  }),
  execute: async ({ query_type }) => {
    // Get the most recent account balance record
    const { data, error } = await supabase
      .from('AccountBalance')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .order('Date', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return 'Error retrieving account balance information.';
    }

    const date = new Date(data.Date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    switch (query_type) {
      case 'cash_balance':
        return `Your account cash balance as of ${date} is ${formatCurrency(data.CashBalance || 0)}`;

      case 'cash_and_equity':
        return `Your account cash balance as of ${date} is ${formatCurrency(data.CashBalance || 0)} and account equity is ${formatCurrency(data.AccountEquity || 0)}`;

      case 'buying_power':
        return `Your Day Trade Buying power as of ${date} is ${formatCurrency(data.DayTradeBP || 0)}`;

      case 'nlv':
        return `Your account Net Liquidation value as of ${date} is ${formatCurrency(data.AccountEquity || 0)}`;

      case 'overnight_margin': {
        const houseExcess = data.HouseExcess || 0;
        const excessLabel = houseExcess >= 0 ? 'House Excess' : 'House Deficit';
        return `Your account House requirement as of ${date} is ${formatCurrency(data.HouseReq || 0)} and ${excessLabel} is ${formatCurrency(Math.abs(houseExcess))}`;
      }

      case 'market_value':
        return `The market value of your long stock positions is ${formatCurrency(data.StockLongMV || 0)}, your long options positions is ${formatCurrency(data.OptionLongMV || 0)}, your short stock positions is ${formatCurrency(data.StockShortMV || 0)}, your short options positions is ${formatCurrency(Math.abs(data.OptionShortMV || 0))}`;

      case 'account_summary':
        return `Your account summary as of ${date}: Cash Balance is ${formatCurrency(data.CashBalance || 0)}, Account Equity is ${formatCurrency(data.AccountEquity || 0)}, Day Trading BP is ${formatCurrency(data.DayTradeBP || 0)}, Stock Long Market value is ${formatCurrency(data.StockLongMV || 0)}, Stock Short Market value is ${formatCurrency(data.StockShortMV || 0)}, Options Long Market value is ${formatCurrency(data.OptionLongMV || 0)}, Options Short Market value is ${formatCurrency(Math.abs(data.OptionShortMV || 0))}`;

      default:
        return `Unknown query type: ${query_type}`;
    }
  },
});

/**
 * Get detailed trades for a symbol
 */
export const getDetailedTrades = tool({
  description: 'Get detailed trade information for a symbol including all trades and calculated totals',
  inputSchema: z.object({
    symbol: z.string().describe('Stock ticker symbol or company name'),
  }),
  execute: async ({ symbol }) => {
    const normalizedSymbol = normalizeSymbol(symbol);

    const { data, error } = await supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .order('Date', { ascending: false });

    if (error) {
      return `Error retrieving trades for ${normalizedSymbol}: ${error.message}`;
    }

    if (!data || data.length === 0) {
      return `No trades found for ${normalizedSymbol}.`;
    }

    const stockTrades = data.filter(t => t.SecurityType === 'S');
    const optionTrades = data.filter(t => t.SecurityType === 'O');
    const buyTrades = stockTrades.filter(t => t.TradeType === 'B');

    const totalSharesPurchased = buyTrades.reduce((sum, t) => sum + parseFloat(t.StockShareQty || '0'), 0);
    const totalCost = buyTrades.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

    // Use last trade price to estimate current value
    const lastPrice = stockTrades[0]?.StockTradePrice ? parseFloat(stockTrades[0].StockTradePrice) : 0;
    const currentValue = totalSharesPurchased * lastPrice;
    const profitLoss = currentValue - totalCost;
    const profitLossPercent = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;

    const profitLossText = profitLoss >= 0 ? `a gain of ${formatCurrency(profitLoss)}` : `a loss of ${formatCurrency(Math.abs(profitLoss))}`;
    const percentText = profitLossPercent >= 0 ? `${profitLossPercent.toFixed(2)} percent` : `negative ${Math.abs(profitLossPercent).toFixed(2)} percent`;

    return `You purchased ${totalSharesPurchased} shares of ${normalizedSymbol} at a total cost of ${formatCurrency(totalCost)} with a current value of ${formatCurrency(currentValue)} resulting in ${profitLossText} or ${percentText}. You also have ${optionTrades.length} option trades.`;
  },
});

/**
 * Get time-based trades
 */
export const getTimeBasedTrades = tool({
  description: 'Get trades for a specific time period, optionally filtered by symbol',
  inputSchema: z.object({
    time_period: z.string().describe('Time period like "last week", "yesterday", "this month", "June 1st to 7th"'),
    symbol: z.string().optional().describe('Optional stock symbol to filter'),
    trade_type: z.enum(['buy', 'sell']).optional().describe('Optional filter for buy or sell trades'),
  }),
  execute: async ({ time_period, symbol, trade_type }) => {
    const resolved = parseTimePeriodToResolvedDates(time_period);
    if (!resolved) {
      return `I couldn't understand the time period "${time_period}".`;
    }

    const { startDate, endDate, dates, description } = resolved;
    const normalizedSymbol = symbol ? normalizeSymbol(symbol) : undefined;

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

    if (trade_type) {
      query = query.eq('TradeType', trade_type === 'buy' ? 'B' : 'S');
    }

    const { data, error } = await query.order('Date', { ascending: false });

    if (error) {
      return `Error retrieving trades: ${error.message}`;
    }

    if (!data || data.length === 0) {
      const symbolText = normalizedSymbol ? ` for ${normalizedSymbol}` : '';
      return `No trades found${symbolText} for ${description}.`;
    }

    const stockTrades = data.filter(t => t.SecurityType === 'S');
    const optionTrades = data.filter(t => t.SecurityType === 'O');
    const buyCount = data.filter(t => t.TradeType === 'B').length;
    const sellCount = data.filter(t => t.TradeType === 'S').length;
    const totalValue = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

    const symbolText = normalizedSymbol ? ` for ${normalizedSymbol}` : '';
    return `Found ${data.length} trades${symbolText} for ${description}: ${stockTrades.length} stock trades and ${optionTrades.length} option trades. ${buyCount} buys and ${sellCount} sells with total value of ${formatCurrency(totalValue)}.`;
  },
});

/**
 * Get options trades with various query types
 */
export const getOptions = tool({
  description: 'Get option trades with support for bulk queries, single trades, expiring options, highest strikes, and total premiums',
  inputSchema: z.object({
    query_type: z.enum(['bulk', 'last', 'expiring', 'highest_strike', 'total_premium'])
      .describe('Type of options query: bulk (multiple trades), last (most recent), expiring (by expiration), highest_strike, total_premium'),
    symbol: z.string().optional().describe('Stock symbol to filter (e.g., AAPL, TSLA)'),
    trade_type: z.enum(['buy', 'sell']).optional().describe('Filter by buy or sell'),
    call_put: z.enum(['call', 'put']).optional().describe('Filter by call or put options'),
    time_period: z.string().optional().describe('Time period like "last month", "this year"'),
    expiration: z.string().optional().describe('Expiration period like "tomorrow", "this week"'),
  }),
  execute: async ({ query_type, symbol, trade_type, call_put, time_period, expiration }) => {
    // Build base query for options only
    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .eq('SecurityType', 'O');

    // Apply symbol filter
    const normalizedSymbol = symbol ? normalizeSymbol(symbol) : undefined;
    if (normalizedSymbol) {
      query = query.or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);
    }

    // Apply trade type filter
    if (trade_type) {
      query = query.eq('TradeType', trade_type === 'buy' ? 'B' : 'S');
    }

    // Apply call/put filter
    if (call_put) {
      const cp = call_put === 'call' ? 'C' : 'P';
      query = query.filter('"Call/Put"', 'eq', cp);
    }

    // Apply date range
    if (time_period) {
      const resolved = parseTimePeriodToResolvedDates(time_period);
      if (resolved) {
        if (resolved.type === 'discrete' && resolved.dates && resolved.dates.length > 0) {
          query = query.in('Date', resolved.dates);
        } else if (resolved.startDate && resolved.endDate) {
          query = query.gte('Date', resolved.startDate).lte('Date', resolved.endDate);
        }
      }
    }

    // Apply expiration filter
    if (expiration) {
      const resolvedExp = parseTimePeriodToResolvedDates(expiration);
      if (resolvedExp) {
        if (resolvedExp.type === 'discrete' && resolvedExp.dates && resolvedExp.dates.length > 0) {
          query = query.in('Expiration', resolvedExp.dates);
        } else if (resolvedExp.startDate === resolvedExp.endDate && resolvedExp.startDate) {
          query = query.eq('Expiration', resolvedExp.startDate);
        } else if (resolvedExp.startDate) {
          query = query.gte('Expiration', resolvedExp.startDate);
          if (resolvedExp.endDate) query = query.lte('Expiration', resolvedExp.endDate);
        }
      }
    }

    // Query type specific ordering
    switch (query_type) {
      case 'last':
        query = query.order('Date', { ascending: false }).limit(1);
        break;
      case 'highest_strike':
        query = query.order('Strike', { ascending: false }).limit(1);
        break;
      default:
        query = query.order('Date', { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      return `Error executing options query: ${error.message}`;
    }

    if (!data || data.length === 0) {
      let filterDesc = normalizedSymbol ? ` for ${normalizedSymbol}` : '';
      if (call_put) filterDesc += ` ${call_put}`;
      filterDesc += ' options';
      if (time_period) filterDesc += ` ${time_period}`;
      if (expiration) filterDesc += ` expiring ${expiration}`;
      return `No${filterDesc} found.`;
    }

    // Build response based on query type
    const callPutLabel = call_put === 'call' ? 'call' : call_put === 'put' ? 'put' : '';
    const actionVerb = trade_type === 'buy' ? 'bought' : trade_type === 'sell' ? 'sold' : 'traded';
    const premiumVerb = trade_type === 'sell' ? 'collecting' : 'paying';

    switch (query_type) {
      case 'last': {
        const trade = data[0];
        const qty = parseFloat(trade.OptionContracts || '0');
        const strike = parseFloat(trade.Strike || '0');
        const premium = Math.abs(parseFloat(trade.NetAmount || '0'));
        const perContract = qty > 0 ? premium / qty : 0;
        const cp = trade['Call/Put'] === 'C' ? 'call' : 'put';
        const action = trade.TradeType === 'B' ? 'bought' : 'sold';
        const pVerb = trade.TradeType === 'B' ? 'paying' : 'collecting';
        const underlying = trade.UnderlyingSymbol || normalizedSymbol || 'the stock';
        const tradeDate = formatDateForVoice(trade.Date);
        const expirationDate = trade.Expiration ? formatDateForVoice(trade.Expiration) : 'N/A';

        return `Your most recent ${cp} option on ${underlying} was on ${tradeDate}. You ${action} ${qty} ${qty === 1 ? 'contract' : 'contracts'} of the $${strike} strike, ${pVerb} ${formatCurrency(premium)} total premium (${formatCurrency(perContract)} per contract). This option expires ${expirationDate}.`;
      }

      case 'highest_strike': {
        const trade = data[0];
        const qty = parseFloat(trade.OptionContracts || '0');
        const strike = parseFloat(trade.Strike || '0');
        const premium = Math.abs(parseFloat(trade.NetAmount || '0'));
        const cp = trade['Call/Put'] === 'C' ? 'call' : 'put';
        const action = trade.TradeType === 'B' ? 'bought' : 'sold';
        const underlying = trade.UnderlyingSymbol || normalizedSymbol || 'the stock';
        const tradeDate = formatDateForVoice(trade.Date);
        const expirationDate = trade.Expiration ? formatDateForVoice(trade.Expiration) : 'N/A';

        return `Your highest strike ${cp} option on ${underlying} was the $${strike} strike. You ${action} ${qty} ${qty === 1 ? 'contract' : 'contracts'} on ${tradeDate} for ${formatCurrency(premium)} total premium, expiring ${expirationDate}.`;
      }

      case 'total_premium': {
        const totalContracts = data.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
        const totalPremium = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);
        const sharesCovered = totalContracts * 100;
        const avgPremium = totalContracts > 0 ? totalPremium / totalContracts / 100 : 0;

        return `You ${actionVerb} ${totalContracts} ${callPutLabel} option contracts${normalizedSymbol ? ` on ${normalizedSymbol}` : ''}${time_period ? ` ${time_period}` : ''}, ${premiumVerb} total premium of ${formatCurrency(totalPremium)}. The average premium per share was ${formatCurrency(avgPremium)}, covering ${sharesCovered} shares across ${data.length} trades.`;
      }

      case 'expiring': {
        const totalContracts = data.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
        const callCount = data.filter(t => t['Call/Put'] === 'C').length;
        const putCount = data.filter(t => t['Call/Put'] === 'P').length;

        return `You have ${data.length} option${data.length === 1 ? '' : 's'} expiring ${expiration || 'soon'} totaling ${totalContracts} contracts. That's ${callCount} call${callCount === 1 ? '' : 's'} and ${putCount} put${putCount === 1 ? '' : 's'}.`;
      }

      case 'bulk':
      default: {
        const totalContracts = data.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
        const totalPremium = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);
        const sharesCovered = totalContracts * 100;
        const avgPremium = totalContracts > 0 ? totalPremium / totalContracts / 100 : 0;

        return `You ${actionVerb} ${totalContracts} ${callPutLabel} option contracts${normalizedSymbol ? ` on ${normalizedSymbol}` : ''}${time_period ? ` ${time_period}` : ''}, ${premiumVerb} total premium of ${formatCurrency(totalPremium)}. The average premium per share was ${formatCurrency(avgPremium)}, covering ${sharesCovered} shares across ${data.length} trades.`;
      }
    }
  },
});

// Helper to format date for voice (TTS-friendly)
function formatDateForVoice(dateStr: string): string {
  if (!dateStr) return 'N/A';
  const datePart = dateStr.split('T')[0];
  const date = new Date(datePart + 'T00:00:00Z');
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * End call system tool
 */
export const endCall = tool({
  description: 'End the current conversation when the user indicates they are done',
  inputSchema: z.object({
    reason: z.string().describe('The reason for ending the call'),
    message: z.string().optional().describe('A farewell message to the user'),
  }),
  execute: async ({ message }) => {
    // This is handled specially by ElevenLabs as a system tool
    return message || 'Goodbye! Have a great day.';
  },
});

// Export all tools as a single object for AI SDK
export const finagentTools = {
  get_trade_summary: getTradeSummary,
  get_fees: getFees,
  get_account_balance: getAccountBalance,
  get_detailed_trades: getDetailedTrades,
  get_time_based_trades: getTimeBasedTrades,
  get_options: getOptions,
  end_call: endCall,
};
