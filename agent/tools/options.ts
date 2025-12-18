import { llm } from '@livekit/agents';
import { z } from 'zod';
import { supabase, ACCOUNT_CODE, normalizeSymbol, parseRelativeDate, formatDateForVoice } from '../shared/index.js';

const QueryType = z.enum(['bulk', 'last', 'expiring', 'highest_strike', 'total_premium']);

/**
 * Comprehensive options query tool
 *
 * Query Types:
 * - bulk: Multiple option trades (e.g., "Show all short calls on TSLA last month")
 * - last: Single most recent trade (e.g., "Show the last call option I bought on AAPL")
 * - expiring: Options expiring on a date (e.g., "Show me all options expiring tomorrow")
 * - highest_strike: Single trade with highest strike (e.g., "Highest strike call I sold on AAPL this year")
 * - total_premium: Aggregated premium sum (e.g., "Total premium paid for SPY options last 12 months")
 */
export const getOptions = llm.tool({
  description: `Query option trades with various query types:
    - bulk: Get multiple option trades matching filters (e.g., "all short calls on TSLA last month")
    - last: Get the single most recent option trade (e.g., "last call option I bought")
    - expiring: Get options expiring on a specific date (e.g., "options expiring tomorrow")
    - highest_strike: Get the trade with highest strike price (e.g., "highest strike call I sold this year")
    - total_premium: Get total premium collected or paid (e.g., "total premium from SPY options")`,

  parameters: z.object({
    query_type: QueryType.describe('Type of options query to perform'),
    symbol: z.string().nullish().describe('Stock ticker symbol (e.g., AAPL, SPY)'),
    trade_type: z.enum(['buy', 'sell']).nullish().describe('Buy (long) or sell (short) options'),
    call_put: z.enum(['call', 'put']).nullish().describe('Call or put option'),
    time_period: z.string().nullish().describe('Time period for trade date (e.g., "last month", "this year")'),
    expiration: z.string().nullish().describe('Expiration date filter (e.g., "tomorrow", "this week")'),
  }),

  execute: async ({ query_type, symbol, trade_type, call_put, time_period, expiration }) => {
    // Build base query
    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .eq('SecurityType', 'O'); // Options only

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
      query = query.filter('"Call/Put"', 'eq', call_put === 'call' ? 'C' : 'P');
    }

    // Apply date range for trade date
    if (time_period) {
      const parsed = parseRelativeDate(time_period);
      if (parsed.start) query = query.gte('Date', parsed.start);
      if (parsed.end) query = query.lte('Date', parsed.end);
    }

    // Apply expiration filter
    if (expiration) {
      const parsed = parseRelativeDate(expiration);
      if (parsed.start === parsed.end && parsed.start) {
        query = query.eq('Expiration', parsed.start);
      } else if (parsed.start) {
        query = query.gte('Expiration', parsed.start);
        if (parsed.end) query = query.lte('Expiration', parsed.end);
      }
    }

    // Query type specific ordering and limits
    switch (query_type) {
      case 'last':
        query = query.order('Date', { ascending: false }).limit(1);
        break;
      case 'highest_strike':
        query = query.order('Strike', { ascending: false }).limit(1);
        break;
      case 'expiring':
      case 'bulk':
      case 'total_premium':
      default:
        query = query.order('Date', { ascending: false });
        break;
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

        return `Your most recent ${cp} option on ${underlying} was on ${tradeDate}. You ${action} ${qty} ${qty === 1 ? 'contract' : 'contracts'} of the $${strike} strike, ${pVerb} $${premium.toFixed(2)} total premium ($${perContract.toFixed(2)} per contract). This option expires ${expirationDate}.`;
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

        return `Your highest strike ${cp} option on ${underlying} was the $${strike} strike. You ${action} ${qty} ${qty === 1 ? 'contract' : 'contracts'} on ${tradeDate} for $${premium.toFixed(2)} total premium, expiring ${expirationDate}.`;
      }

      case 'total_premium': {
        const totalContracts = data.reduce((sum, t) => sum + parseFloat(t.OptionContracts || '0'), 0);
        const totalPremium = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);
        const sharesCovered = totalContracts * 100;
        const avgPremium = totalContracts > 0 ? totalPremium / totalContracts / 100 : 0;
        const symbolLabel = normalizedSymbol || '';

        return `You ${actionVerb} ${totalContracts} ${callPutLabel} option contracts${symbolLabel ? ` on ${symbolLabel}` : ''}${time_period ? ` ${time_period}` : ''}, ${premiumVerb} total premium of $${totalPremium.toFixed(2)}. The average premium per share was $${avgPremium.toFixed(2)}, covering ${sharesCovered} shares across ${data.length} trades.`;
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
        const symbolLabel = normalizedSymbol || '';

        return `You ${actionVerb} ${totalContracts} ${callPutLabel} option contracts${symbolLabel ? ` on ${symbolLabel}` : ''}${time_period ? ` ${time_period}` : ''}, ${premiumVerb} total premium of $${totalPremium.toFixed(2)}. The average premium per share was $${avgPremium.toFixed(2)}, covering ${sharesCovered} shares across ${data.length} trades.`;
      }
    }
  },
});
