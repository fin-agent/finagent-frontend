import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

const SYMBOL_MAP: Record<string, string> = {
  'apple': 'AAPL',
  'google': 'GOOGL',
  'alphabet': 'GOOGL',
  'amazon': 'AMZN',
  'microsoft': 'MSFT',
  'tesla': 'TSLA',
  'nvidia': 'NVDA',
  'meta': 'META',
  'facebook': 'META',
  'netflix': 'NFLX',
  'amd': 'AMD',
  'intel': 'INTC',
  'bank of america': 'BAC',
  'citigroup': 'C',
  'gamestop': 'GME',
  'lucid': 'LCID',
};

function normalizeSymbol(input: string): string {
  const lower = input.toLowerCase().trim();
  return SYMBOL_MAP[lower] || input.toUpperCase();
}

// Returns structured option stats for UI rendering
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, tradeType, year } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    const normalizedSymbol = normalizeSymbol(symbol);
    const filterYear = year || new Date().getFullYear();
    const yearStart = `${filterYear}-01-01`;
    const yearEnd = `${filterYear}-12-31`;

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
        year: filterYear,
        tradeType: typeLabel,
        highestPremium,
        highestPremiumDate: highestTrade?.Date,
        highestPremiumContracts: highestTrade ? parseFloat(highestTrade.OptionContracts || '0') : 0,
        highestPremiumStrike: highestTrade ? parseFloat(highestTrade.Strike || '0') : 0,
        highestPremiumCallPut: highestTrade?.['Call/Put'] === 'C' ? 'Call' : 'Put',
        lowestPremium,
        lowestPremiumDate: lowestTrade?.Date,
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
