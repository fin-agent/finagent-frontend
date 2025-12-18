import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getDateOffset } from '@/src/lib/date-utils';
import { normalizeSymbol } from '@/src/lib/symbol-utils';

// Format raw database date without offset (for "this year" queries)
function formatRawDate(dateStr: string): string {
  if (!dateStr) return '';
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

// Returns structured option stats for UI rendering
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, tradeType, year } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    // Get the date offset to map user's year to demo database year
    const offset = getDateOffset();
    const userYear = year || new Date().getFullYear();
    const offsetYears = Math.round(offset / 365);
    const dbYear = userYear + offsetYears;

    const yearStart = `${dbYear}-01-01`;
    const yearEnd = `${dbYear}-12-31`;

    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .eq('SecurityType', 'O') // Options only
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .gte('Date', yearStart)
      .lte('Date', yearEnd);

    if (tradeType) {
      const normalizedType = tradeType.toLowerCase().startsWith('s') ? 'S' : 'B';
      query = query.eq('TradeType', normalizedType);
    }

    const { data, error } = await query.order('Date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ optionStats: null });
    }

    // Calculate option statistics
    const premiums = data.map(t => parseFloat(t.OptionTradePremium || '0')).filter(p => p > 0);
    const contracts = data.map(t => parseFloat(t.OptionContracts || '0'));
    const totalContracts = contracts.reduce((a, b) => a + b, 0);
    const totalValue = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

    const highestPremium = Math.max(...premiums);
    const lowestPremium = Math.min(...premiums);
    const avgPremium = premiums.reduce((a, b) => a + b, 0) / premiums.length;

    const highestTrade = data.find(t => parseFloat(t.OptionTradePremium || '0') === highestPremium);
    const lowestTrade = data.find(t => parseFloat(t.OptionTradePremium || '0') === lowestPremium);

    // Count calls vs puts
    const callCount = data.filter(t => t['Call/Put'] === 'C').length;
    const putCount = data.filter(t => t['Call/Put'] === 'P').length;

    const typeLabel = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'sell' : 'buy') : 'all';

    return NextResponse.json({
      optionStats: {
        symbol: normalizedSymbol,
        year: userYear, // Return user's requested year, not DB year
        tradeType: typeLabel,
        highestPremium,
        highestPremiumDate: highestTrade?.Date ? formatRawDate(highestTrade.Date) : null,
        highestPremiumContracts: highestTrade ? parseFloat(highestTrade.OptionContracts || '0') : 0,
        highestPremiumStrike: highestTrade ? parseFloat(highestTrade.Strike || '0') : 0,
        highestPremiumCallPut: highestTrade?.['Call/Put'] === 'C' ? 'Call' : 'Put',
        lowestPremium,
        lowestPremiumDate: lowestTrade?.Date ? formatRawDate(lowestTrade.Date) : null,
        lowestPremiumContracts: lowestTrade ? parseFloat(lowestTrade.OptionContracts || '0') : 0,
        lowestPremiumStrike: lowestTrade ? parseFloat(lowestTrade.Strike || '0') : 0,
        lowestPremiumCallPut: lowestTrade?.['Call/Put'] === 'C' ? 'Call' : 'Put',
        averagePremium: avgPremium,
        totalTrades: data.length,
        totalContracts,
        totalValue,
        callCount,
        putCount,
      },
    });
  } catch (error) {
    console.error('Option stats API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
