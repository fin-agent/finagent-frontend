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

// Format number for TTS (no commas)
function formatNumber(num: number): string {
  return Math.round(num).toString();
}

// Format currency for TTS
function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Detailed trades request body:', JSON.stringify(body, null, 2));

    // ElevenLabs may send symbol directly or nested in various ways
    const symbol = body.symbol || body.parameters?.symbol || body.body?.symbol || body.body?.parameters?.symbol;

    if (!symbol) {
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
      });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    const { data, error } = await supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .order('Date', { ascending: false });

    if (error) {
      return NextResponse.json({
        response: `Error getting trade details for ${normalizedSymbol}: ${error.message}`,
      });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        response: `No trades found for ${normalizedSymbol}.`,
      });
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

    // Build response for TTS - matches UI display
    let response = `For ${normalizedSymbol}, you have ${data.length} total trades: `;
    response += `${stockTrades.length} stock trades and ${optionTrades.length} option trades. `;
    response += `${buyCount} buys and ${sellCount} sells. `;
    response += `Total quantity: ${formatNumber(totalQuantity)}`;

    if (stockTrades.length > 0 && optionTrades.length > 0) {
      response += ` (${formatNumber(totalShares)} shares and ${formatNumber(totalContracts)} contracts)`;
    }

    response += `. Total value: ${formatCurrency(totalValue)} with an average of ${formatCurrency(avgValue)} per trade.`;

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Detailed trades error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error getting the detailed trades.',
    });
  }
}
