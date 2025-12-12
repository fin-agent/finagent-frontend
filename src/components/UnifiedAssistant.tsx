'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useConversation } from '@elevenlabs/react';
import { Mic, MessageSquare, X, Phone, Loader2, Plus, History, Send, Filter } from 'lucide-react';
import { TradesTable, type ActiveFilters, type Aggregations } from './generative-ui/TradesTable';
import { QueryBuilder } from './QueryBuilder';
import { TradeSummary } from './generative-ui/TradeSummary';
import { TradeStats } from './generative-ui/TradeStats';
import { OptionStats } from './generative-ui/OptionStats';
import { ProfitableTrades } from './generative-ui/ProfitableTrades';
import { TimeBasedTrades } from './generative-ui/TimeBasedTrades';
import { TimePeriodStats } from './generative-ui/TimePeriodStats';
import { AveragePrice } from './generative-ui/AveragePrice';
import { AdvancedOptionsTable } from './generative-ui/AdvancedOptionsTable';
import { HighestStrikeCard } from './generative-ui/HighestStrikeCard';
import { TotalPremiumCard } from './generative-ui/TotalPremiumCard';
import { ExpiringOptionsTable } from './generative-ui/ExpiringOptionsTable';
import { LastOptionTradeCard } from './generative-ui/LastOptionTradeCard';
import { TradeQueryCard } from './generative-ui/TradeQueryCard';
import { AccountSummary, type AccountQueryType } from './generative-ui/AccountSummary';
import { FeesSummary, type FeeType } from './generative-ui/FeesSummary';

type InputMode = 'voice' | 'text';
type View = 'chat' | 'history';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface TradeUIData {
  type: 'summary' | 'detailed' | 'stats' | 'profitable' | 'time-based' | 'option-stats' | 'average-price' | 'advanced-options' | 'highest-strike' | 'total-premium' | 'expiring-options' | 'last-option' | 'query-builder-result' | 'account-balance' | 'fees';
  symbol: string;
  tradeType?: 'buy' | 'sell' | 'all';
  timePeriod?: string;
  callPut?: 'call' | 'put';
  expiration?: string;
  data: unknown;
  optionData?: unknown; // For combined stock + option stats
  accountQueryType?: AccountQueryType; // For account balance queries
  feeType?: FeeType; // For fees queries
}

interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tradeUI?: TradeUIData;
}

// App color scheme (dark theme)
const colors = {
  bgPrimary: '#000000',
  bgSecondary: '#0a0a0a',
  bgCard: '#1a1a1a',
  bgHover: '#2a2a2a',
  textPrimary: '#ffffff',
  textSecondary: '#8c8c8e',
  textMuted: '#5a5a5c',
  accent: '#00c806',
  accentHover: '#00a805',
  border: '#2a2a2a',
  userBubble: '#00c806',
  assistantBubble: '#2a2a2a',
};

// Known stock symbols for validation
const KNOWN_SYMBOLS = [
  'AAPL', 'GOOGL', 'GOOG', 'AMZN', 'MSFT', 'TSLA', 'NVDA', 'META', 'NFLX', 'AMD', 'INTC', 'GME', 'QCOM',
  'SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'VOO', 'ARKK', 'XLF', 'XLE', 'XLK',
];

// Check if response mentions multiple different stock symbols (portfolio-wide query)
function isPortfolioWideQuery(text: string): boolean {
  const symbolsFound = new Set<string>();

  // Check for known symbols
  for (const sym of KNOWN_SYMBOLS) {
    const regex = new RegExp(`\\b${sym}\\b`, 'gi');
    if (regex.test(text)) {
      symbolsFound.add(sym);
    }
  }

  // Check for company names
  const companyMap: Record<string, string> = {
    'google': 'GOOGL', 'apple': 'AAPL', 'tesla': 'TSLA', 'amazon': 'AMZN',
    'microsoft': 'MSFT', 'nvidia': 'NVDA', 'meta': 'META', 'netflix': 'NFLX',
  };
  for (const [company, symbol] of Object.entries(companyMap)) {
    const regex = new RegExp(`\\b${company}\\b`, 'gi');
    if (regex.test(text)) {
      symbolsFound.add(symbol);
    }
  }

  // If 2+ different symbols are mentioned, it's a portfolio-wide query
  return symbolsFound.size >= 2;
}

// Extract stock symbol or company name from agent's response
function extractSymbolOrCompany(text: string): string | null {
  const commonWords = [
    'THE', 'FOR', 'AND', 'YOU', 'YOUR', 'ARE', 'HAS', 'HAVE', 'WAS', 'THIS', 'THAT', 'WITH', 'ANY',
    'CLASS', 'BOTH', 'WERE', 'FIRST', 'TRADE', 'STOCK', 'TOTAL', 'PROFIT', 'FROM', 'EACH', 'ALL',
    'LAST', 'WEEK', 'MONTH', 'YEAR', 'DAY', 'DAYS', 'TODAY', 'YESTERDAY', 'PAST', 'RECENT',
    'SHOW', 'HERE', 'SUMMARY', 'DETAIL', 'OPTION', 'OPTIONS', 'SHARES', 'ABOUT', 'JUST', 'ONLY',
    // Month names (to avoid extracting from date ranges)
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST',
    'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER', 'JAN', 'FEB', 'MAR', 'APR',
    'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
    // Day names (to avoid extracting from day-of-week queries)
    'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
    'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN',
    // Time indicators (to avoid extracting AM/PM from timestamps like "11:22 AM")
    'AM', 'PM',
    // Other common words
    'EXECUTED', 'OVER', 'DURING', 'BREAKDOWN', 'WOULD', 'LIKE', 'MORE', 'DETAILS',
    'BOUGHT', 'SOLD', 'WHAT', 'TRADED', 'VALUE', 'PRICE'
  ];

  // Pattern 0: "profitable trades for Google" or "trades for AAPL"
  const tradesForMatch = text.match(/(?:profitable\s+)?trades?\s+for\s+(\w+)/i);
  if (tradesForMatch && !commonWords.includes(tradesForMatch[1].toUpperCase())) {
    return tradesForMatch[1];
  }

  // Pattern 1: "for GOOGL shares" or "AAPL trades" - ticker followed by shares/trades
  const tickerSharesMatch = text.match(/\b([A-Z]{2,5})\s+(?:shares|trades?|stock|position)/i);
  if (tickerSharesMatch && !commonWords.includes(tickerSharesMatch[1].toUpperCase())) {
    return tickerSharesMatch[1].toUpperCase();
  }

  // Pattern 2: "price for Google" or "paid for Apple"
  const priceForMatch = text.match(/(?:price|paid)\s+(?:for|of)\s+(\w+)/i);
  if (priceForMatch && !commonWords.includes(priceForMatch[1].toUpperCase())) {
    return priceForMatch[1];
  }

  // Pattern 3: "for Google this year" or "sold Tesla this year"
  const thisYearMatch = text.match(/(?:for|bought|sold)\s+(\w+)\s+(?:this year|in \d{4})/i);
  if (thisYearMatch && !commonWords.includes(thisYearMatch[1].toUpperCase())) {
    return thisYearMatch[1];
  }

  // Pattern 4: Look for standalone tickers (2-5 uppercase) that aren't common words
  const standaloneMatch = text.match(/\b([A-Z]{2,5})\b/g);
  if (standaloneMatch) {
    for (const match of standaloneMatch) {
      if (!commonWords.includes(match) && /^[A-Z]{2,5}$/.test(match)) {
        return match;
      }
    }
  }

  // Pattern 5: Company names like "Google", "Apple", "Tesla" etc
  const companyMatch = text.match(/\b(Google|Apple|Tesla|Amazon|Microsoft|Nvidia|Meta|Netflix|GameStop|Qualcomm|Intel|AMD)\b/i);
  if (companyMatch) {
    return companyMatch[1];
  }

  return null;
}

// Parse OCC option symbol to extract underlying ticker
// Format: AAPL251017C00220000 -> AAPL
function parseOptionSymbol(symbol: string): string {
  // OCC format: 1-6 char ticker + 6 digit date + C/P + 8 digit strike
  const match = symbol.match(/^([A-Z]+)/);
  if (match) {
    return match[1];
  }
  return symbol;
}

// Detect if message contains trade summary data (brief count)
function detectTradeSummary(text: string): { stockTrades: number; optionTrades: number } | null {
  // Skip if just checking/looking up
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up|I'll help you find|I'll find|looking that up/i.test(text);
  if (isJustChecking && !/found|have|total/i.test(text)) return null;

  // Multiple patterns to match different response formats
  const patterns = [
    /(\d+)\s*stock\s*(?:trades?)?\s*(?:and)?\s*(\d+)\s*option\s*trades?/i,
    /have\s+(\d+)\s+stock\s+and\s+(\d+)\s+option\s+trades?/i,
    /(\d+)\s+stock\s+trades?\s+and\s+(\d+)\s+option/i,
    /found\s+(\d+)\s+stock\s+trades?\s+and\s+(\d+)\s+option/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        stockTrades: parseInt(match[1]) || 0,
        optionTrades: parseInt(match[2]) || 0,
      };
    }
  }
  return null;
}

// Detect if message contains detailed trades data (general trade listing)
function detectDetailedTrades(text: string): boolean {
  // Skip if just checking/looking up
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up|I'll help you find|I'll find|looking that up/i.test(text);
  if (isJustChecking && !/here are|detailed|total shares|total cost|found|have|trade/i.test(text)) return false;

  // Check for detailed trade indicators - general trade listing patterns
  const hasDetailedInfo =
    // Detailed/all trades patterns
    /detailed.*trades|total shares purchased|total cost.*\$|profit.?loss.*\$/i.test(text) ||
    /current value.*\$/i.test(text) ||
    // General trade listing patterns
    /here\s+are\s+(your|all|the).*trades/i.test(text) ||
    /showing\s+(your|all|the).*trades/i.test(text) ||
    /found\s+\d+.*trades?\s+for/i.test(text) ||  // "found 8 trades for AAPL"
    /you\s+have\s+\d+.*trades?\s+for/i.test(text) ||  // "you have 8 trades for Apple"
    /\d+\s+(stock|option)\s+trades?\s+and\s+\d+/i.test(text) ||  // "5 stock trades and 3 option"
    /trades?\s+for\s+\w+.*include/i.test(text) ||  // "trades for Apple include..."
    /your\s+\w+\s+trades\s+include/i.test(text) ||  // "your Apple trades include..."
    // Additional patterns for trade listing responses
    /\d+\s+trades?\s+for\s+\w+/i.test(text) ||  // "8 trades for AAPL" or "15 trades for Apple"
    /bought\s+\d+\s+shares/i.test(text) ||  // "bought 100 shares"
    /sold\s+\d+\s+shares/i.test(text) ||  // "sold 50 shares"
    /\d+\s+buy\s+trades?\s+and\s+\d+\s+sell/i.test(text) ||  // "5 buy trades and 3 sell"
    /trades\s+include.*buy.*sell/i.test(text) ||  // "trades include...buy...sell"
    /listing.*trades/i.test(text) ||  // "listing your trades"
    /trade\s+history/i.test(text);  // "trade history"

  return hasDetailedInfo;
}

// Detect if message contains trade stats results (not just "let me check")
function detectTradeStats(text: string): { tradeType: 'buy' | 'sell' | 'all'; timePeriod?: string } | null {
  // Skip messages that are just "checking" without actual price results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up|I'll help you find|I'll find|to find your|looking that up/i.test(text);

  // Check if message contains actual price data (either numeric or spelled out)
  const hasActualResult =
    /was\s+(?:\$[\d,]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)/i.test(text) ||
    /(?:dollars?|cents?)\s+(?:and|per|for)/i.test(text) ||
    /\$[\d,]+\.?\d*/i.test(text) ||
    /highest price|lowest price|average price/i.test(text);

  // If it's just a "checking" message without results, skip
  if (isJustChecking && !hasActualResult) return null;

  // Must have some actual price/result to show the card
  if (!hasActualResult) return null;

  const patterns = [
    // Patterns for sell/sale results
    /highest.*(?:sale|sell|sold)/i,
    /(?:sale|sell|sold).*price/i,
    /lowest.*(?:sale|sell|sold)/i,
    // Patterns for buy/purchase results
    /highest.*(?:buy|bought|purchase|paid)/i,
    /lowest.*(?:buy|bought|purchase|paid)/i,
    /(?:buy|bought|purchase|paid).*price/i,
    /price.*(?:paid|bought)/i,
    // General patterns
    /average\s+(?:sell|buy|trade|sale|purchase)?\s*price/i,
    /trade\s+statistics/i,
    /highest\s+price.*\$/i,
    /lowest\s+price.*\$/i,
    /dollars?\s+(?:and|per)/i,
    /cents?\s+(?:per|for)/i,
    /statistics\s+for\s+\d{4}/i,
    // Year-based statistics patterns (full year only)
    /(?:this|in)\s+(?:\d{4}|year)/i,
    /for\s+\d{4}/i,
  ];

  if (patterns.some(p => p.test(text))) {
    // Determine trade type
    let tradeType: 'buy' | 'sell' | 'all' = 'all';
    if (/sold|sell|sale/i.test(text)) tradeType = 'sell';
    else if (/bought|buy|purchase|paid/i.test(text)) tradeType = 'buy';

    // Extract time period if present
    let timePeriod: string | undefined;
    const timePeriodMatch = text.match(/(?:last|past|this)\s+(?:month|week)|yesterday|today/i);
    if (timePeriodMatch) {
      timePeriod = timePeriodMatch[0].toLowerCase();
    }

    return { tradeType, timePeriod };
  }
  return null;
}

// Detect if message contains profitable trades results
// This should be specific - only match when the response is dedicated to profitable trades analysis
function detectProfitableTrades(text: string): boolean {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up|I'll help you find|I'll find|to find your|looking that up/i.test(text);
  if (isJustChecking) return false;

  // Must explicitly be about profitable trades analysis - not just mentioning profit in passing
  // Look for patterns that indicate a dedicated profitable trades response
  const isProfitableTradesReport =
    // Specific profitable trades patterns
    /\d+\s+profitable\s+trades?/i.test(text) ||  // "1 profitable trade", "5 profitable trades"
    /profitable\s+trades?\s+for\s+/i.test(text) || // "profitable trades for AAPL"
    /total\s+profit\s+of\s+\$/i.test(text) ||  // "total profit of $X"
    /here\s+are\s+your\s+profitable/i.test(text) || // "here are your profitable..."
    /found\s+\d+\s+profitable/i.test(text) ||  // "found 3 profitable..."
    /total\s+matched\s+trades/i.test(text) ||  // FIFO matching result
    /profit.*from\s+matched/i.test(text) ||    // FIFO matched profit
    // "Most profitable" patterns
    /most\s+profitable\s+trade/i.test(text) ||  // "most profitable trade"
    /your\s+most\s+profitable/i.test(text) ||   // "your most profitable..."
    /biggest\s+profit/i.test(text) ||           // "biggest profit"
    /largest\s+profit/i.test(text) ||           // "largest profit"
    /highest\s+profit/i.test(text) ||           // "highest profit"
    /profit\s+of\s+\$[\d,]+/i.test(text) ||     // "profit of $1,234"
    /made\s+a\s+profit\s+of/i.test(text) ||     // "made a profit of"
    /realized\s+(?:a\s+)?profit/i.test(text) || // "realized profit" or "realized a profit"
    /netted\s+(?:a\s+)?profit/i.test(text);     // "netted a profit"

  // Exclude general trade listing messages that happen to mention profit
  const isGeneralTradeListing =
    /here\s+are\s+(your|all|the)\s+.*trades/i.test(text) && !/profitable/i.test(text) ||
    /showing\s+(your|all|the)\s+trades/i.test(text) ||
    /you\s+have\s+\d+\s+(stock|option)\s+trades?/i.test(text);

  if (isGeneralTradeListing) return false;

  return isProfitableTradesReport;
}

// Detect if message contains time-based trades results
function detectTimeBasedTrades(text: string): { timePeriod: string } | null {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up|I'll help you find|I'll find|to find your|looking that up/i.test(text);

  // Skip if this is a price statistics query (should show TradeStats card instead)
  // This prevents "average price last month" from triggering TimeBasedTrades
  const isPriceStatisticsQuery = /(?:highest|lowest|average|max|min)\s+(?:price|premium)|statistics\s+for\s+\d{4}|price\s+(?:was|is)\s+\$/i.test(text);
  if (isPriceStatisticsQuery) return null;

  // Pattern for spelled-out numbers (one through twenty)
  const numberWords = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d+)';

  // Check for actual time-based results with trade counts
  const hasTradeCount = /executed\s+\d+\s+trades?|you\s+(?:have|had)\s+\d+\s+trades?|\d+\s+trades?\s+(?:for|on|over|during|last|this|yesterday|today)|no trades found|\d+\s+total\s+trades?|here\s+are\s+(?:all\s+)?your\s+trades?|last\s+(?:five|ten|seven|\d+)\s+days?/i.test(text);

  if (isJustChecking && !hasTradeCount) return null;
  if (!hasTradeCount) return null;

  // Time period patterns to detect - ordered from most specific to most general
  const timePatterns = [
    // "last N days" patterns with spelled-out or numeric numbers (highest priority)
    { pattern: new RegExp(`(?:for|on|over|during|from)?\\s*(?:the\\s+)?((?:last|past)\\s+${numberWords}\\s+(?:trading\\s+)?days?)`, 'i'), period: null },
    // Direct "N trades [time period]" patterns
    { pattern: /\d+\s+trades?\s+(last\s+week|past\s+week)/i, period: 'last week' },
    { pattern: /\d+\s+trades?\s+(this\s+week)/i, period: 'this week' },
    { pattern: /\d+\s+trades?\s+(last\s+month|past\s+month)/i, period: 'last month' },
    { pattern: /\d+\s+trades?\s+(this\s+month)/i, period: 'this month' },
    { pattern: /\d+\s+trades?\s+(yesterday)/i, period: 'yesterday' },
    { pattern: /\d+\s+trades?\s+(today)/i, period: 'today' },
    // Patterns with prepositions
    { pattern: /(?:for|on|over|during|from)\s+(today)/i, period: 'today' },
    { pattern: /(?:for|on|over|during|from)\s+(yesterday)/i, period: 'yesterday' },
    { pattern: /(?:for|on|over|during|from)\s+(?:the\s+)?(last\s+week|past\s+week)/i, period: 'last week' },
    { pattern: /(?:for|on|over|during|from)\s+(?:the\s+)?(this\s+week)/i, period: 'this week' },
    { pattern: /(?:for|on|over|during|from)\s+(?:the\s+)?(last\s+month|past\s+month)/i, period: 'last month' },
    { pattern: /(?:for|on|over|during|from)\s+(?:the\s+)?(this\s+month)/i, period: 'this month' },
    { pattern: /(?:for|on|over|during|from)\s+(?:the\s+)?(last\s+\d+\s+days?|past\s+\d+\s+days?)/i, period: null },
    { pattern: /(?:for|on|over|during|from)\s+(?:the\s+)?(last\s+\d+\s+trading\s+days?)/i, period: null },
    { pattern: /(?:on|for|from)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, period: null },
    // Patterns without prepositions - "trades last week" style
    { pattern: /trades?\s+(last\s+week|past\s+week)/i, period: 'last week' },
    { pattern: /trades?\s+(this\s+week)/i, period: 'this week' },
    { pattern: /trades?\s+(last\s+month|past\s+month)/i, period: 'last month' },
    { pattern: /trades?\s+(this\s+month)/i, period: 'this month' },
    { pattern: /trades?\s+(yesterday)/i, period: 'yesterday' },
    { pattern: /trades?\s+(today)/i, period: 'today' },
    // General fallback patterns
    { pattern: /(\d+)\s+trading\s+days?/i, period: null },
    { pattern: /(yesterday|today|last week|this week|last month|this month)/i, period: null },
  ];

  for (const { pattern, period } of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      const detectedPeriod = period || match[1].toLowerCase();
      return { timePeriod: detectedPeriod };
    }
  }

  return null;
}

// Detect if message contains average price results (specific single average price query)
// This is for simple queries like "what was the average price I bought Apple for?"
function detectAveragePrice(text: string): { tradeType: 'buy' | 'sell' | 'all'; timePeriod: string } | null {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up|I'll help you find|I'll find|to find your|looking that up/i.test(text);
  if (isJustChecking) return null;

  // Check if this is specifically an average price response (not general stats)
  // Look for patterns that indicate a focused average price response
  const isAveragePriceResponse =
    // "The average price was $X" or "average price for X was $Y"
    /average\s+price\s+(?:for\s+\w+\s+)?(?:trades?\s+)?(?:last\s+(?:month|week)|this\s+(?:month|week|year))?\s*was\s+\$[\d,.]+/i.test(text) ||
    // "average price of $X"
    /average\s+(?:buy|sell|purchase|sale|trade)?\s*price\s+(?:of|is|was)\s+\$[\d,.]+/i.test(text) ||
    // "$X average" or "averaged $X"
    /averaged?\s+\$[\d,.]+/i.test(text) ||
    // "paid an average of $X"
    /paid\s+an\s+average\s+of\s+\$[\d,.]+/i.test(text);

  if (!isAveragePriceResponse) return null;

  // Check if this is a detailed stats response (should use TradeStats/TimePeriodStats instead)
  // If it mentions highest AND lowest prices, it's a full stats response
  const isDetailedStats = /highest\s+price/i.test(text) && /lowest\s+price/i.test(text);
  if (isDetailedStats) return null;

  // Determine trade type from context
  let tradeType: 'buy' | 'sell' | 'all' = 'all';
  // Check buy-related terms first (more specific patterns)
  if (/(?:bought|buy|purchase|paid\s+for)/i.test(text) && !/(?:sold|sell|sale)/i.test(text)) {
    tradeType = 'buy';
  } else if (/(?:sold|sell|sale)/i.test(text) && !/(?:bought|buy|purchase)/i.test(text)) {
    tradeType = 'sell';
  }
  // If both "purchases and sales" are mentioned, keep as 'all'

  // Extract time period
  let timePeriod = 'this year'; // default
  const timePeriodMatch = text.match(/(?:last|past|this)\s+(?:month|week|year)/i);
  if (timePeriodMatch) {
    timePeriod = timePeriodMatch[0].toLowerCase();
  } else if (/yesterday/i.test(text)) {
    timePeriod = 'yesterday';
  } else if (/today/i.test(text)) {
    timePeriod = 'today';
  }

  return { tradeType, timePeriod };
}

// Detect advanced options query results (short/long calls/puts, filtered option trades)
function detectAdvancedOptionsQuery(text: string): { tradeType?: 'buy' | 'sell'; callPut?: 'call' | 'put'; timePeriod?: string } | null {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up/i.test(text);
  if (isJustChecking && !/found|option trades?/i.test(text)) return null;

  // Detect short/long call/put option trade listings
  const isAdvancedOptions =
    /(?:short|long)\s+(?:call|put)\s+options?/i.test(text) ||
    /found\s+\d+\s+(?:option)?\s*trades?.*(?:call|put)/i.test(text) ||
    /\d+\s+option\s+trades?\s+\(\d+\s+calls?,\s*\d+\s+puts?\)/i.test(text) ||
    /(?:call|put)\s+options?\s+(?:on|for)\s+\w+/i.test(text);

  if (!isAdvancedOptions) return null;

  // Determine trade type
  let tradeType: 'buy' | 'sell' | undefined;
  if (/short|sold|sell/i.test(text)) tradeType = 'sell';
  else if (/long|bought|buy/i.test(text)) tradeType = 'buy';

  // Determine call/put
  let callPut: 'call' | 'put' | undefined;
  if (/\bcall\b/i.test(text) && !/\bput\b/i.test(text)) callPut = 'call';
  else if (/\bput\b/i.test(text) && !/\bcall\b/i.test(text)) callPut = 'put';

  // Extract time period
  let timePeriod: string | undefined;
  const periodMatch = text.match(/(?:last|past|this)\s+(?:\d+\s+)?(?:month|week|year|days?)/i);
  if (periodMatch) timePeriod = periodMatch[0].toLowerCase();

  return { tradeType, callPut, timePeriod };
}

// Detect highest/lowest strike query results
function detectHighestStrikeQuery(text: string): { isHighest: boolean; callPut: 'call' | 'put' } | null {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up/i.test(text);
  if (isJustChecking) return null;

  // Detect highest/lowest strike responses
  // Matches patterns like:
  // - "highest strike call/put"
  // - "sold a quantity of ... $220 strike"
  // - "sold 15 contracts of $220 strike" (common agent response format)
  const highestMatch = /(?:highest|maximum|top)\s+strike.*(?:call|put)|(?:sold|bought)\s+(?:a\s+quantity\s+of|\d+\s+contracts?\s+of).*\$\d+\s+strike/i.test(text);
  const lowestMatch = /(?:lowest|minimum|bottom)\s+strike.*(?:call|put)/i.test(text);

  if (!highestMatch && !lowestMatch) return null;

  // Determine call/put
  let callPut: 'call' | 'put' = 'call';
  if (/\bput\b/i.test(text) && !/\bcall\b/i.test(text)) callPut = 'put';

  return { isHighest: highestMatch, callPut };
}

// Detect total premium query results
function detectTotalPremiumQuery(text: string): { tradeType: 'buy' | 'sell'; timePeriod: string } | null {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up/i.test(text);
  if (isJustChecking) return null;

  // Detect total premium responses
  const hasPremiumTotal = /(?:total\s+(?:of\s+)?\$[\d,]+.*(?:premium|options?))|(?:paid\s+a\s+total\s+of\s+\$[\d,]+)/i.test(text);
  if (!hasPremiumTotal) return null;

  // Determine trade type
  let tradeType: 'buy' | 'sell' = 'buy';
  if (/(?:collected|sold|selling|received)/i.test(text)) tradeType = 'sell';

  // Extract time period
  let timePeriod = 'last 12 months';
  const periodMatch = text.match(/(?:last|past|over\s+the\s+last)\s+(?:\d+\s+)?(?:months?|weeks?|year)/i);
  if (periodMatch) timePeriod = periodMatch[0].toLowerCase();

  return { tradeType, timePeriod };
}

// Detect "last/most recent" option trade query results (single trade only)
// This should NOT match bulk queries like "all options last month"
function detectLastOptionQuery(text: string): { tradeType: 'buy' | 'sell'; callPut: 'call' | 'put' } | null {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up/i.test(text);
  if (isJustChecking && !/bought|sold|total value/i.test(text)) return null;

  // IMPORTANT: Skip if this is a bulk/all trades query (multiple trades)
  // Check for patterns indicating multiple trades across a time period
  const isBulkQuery = /across\s+\d+\s+trades/i.test(text) ||
                      /\d+\s+trades?\s+(?:for|on|total)/i.test(text) ||
                      /covering\s+[\d,]+\s+shares\s+across/i.test(text);
  if (isBulkQuery) return null;

  // Only match explicit "last/most recent/latest" single trade queries
  // NOT bulk queries like "You sold 64 call options last month"
  const hasLastOption =
    /(?:last|most\s+recent|latest)\s+(?:call|put)\s+options?/i.test(text) ||
    /your\s+(?:last|most\s+recent|latest)\s+(?:call|put)/i.test(text) ||
    /the\s+(?:last|most\s+recent|latest)\s+(?:call|put)\s+option/i.test(text);

  if (!hasLastOption) return null;

  // Determine trade type
  let tradeType: 'buy' | 'sell' = 'buy';
  if (/\bsold\b/i.test(text)) tradeType = 'sell';

  // Determine call/put
  let callPut: 'call' | 'put' = 'call';
  if (/\bput\b/i.test(text) && !/\bcall\b/i.test(text)) callPut = 'put';

  return { tradeType, callPut };
}

// Detect "all trades" queries that mention BOTH stocks AND options
// This must run BEFORE detectBulkOptionsQuery to prevent options-only rendering
function detectAllTradesQuery(text: string): boolean {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up/i.test(text);
  if (isJustChecking) return false;

  // Check if message mentions BOTH stock trades AND option trades
  // Pattern: "X stock trades and Y option trades" or "X stock and Y option trades"
  const hasBothStocksAndOptions = /\d+\s+stock\s+trades?\s+and\s+\d+\s+option\s+trades?/i.test(text) ||
                                   /\d+\s+stock\s+and\s+\d+\s+option\s+trades?/i.test(text) ||
                                   /includes?\s+\d+\s+stock\s+trades?\s+and\s+\d+\s+option\s+trades?/i.test(text);

  console.log('🔍 detectAllTradesQuery:', hasBothStocksAndOptions, text.substring(0, 150));
  return hasBothStocksAndOptions;
}

// Detect bulk option trade queries (show ALL trades, not just last one)
// Triggers for queries like "show all short call options on Tesla last month"
function detectBulkOptionsQuery(text: string): { tradeType?: 'buy' | 'sell'; callPut?: 'call' | 'put'; timePeriod?: string } | null {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up/i.test(text);
  if (isJustChecking) return null;

  // Must have multiple trades pattern - check various forms of bulk trade responses
  // 1. "across N trades" - explicitly mentions multiple trades
  // 2. "covering N shares across" - mentions shares covered
  // 3. "you sold N call option contracts" - mentions total contracts traded
  // 4. "N option trades" or "N call/put trades" - mentions trade count
  // 5. "total premium of $X" with contracts mention - bulk sale/purchase
  const hasBulkTrades = /across\s+\d+\s+trades/i.test(text) ||
                        /covering\s+[\d,]+\s+shares\s+across/i.test(text) ||
                        /you\s+(?:bought|sold)\s+\d+\s+(?:call|put)\s+option\s+contracts/i.test(text) ||
                        /\d+\s+(?:call|put)\s+option\s+contracts/i.test(text) ||
                        /total\s+premium\s+of\s+\$[\d,]+.*contracts/i.test(text) ||
                        /collecting\s+total\s+premium/i.test(text) ||
                        /\d+\s+option\s+trades/i.test(text);

  console.log('🔍 detectBulkOptionsQuery checking:', text.substring(0, 150));
  console.log('🔍 hasBulkTrades patterns:', {
    acrossNTrades: /across\s+\d+\s+trades/i.test(text),
    coveringShares: /covering\s+[\d,]+\s+shares\s+across/i.test(text),
    youSoldContracts: /you\s+(?:bought|sold)\s+\d+\s+(?:call|put)\s+option\s+contracts/i.test(text),
    NContracts: /\d+\s+(?:call|put)\s+option\s+contracts/i.test(text),
    totalPremiumContracts: /total\s+premium\s+of\s+\$[\d,]+.*contracts/i.test(text),
    collectingTotalPremium: /collecting\s+total\s+premium/i.test(text),
    NOptionTrades: /\d+\s+option\s+trades/i.test(text),
  });
  console.log('🔍 hasBulkTrades result:', hasBulkTrades);

  if (!hasBulkTrades) return null;

  // Determine trade type
  let tradeType: 'buy' | 'sell' | undefined;
  if (/\bsold\b|collecting/i.test(text)) tradeType = 'sell';
  else if (/\bbought\b|paying/i.test(text)) tradeType = 'buy';

  // Determine call/put
  let callPut: 'call' | 'put' | undefined;
  if (/\bcall\b/i.test(text) && !/\bput\b/i.test(text)) callPut = 'call';
  else if (/\bput\b/i.test(text) && !/\bcall\b/i.test(text)) callPut = 'put';

  // Extract time period
  let timePeriod: string | undefined;
  const periodMatch = text.match(/(?:last|past|this)\s+(?:month|week|year)/i);
  if (periodMatch) timePeriod = periodMatch[0].toLowerCase();

  return { tradeType, callPut, timePeriod };
}

// Detect options expiring query results
// NOTE: We intentionally do NOT extract tradeType here because the webhook queries ALL options
// (both bought and sold) but describes them using "bought" or "sold" language based on the majority.
// If we extracted tradeType from the response text, the UI would filter incorrectly.
function detectExpiringOptionsQuery(text: string): { expiration: string; tradeType?: 'buy' | 'sell' } | null {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up/i.test(text);
  if (isJustChecking && !/expiring|positions?/i.test(text)) return null;

  // Detect expiring options responses
  // Patterns:
  // - "options expiring tomorrow" / "option contracts expiring tomorrow"
  // - "expiring tomorrow...options"
  // - "226 option contracts expiring tomorrow"
  // - "contracts expiring tomorrow"
  const hasExpiringOptions =
    /options?\s+(?:contracts?\s+)?expiring\s+(?:tomorrow|this\s+week|this\s+month)/i.test(text) ||
    /contracts?\s+expiring\s+(?:tomorrow|this\s+week|this\s+month)/i.test(text) ||
    /expiring\s+(?:tomorrow|this\s+week|this\s+month).*options?/i.test(text) ||
    /\d+\s+(?:options?|positions?|contracts?)\s+expir/i.test(text);

  if (!hasExpiringOptions) return null;

  // Extract expiration period
  let expiration = 'tomorrow';
  if (/this\s+week/i.test(text)) expiration = 'this week';
  else if (/this\s+month/i.test(text)) expiration = 'this month';

  // DO NOT extract tradeType - the webhook returns ALL expiring options regardless of buy/sell
  // The response text may say "that you bought" based on majority, but we want ALL options
  return { expiration, tradeType: undefined };
}

// Detect account balance query results
function detectAccountBalanceQuery(text: string): { queryType: AccountQueryType; timePeriod?: string } | null {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up/i.test(text);
  if (isJustChecking && !/balance|equity|buying power|margin/i.test(text)) return null;

  // Must have actual balance data (currency amounts)
  const hasBalanceData = /\$[\d,]+\.?\d*/i.test(text);
  if (!hasBalanceData) return null;

  // Extract time period if present
  let timePeriod: string | undefined;
  const periodMatch = text.match(/(?:for|during|in)\s+(?:the\s+)?(?:last|past|this)\s+(?:month|week|year)/i);
  if (periodMatch) timePeriod = periodMatch[0].toLowerCase();

  // Detect query type based on patterns
  // Cash balance patterns
  if (/cash\s+balance|available\s+(?:cash|funds)|can\s+(?:you\s+)?withdraw/i.test(text)) {
    return { queryType: 'cash_balance', timePeriod };
  }

  // Buying power patterns
  if (/buying\s+power|day\s+trading\s+(?:bp|buying\s+power)/i.test(text)) {
    return { queryType: 'buying_power', timePeriod };
  }

  // NLV patterns
  if (/\bNLV\b|net\s+liquidation|account\s+equity(?!\s+is)/i.test(text)) {
    return { queryType: 'nlv', timePeriod };
  }

  // Margin patterns
  if (/overnight\s+margin|house\s+requirement|margin\s+(?:status|requirement)|fed(?:eral)?\s+requirement/i.test(text)) {
    return { queryType: 'overnight_margin', timePeriod };
  }

  // Market value patterns
  if (/market\s+value.*position|position.*market\s+value|stock\s+(?:long|short)|options?\s+(?:long|short)/i.test(text)) {
    return { queryType: 'market_value', timePeriod };
  }

  // Debit balance patterns
  if (/debit\s+balance/i.test(text)) {
    return { queryType: 'debit_balances', timePeriod };
  }

  // Credit balance patterns
  if (/credit\s+balance/i.test(text)) {
    return { queryType: 'credit_balances', timePeriod };
  }

  // Account summary patterns
  if (/account\s+summary|your\s+account\s+as\s+of/i.test(text)) {
    return { queryType: 'account_summary', timePeriod };
  }

  return null;
}

// Detect fees and commissions query results
function detectFeesQuery(text: string): { feeType: FeeType; symbol?: string; timePeriod?: string } | null {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up/i.test(text);
  if (isJustChecking && !/commission|interest|locate\s+fee/i.test(text)) return null;

  // Must have actual fee data (currency amounts)
  const hasAmount = /\$[\d,]+\.?\d*/i.test(text);
  if (!hasAmount) return null;

  // Extract time period
  let timePeriod: string | undefined;
  const periodMatch = text.match(/(?:for|during|in)\s+(?:the\s+)?(?:month\s+of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|last|past|this)\s*(?:month|week|year)?/i);
  if (periodMatch) timePeriod = periodMatch[0].toLowerCase();

  // Extract symbol for locate fees
  let symbol: string | undefined;
  const symbolMatch = text.match(/(?:for\s+(?:stock\s+)?|borrowing\s+)([A-Z]{2,5})\b/i);
  if (symbolMatch) symbol = symbolMatch[1].toUpperCase();

  // Detect fee type
  // Commission patterns
  if (/commission(?:s)?(?:\s+you\s+paid|\s+paid|\s+total)/i.test(text)) {
    return { feeType: 'commission', timePeriod };
  }

  // Credit interest patterns
  if (/credit\s+interest|interest\s+(?:earned|credit)/i.test(text)) {
    return { feeType: 'credit_interest', timePeriod };
  }

  // Debit interest patterns
  if (/debit\s+interest|interest\s+(?:paid|you\s+paid)|margin\s+interest/i.test(text)) {
    return { feeType: 'debit_interest', timePeriod };
  }

  // Locate fee patterns
  if (/locate\s+fee|borrow(?:ing)?\s+(?:stock|fee)|stock\s+borrow/i.test(text)) {
    return { feeType: 'locate_fee', symbol, timePeriod };
  }

  return null;
}

const UnifiedAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [currentView, setCurrentView] = useState<View>('chat');
  const [inputValue, setInputValue] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showQueryBuilder, setShowQueryBuilder] = useState(false);
  const [isQueryLoading, setIsQueryLoading] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const keepaliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  console.log('🎤 ElevenLabs Agent ID being used:', agentId);

  // Track if we've set a title for current voice conversation
  const voiceTitleSetRef = useRef(false);
  // Track if we're resuming from history (don't clear transcript)
  const isResumingFromHistoryRef = useRef(false);

  // Text-only ElevenLabs conversation (no voice, just text)
  const textOnlyConversation = useConversation({
    textOnly: true,
    onMessage: async (message) => {
      if (message.message && inputMode === 'text') {
        const role = message.source === 'user' ? 'user' : 'assistant';

        // Skip user messages as we add them immediately on send
        if (role === 'user') return;

        let tradeUI: TradeUIData | undefined;

        // For assistant messages, check if we should render trade UI
        const symbol = extractSymbolOrCompany(message.message);

        // Check for account balance queries FIRST (highest priority)
        const accountMatch = detectAccountBalanceQuery(message.message);
        if (accountMatch) {
          const data = await fetchTradeData('', 'account-balance', undefined, accountMatch.timePeriod, { accountQueryType: accountMatch.queryType });
          if (data) tradeUI = data;
        }
        // Check for fees/commissions queries
        if (!tradeUI) {
          const feesMatch = detectFeesQuery(message.message);
          if (feesMatch) {
            const data = await fetchTradeData(feesMatch.symbol || '', 'fees', undefined, feesMatch.timePeriod, { feeType: feesMatch.feeType });
            if (data) tradeUI = data;
          }
        }
        // Check for expiring options (high priority for "expiring tomorrow" queries)
        // Must check before bulk options since expiring responses also contain "across N trades"
        if (!tradeUI) {
          const expiringMatch = detectExpiringOptionsQuery(message.message);
          if (expiringMatch) {
            const data = await fetchTradeData(symbol || '', 'expiring-options', expiringMatch.tradeType, undefined, { expiration: expiringMatch.expiration });
            if (data) tradeUI = data;
          }
        }
        // Check for ALL TRADES (both stocks AND options) - must come BEFORE bulk options
        // This prevents "15 stock trades and 11 option trades" from showing only options
        if (!tradeUI && detectAllTradesQuery(message.message) && symbol) {
          const data = await fetchTradeData(symbol, 'detailed');
          if (data) tradeUI = data;
        }
        // Check for BULK option trades (e.g., "show all short calls on Tesla last month")
        // This must come BEFORE detectLastOptionQuery to catch multi-trade responses
        if (!tradeUI) {
          const bulkOptionsMatch = detectBulkOptionsQuery(message.message);
          if (bulkOptionsMatch) {
            const data = await fetchTradeData(symbol || '', 'advanced-options', bulkOptionsMatch.tradeType, bulkOptionsMatch.timePeriod, { callPut: bulkOptionsMatch.callPut });
            if (data) tradeUI = data;
          }
          // Check for "last/most recent" option trade queries (single trade only)
          else {
            const lastOptionMatch = detectLastOptionQuery(message.message);
            if (lastOptionMatch && symbol) {
              const data = await fetchTradeData(symbol, 'last-option', lastOptionMatch.tradeType, undefined, { callPut: lastOptionMatch.callPut });
              if (data) tradeUI = data;
            }
          }
        }
        // Check for highest/lowest strike queries
        if (!tradeUI) {
          const strikeMatch = detectHighestStrikeQuery(message.message);
          if (strikeMatch) {
            const data = await fetchTradeData(symbol || '', 'highest-strike', undefined, undefined, { callPut: strikeMatch.callPut });
            if (data) tradeUI = data;
          }
          // Check for total premium queries
          else {
            const premiumMatch = detectTotalPremiumQuery(message.message);
            if (premiumMatch) {
              const data = await fetchTradeData(symbol || '', 'total-premium', premiumMatch.tradeType, premiumMatch.timePeriod);
              if (data) tradeUI = data;
            }
            // Check for advanced options queries (short/long calls/puts)
            else {
              const advancedMatch = detectAdvancedOptionsQuery(message.message);
              if (advancedMatch) {
                const data = await fetchTradeData(symbol || '', 'advanced-options', advancedMatch.tradeType, advancedMatch.timePeriod, { callPut: advancedMatch.callPut });
                if (data) tradeUI = data;
              }
              // Check for time-based trades
              else {
                const timeMatch = detectTimeBasedTrades(message.message);
                if (timeMatch) {
                  const isPortfolioQuery = isPortfolioWideQuery(message.message);
                  const isDayOfWeekQuery = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(timeMatch.timePeriod);
                  const timeSymbol = (isPortfolioQuery || (isDayOfWeekQuery && !symbol)) ? null : symbol;
                  const data = await fetchTradeData(timeSymbol || '', 'time-based', undefined, timeMatch.timePeriod);
                  if (data) tradeUI = data;
                }
                else if (symbol) {
                  // Check for average price queries first (simple average, not full stats)
                  const avgPriceMatch = detectAveragePrice(message.message);
                  if (avgPriceMatch) {
                    const data = await fetchTradeData(symbol, 'average-price', avgPriceMatch.tradeType, avgPriceMatch.timePeriod);
                    if (data) tradeUI = data;
                  } else {
                    // Check other detection in order of priority:
                    // 1. Trade stats (specific price queries with high/low/avg)
                    // 2. Profitable trades (specific profit analysis) - check BEFORE detailed
                    // 3. Detailed trades (general trade listing)
                    // 4. Trade summary (count overview)
                    const statsMatch = detectTradeStats(message.message);
                    if (statsMatch) {
                      const data = await fetchTradeData(symbol, 'stats', statsMatch.tradeType, statsMatch.timePeriod);
                      if (data) tradeUI = data;
                    } else if (detectProfitableTrades(message.message)) {
                      const data = await fetchTradeData(symbol, 'profitable');
                      if (data) tradeUI = data;
                    } else if (detectDetailedTrades(message.message)) {
                      const data = await fetchTradeData(symbol, 'detailed');
                      if (data) tradeUI = data;
                    } else {
                      const summaryMatch = detectTradeSummary(message.message);
                      if (summaryMatch) {
                        const data = await fetchTradeData(symbol, 'summary');
                        if (data) tradeUI = data;
                      }
                    }
                  }
                }
              }
            }
          }
        }

        const newMessage: TranscriptMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role,
          content: message.message,
          timestamp: new Date(),
          tradeUI,
        };
        setTranscript(prev => [...prev, newMessage]);
        setIsSending(false);

        // Save to database
        if (currentConversationId) {
          saveMessage(currentConversationId, role, message.message, 'text');
        }
      }
    },
    onError: (error) => {
      console.error('Text-only ElevenLabs error:', error);
      setIsSending(false);
    },
  });

  // Fetch trade data for UI rendering
  const fetchTradeData = useCallback(async (
    symbol: string,
    type: 'summary' | 'detailed' | 'stats' | 'profitable' | 'time-based' | 'option-stats' | 'average-price' | 'advanced-options' | 'highest-strike' | 'total-premium' | 'expiring-options' | 'last-option' | 'account-balance' | 'fees',
    tradeType?: 'buy' | 'sell' | 'all',
    timePeriod?: string,
    extraParams?: { callPut?: 'call' | 'put'; expiration?: string; aggregation?: string; accountQueryType?: AccountQueryType; feeType?: FeeType }
  ): Promise<TradeUIData | null> => {
    try {
      let endpoint: string;
      let body: Record<string, unknown> = { symbol };

      if (type === 'account-balance') {
        endpoint = '/api/account-balance-ui';
        body = { queryType: extraParams?.accountQueryType, timePeriod };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return { type, symbol: '', accountQueryType: extraParams?.accountQueryType, data };
      } else if (type === 'fees') {
        endpoint = '/api/fees-ui';
        body = { feeType: extraParams?.feeType, timePeriod, symbol: symbol || undefined };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return { type, symbol, feeType: extraParams?.feeType, timePeriod, data };
      } else if (type === 'average-price') {
        endpoint = '/api/average-price';
        body = { symbol, tradeType: tradeType || 'all', timePeriod };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return { type, symbol, tradeType, timePeriod, data };
      } else if (type === 'last-option') {
        // Fetch the most recent option trade for the symbol
        endpoint = '/api/advanced-query-ui';
        body = {
          symbol: symbol || undefined,
          securityType: 'O', // Options only
          tradeType: tradeType === 'buy' ? 'B' : tradeType === 'sell' ? 'S' : undefined,
          callPut: extraParams?.callPut === 'call' ? 'C' : extraParams?.callPut === 'put' ? 'P' : undefined,
          orderBy: 'date',
          orderDir: 'desc',
          limit: 1,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return {
          type,
          symbol,
          tradeType,
          callPut: extraParams?.callPut,
          data
        };
      } else if (type === 'advanced-options' || type === 'highest-strike' || type === 'total-premium' || type === 'expiring-options') {
        // Use advanced query UI endpoint for all advanced option queries
        endpoint = '/api/advanced-query-ui';
        body = {
          symbol: symbol || undefined,
          securityType: 'O', // Options only
          tradeType: tradeType === 'buy' ? 'B' : tradeType === 'sell' ? 'S' : undefined,
          callPut: extraParams?.callPut === 'call' ? 'C' : extraParams?.callPut === 'put' ? 'P' : undefined,
          fromDate: timePeriod || undefined,
          expiration: extraParams?.expiration || undefined,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return {
          type,
          symbol,
          tradeType,
          timePeriod,
          callPut: extraParams?.callPut,
          expiration: extraParams?.expiration,
          data
        };
      } else if (type === 'summary') {
        endpoint = '/api/elevenlabs/trade-summary';
      } else if (type === 'stats') {
        // Fetch both stock stats and option stats
        const [stockRes, optionRes] = await Promise.all([
          fetch('/api/trade-stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, tradeType: tradeType || 'all', timePeriod }),
          }),
          fetch('/api/option-stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, tradeType: tradeType || 'all', timePeriod }),
          }),
        ]);
        const stockData = await stockRes.json();
        const optionData = await optionRes.json();
        return { type, symbol, tradeType, timePeriod, data: stockData, optionData };
      } else if (type === 'option-stats') {
        endpoint = '/api/option-stats';
        body = { symbol, tradeType: tradeType || 'all' };
      } else if (type === 'profitable') {
        endpoint = '/api/profitable-trades-ui';
      } else if (type === 'time-based') {
        endpoint = '/api/time-trades-ui';
        body = { symbol: symbol || null, timePeriod };
      } else {
        endpoint = '/api/elevenlabs/detailed-trades';
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      return { type, symbol, tradeType, timePeriod, data };
    } catch (error) {
      console.error('Error fetching trade data:', error);
      return null;
    }
  }, []);

  // ElevenLabs Conversation Hook - single source of truth for both voice and text
  const elevenLabsConversation = useConversation({
    onConnect: () => {
      console.log('ElevenLabs connected');
      // Only clear transcript if not resuming from history
      if (!isResumingFromHistoryRef.current) {
        setTranscript([]);
      }
      isResumingFromHistoryRef.current = false;
      voiceTitleSetRef.current = false; // Reset title tracking
      setIsSending(false);
    },
    onDisconnect: () => {
      console.log('ElevenLabs disconnected');
      setIsSending(false);
    },
    onMessage: async (message) => {
      if (message.message) {
        const role = message.source === 'user' ? 'user' : 'assistant';

        let tradeUI: TradeUIData | undefined;

        // For assistant messages, check if we should render trade UI
        if (role === 'assistant') {
          const symbol = extractSymbolOrCompany(message.message);
          console.log('🔍 Message:', message.message.substring(0, 100));
          console.log('🔍 Extracted symbol:', symbol);

          // Check for account balance queries FIRST (highest priority)
          const accountMatch = detectAccountBalanceQuery(message.message);
          if (accountMatch) {
            console.log('🔍 Account balance query detected:', accountMatch.queryType);
            const data = await fetchTradeData('', 'account-balance', undefined, accountMatch.timePeriod, { accountQueryType: accountMatch.queryType });
            if (data) tradeUI = data;
          }
          // Check for fees/commissions queries
          if (!tradeUI) {
            const feesMatch = detectFeesQuery(message.message);
            if (feesMatch) {
              console.log('🔍 Fees query detected:', feesMatch.feeType);
              const data = await fetchTradeData(feesMatch.symbol || '', 'fees', undefined, feesMatch.timePeriod, { feeType: feesMatch.feeType });
              if (data) tradeUI = data;
            }
          }
          // Check for expiring options (high priority for "expiring tomorrow" queries)
          // Must check before bulk options since expiring responses also contain "across N trades"
          if (!tradeUI) {
            const expiringMatch = detectExpiringOptionsQuery(message.message);
            if (expiringMatch) {
              console.log('🔍 Expiring options detected:', expiringMatch.expiration);
              const data = await fetchTradeData(symbol || '', 'expiring-options', expiringMatch.tradeType, undefined, { expiration: expiringMatch.expiration });
              if (data) tradeUI = data;
            }
          }
          // Check for ALL TRADES (both stocks AND options) - must come BEFORE bulk options
          // This prevents "15 stock trades and 11 option trades" from showing only options
          if (!tradeUI && detectAllTradesQuery(message.message) && symbol) {
            console.log('🔍 All trades query detected (both stocks and options)');
            const data = await fetchTradeData(symbol, 'detailed');
            if (data) tradeUI = data;
          }
          // Check for BULK option trades (e.g., "show all short calls on Tesla last month")
          // This must come BEFORE detectLastOptionQuery to catch multi-trade responses
          if (!tradeUI) {
            const bulkOptionsMatch = detectBulkOptionsQuery(message.message);
            if (bulkOptionsMatch) {
              console.log('🔍 Bulk options query detected:', bulkOptionsMatch);
              const data = await fetchTradeData(symbol || '', 'advanced-options', bulkOptionsMatch.tradeType, bulkOptionsMatch.timePeriod, { callPut: bulkOptionsMatch.callPut });
              if (data) tradeUI = data;
            }
            // Check for "last/most recent" option trade queries (single trade only)
            else {
              const lastOptionMatch = detectLastOptionQuery(message.message);
              if (lastOptionMatch && symbol) {
                console.log('🔍 Last option trade detected:', lastOptionMatch);
                const data = await fetchTradeData(symbol, 'last-option', lastOptionMatch.tradeType, undefined, { callPut: lastOptionMatch.callPut });
                if (data) tradeUI = data;
              }
            }
          }
          // Check for highest/lowest strike queries
          if (!tradeUI) {
            const strikeMatch = detectHighestStrikeQuery(message.message);
            if (strikeMatch) {
              console.log('🔍 Highest strike detected:', strikeMatch);
              const data = await fetchTradeData(symbol || '', 'highest-strike', undefined, undefined, { callPut: strikeMatch.callPut });
              if (data) tradeUI = data;
            }
            // Check for total premium queries
            else {
              const premiumMatch = detectTotalPremiumQuery(message.message);
              if (premiumMatch) {
                console.log('🔍 Total premium detected:', premiumMatch);
                const data = await fetchTradeData(symbol || '', 'total-premium', premiumMatch.tradeType, premiumMatch.timePeriod);
                if (data) tradeUI = data;
              }
              // Check for advanced options queries (short/long calls/puts)
              else {
                const advancedMatch = detectAdvancedOptionsQuery(message.message);
                if (advancedMatch) {
                  console.log('🔍 Advanced options query detected:', advancedMatch);
                  const data = await fetchTradeData(symbol || '', 'advanced-options', advancedMatch.tradeType, advancedMatch.timePeriod, { callPut: advancedMatch.callPut });
                  if (data) tradeUI = data;
                }
                // Check for time-based trades
                else {
                  const timeMatch = detectTimeBasedTrades(message.message);
                  if (timeMatch) {
                    console.log('🔍 Time-based trades detected:', timeMatch.timePeriod);
                    const isPortfolioQuery = isPortfolioWideQuery(message.message);
                    const isDayOfWeekQuery = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(timeMatch.timePeriod);
                    const timeSymbol = (isPortfolioQuery || (isDayOfWeekQuery && !symbol)) ? null : symbol;
                    console.log('🔍 Portfolio-wide query:', isPortfolioQuery, 'Day-of-week:', isDayOfWeekQuery, 'Using symbol:', timeSymbol);
                    const data = await fetchTradeData(timeSymbol || '', 'time-based', undefined, timeMatch.timePeriod);
                    console.log('🔍 Fetched time-based data:', data);
                    if (data) tradeUI = data;
                  }
                  else if (symbol) {
                    // Check for average price queries first (simple average, not full stats)
                    const avgPriceMatch = detectAveragePrice(message.message);
                    if (avgPriceMatch) {
                      console.log('🔍 Average price detected:', avgPriceMatch.tradeType, avgPriceMatch.timePeriod);
                      const data = await fetchTradeData(symbol, 'average-price', avgPriceMatch.tradeType, avgPriceMatch.timePeriod);
                      console.log('🔍 Fetched average price data:', data);
                      if (data) tradeUI = data;
                    } else {
                      // Check other detection in order of priority
                      const statsMatch = detectTradeStats(message.message);
                      if (statsMatch) {
                        const data = await fetchTradeData(symbol, 'stats', statsMatch.tradeType, statsMatch.timePeriod);
                        if (data) tradeUI = data;
                      } else if (detectProfitableTrades(message.message)) {
                        console.log('🔍 Profitable trades detected');
                        const data = await fetchTradeData(symbol, 'profitable');
                        if (data) tradeUI = data;
                      } else if (detectDetailedTrades(message.message)) {
                        console.log('🔍 Detailed trades detected');
                        const data = await fetchTradeData(symbol, 'detailed');
                        if (data) tradeUI = data;
                      } else {
                        const summaryMatch = detectTradeSummary(message.message);
                        if (summaryMatch) {
                          const data = await fetchTradeData(symbol, 'summary');
                          if (data) tradeUI = data;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

        const newMessage: TranscriptMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role,
          content: message.message,
          timestamp: new Date(),
          tradeUI,
        };
        setTranscript(prev => [...prev, newMessage]);
        setIsSending(false); // Clear sending state when we get a response

        // Save to database - use refs/state updater to avoid stale closure
        setCurrentConversationId(prevConvId => {
          if (prevConvId) {
            saveMessage(prevConvId, role, message.message, inputMode);

            // Auto-generate title from first user message
            if (role === 'user' && !voiceTitleSetRef.current) {
              setConversations(prevConvs => {
                const conv = prevConvs.find(c => c.id === prevConvId);
                if (conv?.title === 'New Chat') {
                  updateConversationTitle(prevConvId, message.message.slice(0, 50));
                  voiceTitleSetRef.current = true;
                }
                return prevConvs;
              });
            }
          }
          return prevConvId; // Return unchanged
        });
      }
    },
    onError: (error) => {
      console.error('ElevenLabs error:', error);
      setIsSending(false);
    },
  });

  // API functions
  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations');
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  };

  const createConversation = async (title?: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || 'New Chat' }),
      });
      const data = await res.json();
      if (data.conversation) {
        setConversations((prev) => [data.conversation, ...prev]);
        return data.conversation.id;
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
    return null;
  };

  const loadConversationMessages = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/messages?conversation_id=${conversationId}`);
      const data = await res.json();
      if (data.messages) {
        // Load messages into unified transcript, detecting trade UI for assistant messages
        const loadedMessages: TranscriptMessage[] = await Promise.all(
          data.messages.map(async (msg: { id: string; role: string; content: string; created_at: string }) => {
            const baseMessage: TranscriptMessage = {
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              timestamp: new Date(msg.created_at),
            };

            // For assistant messages, check if we should render trade UI
            if (msg.role === 'assistant') {
              const symbol = extractSymbolOrCompany(msg.content);

              // Check for account balance queries FIRST (highest priority)
              const accountMatch = detectAccountBalanceQuery(msg.content);
              if (accountMatch) {
                const tradeData = await fetchTradeData('', 'account-balance', undefined, accountMatch.timePeriod, { accountQueryType: accountMatch.queryType });
                if (tradeData) {
                  baseMessage.tradeUI = tradeData;
                }
              }
              // Check for fees/commissions queries
              if (!baseMessage.tradeUI) {
                const feesMatch = detectFeesQuery(msg.content);
                if (feesMatch) {
                  const tradeData = await fetchTradeData(feesMatch.symbol || '', 'fees', undefined, feesMatch.timePeriod, { feeType: feesMatch.feeType });
                  if (tradeData) {
                    baseMessage.tradeUI = tradeData;
                  }
                }
              }
              // Check for expiring options (high priority for "expiring tomorrow" queries)
              // Must check before bulk options since expiring responses also contain "across N trades"
              if (!baseMessage.tradeUI) {
                const expiringMatch = detectExpiringOptionsQuery(msg.content);
                if (expiringMatch) {
                  const tradeData = await fetchTradeData(symbol || '', 'expiring-options', expiringMatch.tradeType, undefined, { expiration: expiringMatch.expiration });
                  if (tradeData) {
                    baseMessage.tradeUI = tradeData;
                  }
                }
              }
              // Check for ALL TRADES (both stocks AND options) - must come BEFORE bulk options
              // This prevents "15 stock trades and 11 option trades" from showing only options
              if (!baseMessage.tradeUI && detectAllTradesQuery(msg.content) && symbol) {
                const tradeData = await fetchTradeData(symbol, 'detailed');
                if (tradeData) {
                  baseMessage.tradeUI = tradeData;
                }
              }
              // Check for BULK option trades (e.g., "show all short calls on Tesla last month")
              if (!baseMessage.tradeUI) {
                const bulkOptionsMatch = detectBulkOptionsQuery(msg.content);
                if (bulkOptionsMatch) {
                  const tradeData = await fetchTradeData(symbol || '', 'advanced-options', bulkOptionsMatch.tradeType, bulkOptionsMatch.timePeriod, { callPut: bulkOptionsMatch.callPut });
                  if (tradeData) {
                    baseMessage.tradeUI = tradeData;
                  }
                }
                // Check for time-based trades
                else {
                  const timeMatch = detectTimeBasedTrades(msg.content);
                  if (timeMatch) {
                    // For time-based queries, check if it's portfolio-wide:
                    // 1. Multiple symbols mentioned in response
                    // 2. Day-of-week queries with NO symbol are portfolio-wide
                    const isPortfolioQuery = isPortfolioWideQuery(msg.content);
                    const isDayOfWeekQuery = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(timeMatch.timePeriod);
                    // Only use null symbol if portfolio-wide OR (day-of-week AND no symbol detected)
                    const timeSymbol = (isPortfolioQuery || (isDayOfWeekQuery && !symbol)) ? null : symbol;
                    const tradeData = await fetchTradeData(timeSymbol || '', 'time-based', undefined, timeMatch.timePeriod);
                    if (tradeData) {
                      baseMessage.tradeUI = tradeData;
                    }
                  }
                }
              }
              if (!baseMessage.tradeUI && symbol) {
                // Check for average price queries first (simple average, not full stats)
                const avgPriceMatch = detectAveragePrice(msg.content);
                if (avgPriceMatch) {
                  const tradeData = await fetchTradeData(symbol, 'average-price', avgPriceMatch.tradeType, avgPriceMatch.timePeriod);
                  if (tradeData) {
                    baseMessage.tradeUI = tradeData;
                  }
                } else {
                  // Check other detection in order of priority:
                  // 1. Trade stats (specific price queries with high/low/avg)
                  // 2. Profitable trades (specific profit analysis) - check BEFORE detailed
                  // 3. Detailed trades (general trade listing)
                  // 4. Trade summary (count overview)
                  const statsMatch = detectTradeStats(msg.content);
                  if (statsMatch) {
                    const tradeData = await fetchTradeData(symbol, 'stats', statsMatch.tradeType, statsMatch.timePeriod);
                    if (tradeData) {
                      baseMessage.tradeUI = tradeData;
                    }
                  } else if (detectProfitableTrades(msg.content)) {
                    const tradeData = await fetchTradeData(symbol, 'profitable');
                    if (tradeData) {
                      baseMessage.tradeUI = tradeData;
                    }
                  } else if (detectDetailedTrades(msg.content)) {
                    const tradeData = await fetchTradeData(symbol, 'detailed');
                    if (tradeData) {
                      baseMessage.tradeUI = tradeData;
                    }
                  } else {
                    const summaryMatch = detectTradeSummary(msg.content);
                    if (summaryMatch) {
                      const tradeData = await fetchTradeData(symbol, 'summary');
                      if (tradeData) {
                        baseMessage.tradeUI = tradeData;
                      }
                    }
                  }
                }
              }
            }

            return baseMessage;
          })
        );
        setTranscript(loadedMessages);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const saveMessage = async (conversationId: string, role: string, content: string, source: string) => {
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, role, content, source }),
      });
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  };

  const updateConversationTitle = async (conversationId: string, title: string) => {
    try {
      await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, title } : c))
      );
    } catch (error) {
      console.error('Failed to update conversation title:', error);
    }
  };

  // Auto-scroll for transcript
  useEffect(() => {
    if (transcriptRef.current && transcript.length > 0) {
      // Use setTimeout to ensure DOM has fully updated after render
      const timeoutId = setTimeout(() => {
        if (transcriptRef.current) {
          transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
        }
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [transcript]);

  useEffect(() => {
    if (isOpen && inputMode === 'text' && inputRef.current && currentView === 'chat') {
      inputRef.current.focus();
    }
  }, [isOpen, inputMode, currentView]);

  useEffect(() => {
    if (isOpen) fetchConversations();
  }, [isOpen]);

  // Voice session handlers
  const startVoiceSession = useCallback(async () => {
    if (elevenLabsConversation.status === 'connected' || elevenLabsConversation.status === 'connecting') {
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      // @ts-expect-error - ElevenLabs SDK types
      await elevenLabsConversation.startSession({ agentId });
    } catch (error) {
      console.error('Failed to start voice session:', error);
    }
  }, [elevenLabsConversation, agentId]);

  const stopVoiceSession = useCallback(async () => {
    if (elevenLabsConversation.status === 'connected') {
      await elevenLabsConversation.endSession();
    }
  }, [elevenLabsConversation]);

  // Handlers
  const handleOpen = useCallback(async () => {
    setIsOpen(true);
    setInputMode('voice'); // Always open in voice mode first
    setCurrentView('chat');
    if (!currentConversationId) {
      const newId = await createConversation();
      if (newId) setCurrentConversationId(newId);
    }
    // Auto-start voice session
    if (elevenLabsConversation.status !== 'connected' && elevenLabsConversation.status !== 'connecting') {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        // @ts-expect-error - ElevenLabs SDK types
        await elevenLabsConversation.startSession({ agentId });
      } catch (error) {
        console.error('Failed to auto-start voice session:', error);
      }
    }
  }, [currentConversationId, elevenLabsConversation, agentId]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    stopVoiceSession();
  }, [stopVoiceSession]);

  const handleSelectConversation = async (conv: Conversation) => {
    isResumingFromHistoryRef.current = true; // Don't clear transcript when voice connects
    setCurrentConversationId(conv.id);
    await loadConversationMessages(conv.id);
    setCurrentView('chat');
  };

  const handleNewChat = async () => {
    setTranscript([]);
    const newId = await createConversation();
    if (newId) {
      setCurrentConversationId(newId);
      setCurrentView('chat');
    }
  };

  const handleSendMessage = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isSending) return;

    const message = inputValue.trim();
    setInputValue('');
    setIsSending(true);

    let convId = currentConversationId;
    if (!convId) {
      convId = await createConversation(message.slice(0, 50));
      if (convId) setCurrentConversationId(convId);
    }

    // TEXT MODE: Use ElevenLabs text-only (no voice)
    if (inputMode === 'text') {
      // Ensure text-only session is connected
      if (textOnlyConversation.status !== 'connected') {
        try {
          // @ts-expect-error - ElevenLabs SDK types
          await textOnlyConversation.startSession({ agentId });
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error('Failed to start text-only session:', error);
          setIsSending(false);
          return;
        }
      }

      // Add user message to transcript immediately
      const userMessage: TranscriptMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
      };
      setTranscript(prev => [...prev, userMessage]);

      // Save to database
      if (convId) {
        await saveMessage(convId, 'user', message, 'text');
        const currentConv = conversations.find((c) => c.id === convId);
        if (currentConv?.title === 'New Chat') {
          updateConversationTitle(convId, message.slice(0, 50));
        }
      }

      // Send to ElevenLabs text-only conversation
      textOnlyConversation.sendUserMessage(message);
      return;
    }

    // VOICE MODE: Use ElevenLabs (voice response)
    // Ensure ElevenLabs session is connected
    if (elevenLabsConversation.status !== 'connected') {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        // @ts-expect-error - ElevenLabs SDK types
        await elevenLabsConversation.startSession({ agentId });
        // Wait a moment for connection to establish
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error('Failed to start ElevenLabs session:', error);
        setIsSending(false);
        return;
      }
    }

    // Add user message to transcript immediately for UI feedback
    const userMessage: TranscriptMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    setTranscript(prev => [...prev, userMessage]);

    // Save to database
    if (convId) {
      await saveMessage(convId, 'user', message, 'voice');
      const currentConv = conversations.find((c) => c.id === convId);
      if (currentConv?.title === 'New Chat') {
        updateConversationTitle(convId, message.slice(0, 50));
        voiceTitleSetRef.current = true;
      }
    }

    // Send message to ElevenLabs agent (will respond with voice)
    elevenLabsConversation.sendUserMessage(message);
  }, [inputValue, isSending, inputMode, currentConversationId, conversations, elevenLabsConversation, agentId, textOnlyConversation]);

  const handleEndChat = useCallback(() => {
    setTranscript([]);
    setCurrentConversationId(null);
    setCurrentView('history');
    stopVoiceSession();
  }, [stopVoiceSession]);

  // Handle advanced query execution from QueryBuilder
  const handleQueryExecute = useCallback(async (filters: {
    symbol: string;
    securityType: 'all' | 'S' | 'O';
    tradeType: 'all' | 'B' | 'S';
    callPut: 'all' | 'C' | 'P';
    fromDate: string;
    toDate: string;
    expiration: string;
    strike: string;
  }) => {
    setIsQueryLoading(true);
    try {
      const res = await fetch('/api/advanced-query-ui', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: filters.symbol || undefined,
          securityType: filters.securityType !== 'all' ? filters.securityType : undefined,
          tradeType: filters.tradeType !== 'all' ? filters.tradeType : undefined,
          callPut: filters.callPut !== 'all' ? filters.callPut : undefined,
          fromDate: filters.fromDate || undefined,
          toDate: filters.toDate || undefined,
          expiration: filters.expiration || undefined,
          strike: filters.strike ? parseFloat(filters.strike) : undefined,
        }),
      });
      const data = await res.json();
      setShowQueryBuilder(false);

      // Add query results as a message in the transcript
      const queryDesc = generateQueryDescription(filters);
      const resultMsg: TranscriptMessage = {
        id: `msg-${Date.now()}-query`,
        role: 'assistant',
        content: `Here are your ${queryDesc}:`,
        timestamp: new Date(),
        tradeUI: {
          type: 'query-builder-result',
          symbol: filters.symbol || 'Portfolio',
          tradeType: filters.tradeType === 'B' ? 'buy' : filters.tradeType === 'S' ? 'sell' : undefined,
          callPut: filters.callPut === 'C' ? 'call' : filters.callPut === 'P' ? 'put' : undefined,
          data: {
            ...data,
            queryFilters: filters, // Pass the original filters for TradeQueryCard
          },
        },
      };
      setTranscript(prev => [...prev, resultMsg]);
    } catch (error) {
      console.error('Query execution error:', error);
    } finally {
      setIsQueryLoading(false);
    }
  }, []);

  // Generate human-readable query description
  const generateQueryDescription = (filters: {
    symbol: string;
    securityType: 'all' | 'S' | 'O';
    tradeType: 'all' | 'B' | 'S';
    callPut: 'all' | 'C' | 'P';
    fromDate: string;
    toDate: string;
    expiration: string;
    strike: string;
  }): string => {
    const parts: string[] = [];
    if (filters.tradeType === 'B') parts.push('bought');
    else if (filters.tradeType === 'S') parts.push('sold');

    if (filters.securityType === 'O') {
      if (filters.callPut === 'C') parts.push('call options');
      else if (filters.callPut === 'P') parts.push('put options');
      else parts.push('options');
    } else if (filters.securityType === 'S') {
      parts.push('stocks');
    } else {
      parts.push('trades');
    }

    if (filters.symbol) parts.push(`for ${filters.symbol}`);
    if (filters.fromDate) parts.push(`from ${filters.fromDate}`);
    if (filters.expiration) parts.push(`expiring ${filters.expiration}`);

    return parts.join(' ') || 'trades';
  };

  const toggleMode = useCallback(async () => {
    const newMode = inputMode === 'text' ? 'voice' : 'text';
    setInputMode(newMode);

    if (newMode === 'text') {
      // Switching to chat mode - stop voice ElevenLabs, start text-only
      stopVoiceSession();
      if (textOnlyConversation.status !== 'connected' && textOnlyConversation.status !== 'connecting') {
        try {
          // @ts-expect-error - ElevenLabs SDK types
          await textOnlyConversation.startSession({ agentId });
        } catch (error) {
          console.error('Failed to start text-only session:', error);
        }
      }
    } else {
      // Switching to voice mode - stop text-only, start voice ElevenLabs
      if (textOnlyConversation.status === 'connected') {
        await textOnlyConversation.endSession();
      }
      if (elevenLabsConversation.status !== 'connected' && elevenLabsConversation.status !== 'connecting') {
        startVoiceSession();
      }
    }
  }, [inputMode, elevenLabsConversation.status, textOnlyConversation, startVoiceSession, stopVoiceSession, agentId]);

  // Render trade UI component based on data
  const renderTradeUI = (tradeUI: TradeUIData) => {
    const { type, symbol, data } = tradeUI;

    if (type === 'summary') {
      // Parse from the response data
      const responseData = data as { response?: string };
      const text = responseData.response || '';
      const summaryMatch = detectTradeSummary(text);

      if (summaryMatch) {
        return (
          <div style={{ marginTop: '12px' }}>
            <TradeSummary
              symbol={symbol}
              stockCount={summaryMatch.stockTrades}
              optionCount={summaryMatch.optionTrades}
            />
          </div>
        );
      }
    }

    if (type === 'detailed') {
      // Check if data already contains trades (from QueryBuilder)
      const queryData = data as { trades?: Array<Record<string, unknown>>; aggregations?: Aggregations; filters?: ActiveFilters };
      if (queryData.trades && queryData.trades.length > 0) {
        return (
          <div style={{ marginTop: '12px' }}>
            <TradesTable
              trades={queryData.trades as Array<{
                TradeID: number;
                Date: string;
                Symbol: string;
                SecurityType: string;
                TradeType: string;
                StockTradePrice: string;
                StockShareQty: string;
                OptionContracts: string;
                OptionTradePremium: string;
                GrossAmount: string;
                NetAmount: string;
                Strike?: string;
                Expiration?: string;
                'Call/Put'?: string;
              }>}
              filters={queryData.filters}
              aggregations={queryData.aggregations}
            />
          </div>
        );
      }
      // For detailed trades, we need to fetch the full data with trades array
      // The API returns a text response, but we need to call a different endpoint
      // that returns structured data for the table
      return (
        <div style={{ marginTop: '12px' }}>
          <DetailedTradesLoader symbol={symbol} />
        </div>
      );
    }

    if (type === 'stats') {
      const stockStatsData = data as { stats?: {
        symbol: string;
        year: number;
        tradeType: 'buy' | 'sell' | 'all';
        timePeriod?: string | null;
        highestPrice: number;
        highestPriceDate: string;
        highestPriceShares: number;
        lowestPrice: number;
        lowestPriceDate: string;
        lowestPriceShares: number;
        averagePrice: number;
        totalTrades: number;
        totalShares: number;
        totalValue: number;
      }};

      const optionStatsData = tradeUI.optionData as { optionStats?: {
        symbol: string;
        year: number;
        tradeType: 'buy' | 'sell' | 'all';
        highestPremium: number;
        highestPremiumDate: string;
        highestPremiumContracts: number;
        highestPremiumStrike: number;
        highestPremiumCallPut: 'Call' | 'Put';
        lowestPremium: number;
        lowestPremiumDate: string;
        lowestPremiumContracts: number;
        lowestPremiumStrike: number;
        lowestPremiumCallPut: 'Call' | 'Put';
        averagePremium: number;
        totalTrades: number;
        totalContracts: number;
        totalValue: number;
        callCount: number;
        putCount: number;
      }} | null;

      const hasStockStats = stockStatsData?.stats;
      const hasOptionStats = optionStatsData?.optionStats;
      const hasTimePeriod = hasStockStats && stockStatsData.stats!.timePeriod;

      if (hasStockStats || hasOptionStats) {
        return (
          <div style={{ marginTop: '12px' }}>
            {hasStockStats && hasTimePeriod && (
              // Use TimePeriodStats for time-based queries (last month, last week, etc.)
              <TimePeriodStats
                symbol={stockStatsData.stats!.symbol}
                timePeriod={stockStatsData.stats!.timePeriod!}
                tradeType={stockStatsData.stats!.tradeType}
                highestPrice={stockStatsData.stats!.highestPrice}
                highestPriceDate={stockStatsData.stats!.highestPriceDate}
                highestPriceShares={stockStatsData.stats!.highestPriceShares}
                lowestPrice={stockStatsData.stats!.lowestPrice}
                lowestPriceDate={stockStatsData.stats!.lowestPriceDate}
                lowestPriceShares={stockStatsData.stats!.lowestPriceShares}
                averagePrice={stockStatsData.stats!.averagePrice}
                totalTrades={stockStatsData.stats!.totalTrades}
                totalShares={stockStatsData.stats!.totalShares}
                totalValue={stockStatsData.stats!.totalValue}
              />
            )}
            {hasStockStats && !hasTimePeriod && (
              // Use TradeStats for full year stats
              <TradeStats
                symbol={stockStatsData.stats!.symbol}
                year={stockStatsData.stats!.year}
                tradeType={stockStatsData.stats!.tradeType}
                highestPrice={stockStatsData.stats!.highestPrice}
                highestPriceDate={stockStatsData.stats!.highestPriceDate}
                highestPriceShares={stockStatsData.stats!.highestPriceShares}
                lowestPrice={stockStatsData.stats!.lowestPrice}
                lowestPriceDate={stockStatsData.stats!.lowestPriceDate}
                lowestPriceShares={stockStatsData.stats!.lowestPriceShares}
                averagePrice={stockStatsData.stats!.averagePrice}
                totalTrades={stockStatsData.stats!.totalTrades}
                totalShares={stockStatsData.stats!.totalShares}
                totalValue={stockStatsData.stats!.totalValue}
              />
            )}
            {hasOptionStats && (
              <OptionStats
                symbol={optionStatsData.optionStats!.symbol}
                year={optionStatsData.optionStats!.year}
                tradeType={optionStatsData.optionStats!.tradeType}
                highestPremium={optionStatsData.optionStats!.highestPremium}
                highestPremiumDate={optionStatsData.optionStats!.highestPremiumDate}
                highestPremiumContracts={optionStatsData.optionStats!.highestPremiumContracts}
                highestPremiumStrike={optionStatsData.optionStats!.highestPremiumStrike}
                highestPremiumCallPut={optionStatsData.optionStats!.highestPremiumCallPut}
                lowestPremium={optionStatsData.optionStats!.lowestPremium}
                lowestPremiumDate={optionStatsData.optionStats!.lowestPremiumDate}
                lowestPremiumContracts={optionStatsData.optionStats!.lowestPremiumContracts}
                lowestPremiumStrike={optionStatsData.optionStats!.lowestPremiumStrike}
                lowestPremiumCallPut={optionStatsData.optionStats!.lowestPremiumCallPut}
                averagePremium={optionStatsData.optionStats!.averagePremium}
                totalTrades={optionStatsData.optionStats!.totalTrades}
                totalContracts={optionStatsData.optionStats!.totalContracts}
                totalValue={optionStatsData.optionStats!.totalValue}
                callCount={optionStatsData.optionStats!.callCount}
                putCount={optionStatsData.optionStats!.putCount}
              />
            )}
          </div>
        );
      }
    }

    if (type === 'profitable') {
      console.log('🎨 Rendering profitable trades card with data:', data);
      const profitableData = data as {
        symbol: string;
        totalProfitableTrades: number;
        totalProfit: number;
        trades: Array<{
          securityType: string;
          buyDate: string;
          sellDate: string;
          quantity: number;
          buyPrice: number;
          sellPrice: number;
          profitLoss: number;
        }>;
      };

      // Always render if we have data, even with 0 trades (to show "no profitable trades")
      if (profitableData.symbol) {
        return (
          <div style={{ marginTop: '12px' }}>
            <ProfitableTrades
              symbol={profitableData.symbol}
              totalProfitableTrades={profitableData.totalProfitableTrades || 0}
              totalProfit={profitableData.totalProfit || 0}
              trades={profitableData.trades || []}
            />
          </div>
        );
      }
    }

    if (type === 'time-based') {
      console.log('🎨 Rendering time-based trades card with data:', data);
      const timeData = data as {
        timePeriod: {
          description: string;
          displayRange: string;
          tradingDays: number;
        };
        summary: {
          totalTrades: number;
          stockCount: number;
          optionCount: number;
          totalValue: number;
          averagePrice?: number;
        };
        trades: Array<{
          TradeID: number;
          Date: string;
          Symbol: string;
          SecurityType: string;
          TradeType: string;
          StockTradePrice?: string;
          StockShareQty?: string;
          OptionContracts?: string;
          NetAmount: string;
          displayDate?: string;
        }>;
        symbol?: string | null;
      };

      if (timeData.timePeriod && timeData.summary) {
        return (
          <div style={{ marginTop: '12px' }}>
            <TimeBasedTrades
              timePeriod={timeData.timePeriod}
              summary={timeData.summary}
              trades={timeData.trades || []}
              symbol={timeData.symbol}
            />
          </div>
        );
      }
    }

    if (type === 'average-price') {
      console.log('🎨 Rendering average price card with data:', data);
      const avgData = data as {
        symbol: string;
        averagePrice: number;
        highestPrice?: number;
        lowestPrice?: number;
        totalTrades: number;
        totalShares?: number;
        timePeriod: string;
        tradeType: 'buy' | 'sell' | 'all';
      };

      if (avgData.averagePrice !== null && avgData.averagePrice !== undefined) {
        return (
          <div style={{ marginTop: '12px' }}>
            <AveragePrice
              symbol={avgData.symbol}
              averagePrice={avgData.averagePrice}
              timePeriod={avgData.timePeriod}
              tradeType={avgData.tradeType}
              totalTrades={avgData.totalTrades}
              totalShares={avgData.totalShares}
              highestPrice={avgData.highestPrice}
              lowestPrice={avgData.lowestPrice}
            />
          </div>
        );
      }
    }

    if (type === 'advanced-options') {
      console.log('🎨 Rendering advanced options table with data:', data);
      const advancedData = data as {
        trades: Array<{
          TradeID: number;
          Date: string;
          Symbol: string;
          SecurityType: string;
          TradeType: string;
          'Call/Put': string;
          Strike: string;
          Expiration: string;
          OptionContracts: string;
          OptionTradePremium: string;
          NetAmount: string;
        }>;
        aggregations?: {
          totalTrades: number;
          totalContracts: number;
          totalPremium: number;
          callCount: number;
          putCount: number;
        };
        filters?: {
          symbol?: string;
          securityType?: string;
          tradeType?: string;
          callPut?: string;
          fromDate?: string;
          toDate?: string;
          expiration?: string;
          strike?: number;
        };
      };

      // Build query description from filters
      const queryParts: string[] = ['Show all the'];
      if (tradeUI.tradeType === 'sell') queryParts.push('short');
      else if (tradeUI.tradeType === 'buy') queryParts.push('long');
      if (tradeUI.callPut) queryParts.push(tradeUI.callPut);
      queryParts.push('options');
      if (symbol) queryParts.push(`on ${symbol}`);
      if (tradeUI.timePeriod) queryParts.push(`traded ${tradeUI.timePeriod}`);
      const queryText = queryParts.join(' ');

      // Build filter object for TradeQueryCard
      const filters = advancedData.filters || {};
      const cardFilters = {
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        symbol: filters.symbol || symbol,
        securityType: filters.securityType === 'O' ? 'Option' : filters.securityType === 'S' ? 'Stock' : undefined,
        tradeType: filters.tradeType === 'S' ? 'Sell' : filters.tradeType === 'B' ? 'Buy' : undefined,
        callPut: filters.callPut === 'C' ? 'Call' : filters.callPut === 'P' ? 'Put' : undefined,
        strike: filters.strike,
        expiration: filters.expiration,
      };

      return (
        <div style={{ marginTop: '12px' }}>
          <TradeQueryCard
            query={queryText}
            filters={cardFilters}
          />
          {advancedData.trades && advancedData.trades.length > 0 && (
            <AdvancedOptionsTable
              trades={advancedData.trades}
              symbol={symbol}
              callPut={tradeUI.callPut}
              tradeType={tradeUI.tradeType}
              timePeriod={tradeUI.timePeriod}
              aggregations={advancedData.aggregations}
            />
          )}
        </div>
      );
    }

    if (type === 'highest-strike') {
      console.log('🎨 Rendering highest strike card with data:', data);
      const strikeData = data as {
        trades: Array<{
          TradeID: number;
          Date: string;
          Symbol: string;
          TradeType: string;
          'Call/Put': string;
          Strike: string;
          Expiration: string;
          OptionContracts: string;
          OptionTradePremium: string;
          NetAmount: string;
        }>;
      };

      // Get the trade with highest strike
      if (strikeData.trades && strikeData.trades.length > 0) {
        const sortedByStrike = [...strikeData.trades].sort(
          (a, b) => parseFloat(b.Strike) - parseFloat(a.Strike)
        );
        const highestStrikeTrade = sortedByStrike[0];

        // Calculate total premium correctly: premium_per_share * contracts * 100
        const premiumPerShare = parseFloat(highestStrikeTrade.OptionTradePremium || '0');
        const contracts = parseInt(highestStrikeTrade.OptionContracts || '0');
        const totalPremium = premiumPerShare * contracts * 100;

        return (
          <div style={{ marginTop: '12px' }}>
            <HighestStrikeCard
              symbol={parseOptionSymbol(highestStrikeTrade.Symbol)}
              strike={parseFloat(highestStrikeTrade.Strike)}
              callPut={highestStrikeTrade['Call/Put'] === 'C' ? 'Call' : 'Put'}
              tradeType={highestStrikeTrade.TradeType === 'B' ? 'buy' : 'sell'}
              date={highestStrikeTrade.Date}
              expiration={highestStrikeTrade.Expiration}
              contracts={contracts}
              premium={totalPremium}
              isHighest={true}
            />
          </div>
        );
      }
    }

    if (type === 'total-premium') {
      console.log('🎨 Rendering total premium card with data:', data);
      const premiumData = data as {
        trades: Array<{
          TradeID: number;
          Date: string;
          Symbol: string;
          TradeType: string;
          'Call/Put': string;
          Strike: string;
          Expiration: string;
          OptionContracts: string;
          OptionTradePremium: string;
          NetAmount: string;
        }>;
        aggregations?: {
          totalTrades: number;
          totalContracts: number;
          totalPremium: number;
          callCount: number;
          putCount: number;
        };
      };

      if (premiumData.aggregations) {
        return (
          <div style={{ marginTop: '12px' }}>
            <TotalPremiumCard
              symbol={symbol || 'Portfolio'}
              totalPremium={premiumData.aggregations.totalPremium}
              totalTrades={premiumData.aggregations.totalTrades}
              totalContracts={premiumData.aggregations.totalContracts}
              callCount={premiumData.aggregations.callCount}
              putCount={premiumData.aggregations.putCount}
              tradeType={tradeUI.tradeType || 'buy'}
              timePeriod={tradeUI.timePeriod || 'last 12 months'}
            />
          </div>
        );
      }
    }

    if (type === 'expiring-options') {
      console.log('🎨 Rendering expiring options table with data:', data);
      const expiringData = data as {
        trades: Array<{
          TradeID: number;
          Date: string;
          Symbol: string;
          SecurityType: string;
          TradeType: string;
          'Call/Put': string;
          Strike: string;
          Expiration: string;
          OptionContracts: string;
          OptionTradePremium: string;
          NetAmount: string;
        }>;
        aggregations?: {
          tradeCount?: number;
          totalPremium?: number;
          totalNetAmount?: number;
          callCount?: number;
          putCount?: number;
          totalContracts?: number;
        };
      };

      if (expiringData.trades && expiringData.trades.length > 0) {
        return (
          <div style={{ marginTop: '12px' }}>
            <ExpiringOptionsTable
              trades={expiringData.trades}
              expirationPeriod={tradeUI.expiration || 'tomorrow'}
              aggregations={expiringData.aggregations ? {
                tradeCount: expiringData.aggregations.tradeCount,
                totalPremium: expiringData.aggregations.totalNetAmount, // Use net amount for "Total Value"
                callCount: expiringData.aggregations.callCount,
                putCount: expiringData.aggregations.putCount,
                totalContracts: expiringData.aggregations.totalContracts,
              } : undefined}
            />
          </div>
        );
      }
    }

    if (type === 'last-option') {
      console.log('🎨 Rendering last option trade card with data:', data);
      const lastOptionData = data as {
        trades: Array<{
          TradeID: number;
          Date: string;
          Symbol: string;
          UnderlyingSymbol?: string;
          TradeType: string;
          'Call/Put': string;
          Strike: string;
          Expiration: string;
          OptionContracts: string;
          OptionTradePremium: string;
          NetAmount: string;
        }>;
        aggregations?: {
          totalTrades: number;
          totalContracts: number;
          totalPremium: number;
          callCount: number;
          putCount: number;
        };
      };

      if (lastOptionData.trades && lastOptionData.trades.length > 0) {
        const trade = lastOptionData.trades[0]; // Get the most recent trade
        const isCall = trade['Call/Put'] === 'C';
        const isBuy = trade.TradeType === 'B';
        const contracts = parseInt(trade.OptionContracts || '0');
        const premium = parseFloat(trade.OptionTradePremium || '0');
        const totalValue = Math.abs(parseFloat(trade.NetAmount || '0'));
        const strike = parseFloat(trade.Strike || '0');
        // Use UnderlyingSymbol for options (e.g., "AAPL") instead of full option symbol (e.g., "AAPL251220C00195000")
        const displaySymbol = trade.UnderlyingSymbol || trade.Symbol;

        return (
          <div style={{ marginTop: '12px' }}>
            <LastOptionTradeCard
              symbol={displaySymbol}
              callPut={isCall ? 'Call' : 'Put'}
              tradeType={isBuy ? 'buy' : 'sell'}
              strike={strike}
              expiration={trade.Expiration}
              tradeDate={trade.Date}
              contracts={contracts}
              premium={premium}
              totalValue={totalValue}
              totalTrades={lastOptionData.aggregations?.totalTrades}
              avgPremium={lastOptionData.aggregations?.totalPremium
                ? lastOptionData.aggregations.totalPremium / (lastOptionData.aggregations.totalTrades || 1)
                : undefined}
            />
          </div>
        );
      }
    }

    if (type === 'query-builder-result') {
      console.log('🎨 Rendering query builder result with data:', data);
      const queryData = data as {
        trades: Array<{
          TradeID: number;
          Date: string;
          Symbol: string;
          SecurityType: string;
          TradeType: string;
          StockTradePrice: string;
          StockShareQty: string;
          OptionContracts: string;
          OptionTradePremium: string;
          GrossAmount: string;
          NetAmount: string;
          Strike?: string;
          Expiration?: string;
          'Call/Put'?: string;
        }>;
        aggregations?: Aggregations;
        filters?: ActiveFilters;
        queryFilters?: {
          symbol: string;
          securityType: 'all' | 'S' | 'O';
          tradeType: 'all' | 'B' | 'S';
          callPut: 'all' | 'C' | 'P';
          fromDate: string;
          toDate: string;
          expiration: string;
          strike: string;
        };
      };

      // Build query description from filters
      const filters = (queryData.queryFilters || {}) as {
        tradeType?: string;
        securityType?: string;
        callPut?: string;
        symbol?: string;
        fromDate?: string;
        toDate?: string;
        strike?: string;
        expiration?: string;
      };
      const queryParts: string[] = ['Show'];
      if (filters.tradeType === 'S') queryParts.push('all sold');
      else if (filters.tradeType === 'B') queryParts.push('all bought');
      else queryParts.push('all');

      if (filters.securityType === 'O') {
        if (filters.callPut === 'C') queryParts.push('call options');
        else if (filters.callPut === 'P') queryParts.push('put options');
        else queryParts.push('options');
      } else if (filters.securityType === 'S') {
        queryParts.push('stocks');
      } else {
        queryParts.push('trades');
      }

      if (filters.symbol) queryParts.push(`for ${filters.symbol}`);
      if (filters.fromDate) queryParts.push(`from ${filters.fromDate}`);
      const queryText = queryParts.join(' ');

      // Build filter object for TradeQueryCard
      const cardFilters = {
        fromDate: queryData.filters?.fromDate || filters.fromDate,
        toDate: queryData.filters?.toDate || filters.toDate,
        symbol: queryData.filters?.symbol || filters.symbol || symbol,
        securityType: filters.securityType === 'O' ? 'Option' : filters.securityType === 'S' ? 'Stock' : undefined,
        tradeType: filters.tradeType === 'S' ? 'Sell' : filters.tradeType === 'B' ? 'Buy' : undefined,
        callPut: filters.callPut === 'C' ? 'Call' : filters.callPut === 'P' ? 'Put' : undefined,
        strike: filters.strike ? parseFloat(filters.strike) : undefined,
        expiration: filters.expiration,
      };

      return (
        <div style={{ marginTop: '12px' }}>
          <TradeQueryCard
            query={queryText}
            filters={cardFilters}
          />
          {queryData.trades && queryData.trades.length > 0 && (
            <TradesTable
              trades={queryData.trades}
              filters={queryData.filters}
              aggregations={queryData.aggregations}
            />
          )}
        </div>
      );
    }

    if (type === 'account-balance') {
      console.log('🎨 Rendering account balance card with data:', data);
      const accountData = data as {
        queryType: AccountQueryType;
        date: string;
        cashBalance?: number;
        accountEquity?: number;
        dayTradingBP?: number;
        stockLMV?: number;
        stockSMV?: number;
        optionsLMV?: number;
        optionsSMV?: number;
        creditBalance?: number;
        debitBalance?: number;
        houseRequirement?: number;
        houseExcessDeficit?: number;
        fedRequirement?: number;
        fedExcessDeficit?: number;
        balanceTrend?: {
          average: number;
          highest: number;
          highestDate: string;
          lowest: number;
          lowestDate: string;
          period: string;
        };
      };

      if (accountData.date) {
        return (
          <div style={{ marginTop: '12px' }}>
            <AccountSummary
              queryType={tradeUI.accountQueryType || accountData.queryType || 'account_summary'}
              date={accountData.date}
              cashBalance={accountData.cashBalance}
              accountEquity={accountData.accountEquity}
              dayTradingBP={accountData.dayTradingBP}
              stockLMV={accountData.stockLMV}
              stockSMV={accountData.stockSMV}
              optionsLMV={accountData.optionsLMV}
              optionsSMV={accountData.optionsSMV}
              creditBalance={accountData.creditBalance}
              debitBalance={accountData.debitBalance}
              houseRequirement={accountData.houseRequirement}
              houseExcessDeficit={accountData.houseExcessDeficit}
              fedRequirement={accountData.fedRequirement}
              fedExcessDeficit={accountData.fedExcessDeficit}
              balanceTrend={accountData.balanceTrend}
            />
          </div>
        );
      }
    }

    if (type === 'fees') {
      console.log('🎨 Rendering fees summary card with data:', data);
      const feesData = data as {
        feeType: FeeType;
        totalAmount: number;
        transactionCount: number;
        timePeriod: string;
        symbol?: string;
        breakdown?: Array<{
          date: string;
          amount: number;
          symbol?: string;
        }>;
      };

      if (feesData.feeType && feesData.totalAmount !== undefined) {
        return (
          <div style={{ marginTop: '12px' }}>
            <FeesSummary
              feeType={tradeUI.feeType || feesData.feeType}
              totalAmount={feesData.totalAmount}
              transactionCount={feesData.transactionCount}
              timePeriod={feesData.timePeriod}
              symbol={feesData.symbol}
              breakdown={feesData.breakdown}
            />
          </div>
        );
      }
    }

    return null;
  };

  // WebSocket keepalive to prevent inactivity timeout (ElevenLabs has 20s default timeout)
  // Send user activity ping every 15 seconds while voice is connected
  useEffect(() => {
    const isConnected = elevenLabsConversation.status === 'connected';

    if (isConnected && inputMode === 'voice') {
      // Start keepalive interval
      keepaliveIntervalRef.current = setInterval(() => {
        if (elevenLabsConversation.status === 'connected') {
          // sendUserActivity signals the agent that user is still active
          // This prevents the WebSocket from timing out due to inactivity
          elevenLabsConversation.sendUserActivity?.();
          console.log('🔄 Sent keepalive ping to ElevenLabs');
        }
      }, 15000); // 15 seconds (under the 20s default timeout)

      console.log('🟢 Started keepalive interval for voice connection');
    }

    return () => {
      if (keepaliveIntervalRef.current) {
        clearInterval(keepaliveIntervalRef.current);
        keepaliveIntervalRef.current = null;
        console.log('🔴 Cleared keepalive interval');
      }
    };
  }, [elevenLabsConversation.status, inputMode, elevenLabsConversation]);

  const isVoiceConnected = elevenLabsConversation.status === 'connected';
  const isVoiceConnecting = elevenLabsConversation.status === 'connecting';
  const isStreaming = isSending;

  // Format date for conversation list with time
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (days === 0) return `Today at ${timeStr}`;
    if (days === 1) return `Yesterday at ${timeStr}`;
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${timeStr}`;
  };

  // Styles (dark theme matching app)
  const styles = {
    // Floating widget button (pill style like screenshot)
    widgetButton: {
      position: 'fixed' as const,
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 8px 8px 12px',
      background: colors.bgCard,
      borderRadius: '40px',
      border: `1px solid ${colors.border}`,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
      cursor: 'pointer',
      zIndex: 9999,
      whiteSpace: 'nowrap' as const,
      maxWidth: 'calc(100vw - 32px)',
    },
    widgetOrb: {
      position: 'relative' as const,
      width: '32px',
      height: '32px',
      minWidth: '32px',
      borderRadius: '50%',
      background: `radial-gradient(circle at 50% 50%, #00ff08, ${colors.accent}, #008a04)`,
      boxShadow: 'inset 0 -2px 6px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 200, 6, 0.3)',
    },
    widgetOrbHighlight: {
      position: 'absolute' as const,
      top: '5px',
      left: '6px',
      width: '10px',
      height: '8px',
      borderRadius: '50%',
      background: 'rgba(255, 255, 255, 0.4)',
      filter: 'blur(1px)',
    },
    widgetOrbReflection: {
      position: 'absolute' as const,
      top: '3px',
      left: '5px',
      width: '5px',
      height: '4px',
      borderRadius: '50%',
      background: 'rgba(255, 255, 255, 0.7)',
    },
    widgetText: {
      color: colors.textSecondary,
      fontSize: '13px',
      fontWeight: 500,
      whiteSpace: 'nowrap' as const,
    },
    widgetCallBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 14px',
      background: colors.bgHover,
      border: `1px solid ${colors.border}`,
      borderRadius: '24px',
      color: colors.textSecondary,
      fontSize: '13px',
      fontWeight: 500,
      cursor: 'pointer',
      whiteSpace: 'nowrap' as const,
    },
    // Main card - centered on screen
    card: {
      position: 'fixed' as const,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '420px',
      height: '650px',
      maxHeight: '90vh',
      display: 'flex',
      flexDirection: 'column' as const,
      backgroundColor: colors.bgCard,
      borderRadius: '16px',
      border: `1px solid ${colors.border}`,
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
      overflow: 'hidden',
      zIndex: 9999,
    },
    // Header
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: `1px solid ${colors.border}`,
      backgroundColor: colors.bgSecondary,
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    backButton: {
      padding: '6px',
      backgroundColor: 'transparent',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      color: colors.textSecondary,
      display: 'flex',
      alignItems: 'center',
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: '14px',
      fontWeight: 600,
    },
    modeButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 12px',
      fontSize: '13px',
      fontWeight: 500,
      color: colors.textSecondary,
      backgroundColor: colors.bgHover,
      border: `1px solid ${colors.border}`,
      borderRadius: '6px',
      cursor: 'pointer',
    },
    iconButton: {
      padding: '8px',
      backgroundColor: 'transparent',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      color: colors.textSecondary,
      display: 'flex',
      alignItems: 'center',
    },
    // Messages
    messagesContainer: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '16px',
      backgroundColor: colors.bgPrimary,
    },
    messageRow: {
      display: 'flex',
      gap: '12px',
      marginBottom: '16px',
    },
    avatar: {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      backgroundColor: colors.accent,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: colors.bgPrimary,
      fontSize: '11px',
      fontWeight: 700,
      flexShrink: 0,
    },
    assistantBubble: {
      backgroundColor: colors.assistantBubble,
      borderRadius: '16px',
      borderTopLeftRadius: '4px',
      padding: '12px 16px',
      maxWidth: '300px',
    },
    userBubble: {
      backgroundColor: colors.userBubble,
      color: colors.bgPrimary,
      borderRadius: '16px',
      borderTopRightRadius: '4px',
      padding: '12px 16px',
      maxWidth: '280px',
      marginLeft: 'auto',
    },
    messageText: {
      fontSize: '14px',
      lineHeight: 1.5,
      margin: 0,
      whiteSpace: 'pre-wrap' as const,
    },
    // Input area
    inputArea: {
      padding: '16px',
      borderTop: `1px solid ${colors.border}`,
      backgroundColor: colors.bgSecondary,
    },
    inputForm: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
    },
    textInput: {
      width: '100%',
      padding: '12px 16px',
      fontSize: '14px',
      border: `1px solid ${colors.border}`,
      borderRadius: '8px',
      outline: 'none',
      backgroundColor: colors.bgCard,
      color: colors.textPrimary,
    },
    inputActions: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    endChatButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      fontSize: '13px',
      color: '#ff5000',
      backgroundColor: 'transparent',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
    },
    sendButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 20px',
      fontSize: '14px',
      fontWeight: 500,
      color: colors.bgPrimary,
      backgroundColor: colors.accent,
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
    },
    // History view
    historyContainer: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      backgroundColor: colors.bgPrimary,
    },
    historyHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px',
      borderBottom: `1px solid ${colors.border}`,
    },
    historyTitle: {
      color: colors.textPrimary,
      fontSize: '16px',
      fontWeight: 600,
    },
    newChatButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 16px',
      fontSize: '13px',
      fontWeight: 500,
      color: colors.bgPrimary,
      backgroundColor: colors.accent,
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
    },
    historyList: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '8px',
    },
    historyItem: {
      display: 'flex',
      flexDirection: 'column' as const,
      padding: '12px 16px',
      borderRadius: '8px',
      cursor: 'pointer',
      marginBottom: '4px',
      backgroundColor: 'transparent',
      border: 'none',
      width: '100%',
      textAlign: 'left' as const,
    },
    historyItemTitle: {
      color: colors.textPrimary,
      fontSize: '14px',
      fontWeight: 500,
      marginBottom: '4px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap' as const,
    },
    historyItemDate: {
      color: colors.textMuted,
      fontSize: '12px',
    },
    emptyHistory: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      color: colors.textMuted,
      fontSize: '14px',
      padding: '32px',
      textAlign: 'center' as const,
    },
  };

  // Closed state - floating widget
  if (!isOpen) {
    return (
      <div style={styles.widgetButton} onClick={handleOpen}>
        <div style={styles.widgetOrb}>
          <div style={styles.widgetOrbHighlight} />
          <div style={styles.widgetOrbReflection} />
        </div>
        <span style={styles.widgetText}>Need help?</span>
        <button style={styles.widgetCallBtn} onClick={(e) => { e.stopPropagation(); handleOpen(); }}>
          <Phone size={14} />
          Ask anything
        </button>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      {/* Minimize handle - tap to close */}
      <div
        onClick={handleClose}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '8px',
          cursor: 'pointer',
          backgroundColor: colors.bgSecondary,
        }}
      >
        <div style={{
          width: '36px',
          height: '4px',
          borderRadius: '2px',
          backgroundColor: colors.textMuted,
        }} />
      </div>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          {currentView === 'chat' && (
            <button onClick={() => setCurrentView('history')} style={styles.backButton} title="Chat history">
              <History size={18} />
            </button>
          )}
          <span style={styles.headerTitle}>
            {currentView === 'history' ? 'Chat History' : 'AI Assistant'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {currentView === 'chat' && (
            <>
              <button
                onClick={() => setShowQueryBuilder(true)}
                style={{
                  ...styles.modeButton,
                  backgroundColor: 'rgba(0, 200, 6, 0.1)',
                  borderColor: 'rgba(0, 200, 6, 0.3)',
                  color: '#00c806',
                }}
                title="Advanced Query Builder"
              >
                <Filter size={14} />
                Query
              </button>
              <button onClick={toggleMode} style={styles.modeButton}>
                {inputMode === 'text' ? (
                  <>
                    <Mic size={14} />
                    Voice
                  </>
                ) : (
                  <>
                    <MessageSquare size={14} />
                    Chat
                  </>
                )}
              </button>
            </>
          )}
          <button onClick={handleClose} style={styles.iconButton}>
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      {currentView === 'history' ? (
        // History view
        <div style={styles.historyContainer}>
          <div style={styles.historyHeader}>
            <span style={styles.historyTitle}>Recent Chats</span>
            <button onClick={handleNewChat} style={styles.newChatButton}>
              <Plus size={14} />
              New Chat
            </button>
          </div>
          <div style={styles.historyList}>
            {conversations.length === 0 ? (
              <div style={styles.emptyHistory}>
                <History size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <p>No conversations yet</p>
                <p style={{ fontSize: '12px', marginTop: '8px' }}>Start a new chat to begin</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  style={{
                    ...styles.historyItem,
                    backgroundColor: conv.id === currentConversationId ? colors.bgHover : 'transparent',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = conv.id === currentConversationId ? colors.bgHover : 'transparent'}
                >
                  <span style={styles.historyItemTitle}>{conv.title}</span>
                  <span style={styles.historyItemDate}>{formatDate(conv.updated_at)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : inputMode === 'text' ? (
        <>
          {/* Text Chat Messages */}
          <div ref={transcriptRef} style={styles.messagesContainer}>
            {/* Welcome Message */}
            {transcript.length === 0 && (
              <div style={styles.messageRow}>
                <div style={styles.avatar}>FA</div>
                <div style={styles.assistantBubble}>
                  <p style={{ ...styles.messageText, color: colors.textPrimary }}>
                    Hi, I&apos;m here to answer your questions about your portfolio. What would you like to know?
                  </p>
                </div>
              </div>
            )}

            {/* Messages */}
            {transcript.map((message) => (
              <div key={message.id}>
                <div
                  style={{
                    ...styles.messageRow,
                    justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {message.role === 'assistant' && (
                    <div style={styles.avatar}>FA</div>
                  )}
                  <div style={message.role === 'user' ? styles.userBubble : styles.assistantBubble}>
                    <p style={{ ...styles.messageText, color: message.role === 'user' ? colors.bgPrimary : colors.textPrimary }}>
                      {message.content}
                    </p>
                  </div>
                </div>
                {/* Render trade UI if available */}
                {message.tradeUI && renderTradeUI(message.tradeUI)}
              </div>
            ))}

            {/* Typing indicator */}
            {isStreaming && (
              <div style={styles.messageRow}>
                <div style={styles.avatar}>FA</div>
                <div style={styles.assistantBubble}>
                  <Loader2 size={16} style={{ color: colors.textSecondary, animation: 'spin 1s linear infinite' }} />
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div style={styles.inputArea}>
            <form onSubmit={handleSendMessage} style={styles.inputForm}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about your portfolio..."
                style={styles.textInput}
                disabled={isStreaming}
              />
              <div style={styles.inputActions}>
                <button type="button" onClick={handleEndChat} style={styles.endChatButton}>
                  <X size={14} />
                  End chat
                </button>
                <button
                  type="submit"
                  disabled={isStreaming || !inputValue.trim()}
                  style={{
                    ...styles.sendButton,
                    opacity: isStreaming || !inputValue.trim() ? 0.5 : 1,
                    cursor: isStreaming || !inputValue.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Send size={14} />
                  Send
                </button>
              </div>
            </form>
          </div>
        </>
      ) : (
        /* Voice Mode - Chat-style with transcript */
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: colors.bgPrimary, overflow: 'hidden', minHeight: 0 }}>
          {/* Voice Header with small orb */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: `1px solid ${colors.border}`,
            backgroundColor: colors.bgSecondary,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Small orb indicator */}
              <div style={{
                position: 'relative',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: isVoiceConnected
                  ? `radial-gradient(circle at 50% 50%, #00ff08, ${colors.accent}, #008a04)`
                  : colors.bgHover,
                boxShadow: isVoiceConnected ? '0 0 12px rgba(0, 200, 6, 0.5)' : 'none',
                animation: isVoiceConnected && elevenLabsConversation.isSpeaking ? 'pulse 1s infinite' : 'none',
              }}>
                <div style={{
                  position: 'absolute',
                  top: '5px',
                  left: '6px',
                  width: '8px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isVoiceConnected ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.2)',
                }} />
              </div>
              <div>
                <div style={{ color: colors.textPrimary, fontSize: '14px', fontWeight: 600 }}>
                  {isVoiceConnected ? (elevenLabsConversation.isSpeaking ? 'Speaking...' : 'Listening...') : 'Voice Call'}
                </div>
                <div style={{ color: colors.textMuted, fontSize: '12px' }}>
                  {isVoiceConnected ? 'Say something to talk' : 'Start a call to begin'}
                </div>
              </div>
            </div>
            {isVoiceConnected ? (
              <button onClick={stopVoiceSession} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 500,
                color: colors.textPrimary,
                backgroundColor: '#ff5000',
                border: 'none',
                borderRadius: '20px',
                cursor: 'pointer',
              }}>
                <Phone size={14} />
                End
              </button>
            ) : (
              <button onClick={startVoiceSession} disabled={isVoiceConnecting} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 500,
                color: colors.bgPrimary,
                backgroundColor: colors.accent,
                border: 'none',
                borderRadius: '20px',
                cursor: isVoiceConnecting ? 'not-allowed' : 'pointer',
                opacity: isVoiceConnecting ? 0.7 : 1,
              }}>
                {isVoiceConnecting ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Connecting
                  </>
                ) : (
                  <>
                    <Phone size={14} />
                    Call
                  </>
                )}
              </button>
            )}
          </div>

          {/* Transcript Area */}
          <div ref={transcriptRef} style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            paddingBottom: '8px',
            minHeight: 0,
          }}>
            {transcript.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: colors.textMuted,
                textAlign: 'center',
                padding: '32px',
              }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: `radial-gradient(circle at 50% 50%, #00ff08, ${colors.accent}, #008a04)`,
                  marginBottom: '16px',
                  opacity: 0.5,
                }} />
                <p style={{ fontSize: '14px', marginBottom: '8px' }}>
                  {isVoiceConnected ? 'Start speaking...' : 'Click "Call" to start a voice conversation'}
                </p>
                <p style={{ fontSize: '12px' }}>
                  Your conversation will appear here
                </p>
              </div>
            ) : (
              <>
                {transcript.map((msg) => (
                  <div key={msg.id}>
                    <div
                      style={{
                        display: 'flex',
                        gap: '12px',
                        marginBottom: '16px',
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      }}
                    >
                      {msg.role === 'assistant' && (
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          backgroundColor: colors.accent,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: colors.bgPrimary,
                          fontSize: '11px',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}>FA</div>
                      )}
                      <div style={{
                        backgroundColor: msg.role === 'user' ? colors.accent : colors.assistantBubble,
                        color: msg.role === 'user' ? colors.bgPrimary : colors.textPrimary,
                        borderRadius: '16px',
                        borderTopLeftRadius: msg.role === 'assistant' ? '4px' : '16px',
                        borderTopRightRadius: msg.role === 'user' ? '4px' : '16px',
                        padding: '12px 16px',
                        maxWidth: '280px',
                      }}>
                        <p style={{ fontSize: '14px', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                        </p>
                      </div>
                    </div>
                    {/* Render trade UI if available */}
                    {msg.tradeUI && renderTradeUI(msg.tradeUI)}
                  </div>
                ))}
                {/* Scroll anchor */}
                <div style={{ height: '1px' }} />
              </>
            )}
          </div>

          {/* Text Input for Voice Mode */}
          <div style={{
            padding: '12px 16px',
            borderTop: `1px solid ${colors.border}`,
            backgroundColor: colors.bgSecondary,
            flexShrink: 0,
          }}>
            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type a message..."
                disabled={isSending}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  fontSize: '14px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  outline: 'none',
                  backgroundColor: colors.bgCard,
                  color: colors.textPrimary,
                }}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isSending}
                style={{
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: colors.bgPrimary,
                  backgroundColor: colors.accent,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: inputValue.trim() && !isSending ? 'pointer' : 'not-allowed',
                  opacity: inputValue.trim() && !isSending ? 1 : 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
      `}</style>

      {/* Query Builder Modal */}
      {showQueryBuilder && (
        <QueryBuilder
          onExecute={handleQueryExecute}
          onClose={() => setShowQueryBuilder(false)}
          isLoading={isQueryLoading}
        />
      )}
    </div>
  );
};

// Component to load detailed trades data
function DetailedTradesLoader({ symbol }: { symbol: string }) {
  const [tradesData, setTradesData] = useState<{
    trades: Array<{
      TradeID: number;
      Date: string;
      Symbol: string;
      SecurityType: string;
      TradeType: string;
      StockTradePrice: string;
      StockShareQty: string;
      OptionContracts: string;
      OptionTradePremium: string;
      GrossAmount: string;
      NetAmount: string;
      Strike?: string;
      Expiration?: string;
      'Call/Put'?: string;
    }>;
    summary: {
      totalShares: number;
      totalCost: number;
      currentValue: number;
      symbol: string;
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/trades-ui', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol }),
        });
        const data = await res.json();
        if (data.trades) {
          setTradesData(data);
        }
      } catch (error) {
        console.error('Error loading trades:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [symbol]);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#8c8c8e' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '8px', fontSize: '14px' }}>Loading trades...</p>
      </div>
    );
  }

  if (!tradesData) {
    return null;
  }

  return <TradesTable trades={tradesData.trades} summary={tradesData.summary} />;
}

export default UnifiedAssistant;
