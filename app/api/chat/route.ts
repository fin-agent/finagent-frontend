import { createAzure } from '@ai-sdk/azure';
import { streamText, convertToModelMessages } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

// Initialize Azure OpenAI using the official @ai-sdk/azure provider
// Using resourceName to construct proper Azure endpoint
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY!;
const azure = createAzure({
  resourceName: 'saeed-mh1gb8kq-eastus',
  apiKey: AZURE_API_KEY,
  apiVersion: '2024-12-01-preview',
});

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

// Symbol mapping for common company names
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

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: azure('gpt-5'),
    system: `You are a PhD quantitative analyst who is an expert on stocks, options, warrants, and other securities. You work in the back office of a Wall Street brokerage firm and are assisting account holder "Aida Guru" (Account: C40421).

When users ask about trades for a company:
1. Convert company name to ticker symbol (Apple -> AAPL, Google -> GOOGL, etc.)
2. Use the getTradeSummary tool to get the count of trades
3. After receiving the tool result, provide a brief summary message. The detailed data will be displayed automatically by the UI.
4. If the user asks for more details or wants to see trades, use the getDetailedTrades tool
5. After getDetailedTrades, provide a brief conversational response. The full table will be rendered by the UI.

IMPORTANT: When tools return data, keep your text response brief - just acknowledge the data. The UI will automatically render beautiful components showing the trade details. Don't try to list all the trades in text format.

Be professional, precise, and knowledgeable about financial instruments. Always use the tools to get accurate data.`,
    messages: convertToModelMessages(messages),
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
    },
  });

  return result.toUIMessageStreamResponse();
}
