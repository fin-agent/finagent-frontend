import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatCalendarDate } from '@/src/lib/date-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

function normalizeSymbol(input: string): string {
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
  };
  const lower = input.toLowerCase().trim();
  return SYMBOL_MAP[lower] || input.toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Profitable trades request:', JSON.stringify(body, null, 2));

    const symbol = body.symbol || body.parameters?.symbol;

    if (!symbol) {
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
      });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    // Fetch buy trades
    const { data: buyTrades, error: buyError } = await supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .eq('TradeType', 'B')
      .order('Date', { ascending: true })
      .order('TradeID', { ascending: true });

    if (buyError) {
      return NextResponse.json({
        response: `Error fetching trades: ${buyError.message}`,
      });
    }

    // Fetch sell trades
    const { data: sellTrades, error: sellError } = await supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .ilike('TradeType', 'S')
      .order('Date', { ascending: true })
      .order('TradeID', { ascending: true });

    if (sellError) {
      return NextResponse.json({
        response: `Error fetching trades: ${sellError.message}`,
      });
    }

    if (!buyTrades?.length || !sellTrades?.length) {
      return NextResponse.json({
        response: `No matched buy/sell pairs found for ${normalizedSymbol}. You may have open positions that haven't been sold yet.`,
      });
    }

    // Match trades using FIFO by security type
    interface MatchedTrade {
      securityType: string;
      buyDate: string;
      sellDate: string;
      quantity: number;
      buyPrice: number;
      sellPrice: number;
      profitLoss: number;
    }

    const matchedTrades: MatchedTrade[] = [];
    const securityTypes = ['S', 'O'];

    for (const secType of securityTypes) {
      const buys = buyTrades.filter(t => t.SecurityType === secType);
      const sells = sellTrades.filter(t => t.SecurityType === secType);
      const matchCount = Math.min(buys.length, sells.length);

      for (let i = 0; i < matchCount; i++) {
        const buy = buys[i];
        const sell = sells[i];
        const profitLoss = (parseFloat(sell.NetAmount) || 0) + (parseFloat(buy.NetAmount) || 0);

        matchedTrades.push({
          securityType: secType === 'S' ? 'Stock' : 'Option',
          // Format dates with offset applied for display
          buyDate: formatCalendarDate(buy.Date),
          sellDate: formatCalendarDate(sell.Date),
          quantity: parseFloat(buy.StockShareQty || buy.OptionContracts || '0'),
          buyPrice: parseFloat(buy.StockTradePrice || buy.OptionTradePremium || '0'),
          sellPrice: parseFloat(sell.StockTradePrice || sell.OptionTradePremium || '0'),
          profitLoss,
        });
      }
    }

    // Filter to only profitable and sort
    const profitableTrades = matchedTrades
      .filter(t => t.profitLoss > 0)
      .sort((a, b) => b.profitLoss - a.profitLoss);

    const totalProfit = profitableTrades.reduce((sum, t) => sum + t.profitLoss, 0);

    if (profitableTrades.length === 0) {
      const allTradesProfit = matchedTrades.reduce((sum, t) => sum + t.profitLoss, 0);
      if (matchedTrades.length > 0) {
        return NextResponse.json({
          response: `No profitable trades found for ${normalizedSymbol}. You have ${matchedTrades.length} matched trades with a total loss of $${Math.abs(allTradesProfit).toFixed(2)}.`,
        });
      }
      return NextResponse.json({
        response: `No profitable trades found for ${normalizedSymbol}.`,
      });
    }

    // Build response
    let response = `Found ${profitableTrades.length} profitable trades for ${normalizedSymbol} with a total profit of $${totalProfit.toFixed(2)}. `;

    // List top 3 trades
    const topTrades = profitableTrades.slice(0, 3);
    topTrades.forEach((trade, i) => {
      response += `Trade ${i + 1}: ${trade.securityType}, bought ${trade.buyDate} at $${trade.buyPrice.toFixed(2)}, sold ${trade.sellDate} at $${trade.sellPrice.toFixed(2)}, profit $${trade.profitLoss.toFixed(2)}. `;
    });

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Profitable trades error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error getting the profitable trades.',
    });
  }
}
