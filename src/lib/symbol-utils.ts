/**
 * Symbol utilities for parsing and normalizing stock/option symbols
 */

// Speech recognition corrections - voice transcription often mishears tickers
const SPEECH_CORRECTIONS: Record<string, string> = {
  'm10': 'MTEN',
  'm 10': 'MTEN',
  'mtn': 'MTEN',
  'emten': 'MTEN',
  'lc id': 'LCID',
  'l c i d': 'LCID',
  'lucid': 'LCID',
  'ui path': 'PATH',
  'you eye path': 'PATH',
  'b m n r': 'BMNR',
  'bmnr': 'BMNR',
  'c r c l': 'CRCL',
  'crcl': 'CRCL',
  'circle': 'CRCL',
  'r g c': 'RGC',
  'rgc': 'RGC',
};

// Map company names to ticker symbols
export const SYMBOL_MAP: Record<string, string> = {
  'apple': 'AAPL',
  'google': 'GOOGL',
  'alphabet': 'GOOGL',
  'amazon': 'AMZN',
  'microsoft': 'MSFT',
  'tesla': 'TSLA',
  'nvidia': 'NVDA',
  'meta': 'META',
  'netflix': 'NFLX',
  'amd': 'AMD',
  'intel': 'INTC',
  'ibm': 'IBM',
  'salesforce': 'CRM',
  'adobe': 'ADBE',
  'paypal': 'PYPL',
  'shopify': 'SHOP',
  'uber': 'UBER',
  'lyft': 'LYFT',
  'snap': 'SNAP',
  'twitter': 'X',
  'spotify': 'SPOT',
  'zoom': 'ZM',
  'palantir': 'PLTR',
  'coinbase': 'COIN',
  'robinhood': 'HOOD',
  'disney': 'DIS',
  'boeing': 'BA',
  'jpmorgan': 'JPM',
  'goldman': 'GS',
  'morgan stanley': 'MS',
  'bank of america': 'BAC',
  'wells fargo': 'WFC',
  'visa': 'V',
  'mastercard': 'MA',
  'american express': 'AXP',
  'coca-cola': 'KO',
  'pepsi': 'PEP',
  'walmart': 'WMT',
  'target': 'TGT',
  'costco': 'COST',
  'home depot': 'HD',
  'lowes': 'LOW',
  'starbucks': 'SBUX',
  'mcdonalds': 'MCD',
  'nike': 'NKE',
  'exxon': 'XOM',
  'chevron': 'CVX',
};

// Reverse map: ticker symbols to company names for voice output
// TTS reads "TSLA" as "T S L A" which sounds unnatural
// This map converts tickers to speakable company names
export const TICKER_TO_COMPANY: Record<string, string> = {
  'AAPL': 'Apple',
  'GOOGL': 'Google',
  'GOOG': 'Google',
  'AMZN': 'Amazon',
  'MSFT': 'Microsoft',
  'TSLA': 'Tesla',
  'NVDA': 'Nvidia',
  'META': 'Meta',
  'NFLX': 'Netflix',
  'AMD': 'AMD',
  'INTC': 'Intel',
  'IBM': 'IBM',
  'CRM': 'Salesforce',
  'ADBE': 'Adobe',
  'PYPL': 'PayPal',
  'SHOP': 'Shopify',
  'UBER': 'Uber',
  'LYFT': 'Lyft',
  'SNAP': 'Snap',
  'X': 'X',
  'SPOT': 'Spotify',
  'ZM': 'Zoom',
  'PLTR': 'Palantir',
  'COIN': 'Coinbase',
  'HOOD': 'Robinhood',
  'DIS': 'Disney',
  'BA': 'Boeing',
  'JPM': 'JP Morgan',
  'GS': 'Goldman Sachs',
  'MS': 'Morgan Stanley',
  'BAC': 'Bank of America',
  'WFC': 'Wells Fargo',
  'V': 'Visa',
  'MA': 'Mastercard',
  'AXP': 'American Express',
  'KO': 'Coca-Cola',
  'PEP': 'Pepsi',
  'WMT': 'Walmart',
  'TGT': 'Target',
  'COST': 'Costco',
  'HD': 'Home Depot',
  'LOW': 'Lowes',
  'SBUX': 'Starbucks',
  'MCD': 'McDonalds',
  'NKE': 'Nike',
  'XOM': 'Exxon',
  'CVX': 'Chevron',
  'SPY': 'S&P 500 ETF',
  'QQQ': 'Nasdaq ETF',
  'IWM': 'Russell 2000 ETF',
};

/**
 * Convert a ticker symbol to a speakable company name for TTS
 * If no mapping exists, returns the original ticker (TTS will spell it out)
 *
 * e.g., "TSLA" -> "Tesla"
 *       "AAPL" -> "Apple"
 *       "MTEN" -> "MTEN" (unknown, kept as-is)
 */
export function symbolToCompanyName(ticker: string): string {
  if (!ticker) return ticker;
  const upper = ticker.toUpperCase();
  return TICKER_TO_COMPANY[upper] || ticker;
}

/**
 * Normalize a company name or symbol to its ticker
 * Handles: Speech corrections, OCC option symbols, company names, and raw tickers
 *
 * e.g., "M10" -> "MTEN" (speech recognition correction)
 *       "Apple" -> "AAPL" (company name)
 *       "tesla" -> "TSLA"
 *       "TSLA251129C00350000" -> "TSLA" (extracts from OCC)
 *       "AAPL" -> "AAPL"
 */
export function normalizeSymbol(input: string): string {
  if (!input) return input;

  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // 1. Check speech recognition corrections FIRST (handles "M10" -> "MTEN", etc.)
  if (SPEECH_CORRECTIONS[lower]) {
    return SPEECH_CORRECTIONS[lower];
  }

  // 2. Check if it's an OCC option symbol and extract the ticker
  if (isOptionSymbol(trimmed.toUpperCase())) {
    return parseOptionSymbol(trimmed.toUpperCase());
  }

  // 3. Check if it looks like an OCC symbol (has digits after letters)
  // This catches partial or malformed OCC symbols like "TSLA251129"
  const occMatch = trimmed.toUpperCase().match(/^([A-Z]{1,6})\d/);
  if (occMatch) {
    return occMatch[1];
  }

  // 4. Check company name map
  if (SYMBOL_MAP[lower]) {
    return SYMBOL_MAP[lower];
  }

  // 5. Default to uppercase
  return trimmed.toUpperCase();
}

/**
 * Parse OCC option symbol to extract just the ticker
 * OCC format: 1-6 char ticker + 6 digit date (YYMMDD) + C/P + 8 digit strike
 * e.g., TSLA251129C00350000 -> TSLA
 *       AAPL251121P00175000 -> AAPL
 *       SPY251219C00600000 -> SPY
 */
export function parseOptionSymbol(symbol: string): string {
  if (!symbol) return symbol;

  // Match leading uppercase letters (the ticker portion)
  const match = symbol.match(/^([A-Z]{1,6})/);
  return match ? match[1] : symbol;
}

/**
 * Check if a symbol is an OCC option symbol
 * OCC format has: ticker + 6 digits + C/P + 8 digits
 */
export function isOptionSymbol(symbol: string): boolean {
  if (!symbol) return false;
  // OCC option symbols are 15-21 chars: 1-6 ticker + 6 date + 1 C/P + 8 strike
  return /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(symbol);
}

/**
 * Parse full OCC option symbol into components
 * e.g., TSLA251129C00350000 -> { ticker: 'TSLA', expiry: '2025-11-29', type: 'call', strike: 350 }
 */
export function parseOptionSymbolFull(symbol: string): {
  ticker: string;
  expiry: string;
  type: 'call' | 'put';
  strike: number;
} | null {
  if (!symbol) return null;

  const match = symbol.match(/^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!match) return null;

  const [, ticker, yy, mm, dd, cp, strikeStr] = match;
  const year = 2000 + parseInt(yy, 10);
  const month = mm.padStart(2, '0');
  const day = dd.padStart(2, '0');
  const strike = parseInt(strikeStr, 10) / 1000; // Strike is in 1/1000ths

  return {
    ticker,
    expiry: `${year}-${month}-${day}`,
    type: cp === 'C' ? 'call' : 'put',
    strike,
  };
}

/**
 * Resolve a company name or symbol to ticker using LLM
 * Only called when local resolution fails
 */
export async function resolveSymbolWithLLM(input: string): Promise<string | null> {
  try {
    const response = await fetch('/api/resolve-symbol', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.symbol || null;
  } catch {
    return null;
  }
}

/**
 * Smart symbol resolution with LLM fallback
 * 1. Try local normalizeSymbol (OCC parsing + company map)
 * 2. If result looks like it wasn't resolved (same as input), try LLM
 */
export async function resolveSymbol(input: string): Promise<string> {
  if (!input) return input;

  // First try local resolution
  const localResult = normalizeSymbol(input);

  // If local resolution worked (result is different from uppercase input),
  // or if it looks like a valid ticker (1-5 uppercase letters), return it
  const isValidTicker = /^[A-Z]{1,5}$/.test(localResult);
  if (isValidTicker) {
    return localResult;
  }

  // Try LLM fallback for anything that doesn't look like a ticker
  const llmResult = await resolveSymbolWithLLM(input);
  if (llmResult) {
    return llmResult;
  }

  // Fall back to local result
  return localResult;
}
