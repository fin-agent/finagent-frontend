import { llm } from '@livekit/agents';
import { z } from 'zod';
import { supabase, ACCOUNT_CODE, normalizeSymbol, parseRelativeDate, formatDateForVoice } from '../shared/index.js';

/**
 * Get a summary count of trades for a symbol
 */
export const getTradeSummary = llm.tool({
  description: 'Get a summary count of stock and option trades for a given symbol',
  parameters: z.object({
    symbol: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA) or company name (e.g., Apple, Tesla)'),
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
 * Get detailed trade history for a symbol
 */
export const getDetailedTrades = llm.tool({
  description: 'Get detailed trade history for a symbol including quantities, values, and breakdown by type',
  parameters: z.object({
    symbol: z.string().describe('Stock ticker symbol or company name'),
    time_period: z.string().nullish().describe('Time period like "today", "this week", "last month", "this year"'),
  }),
  execute: async ({ symbol, time_period }) => {
    const normalizedSymbol = normalizeSymbol(symbol);

    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .order('Date', { ascending: false });

    if (time_period) {
      const parsed = parseRelativeDate(time_period);
      if (parsed.start) query = query.gte('Date', parsed.start);
      if (parsed.end) query = query.lte('Date', parsed.end);
    }

    const { data, error } = await query;

    if (error) {
      return `Error looking up trades for ${normalizedSymbol}: ${error.message}`;
    }

    if (!data || data.length === 0) {
      return `No trades found for ${normalizedSymbol}${time_period ? ` ${time_period}` : ''}.`;
    }

    // Calculate summary metrics
    const stockTrades = data.filter(t => t.SecurityType === 'S');
    const optionTrades = data.filter(t => t.SecurityType === 'O');
    const buyTrades = data.filter(t => t.TradeType === 'B');
    const sellTrades = data.filter(t => t.TradeType === 'S');

    const totalShares = stockTrades.reduce((sum, t) => sum + parseFloat(t.Quantity || '0'), 0);
    const totalContracts = optionTrades.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
    const totalValue = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

    const timePeriodDescription = time_period ? ` ${time_period}` : '';

    let response = `For ${normalizedSymbol}${timePeriodDescription}, you have ${data.length} total trades: `;
    response += `${stockTrades.length} stock trades and ${optionTrades.length} option trades. `;
    response += `${buyTrades.length} buys and ${sellTrades.length} sells. `;

    if (totalShares > 0) {
      response += `Total shares traded: ${totalShares.toLocaleString()}. `;
    }
    if (totalContracts > 0) {
      response += `Total option contracts: ${totalContracts.toLocaleString()}. `;
    }
    response += `Total trade value: $${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;

    return response;
  },
});

/**
 * Get trade statistics (highest/lowest prices, averages)
 */
export const getTradeStats = llm.tool({
  description: 'Get trade statistics including highest price sold, lowest price bought, and averages for a symbol',
  parameters: z.object({
    symbol: z.string().describe('Stock ticker symbol or company name'),
    time_period: z.string().nullish().describe('Time period like "this year", "last month"'),
    trade_type: z.enum(['buy', 'sell']).nullish().describe('Filter by buy or sell trades'),
    security_type: z.enum(['stock', 'option']).nullish().describe('Filter by stock or option trades'),
  }),
  execute: async ({ symbol, time_period, trade_type, security_type }) => {
    const normalizedSymbol = normalizeSymbol(symbol);

    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);

    if (trade_type) {
      query = query.eq('TradeType', trade_type === 'buy' ? 'B' : 'S');
    }

    if (security_type) {
      query = query.eq('SecurityType', security_type === 'stock' ? 'S' : 'O');
    }

    if (time_period) {
      const parsed = parseRelativeDate(time_period);
      if (parsed.start) query = query.gte('Date', parsed.start);
      if (parsed.end) query = query.lte('Date', parsed.end);
    }

    const { data, error } = await query;

    if (error) {
      return `Error looking up trade stats for ${normalizedSymbol}: ${error.message}`;
    }

    if (!data || data.length === 0) {
      return `No trades found for ${normalizedSymbol}${time_period ? ` ${time_period}` : ''}.`;
    }

    // Separate stock and option trades for different stat calculations
    const stockTrades = data.filter(t => t.SecurityType === 'S');
    const optionTrades = data.filter(t => t.SecurityType === 'O');

    let response = '';
    const timePeriodDescription = time_period ? ` ${time_period}` : '';

    // Stock stats
    if (stockTrades.length > 0) {
      const stockPrices = stockTrades.map(t => parseFloat(t.Price || '0')).filter(p => p > 0);
      const highestStock = Math.max(...stockPrices);
      const lowestStock = Math.min(...stockPrices);
      const avgStock = stockPrices.reduce((a, b) => a + b, 0) / stockPrices.length;

      const highestTrade = stockTrades.find(t => parseFloat(t.Price || '0') === highestStock);
      const lowestTrade = stockTrades.find(t => parseFloat(t.Price || '0') === lowestStock);

      response += `Stock stats for ${normalizedSymbol}${timePeriodDescription}: `;
      response += `Highest price: $${highestStock.toFixed(2)}`;
      if (highestTrade) {
        const action = highestTrade.TradeType === 'B' ? 'bought' : 'sold';
        response += ` (${action} on ${formatDateForVoice(highestTrade.Date)})`;
      }
      response += `. Lowest price: $${lowestStock.toFixed(2)}`;
      if (lowestTrade) {
        const action = lowestTrade.TradeType === 'B' ? 'bought' : 'sold';
        response += ` (${action} on ${formatDateForVoice(lowestTrade.Date)})`;
      }
      response += `. Average price: $${avgStock.toFixed(2)}. `;
    }

    // Option stats
    if (optionTrades.length > 0) {
      const premiums = optionTrades.map(t => Math.abs(parseFloat(t.NetAmount || '0') / parseFloat(t.OptionContracts || '1')));
      const avgPremium = premiums.reduce((a, b) => a + b, 0) / premiums.length;
      const totalContracts = optionTrades.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);

      response += `Option stats for ${normalizedSymbol}${timePeriodDescription}: `;
      response += `${optionTrades.length} option trades, ${totalContracts} total contracts. `;
      response += `Average premium per contract: $${avgPremium.toFixed(2)}. `;
    }

    return response.trim();
  },
});

/**
 * Get profitable trades using FIFO matching
 */
export const getProfitableTrades = llm.tool({
  description: 'Get profitable trades for a symbol using FIFO (First-In-First-Out) matching of buys and sells',
  parameters: z.object({
    symbol: z.string().describe('Stock ticker symbol or company name'),
    security_type: z.enum(['stock', 'option']).nullish().describe('Filter by stock or option trades'),
  }),
  execute: async ({ symbol, security_type }) => {
    const normalizedSymbol = normalizeSymbol(symbol);

    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .order('Date', { ascending: true });

    if (security_type) {
      query = query.eq('SecurityType', security_type === 'stock' ? 'S' : 'O');
    }

    const { data, error } = await query;

    if (error) {
      return `Error looking up trades for ${normalizedSymbol}: ${error.message}`;
    }

    if (!data || data.length === 0) {
      return `No trades found for ${normalizedSymbol}.`;
    }

    // FIFO matching for stocks
    const stockTrades = data.filter(t => t.SecurityType === 'S');
    const buys = stockTrades.filter(t => t.TradeType === 'B').map(t => ({
      ...t,
      remainingQty: parseFloat(t.Quantity || '0'),
      pricePerShare: Math.abs(parseFloat(t.NetAmount || '0')) / parseFloat(t.Quantity || '1'),
    }));
    const sells = stockTrades.filter(t => t.TradeType === 'S');

    let totalProfit = 0;
    let matchedTrades = 0;

    for (const sell of sells) {
      let sellQty = parseFloat(sell.Quantity || '0');
      const sellPricePerShare = Math.abs(parseFloat(sell.NetAmount || '0')) / sellQty;

      for (const buy of buys) {
        if (buy.remainingQty <= 0 || sellQty <= 0) continue;

        const matchQty = Math.min(buy.remainingQty, sellQty);
        const profit = matchQty * (sellPricePerShare - buy.pricePerShare);
        totalProfit += profit;
        matchedTrades++;

        buy.remainingQty -= matchQty;
        sellQty -= matchQty;
      }
    }

    if (matchedTrades === 0) {
      return `No matched buy/sell pairs found for ${normalizedSymbol} to calculate profit.`;
    }

    const profitOrLoss = totalProfit >= 0 ? 'profit' : 'loss';
    return `For ${normalizedSymbol} stock trades using FIFO matching: Total ${profitOrLoss} of $${Math.abs(totalProfit).toFixed(2)} across ${matchedTrades} matched trade pairs.`;
  },
});

/**
 * Get time-based trades (trades within a specific time period)
 */
export const getTimeBasedTrades = llm.tool({
  description: 'Get trades for a specific time period like today, yesterday, this week, last month',
  parameters: z.object({
    time_period: z.string().describe('Time period: "today", "yesterday", "this week", "last week", "this month", "last month", "this year", "last 30 days", etc.'),
    symbol: z.string().nullish().describe('Optional stock symbol to filter by'),
    trade_type: z.enum(['buy', 'sell']).nullish().describe('Filter by buy or sell trades'),
  }),
  execute: async ({ time_period, symbol, trade_type }) => {
    const parsed = parseRelativeDate(time_period);

    if (!parsed.start) {
      return `I couldn't understand the time period "${time_period}". Try "today", "this week", "last month", etc.`;
    }

    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .gte('Date', parsed.start)
      .order('Date', { ascending: false });

    if (parsed.end) {
      query = query.lte('Date', parsed.end);
    }

    if (symbol) {
      const normalizedSymbol = normalizeSymbol(symbol);
      query = query.or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);
    }

    if (trade_type) {
      query = query.eq('TradeType', trade_type === 'buy' ? 'B' : 'S');
    }

    const { data, error } = await query;

    if (error) {
      return `Error looking up trades: ${error.message}`;
    }

    if (!data || data.length === 0) {
      let filterDesc = symbol ? ` for ${symbol}` : '';
      if (trade_type) filterDesc += ` (${trade_type}s only)`;
      return `No trades found ${time_period}${filterDesc}.`;
    }

    const stockCount = data.filter(t => t.SecurityType === 'S').length;
    const optionCount = data.filter(t => t.SecurityType === 'O').length;
    const totalValue = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

    // Get unique symbols
    const symbols = [...new Set(data.map(t => t.UnderlyingSymbol || t.Symbol))];

    let response = `${time_period}, you had ${data.length} trades: ${stockCount} stock and ${optionCount} option trades. `;
    response += `Total value: $${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. `;

    if (symbols.length <= 5) {
      response += `Symbols traded: ${symbols.join(', ')}.`;
    } else {
      response += `Traded ${symbols.length} different symbols including ${symbols.slice(0, 3).join(', ')}, and more.`;
    }

    return response;
  },
});
