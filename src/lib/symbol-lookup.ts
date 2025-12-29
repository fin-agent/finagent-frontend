/**
 * Symbol Lookup Utility
 *
 * When a query returns no results for a symbol, this utility checks
 * if the symbol exists elsewhere in the database and provides context.
 *
 * This makes the agent smarter - instead of just saying "No trades found",
 * it can say "No trades found, but I see locate fee entries for this symbol."
 */

import { createClient } from '@supabase/supabase-js';

const ACCOUNT_CODE = 'C40421';

export interface SymbolPresence {
  foundIn: string[];
  context: string | null;
  details: {
    trades?: { count: number; types: string[] };
    fees?: { count: number; feeTypes: string[] };
  };
}

/**
 * Check where a symbol appears across database tables.
 * Returns context about where the symbol exists if not found in the expected table.
 */
export async function checkSymbolPresence(
  symbol: string,
  excludeTable?: 'TradeData' | 'FeesAndInterest'
): Promise<SymbolPresence> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const normalizedSymbol = symbol.toUpperCase();
  const foundIn: string[] = [];
  const details: SymbolPresence['details'] = {};

  // Check TradeData if not excluded
  if (excludeTable !== 'TradeData') {
    const { data: trades, error: tradeError } = await supabase
      .from('TradeData')
      .select('SecurityType, TradeType')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .limit(100);

    if (!tradeError && trades && trades.length > 0) {
      foundIn.push('TradeData');
      const types = new Set<string>();
      trades.forEach(t => {
        if (t.SecurityType === 'S') types.add('stock');
        if (t.SecurityType === 'O') types.add('option');
      });
      details.trades = {
        count: trades.length,
        types: Array.from(types),
      };
    }
  }

  // Check FeesAndInterest if not excluded
  if (excludeTable !== 'FeesAndInterest') {
    const { data: fees, error: feeError } = await supabase
      .from('FeesAndInterest')
      .select('Type')
      .eq('AccountCode', ACCOUNT_CODE)
      .eq('Symbol', normalizedSymbol)
      .limit(100);

    if (!feeError && fees && fees.length > 0) {
      foundIn.push('FeesAndInterest');
      const feeTypes = new Set<string>();
      fees.forEach(f => {
        // Use singular names - pluralization handled in message building
        if (f.Type === 'LocateFee') feeTypes.add('locate fee');
        if (f.Type === 'ShortInterest') feeTypes.add('short interest');
        if (f.Type === 'Commission') feeTypes.add('commission');
        if (f.Type === 'DebitInterest') feeTypes.add('debit interest');
        if (f.Type === 'CreditInterest') feeTypes.add('credit interest');
      });
      details.fees = {
        count: fees.length,
        feeTypes: Array.from(feeTypes),
      };
    }
  }

  // Build context message
  let context: string | null = null;

  if (foundIn.length > 0) {
    const parts: string[] = [];

    if (details.fees && details.fees.feeTypes.length > 0) {
      const count = details.fees.count;
      const feeTypeStr = details.fees.feeTypes.join(' and ');
      // Fix pluralization: "1 locate fee entry" vs "5 locate fee entries"
      const entryWord = count === 1 ? 'entry' : 'entries';
      // Use "there are/is" to avoid "I found" getting lowercased
      const verb = count === 1 ? 'is' : 'are';
      parts.push(`there ${verb} ${count} ${feeTypeStr} ${entryWord} for ${normalizedSymbol}`);
    }

    if (details.trades && details.trades.types.length > 0) {
      const count = details.trades.count;
      const tradeTypeStr = details.trades.types.join(' and ');
      // Fix pluralization: "1 stock trade" vs "5 stock trades"
      const tradeWord = count === 1 ? 'trade' : 'trades';
      const verb = count === 1 ? 'is' : 'are';
      parts.push(`there ${verb} ${count} ${tradeTypeStr} ${tradeWord} for ${normalizedSymbol}`);
    }

    if (parts.length > 0) {
      context = parts.join('. ') + '.';
    }
  }

  return { foundIn, context, details };
}

/**
 * Build a helpful "no results" message that includes context about where the symbol exists.
 */
export async function buildNoResultsMessage(
  symbol: string,
  queryType: 'trades' | 'fees',
  timePeriod?: string
): Promise<string> {
  const periodText = timePeriod ? ` for ${timePeriod}` : '';
  const baseMessage = queryType === 'trades'
    ? `No trades found for ${symbol}${periodText}.`
    : `No fees found for ${symbol}${periodText}.`;

  // Check if symbol exists elsewhere
  const excludeTable = queryType === 'trades' ? 'TradeData' : 'FeesAndInterest';
  const presence = await checkSymbolPresence(symbol, excludeTable as 'TradeData' | 'FeesAndInterest');

  if (presence.context) {
    // Make first letter lowercase to flow naturally after "However, "
    const contextLower = presence.context.charAt(0).toLowerCase() + presence.context.slice(1);
    return `${baseMessage} However, ${contextLower} Would you like to see those instead?`;
  }

  return baseMessage;
}
