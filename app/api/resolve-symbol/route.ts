import { NextRequest, NextResponse } from 'next/server';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local directly to avoid shell environment conflicts
const envLocalPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envLocalPath));
  for (const key in envConfig) {
    if (!process.env[key] || key.startsWith('AZURE')) {
      process.env[key] = envConfig[key];
    }
  }
}

/**
 * Resolve a company name or description to a stock ticker symbol using Azure OpenAI
 * Uses a lightweight prompt for fast, cost-effective resolution
 */
export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Skip if it already looks like a valid ticker
    if (/^[A-Z]{1,5}$/.test(query.toUpperCase())) {
      return NextResponse.json({ symbol: query.toUpperCase() });
    }

    const endpoint = process.env.AZURE_EXISTING_AIPROJECT_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const model = process.env.AZURE_OPENAI_MODEL || 'gpt-4o-mini';
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';

    if (!endpoint || !apiKey) {
      console.error('Azure OpenAI not configured for symbol resolution');
      return NextResponse.json({ symbol: null });
    }

    // Construct Azure OpenAI URL
    let url = endpoint;
    if (url.includes('openai.azure.com') && !url.includes('/deployments/')) {
      url = url.replace(/\/openai\/v1\/?$/, '');
      url = url.replace(/\/$/, '');
      url = `${url}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are a stock ticker resolver. Given a company name, description, or partial name, return ONLY the stock ticker symbol (1-5 uppercase letters). If you cannot determine the ticker, return "UNKNOWN".

Examples:
- "Apple" → "AAPL"
- "the electric car company founded by Elon Musk" → "TSLA"
- "Google's parent company" → "GOOGL"
- "the streaming service with the red logo" → "NFLX"
- "microstrategy" → "MSTR"
- "arm holdings" → "ARM"

Return ONLY the ticker symbol, nothing else.`,
          },
          {
            role: 'user',
            content: query,
          },
        ],
        max_tokens: 10,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.error('Azure OpenAI error:', response.status, await response.text());
      return NextResponse.json({ symbol: null });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim().toUpperCase();

    // Validate the response looks like a ticker
    if (content && /^[A-Z]{1,5}$/.test(content) && content !== 'UNKNOWN') {
      return NextResponse.json({ symbol: content });
    }

    return NextResponse.json({ symbol: null });
  } catch (error) {
    console.error('Symbol resolution error:', error);
    return NextResponse.json({ symbol: null });
  }
}
