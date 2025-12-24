import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// CORS headers for ElevenLabs
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
};

// Handle OPTIONS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}
import { createClient } from '@supabase/supabase-js';
import { normalizeSymbol, symbolToCompanyName } from '@/src/lib/symbol-utils';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';
import { suggestDataPeriod } from '@/src/lib/data-availability';
import { formatCalendarDate } from '@/src/lib/date-utils';
import { formatCurrencyForTTS } from '@/src/lib/tts-utils';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local explicitly to override any shell environment variables
let envLocalConfig: Record<string, string> = {};

function loadEnvLocal(): Record<string, string> {
  if (Object.keys(envLocalConfig).length > 0) return envLocalConfig;

  try {
    const envLocalPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envLocalPath)) {
      const envContent = fs.readFileSync(envLocalPath, 'utf-8');
      const parsed = dotenv.parse(envContent);
      envLocalConfig = parsed;
      console.log('🔧 [ElevenLabs LLM] Loaded .env.local directly');
    }
  } catch (error) {
    console.warn('⚠️ [ElevenLabs LLM] Could not load .env.local:', error);
  }
  return envLocalConfig;
}

// Force load env.local at module level
const envConfig = loadEnvLocal();
const resourceName = envConfig['AZURE_OPENAI_RESOURCE_NAME'] || 'finagent-dev-resource';
const deployment = envConfig['AZURE_OPENAI_DEPLOYMENT'] || 'gpt-5.1';
const apiKey = envConfig['AZURE_OPENAI_API_KEY'] || '';

console.log('🔧 [ElevenLabs LLM] Azure config:', {
  resourceName,
  apiKeyPrefix: apiKey?.substring(0, 10) + '...',
  deployment,
});

// Create OpenAI client configured for Azure
const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: `https://${resourceName}.openai.azure.com/openai/deployments/${deployment}`,
  defaultQuery: { 'api-version': '2024-10-21' },
  defaultHeaders: { 'api-key': apiKey },
});

// Initialize Supabase client
const supabase = createClient(
  envConfig['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  envConfig['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';


// Strip markdown from response for clean TTS output
function stripMarkdown(text: string): string {
  if (!text) return '';
  return text
    // Remove bold/italic markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bullet points and dashes at line start
    .replace(/^[-*•]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Tool definitions for OpenAI function calling
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'getTradeSummary',
      description: 'Get a summary count of trades for a stock symbol',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Stock ticker symbol' },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getFees',
      description: 'Get fee information: commissions, credit/debit interest, locate fees, or short interest.',
      parameters: {
        type: 'object',
        properties: {
          fee_type: {
            type: 'string',
            enum: ['commission', 'credit_interest', 'debit_interest', 'locate_fee', 'short_interest'],
            description: 'Type of fee to query',
          },
          time_period: { type: 'string', description: 'Time period like "last month", "this year", "October"' },
          symbol: { type: 'string', description: 'Stock symbol for locate fees' },
        },
        required: ['fee_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getAccountBalance',
      description: 'Get account balance information: cash balance, buying power, account summary, NLV, margin, or market value.',
      parameters: {
        type: 'object',
        properties: {
          query_type: {
            type: 'string',
            enum: ['cash_balance', 'cash_and_equity', 'buying_power', 'account_summary', 'nlv', 'overnight_margin', 'market_value'],
            description: 'Type of balance information to retrieve',
          },
        },
        required: ['query_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTimeTrades',
      description: 'Get trades for a specific time period like "today", "yesterday", "last week", "last month"',
      parameters: {
        type: 'object',
        properties: {
          time_period: { type: 'string', description: 'Time period like "today", "yesterday", "last week"' },
          symbol: { type: 'string', description: 'Optional stock symbol to filter by' },
        },
        required: ['time_period'],
      },
    },
  },
];

// Tool execution functions
async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'getTradeSummary': {
      const symbol = args.symbol as string;
      const normalizedSymbol = normalizeSymbol(symbol);
      const { data, error } = await supabase
        .from('TradeData')
        .select('SecurityType, TradeType')
        .eq('AccountCode', ACCOUNT_CODE)
        .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);

      if (error) return JSON.stringify({ error: error.message, symbol: normalizedSymbol });

      const stockTrades = data?.filter(t => t.SecurityType === 'S').length || 0;
      const optionTrades = data?.filter(t => t.SecurityType === 'O').length || 0;

      // Use company name for natural voice output (e.g., "Tesla" instead of "T S L A")
      const companyName = symbolToCompanyName(normalizedSymbol);
      return JSON.stringify({
        symbol: normalizedSymbol,
        stockTrades,
        optionTrades,
        totalTrades: stockTrades + optionTrades,
        response: `You have ${stockTrades + optionTrades} total trades for ${companyName}: ${stockTrades} stock trades and ${optionTrades} option trades.`,
      });
    }

    case 'getFees': {
      const fee_type = args.fee_type as string;
      const time_period = (args.time_period as string) || 'this month';
      const symbol = args.symbol as string | undefined;
      const resolved = parseTimePeriodToResolvedDates(time_period);

      if (!resolved) {
        return JSON.stringify({
          error: `Couldn't understand time period "${time_period}"`,
          response: `I couldn't understand the time period "${time_period}".`,
        });
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

        if (error) return JSON.stringify({ error: error.message, feeType: 'commission', totalAmount: 0 });

        const totalCommission = data?.reduce((sum, t) => sum + Math.abs(t.Commission || 0), 0) || 0;

        if (!data || data.length === 0 || totalCommission < 0.01) {
          const suggestion = await suggestDataPeriod('TradeData', description);
          return JSON.stringify({
            feeType: 'commission',
            totalAmount: 0,
            response: suggestion && suggestion.amount > 0
              ? `No commission data found for ${description}. However, I found ${formatCurrencyForTTS(suggestion.amount)} in commissions for ${suggestion.suggestedPeriod}. Would you like to know more about that?`
              : `No commission data found for ${description}.`,
          });
        }

        return JSON.stringify({
          feeType: 'commission',
          totalAmount: totalCommission,
          transactionCount: data.length,
          timePeriod: description,
          response: `The total commission you paid in ${description} is ${formatCurrencyForTTS(totalCommission)}`,
        });
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

      if (error) return JSON.stringify({ error: error.message, feeType: fee_type, totalAmount: 0 });

      const totalAmount = data?.reduce((sum, f) => sum + Math.abs(f.Amount || 0), 0) || 0;

      if (!data || data.length === 0 || totalAmount < 0.01) {
        const suggestion = await suggestDataPeriod('FeesAndInterest', description, {
          feeType: dbFeeType,
          symbol: normalizedSymbol,
        });
        const feeTypeName = fee_type.replace('_', ' ');
        // Use company name for natural voice output
        const companyName = normalizedSymbol ? symbolToCompanyName(normalizedSymbol) : '';
        const symbolText = companyName ? ` for ${companyName}` : '';

        return JSON.stringify({
          feeType: fee_type,
          totalAmount: 0,
          response: suggestion && suggestion.amount > 0
            ? `No ${feeTypeName} found${symbolText} for ${description}. However, I found ${formatCurrencyForTTS(suggestion.amount)} in ${feeTypeName} for ${suggestion.suggestedPeriod}. Would you like to know more about that?`
            : `No ${feeTypeName} data found${symbolText} for ${description}.`,
        });
      }

      const feeTypeNames: Record<string, string> = {
        'credit_interest': 'credit interest you received',
        'debit_interest': 'debit interest you paid',
        'locate_fee': 'locate fees you paid',
        'short_interest': 'short interest',
      };
      // Use company name for natural voice output
      const companyName = normalizedSymbol ? symbolToCompanyName(normalizedSymbol) : '';
      const symbolText = companyName ? ` for ${companyName}` : '';

      return JSON.stringify({
        feeType: fee_type,
        totalAmount,
        transactionCount: data.length,
        timePeriod: description,
        symbol: normalizedSymbol,
        response: `The total ${feeTypeNames[fee_type] || fee_type}${symbolText} for ${description} is ${formatCurrencyForTTS(totalAmount)}`,
      });
    }

    case 'getAccountBalance': {
      const query_type = args.query_type as string;
      const { data, error } = await supabase
        .from('AccountBalance')
        .select('*')
        .eq('AccountCode', ACCOUNT_CODE)
        .order('Date', { ascending: false })
        .limit(1)
        .single();

      if (error) return JSON.stringify({ error: error.message, queryType: query_type });

      const balanceDate = formatCalendarDate(data.Date);

      const responses: Record<string, string> = {
        'cash_balance': `Your account cash balance as of ${balanceDate} is ${formatCurrencyForTTS(data.CashBalance)}`,
        'cash_and_equity': `Your account cash balance as of ${balanceDate} is ${formatCurrencyForTTS(data.CashBalance)} and account equity is ${formatCurrencyForTTS(data['Account Equity'])}`,
        'buying_power': `Your Day Trade Buying power as of ${balanceDate} is ${formatCurrencyForTTS(data.DayTradingBP)}`,
        'nlv': `Your account Net Liquidation value as of ${balanceDate} is ${formatCurrencyForTTS(data['Account Equity'])}`,
        'overnight_margin': `Your account House requirement as of ${balanceDate} is ${formatCurrencyForTTS(data.HouseRequirment)}`,
        'market_value': `The market value of your long stock positions is ${formatCurrencyForTTS(data['Stock LMV'] || 0)}, long options is ${formatCurrencyForTTS(data['Options LMV'] || 0)}`,
        'account_summary': `Your account summary as of ${balanceDate}: Cash Balance is ${formatCurrencyForTTS(data.CashBalance)}, Account Equity is ${formatCurrencyForTTS(data['Account Equity'])}, Day Trading BP is ${formatCurrencyForTTS(data.DayTradingBP)}`,
      };

      return JSON.stringify({
        queryType: query_type,
        asOfDate: balanceDate,
        response: responses[query_type] || responses['account_summary'],
      });
    }

    case 'getTimeTrades': {
      const time_period = args.time_period as string;
      const symbol = args.symbol as string | undefined;
      const resolved = parseTimePeriodToResolvedDates(time_period);

      if (!resolved) {
        return JSON.stringify({
          error: `Couldn't understand time period "${time_period}"`,
          response: `I couldn't understand the time period "${time_period}".`,
        });
      }

      const { startDate, endDate, dates, description } = resolved;
      const normalizedSymbol = symbol ? normalizeSymbol(symbol) : null;

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

      const { data, error } = await query.order('Date', { ascending: false });

      if (error) return JSON.stringify({ error: error.message, timePeriod: description });

      // Use company name for natural voice output
      const companyName = normalizedSymbol ? symbolToCompanyName(normalizedSymbol) : '';

      if (!data || data.length === 0) {
        const suggestion = await suggestDataPeriod('TradeData', description);
        const symbolText = companyName ? ` for ${companyName}` : '';
        return JSON.stringify({
          timePeriod: description,
          totalTrades: 0,
          response: suggestion
            ? `No trades found${symbolText} for ${description}. However, I found ${suggestion.count} trades for ${suggestion.suggestedPeriod}. Would you like to see those?`
            : `No trades found${symbolText} for ${description}.`,
        });
      }

      const stockTrades = data.filter(t => t.SecurityType === 'S');
      const optionTrades = data.filter(t => t.SecurityType === 'O');
      const totalValue = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);
      const symbolText = companyName ? ` for ${companyName}` : '';

      return JSON.stringify({
        timePeriod: description,
        symbol: normalizedSymbol,
        totalTrades: data.length,
        stockCount: stockTrades.length,
        optionCount: optionTrades.length,
        totalValue,
        response: `You executed ${data.length} trades${symbolText} ${description}: ${stockTrades.length} stock trades and ${optionTrades.length} option trades with a total value of ${formatCurrencyForTTS(totalValue)}.`,
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// OpenAI-compatible endpoint for ElevenLabs Custom LLM
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, stream, model } = body;

    console.log('🔧 [ElevenLabs LLM] Received request:', JSON.stringify({
      stream,
      model,
      messagesCount: messages?.length,
      lastMessages: messages?.slice(-2)
    }, null, 2));

    // Format current date for system prompt
    const now = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const currentDayName = dayNames[now.getDay()];
    const formattedDate = `${currentDayName}, ${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

    const systemPrompt = `You are FinAgent, a voice assistant for trading portfolio queries.

TODAY: ${formattedDate}

CRITICAL RULES FOR VOICE OUTPUT:
1. This is spoken aloud by text-to-speech. NEVER use any markdown or formatting.
2. NO asterisks, NO bullet points, NO dashes, NO headers, NO bold, NO italics.
3. Keep responses to 1-2 sentences maximum.
4. When a tool returns a "response" field, speak ONLY that response verbatim.
5. If you cannot answer, say so briefly without suggesting alternatives.

TOOLS:
getTradeSummary: Trade counts for a symbol
getFees: Commissions, interest, locate fees
getAccountBalance: Cash, equity, buying power
getTimeTrades: Trades for time periods

Convert company names to tickers. Apple is AAPL, Google is GOOGL, Tesla is TSLA.
Be brief. One sentence is ideal.`;

    // Build messages with system prompt
    const allMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.filter((m: { role: string }) => m.role !== 'system'),
    ];

    // First call to get tool calls or response
    let response = await openai.chat.completions.create({
      model: deployment,
      messages: allMessages,
      tools,
      tool_choice: 'auto',
    });

    let assistantMessage = response.choices[0].message;

    // Handle tool calls if present
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Add assistant message with tool calls
      allMessages.push(assistantMessage);

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        // Skip non-function tool calls
        if (toolCall.type !== 'function') continue;

        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`🔧 [ElevenLabs LLM] Calling tool: ${toolName}`, toolArgs);

        const result = await executeTool(toolName, toolArgs);

        console.log(`🔧 [ElevenLabs LLM] Tool result:`, result);

        // Add tool result
        allMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Get next response
      response = await openai.chat.completions.create({
        model: deployment,
        messages: allMessages,
        tools,
        tool_choice: 'auto',
      });

      assistantMessage = response.choices[0].message;
    }

    // Strip any markdown from response for clean TTS
    const cleanContent = stripMarkdown(assistantMessage.content || '');

    console.log('🔧 [ElevenLabs LLM] Final response:', cleanContent);

    // Handle streaming response for ElevenLabs
    if (stream) {
      console.log('🔧 [ElevenLabs LLM] Returning streaming response');

      const chatId = response.id || `chatcmpl-${Date.now()}`;
      const created = response.created || Math.floor(Date.now() / 1000);

      // Create SSE stream
      const encoder = new TextEncoder();
      const streamResponse = new ReadableStream({
        start(controller) {
          // Send initial chunk with role
          const initialChunk = {
            id: chatId,
            object: 'chat.completion.chunk',
            created,
            model: deployment,
            choices: [{
              index: 0,
              delta: { role: 'assistant', content: '' },
              finish_reason: null,
            }],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialChunk)}\n\n`));

          // Send content in chunks (word by word for smoother TTS)
          const words = cleanContent.split(' ');
          for (let i = 0; i < words.length; i++) {
            const word = words[i] + (i < words.length - 1 ? ' ' : '');
            const contentChunk = {
              id: chatId,
              object: 'chat.completion.chunk',
              created,
              model: deployment,
              choices: [{
                index: 0,
                delta: { content: word },
                finish_reason: null,
              }],
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(contentChunk)}\n\n`));
          }

          // Send final chunk with finish_reason
          const finalChunk = {
            id: chatId,
            object: 'chat.completion.chunk',
            created,
            model: deployment,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: 'stop',
            }],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      return new Response(streamResponse, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Return non-streaming response (for testing/curl)
    return NextResponse.json({
      id: response.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: response.created || Math.floor(Date.now() / 1000),
      model: deployment,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: cleanContent,
          },
          logprobs: null,
          finish_reason: 'stop',
        },
      ],
      usage: response.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('🔧 [ElevenLabs LLM] Error:', error);
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'server_error',
        },
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
