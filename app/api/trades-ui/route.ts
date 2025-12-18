import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatCalendarDate } from '@/src/lib/date-utils';
import { normalizeSymbol } from '@/src/lib/symbol-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

// Returns structured trade data for UI rendering
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = body.symbol;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    const { data, error } = await supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .order('Date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ trades: [], summary: null });
    }

    // Separate stock and option trades
    const stockTrades = data.filter(t => t.SecurityType === 'S');
    const optionTrades = data.filter(t => t.SecurityType === 'O');

    // Count buys and sells across ALL trades
    const buyCount = data.filter(t => t.TradeType === 'B').length;
    const sellCount = data.filter(t => t.TradeType === 'S').length;

    // Calculate total quantities for ALL trades
    const totalShares = stockTrades.reduce((sum, t) =>
      sum + parseFloat(t.StockShareQty || '0'), 0);
    const totalContracts = optionTrades.reduce((sum, t) =>
      sum + parseFloat(t.OptionContracts || '0'), 0);
    const totalQuantity = totalShares + totalContracts;

    // Calculate total value (sum of absolute NetAmounts) for ALL trades
    const totalValue = data.reduce((sum, t) =>
      sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

    // Calculate average value per trade
    const avgValue = data.length > 0 ? totalValue / data.length : 0;

    // Format trades for the TradesTable component with offset-adjusted dates
    const trades = data.map(t => ({
      TradeID: t.TradeID,
      Date: formatCalendarDate(t.Date),
      Symbol: t.Symbol || normalizedSymbol,
      SecurityType: t.SecurityType,
      TradeType: t.TradeType,
      StockTradePrice: t.StockTradePrice || '0',
      StockShareQty: t.StockShareQty || '0',
      OptionContracts: t.OptionContracts || '0',
      OptionTradePremium: t.OptionTradePremium || '0',
      GrossAmount: t.GrossAmount || '0',
      NetAmount: t.NetAmount || '0',
      Strike: t.Strike,
      Expiration: t.Expiration ? formatCalendarDate(t.Expiration) : null,
      'Call/Put': t['Call/Put'],
    }));

    // Summary matches voice endpoint and UI component calculations
    const summary = {
      symbol: normalizedSymbol,
      tradeCount: data.length,
      stockCount: stockTrades.length,
      optionCount: optionTrades.length,
      buyCount,
      sellCount,
      totalShares,
      totalContracts,
      totalQuantity,
      totalValue,
      avgValue,
    };

    return NextResponse.json({ trades, summary });
  } catch (error) {
    console.error('Trades UI API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
