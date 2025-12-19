'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useConversation } from '@elevenlabs/react';
import { Mic, MessageSquare, X, Phone, Loader2, Plus, History, Send } from 'lucide-react';
import { TradesTable, type ActiveFilters, type Aggregations } from './generative-ui/TradesTable';
import { TradeSummary } from './generative-ui/TradeSummary';
import { TradeStats } from './generative-ui/TradeStats';
import { OptionStats } from './generative-ui/OptionStats';
import { ProfitableTrades } from './generative-ui/ProfitableTrades';
import { TimeBasedTrades } from './generative-ui/TimeBasedTrades';
import { TimePeriodStats } from './generative-ui/TimePeriodStats';
import { AveragePrice } from './generative-ui/AveragePrice';
import { BulkOptionsCard } from './generative-ui/BulkOptionsCard';
import { HighestStrikeCard } from './generative-ui/HighestStrikeCard';
import { TotalPremiumCard } from './generative-ui/TotalPremiumCard';
import { ExpiringOptionsTable } from './generative-ui/ExpiringOptionsTable';
import { LastOptionTradeCard } from './generative-ui/LastOptionTradeCard';
import { AccountSummary, type AccountQueryType } from './generative-ui/AccountSummary';
import { FeesSummary, type FeeType } from './generative-ui/FeesSummary';
import type { ClassificationResult } from '@/src/lib/intent-detection';
import { formatCalendarDate } from '@/src/lib/date-utils';
import { getOptionPremiumUSD, safeParseNumber } from '@/src/lib/trade-math';
import { parseOptionSymbol } from '@/src/lib/symbol-utils';

type InputMode = 'voice' | 'text';
type View = 'chat' | 'history';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface TradeUIData {
  type: 'summary' | 'detailed' | 'stats' | 'profitable' | 'time-based' | 'option-stats' | 'average-price' | 'advanced-options' | 'highest-strike' | 'total-premium' | 'expiring-options' | 'last-option' | 'account-balance' | 'fees';
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

// Query intent detected from USER's message (not agent response)
// This is more reliable than parsing agent's natural language response
interface QueryIntent {
  cardType: TradeUIData['type'];
  symbol?: string;
  tradeType?: 'buy' | 'sell';
  timePeriod?: string;
  callPut?: 'call' | 'put';
  expiration?: string;
  accountQueryType?: AccountQueryType;
  feeType?: FeeType;
  dateFilter?: { type: string; startDate?: string; endDate?: string; description: string };
}

// High-signal option intents where regex patterns are very reliable
function isHighSignalOptionIntent(intent: QueryIntent | null): boolean {
  if (!intent) return false;
  return (
    intent.cardType === 'last-option' ||
    intent.cardType === 'highest-strike' ||
    intent.cardType === 'total-premium' ||
    intent.cardType === 'expiring-options' ||
    intent.cardType === 'advanced-options'
  );
}

interface QueryIntentWithConfidence extends QueryIntent {
  confidence?: number;
}

function chooseIntent(
  userQuery: string,
  llmIntent: QueryIntentWithConfidence | null,
  regexIntent: QueryIntent | null
): QueryIntent | null {
  // If both agree, use LLM (has more entity extraction)
  if (llmIntent && regexIntent && llmIntent.cardType === regexIntent.cardType) {
    console.log('🎯 [Intent Choice] LLM and regex agree:', llmIntent.cardType);
    return llmIntent;
  }

  // If LLM is highly confident (>= 0.85), trust it even if regex differs
  if (llmIntent && (llmIntent.confidence ?? 0) >= 0.85) {
    console.log('🎯 [Intent Choice] LLM high confidence:', llmIntent.cardType, `(${((llmIntent.confidence ?? 0) * 100).toFixed(0)}%)`);
    return llmIntent;
  }

  // For high-signal option patterns (clear regex match), prefer regex when LLM is uncertain
  if (isHighSignalOptionIntent(regexIntent) && (!llmIntent || (llmIntent.confidence ?? 0) < 0.85)) {
    console.log('🎯 [Intent Choice] Regex high-signal pattern:', regexIntent?.cardType);
    return regexIntent;
  }

  // Default: prefer LLM if available, otherwise regex
  if (llmIntent) {
    console.log('🎯 [Intent Choice] Using LLM:', llmIntent.cardType);
    return llmIntent;
  }

  console.log('🎯 [Intent Choice] Fallback to regex:', regexIntent?.cardType || 'null');
  return regexIntent;
}

function formatUSDNoCommas(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '$0.00';
  return `$${num.toFixed(2)}`;
}

function formatUSDCurrency(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value);
  const safe = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(safe);
}

function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || `${singular}s`);
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length === 0) return '';
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`;
}

function isExplainCalculationQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    /\bhow\b.*\bcalculat/i.test(q) ||
    /\bshow\b.*\bcalculat/i.test(q) ||
    /\bshow\b.*\bmath\b/i.test(q) ||
    /\bshow\b.*\bwork\b/i.test(q) ||
    /\bbreak\s*down\b/i.test(q) ||
    /\bhow\b.*\bget\b.*\bthat\b/i.test(q) ||
    /\bhow\b.*\bcomputed\b/i.test(q)
  );
}

/**
 * Detect if user is accepting a suggestion ("Would you like to know more?")
 * Matches: "yes", "sure", "yeah", "tell me more", "show me", "okay", "please", etc.
 */
function isSuggestionFollowup(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (
    /^(yes|yeah|yep|yup|sure|ok|okay|please|alright|y|yea)\.?!?$/i.test(q) ||
    /^(tell|show)\s+(me|us)\s+(more|about|that)/i.test(q) ||
    /^(yes|yeah|sure|ok|okay),?\s+(please|go ahead|tell me|show me)/i.test(q) ||
    /^i('?d| would)\s+like\s+(to|that)/i.test(q) ||
    /^(go\s+ahead|do\s+it|proceed)/i.test(q) ||
    /^(sounds?\s+good|why\s+not|absolutely|definitely)/i.test(q)
  );
}

/**
 * Detect if user is asking a contextual follow-up with a time period change
 * Examples: "And what about the last three months?", "How about last quarter?", "What about this year?"
 *           "So how much has paid in the last three months?"
 * Returns the extracted time period if detected, null otherwise
 */
function detectContextualTimePeriodFollowup(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // Time period validation - must contain time-related words
  const timeWords = /\b(last|past|this|previous|yesterday|today|week|month|year|quarter|days?|months?|years?|\d+)\b/i;

  // Patterns for contextual follow-ups with time period changes
  const patterns = [
    // "and what about X", "how about X", "what about X"
    /^(?:and\s+)?(?:what|how)\s+about\s+(?:the\s+)?(.+?)\??$/i,
    // "and for X", "and in X"
    /^(?:and\s+)?(?:for|in)\s+(?:the\s+)?(.+?)\??$/i,
    // "show me the same for X"
    /^(?:show\s+me\s+)?(?:the\s+)?(?:same\s+(?:for|thing)\s+)?(?:for\s+)?(.+?)\??$/i,
    // "and X?" - short follow-up
    /^and\s+(?:the\s+)?(.+?)\??$/i,
    // "so how much [was paid/did I pay/has been paid] in/for the last X" - repeat question
    /^(?:so\s+)?how\s+much\s+(?:was\s+paid|did\s+i\s+pay|has\s+(?:been\s+)?paid|have\s+i\s+paid)?\s*(?:in|for)?\s*(?:the\s+)?(.+?)\??$/i,
    // "how much in/for X?" - shortened repeat
    /^how\s+much\s+(?:in|for)\s+(?:the\s+)?(.+?)\??$/i,
    // "what was it for X?" or "what is it for X?"
    /^what\s+(?:was|is)\s+it\s+(?:for|in)\s+(?:the\s+)?(.+?)\??$/i,
  ];

  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match && match[1]) {
      const timePart = match[1].trim();
      // Validate it looks like a time period
      if (timeWords.test(timePart)) {
        return timePart;
      }
    }
  }

  // Fallback: check if query is just a time period (e.g., "the last three months?", "last quarter?")
  const justTimePeriod = /^(?:the\s+)?(last|past|this)\s+(?:\d+\s+)?(week|month|year|quarter|days?|months?|years?)\??$/i;
  if (justTimePeriod.test(q)) {
    return q.replace(/\?$/, '').trim();
  }

  return null;
}

function normalizeTradeVerb(tradeType: string): 'buying' | 'selling' {
  const normalized = tradeType.trim().toUpperCase();
  if (normalized === 'B' || normalized === 'BUY') return 'buying';
  return 'selling';
}

function formatStrikeForDisplay(strike: number): string {
  if (!Number.isFinite(strike)) return '';
  if (Number.isInteger(strike)) return String(strike);
  return String(Number(strike.toFixed(3))).replace(/\.0+$/, '');
}

function parseOCCOptionSymbolDetails(symbol: string): { underlying: string; callPut: 'call' | 'put'; strike: number } | null {
  const match = symbol.match(/^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/);
  if (!match) return null;
  const [, underlying, , callPutRaw, strikeRaw] = match;
  const strike = Number.parseInt(strikeRaw, 10) / 1000;
  return {
    underlying,
    callPut: callPutRaw === 'C' ? 'call' : 'put',
    strike,
  };
}

function formatDateForHighestStrikeCard(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Generate dynamic variables for ElevenLabs conversation session.
 * These variables are injected into the agent's system prompt using {{variable_name}} syntax.
 * This allows the voice agent to know the current date/time for interpreting day-of-week queries.
 */
function getElevenLabsDynamicVariables(): Record<string, string> {
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];

  const dayOfWeek = dayNames[now.getDay()];
  const month = monthNames[now.getMonth()];
  const dayOfMonth = now.getDate();
  const year = now.getFullYear();

  // Get user's timezone
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Format: "Monday, December 15, 2025"
  const formattedDate = `${dayOfWeek}, ${month} ${dayOfMonth}, ${year}`;

  return {
    current_date: formattedDate,
    current_day: dayOfWeek,
    current_day_of_month: String(dayOfMonth),
    current_month: month,
    current_year: String(year),
    timezone: timezone,
  };
}

function buildAnswerOverride(intent: QueryIntent | null, tradeUI: TradeUIData | null): string | null {
  if (!intent || !tradeUI) return null;

  if (tradeUI.type === 'time-based') {
    const d = tradeUI.data as {
      timePeriod?: { description?: string; displayRange?: string };
      summary?: { totalTrades?: number; stockCount?: number; optionCount?: number; totalValue?: number };
      trades?: Array<{
        SecurityType: string;
        TradeType: string;
        Symbol: string;
        StockShareQty?: string;
        StockTradePrice?: string;
        OptionContracts?: string;
        OptionTradePremium?: string;
      }>;
    };
    const totalTrades = d.summary?.totalTrades ?? 0;
    const stockCount = d.summary?.stockCount ?? 0;
    const optionCount = d.summary?.optionCount ?? 0;
    const totalValue = d.summary?.totalValue ?? 0;
    const desc = d.timePeriod?.description || tradeUI.timePeriod || intent.timePeriod || '';
    const range = d.timePeriod?.displayRange ? ` from ${d.timePeriod.displayRange}` : '';
    const symbolText = tradeUI.symbol ? ` for ${tradeUI.symbol}` : '';

    const summaryText = `You executed ${totalTrades} total ${pluralize(totalTrades, 'trade')}${symbolText} ${desc}${range}: ${stockCount} ${pluralize(stockCount, 'stock trade')} and ${optionCount} ${pluralize(optionCount, 'option trade')} with a total value of ${formatUSDNoCommas(totalValue)}.`;

    const trades = d.trades || [];
    if (!trades.length) return summaryText;

    const descLower = desc.toLowerCase();
    const isShortPeriod = /\b(today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(descLower);
    const maxDetailsPerType = isShortPeriod ? Number.POSITIVE_INFINITY : 2;

    const stockTrades = trades.filter((t) => t.SecurityType === 'S');
    const optionTrades = trades.filter((t) => t.SecurityType === 'O');

    const stockPhrasesAll = stockTrades.map((t) => {
      const shares = Math.trunc(safeParseNumber(t.StockShareQty));
      const price = safeParseNumber(t.StockTradePrice);
      if (!shares || !Number.isFinite(price)) return null;
      const verb = normalizeTradeVerb(t.TradeType);
      return `${verb} ${shares} ${pluralize(shares, 'share')} of ${t.Symbol} at ${formatUSDNoCommas(price)}`;
    }).filter((v): v is string => Boolean(v));

    const optionPhrasesAll = optionTrades.map((t) => {
      const contracts = Math.trunc(safeParseNumber(t.OptionContracts));
      if (!contracts) return null;

      const verb = normalizeTradeVerb(t.TradeType);
      const parsed = parseOCCOptionSymbolDetails(t.Symbol);
      const underlying = parsed?.underlying || t.Symbol;
      const strikeText = parsed ? formatStrikeForDisplay(parsed.strike) : '';
      const callPutText = parsed?.callPut || 'option';
      const premium = safeParseNumber(t.OptionTradePremium);
      const premiumText = Number.isFinite(premium) && premium !== 0 ? ` at ${formatUSDNoCommas(premium)} premium` : '';

      if (strikeText) {
        return `${verb} ${contracts} ${underlying} $${strikeText} ${callPutText} ${pluralize(contracts, 'option', 'options')}${premiumText}`;
      }
      return `${verb} ${contracts} ${underlying} ${pluralize(contracts, 'option', 'options')}${premiumText}`;
    }).filter((v): v is string => Boolean(v));

    const stockPhrases = stockPhrasesAll.slice(0, maxDetailsPerType);
    const optionPhrases = optionPhrasesAll.slice(0, maxDetailsPerType);
    const stockMore = Math.max(0, stockPhrasesAll.length - stockPhrases.length);
    const optionMore = Math.max(0, optionPhrasesAll.length - optionPhrases.length);

    const stockSentence = stockPhrases.length
      ? ` Stock trades included ${joinPhrases(stockPhrases)}${stockMore ? ` (plus ${stockMore} more).` : '.'}`
      : '';
    const optionSentence = optionPhrases.length
      ? ` Option trades included ${joinPhrases(optionPhrases)}${optionMore ? ` (plus ${optionMore} more).` : '.'}`
      : '';

    return `${summaryText}${stockSentence}${optionSentence}`.trim();
  }

  if (tradeUI.type === 'detailed') {
    const d = tradeUI.data as {
      trades?: Array<{
        SecurityType: string;
        TradeType: string;
      }>;
      summary?: {
        totalShares?: number;
        totalCost?: number;
        currentValue?: number;
        symbol?: string;
      } | null;
    };

    const trades = d.trades || [];
    if (trades.length === 0) return null;

    const stockCount = trades.filter((t) => t.SecurityType === 'S').length;
    const optionCount = trades.filter((t) => t.SecurityType === 'O').length;

    const summary = d.summary || null;
    const totalShares = summary?.totalShares;
    const totalCost = summary?.totalCost;
    const currentValue = summary?.currentValue;
    const symbol = summary?.symbol || tradeUI.symbol;

    const sharesText = typeof totalShares === 'number' && Number.isFinite(totalShares)
      ? ` Total shares bought: ${Math.round(totalShares)}.`
      : '';
    const costText = typeof totalCost === 'number' && Number.isFinite(totalCost)
      ? ` Total buy cost: ${formatUSDNoCommas(totalCost)}.`
      : '';
    const valueText = typeof currentValue === 'number' && Number.isFinite(currentValue)
      ? ` Current estimated value: ${formatUSDNoCommas(currentValue)}.`
      : '';

    return `Here are your ${symbol} trades: ${stockCount} ${pluralize(stockCount, 'stock trade')} and ${optionCount} ${pluralize(optionCount, 'option trade')}.${sharesText}${costText}${valueText}`.trim();
  }

  if (tradeUI.type === 'profitable') {
    const d = tradeUI.data as {
      symbol?: string;
      timePeriod?: string | null;
      totalProfitableTrades?: number;
      totalProfit?: number;
      trades?: Array<{ profitLoss?: number; buyDate?: string; sellDate?: string }>;
    };
    const count = d.totalProfitableTrades ?? 0;
    const totalProfit = d.totalProfit ?? 0;
    const symbol = d.symbol || tradeUI.symbol;
    const period = d.timePeriod ? ` ${d.timePeriod}` : '';
    const top = (d.trades || []).slice().sort((a, b) => (b.profitLoss || 0) - (a.profitLoss || 0))[0];
    const topText = top
      ? ` Top profit was ${formatUSDNoCommas(top.profitLoss)} from ${top.buyDate} to ${top.sellDate}.`
      : '';
    return `You have ${count} profitable ${pluralize(count, 'trade')} for ${symbol}${period} with total realized profit ${formatUSDNoCommas(totalProfit)}.${topText}`;
  }

  if (tradeUI.type === 'average-price') {
    const d = tradeUI.data as {
      symbol?: string;
      averagePrice?: number | null;
      timePeriod?: string;
      tradeType?: 'buy' | 'sell' | 'all';
    };
    const symbol = d.symbol || tradeUI.symbol;
    const avg = d.averagePrice;
    const period = d.timePeriod || tradeUI.timePeriod || intent.timePeriod || 'this year';
    const action = d.tradeType === 'buy' ? 'bought' : d.tradeType === 'sell' ? 'sold' : 'traded';
    if (!avg || !Number.isFinite(avg)) {
      return `I don't see any ${action} trades for ${symbol} ${period}.`;
    }
    return `The average price you ${action} ${symbol} ${period} was ${formatUSDNoCommas(avg)} per share.`;
  }

	  if (tradeUI.type === 'stats') {
	    const stock = tradeUI.data as { stats?: { highestPrice?: number; highestPriceDate?: string | null; lowestPrice?: number; lowestPriceDate?: string | null; averagePrice?: number; tradeType?: string; timePeriod?: string | null } };
	    const s = stock.stats;
	    if (!s) return null;

    const symbol = tradeUI.symbol;
    const period = s.timePeriod || tradeUI.timePeriod || intent.timePeriod || 'this year';
    const tradedAs = (tradeUI.tradeType || s.tradeType) === 'sell' ? 'sold' : (tradeUI.tradeType || s.tradeType) === 'buy' ? 'bought' : 'traded';
    const highText = s.highestPrice ? `Highest price ${tradedAs}: ${formatUSDNoCommas(s.highestPrice)}${s.highestPriceDate ? ` on ${s.highestPriceDate}` : ''}.` : '';
    const lowText = s.lowestPrice ? ` Lowest price ${tradedAs}: ${formatUSDNoCommas(s.lowestPrice)}${s.lowestPriceDate ? ` on ${s.lowestPriceDate}` : ''}.` : '';
    const avgText = s.averagePrice ? ` Average price: ${formatUSDNoCommas(s.averagePrice)}.` : '';
	    return `${symbol} trade statistics for ${period}. ${highText}${lowText}${avgText}`.trim();
	  }

  if (tradeUI.type === 'last-option') {
    const d = tradeUI.data as {
      trades?: Array<{
        Date: string;
        Symbol: string;
        TradeType: string;
        'Call/Put': string;
        Strike: string;
        Expiration: string;
        OptionContracts: string;
        OptionTradePremium?: string;
        NetAmount: string;
        UnderlyingSymbol?: string;
      }>;
    };

    const trades = d.trades || [];
    if (!trades.length) return null;

    // Get the most recent (first) trade
    const trade = trades[0];
    const parsed = parseOCCOptionSymbolDetails(trade.Symbol);
    const underlying = trade.UnderlyingSymbol || parsed?.underlying || tradeUI.symbol || 'unknown';
    const contracts = Math.trunc(safeParseNumber(trade.OptionContracts));
    const strike = safeParseNumber(trade.Strike);
    const netAmount = safeParseNumber(trade.NetAmount);
    const grossPremium = getOptionPremiumUSD(trade);
    const totalPremium = netAmount !== 0 ? Math.abs(netAmount) : grossPremium;
    const perContract = contracts > 0 ? totalPremium / contracts : 0;
    const callPut = trade['Call/Put'] === 'C' ? 'call' : 'put';
    const action = trade.TradeType === 'B' ? 'bought' : 'sold';
    const premiumVerb = trade.TradeType === 'B' ? 'paying' : 'collecting';
    const displayDate = formatDateForHighestStrikeCard(trade.Date);
    const displayExpiration = formatDateForHighestStrikeCard(trade.Expiration);

    return `Your most recent ${callPut} option trade on ${underlying} was on ${displayDate}. You ${action} ${contracts} ${pluralize(contracts, 'contract')} of the $${formatStrikeForDisplay(strike)} strike, ${premiumVerb} ${formatUSDNoCommas(totalPremium)} total premium (${formatUSDNoCommas(perContract)} per contract). This option expires ${displayExpiration}.`;
  }

	  if (tradeUI.type === 'highest-strike') {
	    type ParsedHighestStrike = {
	      parsedFromText?: boolean;
	      symbol: string;
	      strike: number;
	      callPut: 'call' | 'put';
	      tradeType: 'buy' | 'sell';
	      date: string;
	      expiration: string;
	      contracts: number;
	      premium: number;
	      isHighest?: boolean;
	    };

	    const parsed = tradeUI.data as ParsedHighestStrike;
	    const period = tradeUI.timePeriod || intent.timePeriod || 'this year';

	    // If we explicitly parsed from agent text (legacy), keep date strings as-is so UI + transcript match.
	    if (parsed.parsedFromText) {
	      const action = parsed.tradeType === 'sell' ? 'sold' : 'bought';
	      const premiumVerb = parsed.tradeType === 'sell' ? 'collected' : 'paid';
	      const perContract = parsed.contracts > 0 ? parsed.premium / parsed.contracts : 0;
	      return `The highest strike ${parsed.callPut} option you ${action} on ${parsed.symbol} ${period} was the $${parsed.strike} strike. You ${action} ${parsed.contracts} ${pluralize(parsed.contracts, 'contract')} on ${parsed.date} for a total premium ${premiumVerb} of ${formatUSDNoCommas(parsed.premium)} (${formatUSDNoCommas(perContract)} per contract), expiring ${parsed.expiration}.`;
	    }

	    const d = tradeUI.data as {
	      trades?: Array<{
	        Date: string;
	        Symbol: string;
	        TradeType: string;
	        'Call/Put': string;
	        Strike: string;
	        Expiration: string;
	        OptionContracts: string;
	        NetAmount: string;
	        OptionTradePremium?: string;
	      }>;
	    };

	    const trades = d.trades || [];
	    if (!trades.length) return null;

	    const highestStrikeTrade = trades.slice().sort((a, b) => parseFloat(b.Strike) - parseFloat(a.Strike))[0];
	    const contracts = Math.trunc(safeParseNumber(highestStrikeTrade.OptionContracts));
	    const netAmount = safeParseNumber(highestStrikeTrade.NetAmount);
	    const grossPremium = getOptionPremiumUSD(highestStrikeTrade);
	    const totalPremium = netAmount !== 0 ? Math.abs(netAmount) : grossPremium;
	    const perContract = contracts > 0 ? totalPremium / contracts : 0;

	    const symbol = parseOptionSymbol(highestStrikeTrade.Symbol);
	    const callPut = highestStrikeTrade['Call/Put'] === 'C' ? 'call' : 'put';
	    const tradeType = highestStrikeTrade.TradeType === 'B' ? 'buy' : 'sell';
	    const action = tradeType === 'sell' ? 'sold' : 'bought';
	    const premiumVerb = tradeType === 'sell' ? 'collected' : 'paid';
	    const displayDate = formatDateForHighestStrikeCard(highestStrikeTrade.Date);
	    const displayExpiration = formatDateForHighestStrikeCard(highestStrikeTrade.Expiration);

	    return `The highest strike ${callPut} option you ${action} on ${symbol} ${period} was the $${Number.parseFloat(highestStrikeTrade.Strike)} strike. You ${action} ${contracts} ${pluralize(contracts, 'contract')} on ${displayDate} for a total premium ${premiumVerb} of ${formatUSDNoCommas(totalPremium)} (${formatUSDNoCommas(perContract)} per contract), expiring ${displayExpiration}.`;
	  }

  if (tradeUI.type === 'account-balance') {
    const d = tradeUI.data as {
      error?: string;
      queryType?: AccountQueryType;
      date?: string;
      cashBalance?: number;
      accountEquity?: number;
      dayTradingBP?: number;
      stockLMV?: number;
      stockSMV?: number;
      optionsLMV?: number;
      optionsSMV?: number;
      houseRequirement?: number;
      houseExcessDeficit?: number;
      balanceTrend?: {
        average: number;
        highest: number;
        highestDate: string;
        lowest: number;
        lowestDate: string;
        period: string;
        periodMonth?: string;
      };
    };

    if (!d || d.error || !d.date) return null;

    const queryType = tradeUI.accountQueryType || d.queryType || intent.accountQueryType || 'account_summary';
    const asOfDate = formatCalendarDate(d.date);

    if (queryType === 'cash_balance') {
      return `Your account cash balance as of ${asOfDate} is ${formatUSDCurrency(d.cashBalance)}`;
    }

    if (queryType === 'cash_and_equity') {
      return `Your account cash balance as of ${asOfDate} is ${formatUSDCurrency(d.cashBalance)}, and your account equity is ${formatUSDCurrency(d.accountEquity)}`;
    }

    if (queryType === 'buying_power') {
      return `Your day trading buying power as of ${asOfDate} is ${formatUSDCurrency(d.dayTradingBP)}`;
    }

    if (queryType === 'nlv') {
      return `Your net liquidation value as of ${asOfDate} is ${formatUSDCurrency(d.accountEquity)}`;
    }

    if (queryType === 'overnight_margin') {
      const houseRequirement = formatUSDCurrency(d.houseRequirement);
      const excessDeficit = d.houseExcessDeficit ?? 0;
      const label = excessDeficit >= 0 ? 'excess' : 'deficit';
      const amount = formatUSDCurrency(Math.abs(excessDeficit));
      return `Your house requirement as of ${asOfDate} is ${houseRequirement}, and your house ${label} is ${amount}`;
    }

    if (queryType === 'market_value') {
      return `The market value of your long stock positions is ${formatUSDCurrency(d.stockLMV)}, your long options positions is ${formatUSDCurrency(d.optionsLMV)}, your short stock positions is ${formatUSDCurrency(d.stockSMV)}, and your short options positions is ${formatUSDCurrency(d.optionsSMV)}`;
    }

    if (queryType === 'debit_balances' || queryType === 'credit_balances') {
      const trend = d.balanceTrend;
      if (!trend) return null;

      const monthLabel = trend.periodMonth || trend.period;
      const average = formatUSDCurrency(trend.average);
      const highestAmount = formatUSDCurrency(trend.highest);
      const lowestAmount = formatUSDCurrency(trend.lowest);
      const highestDate = formatCalendarDate(trend.highestDate);
      const lowestDate = formatCalendarDate(trend.lowestDate);

      const balanceType = queryType === 'debit_balances' ? 'debit' : 'credit';
      return `Your average ${balanceType} balance for the month of ${monthLabel} is ${average}.\nThe highest ${balanceType} balance was on ${highestDate} at ${highestAmount}.\nThe lowest ${balanceType} balance was on ${lowestDate} at ${lowestAmount}.`;
    }

    // Default: full summary
    return `Your account summary as of ${asOfDate}:\n\n* Cash Balance: ${formatUSDCurrency(d.cashBalance)}\n* Account Equity: ${formatUSDCurrency(d.accountEquity)}\n* Day Trading Buying Power: ${formatUSDCurrency(d.dayTradingBP)}\n* Stock Long Market Value: ${formatUSDCurrency(d.stockLMV)}\n* Stock Short Market Value: ${formatUSDCurrency(d.stockSMV)}\n* Options Long Market Value: ${formatUSDCurrency(d.optionsLMV)}\n* Options Short Market Value: ${formatUSDCurrency(d.optionsSMV)}`;
  }

  if (tradeUI.type === 'fees') {
    const d = tradeUI.data as {
      error?: string;
      feeType?: FeeType;
      totalAmount?: number;
      transactionCount?: number;
      timePeriod?: string;
      periodMonth?: string;
      symbol?: string;
      suggestion?: {
        period: string;
        amount: number;
        count: number;
        startDate: string;
        endDate: string;
      } | null;
    };

    if (!d || d.error || !d.feeType || d.totalAmount === undefined) return null;

    const feeType = tradeUI.feeType || d.feeType || intent.feeType || 'commission';
    const timePeriod = d.timePeriod || tradeUI.timePeriod || intent.timePeriod || '';
    const hasNoData = Math.abs(d.totalAmount) < 0.01 && (d.transactionCount || 0) === 0;

    // If no data found but we have a suggestion, show the suggestion text
    if (hasNoData && d.suggestion) {
      const feeTypeName = feeType === 'commission' ? 'commission' :
        feeType === 'credit_interest' ? 'credit interest' :
        feeType === 'debit_interest' ? 'debit interest' :
        feeType === 'locate_fee' ? 'locate fees' : 'fees';
      const symbolText = d.symbol ? ` for ${d.symbol}` : '';
      const suggestionAmount = formatUSDCurrency(d.suggestion.amount);
      return `No ${feeTypeName} found${symbolText} for ${timePeriod}. However, I found ${suggestionAmount} in ${feeTypeName} for ${d.suggestion.period}. Would you like to know more about that?`;
    }

    const amount = formatUSDCurrency(d.totalAmount);

    const monthFromLabel = (() => {
      if (d.periodMonth) return d.periodMonth;
      const m = timePeriod.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
      if (!m) return null;
      return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    })();

    if (feeType === 'commission') {
      if (monthFromLabel) return `The total commission you paid in the month of ${monthFromLabel} is ${amount}`;
      return `The total commission you paid for ${timePeriod} is ${amount}`;
    }

    if (feeType === 'credit_interest') {
      if (monthFromLabel) return `The total credit interest you received for the month of ${monthFromLabel} is ${amount}`;
      return `The total credit interest you received for ${timePeriod} is ${amount}`;
    }

    if (feeType === 'locate_fee') {
      const sym = (d.symbol || tradeUI.symbol || intent.symbol || '').toUpperCase();
      const period = /\bthis year\b/i.test(timePeriod) ? 'this year' : timePeriod;
      return `The total locate fees you paid for stock ${sym} ${period} is ${amount}`.trim();
    }

    // debit_interest
    if (/\blast week\b/i.test(timePeriod)) {
      return `The total debit interest you paid last week is ${amount}`;
    }
    if (monthFromLabel) return `The total debit interest you paid for the month of ${monthFromLabel} is ${amount}`;
    return `The total debit interest you paid for ${timePeriod} is ${amount}`;
  }

		  return null;
		}


function buildAveragePriceCalculationExplanation(tradeUI: TradeUIData | null): string | null {
  if (!tradeUI || tradeUI.type !== 'average-price') return null;
  const d = tradeUI.data as {
    symbol?: string;
    averagePrice?: number | null;
    timePeriod?: string;
    tradeType?: 'buy' | 'sell' | 'all';
    totalShares?: number;
    breakdown?: {
      totalNotional: number;
      trades: Array<{ date: string; shares: number; price: number; notional: number }>;
    };
  };

  const symbol = d.symbol || tradeUI.symbol;
  const period = d.timePeriod || tradeUI.timePeriod || 'this year';
  const tradeType = d.tradeType || tradeUI.tradeType || 'all';
  const action = tradeType === 'buy' ? 'bought' : tradeType === 'sell' ? 'sold' : 'traded';

  const breakdown = d.breakdown;
  const trades = breakdown?.trades || [];
  const totalShares = d.totalShares;
  const avg = d.averagePrice;

  if (!trades.length || !totalShares || !avg || !Number.isFinite(avg)) {
    return `I calculate the average ${action} price as a weighted average: total dollars ÷ total shares. I don't have the trade-by-trade breakdown for ${symbol} ${period} in this view.`;
  }

  const lines = trades
    .slice(0, 12)
    .map((t) => `- ${t.date}: ${Math.round(t.shares)} ${pluralize(Math.round(t.shares), 'share')} at ${formatUSDNoCommas(t.price)} (${formatUSDNoCommas(t.notional)})`);
  const more = trades.length > 12 ? `\n- …plus ${trades.length - 12} more ${pluralize(trades.length - 12, 'trade')}` : '';

  return `Here’s how I calculated it for ${symbol} ${period}:\n\n${lines.join('\n')}${more}\n\nTotal: ${formatUSDNoCommas(breakdown?.totalNotional ?? 0)} ÷ ${Math.round(totalShares)} ${pluralize(Math.round(totalShares), 'share')} = ${formatUSDNoCommas(avg)} per share.`;
}


/**
 * Detect query intent from USER's message (before sending to agent)
 * This is more reliable than parsing agent's variable responses
 */
function detectUserQueryIntent(query: string): QueryIntent | null {
  const lowerQuery = query.toLowerCase();

  // Speech recognition correction map - voice transcription often mishears stock tickers
  // These corrections are applied BEFORE symbol extraction
  const speechCorrections: Record<string, string> = {
    'm10': 'MTEN', 'm 10': 'MTEN', 'mtn': 'MTEN', 'emten': 'MTEN', 'em ten': 'MTEN',
    'lc id': 'LCID', 'l c i d': 'LCID', 'lucid': 'LCID',
    'ui path': 'PATH', 'you eye path': 'PATH',
    'bmnr': 'BMNR', 'b m n r': 'BMNR',
    'crcl': 'CRCL', 'c r c l': 'CRCL', 'circle': 'CRCL',
    'rgc': 'RGC', 'r g c': 'RGC',
  };

  // Company name to symbol mapping for user queries
  const companyToSymbol: Record<string, string> = {
    'apple': 'AAPL', 'google': 'GOOGL', 'alphabet': 'GOOGL',
    'amazon': 'AMZN', 'microsoft': 'MSFT', 'tesla': 'TSLA',
    'nvidia': 'NVDA', 'meta': 'META', 'facebook': 'META',
    'netflix': 'NFLX', 'amd': 'AMD', 'intel': 'INTC',
    'gamestop': 'GME', 'qualcomm': 'QCOM',
  };

  // Extract symbol from query - check company names first, then uppercase tickers
  let symbol: string | undefined;

  // FIRST: Check for speech recognition corrections (highest priority)
  for (const [misheard, correct] of Object.entries(speechCorrections)) {
    if (new RegExp(`\\b${misheard.replace(/\s+/g, '\\s*')}\\b`, 'i').test(lowerQuery)) {
      symbol = correct;
      break;
    }
  }

  // SECOND: Check for company names
  if (!symbol) {
    for (const [company, ticker] of Object.entries(companyToSymbol)) {
      if (new RegExp(`\\b${company}\\b`, 'i').test(lowerQuery)) {
        symbol = ticker;
        break;
      }
    }
  }

  // THIRD: Check for uppercase tickers (letters only)
  if (!symbol) {
    const symbolMatch = query.match(/\b([A-Z]{2,5})\b/g);
    symbol = symbolMatch?.find(s =>
      KNOWN_SYMBOLS.includes(s) ||
      !['THE', 'FOR', 'AND', 'ALL', 'MY', 'HOW', 'WHAT', 'SHOW', 'GET', 'DID', 'HAVE', 'HAS'].includes(s)
    );
  }

  // FOURTH: Check for alphanumeric patterns like M10, NVDA2 (speech recognition artifacts)
  if (!symbol) {
    const alphanumMatch = query.match(/\b([A-Z][A-Z0-9]{1,4})\b/g);
    const candidate = alphanumMatch?.find(s =>
      /[0-9]/.test(s) && // Must contain a digit (to avoid catching normal words)
      !['THE', 'FOR', 'AND', 'ALL', 'MY', 'HOW', 'WHAT', 'SHOW', 'GET', 'DID', 'HAVE', 'HAS', '1ST', '2ND', '3RD'].includes(s)
    );
    if (candidate) {
      // Check if this alphanumeric pattern has a known correction
      const corrected = speechCorrections[candidate.toLowerCase()];
      symbol = corrected || candidate;
    }
  }

  // Extract time period from query (comprehensive patterns)
  // Support both numeric (4) and spelled-out (four) numbers
  const numberPattern = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
  const timePeriodRegex = new RegExp(
    `\\b(today|yesterday|last\\s+week|this\\s+week|last\\s+month|this\\s+month|last\\s+year|this\\s+year|(?:last|past)\\s+${numberPattern}\\s+days?|(?:last|past)\\s+${numberPattern}\\s+months?|(?:last|past)\\s+${numberPattern}\\s+trading\\s+days?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b`,
    'i'
  );
  const timePeriodMatch = lowerQuery.match(timePeriodRegex);
  let timePeriod = timePeriodMatch?.[1];

  // Month name support (e.g., "in October", "month of October")
  if (!timePeriod) {
    const monthMatch = lowerQuery.match(/\b(?:month\s+of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
    if (monthMatch) timePeriod = monthMatch[1].toLowerCase();
  }

  // "for the month" defaults to current month if unspecified
  if (!timePeriod && /\bfor\s+the\s+month\b/i.test(lowerQuery)) {
    timePeriod = 'this month';
  }

  // Extract trade type context
  const isSellQuery = /\b(sold|sell|selling|short|written)\b/i.test(lowerQuery);
  const isBuyQuery = /\b(bought|buy|buying|long|purchased)\b/i.test(lowerQuery);
  const tradeType = isSellQuery ? 'sell' : isBuyQuery ? 'buy' : undefined;

  // Extract call/put context
  const isCallQuery = /\bcalls?\b/i.test(lowerQuery);
  const isPutQuery = /\bputs?\b/i.test(lowerQuery);
  const callPut = isCallQuery && !isPutQuery ? 'call' : isPutQuery && !isCallQuery ? 'put' : undefined;

  // 1. Account balance queries
  const isAccountQuery = /\b(account|balances?|buying\s*power|equity|margin|net\s*liquidation|nlv|market\s*value|withdraw|available\s+funds|available\s+cash|how\s+much\s+money)\b/i.test(lowerQuery);
  if (isAccountQuery) {
    let accountQueryType: AccountQueryType = 'account_summary';

    // Most-specific patterns first
    if (/\bdebit\s+balances?\b/i.test(lowerQuery)) accountQueryType = 'debit_balances';
    else if (/\bcredit\s+balances?\b/i.test(lowerQuery)) accountQueryType = 'credit_balances';
    else if (/\bhow\s+much\s+money\s+do\s+i\s+have\b/i.test(lowerQuery)) accountQueryType = 'cash_and_equity';
    else if (/\b(withdraw|available\s+funds|available\s+cash|cash\s*balance)\b/i.test(lowerQuery)) accountQueryType = 'cash_balance';
    else if (/buying\s*power/i.test(lowerQuery)) accountQueryType = 'buying_power';
    else if (/nlv|net\s*liquidation/i.test(lowerQuery)) accountQueryType = 'nlv';
    else if (/overnight\s+margin|margin/i.test(lowerQuery)) accountQueryType = 'overnight_margin';
    else if (/market\s*value/i.test(lowerQuery)) accountQueryType = 'market_value';
    else if (/account\s+summary|show\s+me\s+my\s+account|show\s+my\s+account\b/i.test(lowerQuery)) accountQueryType = 'account_summary';

    return { cardType: 'account-balance', accountQueryType, timePeriod };
  }

  // 2. Fees queries
  if (/\b(fees?|commissions?|interest|locate|borrow(?:ing)?)\b/i.test(lowerQuery)) {
    let feeType: FeeType = 'commission';
    if (/credit\s*interest/i.test(lowerQuery)) feeType = 'credit_interest';
    else if (/debit\s*interest|margin\s*interest/i.test(lowerQuery)) feeType = 'debit_interest';
    else if (/locate|borrow(?:ing)?|stock\s+borrow/i.test(lowerQuery)) feeType = 'locate_fee';
    return { cardType: 'fees', feeType, timePeriod, symbol };
  }

  // 3. Expiring options
  if (/\b(expir(?:ing|es?|ation))\s+(tomorrow|this\s+week|this\s+month)/i.test(lowerQuery) ||
      /options?\s+expir/i.test(lowerQuery)) {
    const expirationMatch = lowerQuery.match(/expir\w*\s+(tomorrow|this\s+week|this\s+month)/i) ||
                            lowerQuery.match(/(tomorrow|this\s+week|this\s+month)/i);
    return { cardType: 'expiring-options', expiration: expirationMatch?.[1] || 'tomorrow', symbol };
  }

  // 4. Last/most recent option trade (must come before bulk options)
  // Matches: "last call option", "last call options", "most recent put", "latest option"
  // Note: "options" plural still means "the last one" in context like "last call options I bought"
  if (/\b(last|most\s+recent|latest)\s+(call|put|options?)\b/i.test(lowerQuery)) {
    return { cardType: 'last-option', symbol, tradeType, callPut };
  }

  // 5. Highest/lowest strike (must come before bulk options)
  if (/\b(highest|lowest)\s+strike\b/i.test(lowerQuery)) {
    return { cardType: 'highest-strike', symbol, tradeType, callPut, timePeriod };
  }

  // 6. Total premium (must come before bulk options)
  if (/\btotal\s+premium\b/i.test(lowerQuery) || /\bpremium\s+(collected|paid|received)\b/i.test(lowerQuery)) {
    return { cardType: 'total-premium', symbol, tradeType, timePeriod };
  }

  // 7. Bulk options queries (all short/long calls/puts, option trades)
  // Matches: "show all the short calls", "all my short puts", "short call options on TSLA"
  const isBulkOptionsQuery =
    // Pattern: "show [me] [all] [the] [my] short/long calls/puts [options]"
    /\bshow\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:my\s+)?(short|long)?\s*(call|put)s?\s*(?:options?)?\b/i.test(lowerQuery) ||
    // Pattern: "all [the] [my] short/long calls/puts [options]"
    /\ball\s+(?:the\s+)?(?:my\s+)?(short|long)?\s*(call|put)s?\s*(?:options?)?\b/i.test(lowerQuery) ||
    // Pattern: "my short/long calls/puts [options]"
    /\bmy\s+(short|long)?\s*(call|put)s?\s*(?:options?)?\b/i.test(lowerQuery) ||
    // Pattern: "short/long calls/puts [options] on/for SYMBOL"
    /\b(short|long)\s+(call|put)s?\s*(?:options?)?\s+(on|for)\b/i.test(lowerQuery) ||
    // Pattern: "option trades"
    /\boption\s+trades?\b/i.test(lowerQuery);

  if (isBulkOptionsQuery) {
    return { cardType: 'advanced-options', symbol, tradeType, callPut, timePeriod };
  }

  // 8. Average price (simple average query - before general stats)
  if (/\b(average|avg)\s+(price|cost)\b/i.test(lowerQuery) &&
      !/\b(highest|lowest|max|min)\b/i.test(lowerQuery)) {
    return { cardType: 'average-price', symbol, tradeType, timePeriod };
  }

  // 9. Trade stats (highest/lowest price)
  if (/\b(highest|lowest|max|min)\s+(price|sold|bought|paid)\b/i.test(lowerQuery)) {
    return { cardType: 'stats', symbol, tradeType, timePeriod };
  }

  // 10. Profitable trades
  if (/\b(profitable|profit|gains?|winners?|winning)\b/i.test(lowerQuery)) {
    return { cardType: 'profitable', symbol };
  }

  // 11. Time-based trades (yesterday, last week, etc.) - MUST COME BEFORE detailed trades
  if (timePeriod && !symbol) {
    // Portfolio-wide time query (no symbol specified)
    return { cardType: 'time-based', symbol: undefined, timePeriod };
  }
  if (timePeriod && symbol) {
    // Symbol-specific time query
    return { cardType: 'time-based', symbol, timePeriod };
  }

  // 12. Trade summary (how many trades)
  if (/\b(how\s+many|count|number\s+of|total)\s+trades?\b/i.test(lowerQuery)) {
    return { cardType: 'summary', symbol };
  }

  // 13. Detailed trades (show trades, list trades, what did I trade)
  // Updated to handle "show my Apple trades" pattern (symbol between "my" and "trades")
  if (/\b(show|list|get|display|what)\s+(my\s+|did\s+I\s+)?(\w+\s+)*(all\s+)?trades?\b/i.test(lowerQuery) ||
      /\btrades?\s+(for|on)\s+/i.test(lowerQuery) ||
      /\bmy\s+\w+\s+trades?\b/i.test(lowerQuery)) {
    // If symbol detected and query mentions "trades", this is a detailed trades request
    return { cardType: 'detailed', symbol };
  }

  // 14. General symbol query (e.g., "AAPL" or "Apple" by itself, or "my Apple trades")
  if (symbol && /\btrades?\b/i.test(lowerQuery)) {
    return { cardType: 'detailed', symbol };
  }

  return null;
}

/**
 * Classify intent using GPT-based LLM classifier (via API)
 * Returns null if classification fails or confidence is too low
 */
async function classifyIntentViaAPI(query: string): Promise<QueryIntentWithConfidence | null> {
  if (process.env.NEXT_PUBLIC_DISABLE_LLM_CLASSIFIER === '1') {
    return null;
  }
  try {
    // Pass current date from browser for smart day-of-week interpretation
    // e.g., "Monday" should mean today if today is Monday
    const response = await fetch('/api/classify-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        currentDate: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      console.warn('[LLM Classifier] API error:', response.status, body);
      return null;
    }

    const { result } = await response.json() as { result: ClassificationResult | null };

    if (!result) {
      console.log('[LLM Classifier] No confident match from GPT');
      return null;
    }

    // Map ClassificationResult to QueryIntentWithConfidence format (includes confidence)
    return {
      cardType: result.cardType as QueryIntent['cardType'],
      symbol: result.entities.symbol,
      tradeType: result.entities.tradeType,
      timePeriod: result.entities.timePeriod,
      callPut: result.entities.callPut,
      expiration: result.entities.expiration,
      accountQueryType: result.entities.accountQueryType,
      feeType: result.entities.feeType,
      confidence: result.confidence,
    };
  } catch (error) {
    console.error('[LLM Classifier] Error:', error);
    return null;
  }
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

// Parse highest/lowest strike data directly from agent text
// This ensures UI card matches exactly what the agent said (no drift from separate API call)
interface ParsedHighestStrikeData {
  isHighest: boolean;
  callPut: 'call' | 'put';
  tradeType: 'buy' | 'sell';
  strike: number;
  date: string; // Keep as spoken date string
  expiration: string; // Keep as spoken date string
  contracts: number;
  premium: number;
  symbol: string;
}

function parseHighestStrikeFromText(text: string): ParsedHighestStrikeData | null {
  // Skip messages that are just "checking" without actual results
  const isJustChecking = /I'll check|let me check|checking your|retrieving|looking up/i.test(text);
  if (isJustChecking && !/(?:highest|lowest|strike|premium|contracts?|bought|sold)/i.test(text)) return null;

  // Detect highest/lowest strike responses
  const highestMatch = /(?:highest|maximum|top)\s+strike.*(?:call|put)|(?:sold|bought)\s+(?:a\s+quantity\s+of|\d+\s+contracts?\s+of).*\$\d+\s+strike/i.test(text);
  const lowestMatch = /(?:lowest|minimum|bottom)\s+strike.*(?:call|put)/i.test(text);

  if (!highestMatch && !lowestMatch) return null;

  // Parse strike price: "$220 strike" or "$192.5"
  const strikeMatch = text.match(/\$(\d+(?:\.\d+)?)\s*strike/i) || text.match(/\$(\d+(?:\.\d+)?)/);
  const strike = strikeMatch ? parseFloat(strikeMatch[1]) : 0;
  if (!strike) return null;

  const dateToken = '([A-Z][a-z]+\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s*\\d{4}|[A-Z][a-z]+\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})';
  // Parse trade date: "on September 10, 2025", "trade date September 10", or "on 9/10/2025"
  const dateMatch = text.match(new RegExp(`(?:on|trade\\s+date|traded)\\s+${dateToken}`, 'i'));
  const dateStr = dateMatch ? dateMatch[1] : '';

  // Parse expiration: "expiration on Oct 17", "expiring Oct 17", "expires on 10/17/2025"
  const expMatch =
    text.match(new RegExp(`(?:expir(?:ation|y|es|ing)|expires?)\\s+(?:on\\s+)?${dateToken}`, 'i')) ||
    text.match(new RegExp(`(?:with\\s+)?expiration\\s+(?:on\\s+)?${dateToken}`, 'i'));
  const expStr = expMatch ? expMatch[1] : '';

  // Parse contracts: "15 contracts" or "sold 15 contracts"
  const contractsMatch = text.match(/(\d+)\s+contracts?/i);
  const contracts = contractsMatch ? parseInt(contractsMatch[1]) : 0;

  // Parse premium: "$1416 in premium" or "collecting $1416"
  const premiumMatch =
    text.match(/premium\s+of\s+\$?\s*([\d,]+(?:\.\d+)?)/i) ||
    text.match(/(?:collecting|collected|received|paid)\s+\$?\s*([\d,]+(?:\.\d+)?)/i) ||
    text.match(/total\s+premium\s+(?:collected|paid)?\s*(?:was|of|:)?\s*\$?\s*([\d,]+(?:\.\d+)?)/i) ||
    text.match(/\$?\s*([\d,]+(?:\.\d+)?)\s+(?:in\s+)?premium/i);
  const premium = premiumMatch ? parseFloat(premiumMatch[1].replace(/,/g, '')) : 0;

  // Determine call/put
  let callPut: 'call' | 'put' = 'call';
  if (/\bput\b/i.test(text) && !/\bcall\b/i.test(text)) callPut = 'put';

  // Determine trade type
  let tradeType: 'buy' | 'sell' = 'sell';
  if (/\b(?:bought|purchased|buying)\b/i.test(text)) tradeType = 'buy';

  // Extract symbol from text (company name or ticker)
  let symbol = 'AAPL';
  const symbolPatterns = [
    { pattern: /Apple\s+Inc|Apple/i, ticker: 'AAPL' },
    { pattern: /\bAAPL\b/, ticker: 'AAPL' },
    { pattern: /Tesla/i, ticker: 'TSLA' },
    { pattern: /\bTSLA\b/, ticker: 'TSLA' },
    { pattern: /Google|Alphabet/i, ticker: 'GOOGL' },
    { pattern: /\bGOOGL?\b/, ticker: 'GOOGL' },
    { pattern: /Nvidia/i, ticker: 'NVDA' },
    { pattern: /\bNVDA\b/, ticker: 'NVDA' },
    { pattern: /\bSPY\b/, ticker: 'SPY' },
  ];
  for (const { pattern, ticker } of symbolPatterns) {
    if (pattern.test(text)) {
      symbol = ticker;
      break;
    }
  }

  return {
    isHighest: highestMatch,
    callPut,
    tradeType,
    strike,
    date: dateStr,
    expiration: expStr,
    contracts,
    premium,
    symbol
  };
}

function isCompleteHighestStrikeParse(parsed: ParsedHighestStrikeData): boolean {
  return (
    parsed.strike > 0 &&
    parsed.contracts > 0 &&
    parsed.premium > 0 &&
    parsed.date.trim().length > 0 &&
    parsed.expiration.trim().length > 0
  );
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
  // 4. "N option trades" or "N call/put trades" - mentions trade count (but NOT in "stock trades and option trades" summaries)
  // 5. "total premium of $X" with contracts mention - bulk sale/purchase

  // Check if this is a portfolio summary with both stock and option trades
  // Patterns like "5 stock trades and 3 option trades" should NOT trigger bulk options
  // Must cover all variants from detectAllTradesQuery
  const isPortfolioSummary = /\d+\s+stock\s+trades?\s+and\s+\d+\s+option\s+trades?/i.test(text) ||
                             /\d+\s+stock\s+and\s+\d+\s+option\s+trades?/i.test(text) ||
                             /includes?\s+\d+\s+stock\s+trades?\s+and\s+\d+\s+option\s+trades?/i.test(text) ||
                             /executed\s+\d+\s+trades?\s+(?:yesterday|today|last\s+week|this\s+week|last\s+month)/i.test(text);

  const hasBulkTrades = !isPortfolioSummary && (
                        /across\s+\d+\s+trades/i.test(text) ||
                        /covering\s+[\d,]+\s+shares\s+across/i.test(text) ||
                        /you\s+(?:bought|sold)\s+\d+\s+(?:call|put)\s+option\s+contracts/i.test(text) ||
                        /\d+\s+(?:call|put)\s+option\s+contracts/i.test(text) ||
                        /total\s+premium\s+of\s+\$[\d,]+.*contracts/i.test(text) ||
                        /collecting\s+total\s+premium/i.test(text) ||
                        /\d+\s+option\s+trades/i.test(text));

  console.log('🔍 detectBulkOptionsQuery checking:', text.substring(0, 150));
  console.log('🔍 hasBulkTrades patterns:', {
    isPortfolioSummary,
    acrossNTrades: /across\s+\d+\s+trades/i.test(text),
    coveringShares: /covering\s+[\d,]+\s+shares\s+across/i.test(text),
    youSoldContracts: /you\s+(?:bought|sold)\s+\d+\s+(?:call|put)\s+option\s+contracts/i.test(text),
    NContracts: /\d+\s+(?:call|put)\s+option\s+contracts/i.test(text),
    totalPremiumContracts: /total\s+premium\s+of\s+\$[\d,]+.*contracts/i.test(text),
    collectingTotalPremium: /collecting\s+total\s+premium/i.test(text),
    NOptionTrades: /\d+\s+option\s+trades/i.test(text),
  });
  console.log('🔍 hasBulkTrades result:', hasBulkTrades, '(skipped if isPortfolioSummary)');

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
  // IMPORTANT: Check account_summary FIRST since it contains multiple fields (cash, equity, buying power, etc.)
  // If we detect "account summary" or multiple balance fields mentioned together, it's a full summary
  const hasAccountSummary = /account\s+summary/i.test(text);
  const hasMultipleFields = (
    /cash\s+balance/i.test(text) &&
    /account\s+equity/i.test(text) &&
    /buying\s+power/i.test(text)
  );
  if (hasAccountSummary || hasMultipleFields) {
    return { queryType: 'account_summary', timePeriod };
  }

  // Cash + equity patterns (but not a full account summary)
  if (/cash\s+balance/i.test(text) && /account\s+equity/i.test(text)) {
    return { queryType: 'cash_and_equity', timePeriod };
  }

  // Margin patterns (check before market value since margin responses may mention stock values)
  if (/overnight\s+margin|house\s+requirement|margin\s+(?:status|requirement)|fed(?:eral)?\s+requirement/i.test(text)) {
    return { queryType: 'overnight_margin', timePeriod };
  }

  // Market value patterns (check before cash/buying power since it mentions stock/options long/short)
  if (/market\s+value.*position|position.*market\s+value/i.test(text)) {
    return { queryType: 'market_value', timePeriod };
  }
  // Also detect when response lists stock AND option long/short values together
  if (/stock\s+long.*stock\s+short|options?\s+long.*options?\s+short/i.test(text)) {
    return { queryType: 'market_value', timePeriod };
  }

  // Debit balance patterns (check before cash since "debit balance" is more specific)
  if (/debit\s+balance/i.test(text)) {
    return { queryType: 'debit_balances', timePeriod };
  }

  // Credit balance patterns
  if (/credit\s+balance/i.test(text)) {
    return { queryType: 'credit_balances', timePeriod };
  }

  // Buying power patterns
  if (/buying\s+power|day\s+trading\s+(?:bp|buying\s+power)/i.test(text)) {
    return { queryType: 'buying_power', timePeriod };
  }

  // NLV patterns
  if (/\bNLV\b|net\s+liquidation/i.test(text)) {
    return { queryType: 'nlv', timePeriod };
  }

  // Cash balance patterns (checked last among specific queries)
  if (/cash\s+balance|available\s+(?:cash|funds)|can\s+(?:you\s+)?withdraw/i.test(text)) {
    return { queryType: 'cash_balance', timePeriod };
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

  // Debit interest patterns (includes "short interest" and "debit balance charges")
  if (/debit\s+interest|interest\s+(?:paid|you\s+paid)|margin\s+interest|short\s+interest|debit\s+balance\s+charge/i.test(text)) {
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
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const keepaliveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Reconnection state for auto-reconnect on unexpected disconnects
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 3;
  const baseReconnectDelay = 2000; // 2 seconds, doubles each attempt
  const inputModeRef = useRef<InputMode>(inputMode);
  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  console.log('🎤 ElevenLabs Agent ID being used:', agentId);

  // Track if we've set a title for current voice conversation
  const voiceTitleSetRef = useRef(false);
  // Track if we're resuming from history (don't clear transcript)
  const isResumingFromHistoryRef = useRef(false);
  // Store the pending query intent detected from user's message
  // This is used to determine which UI card to show when agent responds
  const pendingQueryIntentRef = useRef<QueryIntent | null>(null);
  // Prefetched trade UI for the pending query (rendered after assistant text)
  const pendingTradeUIRequestRef = useRef<Promise<TradeUIData | null> | null>(null);
  // Optional deterministic answer override computed from the same data as the UI card.
  // This prevents hallucinated numbers that disagree with the rendered UI.
  const pendingAnswerOverrideRef = useRef<Promise<string | null> | null>(null);
  // Stores the most recently rendered assistant card, used for follow-ups like
  // "how are you calculating this?"
  const lastAssistantTradeUIRef = useRef<TradeUIData | null>(null);
  // Stores the last data suggestion offered (for "would you like to know more?" follow-ups)
  const lastSuggestionRef = useRef<{
    feeType: FeeType;
    timePeriod: string;
    startDate: string;
    endDate: string;
    amount: number;
    count: number;
    symbol?: string;
  } | null>(null);
  // Used to avoid rendering a new UI card for purely explanatory follow-ups.
  const suppressNextTradeUICardRef = useRef(false);
  // Track when an intent-based card was rendered to prevent fallback from overriding
  // (ElevenLabs can send multiple message events for the same query)
  const lastIntentCardRenderedAtRef = useRef<number>(0);
  // Voice transcripts can arrive very close to the assistant's response. We optimistically
  // set a "fast" intent immediately, then optionally refine with the LLM classifier.
  const pendingVoiceIntentTokenRef = useRef(0);
  // Track the last processed message to prevent duplicates
  // ElevenLabs SDK can sometimes fire onMessage multiple times for the same message
  const lastProcessedTextMessageRef = useRef<{ content: string; timestamp: number } | null>(null);
  const lastProcessedVoiceMessageRef = useRef<{ content: string; timestamp: number } | null>(null);
  // UI data set directly by client tools - bypasses pattern matching for reliable rendering
  // This ensures voice response and UI card use the SAME data (no drift)
  const toolUIDataRef = useRef<TradeUIData | null>(null);

  function isIdleNudgeMessage(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return true;
    if (/^\.*$/.test(trimmed)) return true;
    if (/^(one|just)\s+moment\.?$/i.test(trimmed)) return true;
    if (/^hello\?\s*are you (still )?there\?/i.test(trimmed)) return true;
    if (/are you (still )?there\?/i.test(trimmed) && /ready to help you/i.test(trimmed)) return true;
    if (/i'?m here to help you/i.test(trimmed) && /whenever you're ready|when you return/i.test(trimmed)) return true;
    return false;
  }

  function isJustCheckingMessage(text: string): boolean {
    return /I'll check|let me check|checking your|retrieving|looking up/i.test(text);
  }

  function isSessionGreetingMessage(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (!/^hello\b/i.test(trimmed)) return false;
    return /portfolio/i.test(trimmed) && /(what would you like to know|how can i help|ask about)/i.test(trimmed);
  }

  function isTransientAssistantMessage(text: string): boolean {
    const trimmed = text.trim();
    if (isIdleNudgeMessage(trimmed)) return true;
    if (!isJustCheckingMessage(trimmed)) return false;
    // Allow "let me check... <answer>" style messages through.
    return !/(?:executed|here\s+are|found|no\s+trades|total\s+trades|bought|sold|premium|strike|contracts?|shares?)/i.test(trimmed);
  }

  const clientTools = useMemo(() => {
    const postJson = async (endpoint: string, body: Record<string, unknown>) => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return await res.json();
    };

    const unwrapResponse = (payload: unknown): string => {
      if (payload && typeof payload === 'object' && 'response' in payload) {
        const response = (payload as { response?: unknown }).response;
        if (typeof response === 'string') return response;
      }
      try {
        return JSON.stringify(payload);
      } catch {
        return String(payload);
      }
    };

    const getString = (params: Record<string, unknown>, key: string): string | undefined => {
      const value = params[key];
      return typeof value === 'string' ? value : undefined;
    };

    const getToolSymbol = (params: Record<string, unknown>): string | undefined => {
      return (
        getString(params, 'symbol') ||
        getString(params, 'ticker') ||
        getString(params, 'underlying') ||
        getString(params, 'company')
      );
    };

    const get_trade_summary = async (parameters: Record<string, unknown>) => {
      const symbol = getToolSymbol(parameters);
      const payload = await postJson('/api/elevenlabs/trade-summary', { symbol });
      // Store UI data for rendering
      toolUIDataRef.current = { type: 'summary', symbol: symbol || '', data: payload };
      console.log('📊 [Trade Summary Tool] Set toolUIDataRef:', toolUIDataRef.current);
      return unwrapResponse(payload);
    };

    const get_detailed_trades = async (parameters: Record<string, unknown>) => {
      console.log('📊 [Detailed Trades Tool] ================================');
      console.log('📊 [Detailed Trades Tool] Parameters:', JSON.stringify(parameters, null, 2));

      // CRITICAL: Use LLM-corrected symbol from intent classifier if available
      const rawSymbol = getToolSymbol(parameters);
      const llmSymbol = pendingQueryIntentRef.current?.symbol;
      const symbol = llmSymbol || rawSymbol;

      console.log('📊 [Detailed Trades] Raw symbol:', rawSymbol);
      console.log('📊 [Detailed Trades] LLM-corrected symbol:', llmSymbol);
      console.log('📊 [Detailed Trades] Using symbol:', symbol);

      // SINGLE FETCH: Voice endpoint returns BOTH response AND uiData
      const voicePayload = await postJson('/api/elevenlabs/detailed-trades', { symbol });

      // Store UI data from voice response (guaranteed sync)
      if (voicePayload && typeof voicePayload === 'object' && 'uiData' in voicePayload) {
        toolUIDataRef.current = { type: 'detailed', symbol: symbol || '', data: voicePayload.uiData };
        console.log('📊 [Detailed Trades Tool] Set toolUIDataRef from voice response:', toolUIDataRef.current);
      }

      console.log('📊 [Detailed Trades Tool] ================================');
      return unwrapResponse(voicePayload);
    };

    const get_trade_stats = async (parameters: Record<string, unknown>) => {
      const symbol = getToolSymbol(parameters);
      const tradeType = getString(parameters, 'trade_type');
      const timePeriod = getString(parameters, 'time_period');
      // Fetch both stock and option stats for UI
      const [stockData, optionData] = await Promise.all([
        postJson('/api/trade-stats', { symbol, tradeType: tradeType || 'all', timePeriod }),
        postJson('/api/option-stats', { symbol, tradeType: tradeType || 'all', timePeriod }),
      ]);
      // Store UI data for rendering
      toolUIDataRef.current = { type: 'stats', symbol: symbol || '', tradeType: tradeType as 'buy' | 'sell' | undefined, timePeriod, data: stockData, optionData };
      console.log('📊 [Trade Stats Tool] Set toolUIDataRef:', toolUIDataRef.current);
      // Get voice response
      const voicePayload = await postJson('/api/elevenlabs/trade-stats', { symbol, trade_type: tradeType, time_period: timePeriod });
      return unwrapResponse(voicePayload);
    };

    const get_profitable_trades = async (parameters: Record<string, unknown>) => {
      const symbol = getToolSymbol(parameters);
      const timePeriod = getString(parameters, 'time_period');
      // Fetch UI data
      const uiPayload = await postJson('/api/profitable-trades-ui', { symbol, timePeriod });
      // Store UI data for rendering
      toolUIDataRef.current = { type: 'profitable', symbol: symbol || '', timePeriod, data: uiPayload };
      console.log('📊 [Profitable Trades Tool] Set toolUIDataRef:', toolUIDataRef.current);
      // Get voice response
      const voicePayload = await postJson('/api/elevenlabs/profitable-trades', { symbol, time_period: timePeriod });
      return unwrapResponse(voicePayload);
    };

    const get_time_based_trades = async (parameters: Record<string, unknown>) => {
      console.log('📊 [Time Based Trades Tool] ================================');
      console.log('📊 [Time Based Trades Tool] Parameters:', JSON.stringify(parameters, null, 2));

      // CRITICAL: Use LLM-corrected symbol from intent classifier if available
      const rawSymbol = getToolSymbol(parameters);
      const llmSymbol = pendingQueryIntentRef.current?.symbol;
      const symbol = llmSymbol || rawSymbol;

      console.log('📊 [Time Based Trades] Raw symbol:', rawSymbol);
      console.log('📊 [Time Based Trades] LLM-corrected symbol:', llmSymbol);
      console.log('📊 [Time Based Trades] Using symbol:', symbol);

      const timePeriod = getString(parameters, 'time_period');
      const calculation = getString(parameters, 'calculation');
      const tradeType = getString(parameters, 'trade_type');

      // SINGLE FETCH: Voice endpoint returns BOTH response AND uiData
      const voicePayload = await postJson('/api/elevenlabs/time-trades', { symbol, time_period: timePeriod, calculation, trade_type: tradeType });

      // Store UI data from voice response (guaranteed sync)
      if (voicePayload && typeof voicePayload === 'object' && 'uiData' in voicePayload) {
        toolUIDataRef.current = { type: 'time-based', symbol: symbol || '', timePeriod, data: voicePayload.uiData };
        console.log('📊 [Time Based Trades Tool] Set toolUIDataRef from voice response:', toolUIDataRef.current);
      }

      console.log('📊 [Time Based Trades Tool] ================================');
      return unwrapResponse(voicePayload);
    };

    const get_advanced_trades = async (parameters: Record<string, unknown>) => {
      const symbol = getToolSymbol(parameters);
      const securityType = getString(parameters, 'security_type');
      const tradeType = getString(parameters, 'trade_type');
      const callPut = getString(parameters, 'call_put');
      const fromDate = getString(parameters, 'from_date');
      const toDate = getString(parameters, 'to_date');
      const expiration = getString(parameters, 'expiration');
      // Fetch UI data
      const uiPayload = await postJson('/api/advanced-query-ui', {
        symbol: symbol || undefined,
        securityType: securityType === 'option' ? 'O' : securityType === 'stock' ? 'S' : undefined,
        tradeType: tradeType === 'buy' ? 'B' : tradeType === 'sell' ? 'S' : undefined,
        callPut: callPut === 'call' ? 'C' : callPut === 'put' ? 'P' : undefined,
        fromDate,
        toDate,
        expiration,
      });
      // Store UI data for rendering
      toolUIDataRef.current = {
        type: 'advanced-options',
        symbol: symbol || '',
        tradeType: tradeType as 'buy' | 'sell' | undefined,
        callPut: callPut as 'call' | 'put' | undefined,
        expiration,
        data: uiPayload
      };
      console.log('📊 [Advanced Trades Tool] Set toolUIDataRef:', toolUIDataRef.current);
      // Get voice response
      const voicePayload = await postJson('/api/elevenlabs/advanced-query', {
        symbol, security_type: securityType, trade_type: tradeType, call_put: callPut,
        from_date: fromDate, to_date: toDate, expiration,
        strike: parameters['strike'], aggregation: getString(parameters, 'aggregation'),
        limit: parameters['limit'], order_by: getString(parameters, 'order_by'),
      });
      return unwrapResponse(voicePayload);
    };

    const get_account_balance = async (parameters: Record<string, unknown>) => {
      console.log('💰 [Account Balance Tool] ================================');
      console.log('💰 [Account Balance Tool] Parameters:', JSON.stringify(parameters, null, 2));
      const queryType = getString(parameters, 'query_type');
      const timePeriod = getString(parameters, 'time_period');

      // SINGLE FETCH: Voice endpoint returns BOTH response AND uiData
      const voicePayload = await postJson('/api/elevenlabs/account-balance', { query_type: queryType, time_period: timePeriod });

      // Store UI data from voice response (guaranteed sync)
      if (voicePayload && typeof voicePayload === 'object' && 'uiData' in voicePayload) {
        toolUIDataRef.current = {
          type: 'account-balance',
          symbol: '',
          accountQueryType: queryType as AccountQueryType,
          data: voicePayload.uiData
        };
        console.log('💰 [Account Balance Tool] Set toolUIDataRef from voice response:', toolUIDataRef.current);
      }

      const result = unwrapResponse(voicePayload);
      console.log('💰 [Account Balance Tool] Webhook Response:', result);
      console.log('💰 [Account Balance Tool] ================================');
      return result;
    };

    const get_fees = async (parameters: Record<string, unknown>) => {
      console.log('💸 [Fees Tool] ================================');
      console.log('💸 [Fees Tool] Parameters:', JSON.stringify(parameters, null, 2));
      const feeType = getString(parameters, 'fee_type');
      const timePeriod = getString(parameters, 'time_period');

      // CRITICAL: Use LLM-corrected symbol from intent classifier if available
      // This fixes speech-to-text errors like "M10" → "MTEN"
      const rawSymbol = getToolSymbol(parameters);
      const llmSymbol = pendingQueryIntentRef.current?.symbol;
      const symbol = llmSymbol || rawSymbol;

      console.log('💸 [Fees Tool] Raw symbol from ElevenLabs:', rawSymbol);
      console.log('💸 [Fees Tool] LLM-corrected symbol:', llmSymbol);
      console.log('💸 [Fees Tool] Using symbol:', symbol);

      // SINGLE FETCH: Voice endpoint returns BOTH response AND uiData
      const voicePayload = await postJson('/api/elevenlabs/fees', { fee_type: feeType, time_period: timePeriod, symbol });

      // Store UI data from voice response (guaranteed sync)
      if (voicePayload && typeof voicePayload === 'object' && 'uiData' in voicePayload) {
        toolUIDataRef.current = {
          type: 'fees',
          symbol: symbol || '',
          feeType: feeType as FeeType,
          timePeriod,
          data: voicePayload.uiData
        };
        console.log('💸 [Fees Tool] Set toolUIDataRef from voice response:', toolUIDataRef.current);
      }

      const result = unwrapResponse(voicePayload);
      console.log('💸 [Fees Tool] Webhook Response:', result);
      console.log('💸 [Fees Tool] ================================');
      return result;
    };

    return {
      get_trade_summary,
      get_detailed_trades,
      get_trade_stats,
      get_profitable_trades,
      get_time_based_trades,
      get_advanced_trades,
      get_account_balance,
      get_fees,

      // Aliases (in case tool names are camelCased in ElevenLabs UI)
      getTradeSummary: get_trade_summary,
      getDetailedTrades: get_detailed_trades,
      getTradeStats: get_trade_stats,
      getProfitableTrades: get_profitable_trades,
      getTimeBasedTrades: get_time_based_trades,
      getAdvancedTrades: get_advanced_trades,
      getAccountBalance: get_account_balance,
      getFees: get_fees,
    };
  }, []);

// Text-only ElevenLabs conversation (no voice, just text)
  const textOnlyConversation = useConversation({
    textOnly: true,
    clientTools,
    onMessage: async (message) => {
      // DEBUG: Log raw ElevenLabs message for text mode
      console.log('📝 [Text Mode RAW] ================================');
      console.log('📝 [Text Mode RAW] Full message object:', JSON.stringify(message, null, 2));
      console.log('📝 [Text Mode RAW] message.message:', message.message);
      console.log('📝 [Text Mode RAW] message.source:', message.source);
      console.log('📝 [Text Mode RAW] ================================');

      if (message.message && inputModeRef.current === 'text') {
        const role = message.source === 'user' ? 'user' : 'assistant';

        // Skip user messages as we add them immediately on send
        if (role === 'user') {
          return;
        }

        // If the agent greets after the user already asked something, don't let it consume the pending intent.
        if (role === 'assistant' && pendingQueryIntentRef.current && isSessionGreetingMessage(message.message)) {
          return;
        }

        // Skip non-answer assistant nudges ("...", "one moment", etc.)
        if (role === 'assistant' && isTransientAssistantMessage(message.message)) {
          return;
        }

        // If we already have deterministic data for this cycle, prefer it over the agent's text.
        let assistantContent = message.message;
        if (role === 'assistant' && pendingAnswerOverrideRef.current) {
          const answerPromise = pendingAnswerOverrideRef.current;
          pendingAnswerOverrideRef.current = null;
          try {
            const override = await answerPromise;
            if (override) assistantContent = override;
          } catch (error) {
            console.warn('[Answer Override] Failed to build override:', error);
          }
        }

        // Deduplicate: Skip if this is the same message we just processed (within 2 seconds)
        const now = Date.now();
        const lastMsg = lastProcessedTextMessageRef.current;
        if (lastMsg && lastMsg.content === assistantContent && (now - lastMsg.timestamp) < 2000) {
          console.log('🔍 [Text Mode] Skipping duplicate message');
          return;
        }
        lastProcessedTextMessageRef.current = { content: assistantContent, timestamp: now };

        // For assistant messages, check if we should render trade UI
        const symbol = extractSymbolOrCompany(assistantContent);
        console.log('🔍 [Text Mode] Message:', assistantContent.substring(0, 150));
        console.log('🔍 [Text Mode] Extracted symbol:', symbol);

        const newMessageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newMessage: TranscriptMessage = {
          id: newMessageId,
          role,
          content: assistantContent,
          timestamp: new Date(),
        };
        setTranscript(prev => [...prev, newMessage]);
        setIsSending(false);

        // Save to database
        if (currentConversationId) {
          saveMessage(currentConversationId, role, assistantContent, 'text');
        }

        // Compute and attach the UI card after the assistant text is shown
        void (async () => {
          if (suppressNextTradeUICardRef.current) {
            suppressNextTradeUICardRef.current = false;
            return;
          }
          let tradeUI: TradeUIData | undefined;

          // HIGHEST PRIORITY: Use UI data set directly by client tools (single source of truth)
          if (toolUIDataRef.current) {
            tradeUI = toolUIDataRef.current;
            toolUIDataRef.current = null; // Clear after use
            console.log('🎯 [Tool Direct] Using UI data from client tool:', tradeUI.type);
            // Mark timestamp to prevent fallback from overriding
            lastIntentCardRenderedAtRef.current = Date.now();
          }

          // PRIMARY: Use stored intent from user's query (deterministic)
          // Skip if we already have UI data from client tool
          const pendingIntent = pendingQueryIntentRef.current;
          const pendingTradeUIRequest = pendingTradeUIRequestRef.current;
          if (!tradeUI && pendingIntent) {
            console.log('🎯 [Intent-Based] Using stored intent:', pendingIntent);
            // Consume intent for this assistant response (only once we have a real assistant answer)
            pendingQueryIntentRef.current = null;
            pendingTradeUIRequestRef.current = null;

            // SPECIAL CASE: highest-strike must match assistant narrative (dates), so parse from text first
            if (pendingIntent.cardType === 'highest-strike') {
              const parsedStrike = parseHighestStrikeFromText(message.message);
              if (parsedStrike && isCompleteHighestStrikeParse(parsedStrike)) {
                if (pendingIntent.symbol) parsedStrike.symbol = pendingIntent.symbol;
                tradeUI = {
                  type: 'highest-strike',
                  symbol: parsedStrike.symbol,
                  tradeType: parsedStrike.tradeType,
                  callPut: parsedStrike.callPut,
                  data: {
                    parsedFromText: true,
                    ...parsedStrike,
                  }
                };
              }
            }

            // Otherwise, prefer the prefetched trade UI if available
            if (!tradeUI && pendingTradeUIRequest) {
              const data = await pendingTradeUIRequest;
              if (data) tradeUI = data;
            }

            // Fallback to fetching now if we didn't prefetch (or prefetch failed)
            if (!tradeUI) {
              const intentSymbol = pendingIntent.symbol || '';
              const data = await fetchTradeData(
                intentSymbol,
                pendingIntent.cardType,
                pendingIntent.tradeType,
                pendingIntent.timePeriod,
                {
                  callPut: pendingIntent.callPut,
                  expiration: pendingIntent.expiration,
                  accountQueryType: pendingIntent.accountQueryType,
                  feeType: pendingIntent.feeType,
                }
              );
              if (data) {
                tradeUI = data;
                // Mark timestamp to prevent fallback from overriding on subsequent message events
                lastIntentCardRenderedAtRef.current = Date.now();
                console.log('🎯 [Intent-Based] Successfully rendered card:', pendingIntent.cardType);
              }
            }
          }

          // FALLBACK: Regex-based detection on agent's response
          // Skip fallback if an intent-based card was recently rendered (within 5 seconds)
          // This prevents subsequent message chunks from ElevenLabs from triggering wrong cards
          const timeSinceIntentCard = Date.now() - lastIntentCardRenderedAtRef.current;
          const skipFallback = timeSinceIntentCard < 5000;
          if (skipFallback && !tradeUI) {
            console.log('🔍 [Text Mode] Skipping fallback - intent card rendered', timeSinceIntentCard, 'ms ago');
          }
          if (!tradeUI && !skipFallback) {
            // Check for account balance queries FIRST (highest priority)
            const accountMatch = detectAccountBalanceQuery(message.message);
            console.log('🔍 [Text Mode] Account balance match:', accountMatch);
            if (accountMatch) {
              console.log('🔍 [Text Mode] Account balance query detected:', accountMatch.queryType);
              const data = await fetchTradeData('', 'account-balance', undefined, accountMatch.timePeriod, { accountQueryType: accountMatch.queryType });
              console.log('🔍 [Text Mode] Account balance data:', data);
              if (data) tradeUI = data;
            }
          }
          if (!tradeUI && !skipFallback) {
            const feesMatch = detectFeesQuery(message.message);
            console.log('🔍 [Text Mode] Fees match:', feesMatch);
            if (feesMatch) {
              console.log('🔍 [Text Mode] Fees query detected:', feesMatch.feeType);
              const data = await fetchTradeData(feesMatch.symbol || '', 'fees', undefined, feesMatch.timePeriod, { feeType: feesMatch.feeType });
              console.log('🔍 [Text Mode] Fees data:', data);
              if (data) tradeUI = data;
            }
          }
          if (!tradeUI && !skipFallback) {
            const expiringMatch = detectExpiringOptionsQuery(message.message);
            if (expiringMatch) {
              const data = await fetchTradeData(symbol || '', 'expiring-options', expiringMatch.tradeType, undefined, { expiration: expiringMatch.expiration });
              if (data) tradeUI = data;
            }
          }
          if (!tradeUI && !skipFallback && detectAllTradesQuery(message.message) && symbol) {
            const data = await fetchTradeData(symbol, 'detailed');
            if (data) tradeUI = data;
          }
          if (!tradeUI && !skipFallback) {
            const bulkOptionsMatch = detectBulkOptionsQuery(message.message);
            if (bulkOptionsMatch) {
              const data = await fetchTradeData(symbol || '', 'advanced-options', bulkOptionsMatch.tradeType, bulkOptionsMatch.timePeriod, { callPut: bulkOptionsMatch.callPut });
              if (data) tradeUI = data;
            } else {
              const lastOptionMatch = detectLastOptionQuery(message.message);
              if (lastOptionMatch && symbol) {
                const data = await fetchTradeData(symbol, 'last-option', lastOptionMatch.tradeType, undefined, { callPut: lastOptionMatch.callPut });
                if (data) tradeUI = data;
              }
            }
          }
          if (!tradeUI && !skipFallback) {
            const parsedStrike = parseHighestStrikeFromText(message.message);
            if (parsedStrike && isCompleteHighestStrikeParse(parsedStrike)) {
              console.log('🎯 [Text Parse] Using parsed highest-strike data from agent text:', parsedStrike);
              tradeUI = {
                type: 'highest-strike',
                symbol: parsedStrike.symbol,
                tradeType: parsedStrike.tradeType,
                callPut: parsedStrike.callPut,
                data: {
                  parsedFromText: true,
                  ...parsedStrike
                }
              };
            } else {
              const premiumMatch = detectTotalPremiumQuery(message.message);
              if (premiumMatch) {
                const data = await fetchTradeData(symbol || '', 'total-premium', premiumMatch.tradeType, premiumMatch.timePeriod);
                if (data) tradeUI = data;
              } else {
                const advancedMatch = detectAdvancedOptionsQuery(message.message);
                if (advancedMatch) {
                  const data = await fetchTradeData(symbol || '', 'advanced-options', advancedMatch.tradeType, advancedMatch.timePeriod, { callPut: advancedMatch.callPut });
                  if (data) tradeUI = data;
                } else {
                  const timeMatch = detectTimeBasedTrades(message.message);
                  if (timeMatch) {
                    const isPortfolioQuery = isPortfolioWideQuery(message.message);
                    const isDayOfWeekQuery = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(timeMatch.timePeriod);
                    const timeSymbol = (isPortfolioQuery || (isDayOfWeekQuery && !symbol)) ? null : symbol;
                    const data = await fetchTradeData(timeSymbol || '', 'time-based', undefined, timeMatch.timePeriod);
                    if (data) tradeUI = data;
                  } else if (symbol) {
                    const avgPriceMatch = detectAveragePrice(message.message);
                    if (avgPriceMatch) {
                      const data = await fetchTradeData(symbol, 'average-price', avgPriceMatch.tradeType, avgPriceMatch.timePeriod);
                      if (data) tradeUI = data;
                    } else {
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

          if (tradeUI) {
            lastAssistantTradeUIRef.current = tradeUI;
            // Store suggestion for follow-up handling
            if (tradeUI.type === 'fees' && tradeUI.data) {
              const feesData = tradeUI.data as { suggestion?: { period: string; amount: number; count: number; startDate: string; endDate: string } | null; feeType?: FeeType; symbol?: string; timePeriod?: string };
              if (feesData.suggestion) {
                lastSuggestionRef.current = {
                  feeType: tradeUI.feeType || feesData.feeType || 'commission',
                  timePeriod: feesData.suggestion.period,
                  startDate: feesData.suggestion.startDate,
                  endDate: feesData.suggestion.endDate,
                  amount: feesData.suggestion.amount,
                  count: feesData.suggestion.count,
                  symbol: feesData.symbol || tradeUI.symbol,
                };
              }
            }
            setTranscript(prev => prev.map((m) => m.id === newMessageId ? { ...m, tradeUI } : m));
          }
        })();
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
    extraParams?: { callPut?: 'call' | 'put'; expiration?: string; aggregation?: string; accountQueryType?: AccountQueryType; feeType?: FeeType; includeTrades?: boolean; dateFilter?: { type: string; startDate?: string; endDate?: string; description: string } }
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
        // If dateFilter provided (e.g., from suggestion follow-up), use it instead of timePeriod
        body = {
          feeType: extraParams?.feeType,
          timePeriod,
          symbol: symbol || undefined,
          dateFilter: extraParams?.dateFilter,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return { type, symbol, feeType: extraParams?.feeType, timePeriod, data };
      } else if (type === 'average-price') {
        endpoint = '/api/average-price';
        const includeTrades = extraParams?.includeTrades ?? true;
        body = { symbol, tradeType: tradeType || 'all', timePeriod, includeTrades };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        return { type, symbol, tradeType, timePeriod, data };
      } else if (type === 'last-option') {
        // Fetch the most recent option trade matching the criteria
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
        body = { symbol, timePeriod };
      } else if (type === 'time-based') {
        endpoint = '/api/time-trades-ui';
        body = { symbol: symbol || null, timePeriod };
      } else if (type === 'detailed') {
        endpoint = '/api/trades-ui';
        body = { symbol };
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
    clientTools,
    onConnect: () => {
      console.log('ElevenLabs connected');
      // Reset reconnection state on successful connection
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // Only clear transcript if not resuming from history
      if (!isResumingFromHistoryRef.current) {
        setTranscript([]);
      }
      isResumingFromHistoryRef.current = false;
      voiceTitleSetRef.current = false; // Reset title tracking
      setIsSending(false);
    },
    onDisconnect: (details) => {
      console.log('ElevenLabs disconnected', JSON.stringify(details, null, 2));
      console.log('🔴 [Disconnect] Full details:', details);
      // Extract message from error reason type (message only exists on error variant)
      const errorMessage = details?.reason === 'error' ? (details as { message?: string }).message : undefined;
      console.log('🔴 [Disconnect] Reason:', details?.reason, '| Message:', errorMessage);
      setIsSending(false);

      // Check if this is a quota/billing error - don't auto-reconnect for these
      const isQuotaError = errorMessage?.toLowerCase().includes('quota') ||
                          errorMessage?.toLowerCase().includes('limit') ||
                          errorMessage?.toLowerCase().includes('billing');

      // Check if user intentionally disconnected
      const isIntentionalDisconnect = details?.reason === 'user' || details?.reason === 'agent';

      // Auto-reconnect for unexpected disconnects (network issues, server errors)
      if (!isQuotaError && !isIntentionalDisconnect && inputModeRef.current === 'voice') {
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current += 1;
          console.log(`🔄 [Reconnect] Attempting reconnection ${reconnectAttemptsRef.current}/${maxReconnectAttempts} in ${delay}ms...`);

          // Clear any existing reconnect timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }

          reconnectTimeoutRef.current = setTimeout(async () => {
            try {
              console.log('🔄 [Reconnect] Starting reconnection...');
              await navigator.mediaDevices.getUserMedia({ audio: true });
              // @ts-expect-error - ElevenLabs SDK types
              await elevenLabsConversation.startSession({ agentId, dynamicVariables: getElevenLabsDynamicVariables() });
              console.log('✅ [Reconnect] Successfully reconnected!');
              reconnectAttemptsRef.current = 0; // Reset on success
            } catch (error) {
              console.error('❌ [Reconnect] Failed to reconnect:', error);
            }
          }, delay);
        } else {
          console.log('❌ [Reconnect] Max reconnection attempts reached. Please manually reconnect.');
          reconnectAttemptsRef.current = 0; // Reset for future attempts
        }
      } else if (isQuotaError) {
        console.warn('⚠️ [Disconnect] Quota/billing error detected. Check your ElevenLabs dashboard.');
      }
    },
    onStatusChange: (status) => {
      console.log('🔄 [Status Change]', JSON.stringify(status));
    },
    onMessage: async (message) => {
      // DEBUG: Log raw ElevenLabs message object to compare voice vs text
      console.log('🎙️ [ElevenLabs RAW] ================================');
      console.log('🎙️ [ElevenLabs RAW] Full message object:', JSON.stringify(message, null, 2));
      console.log('🎙️ [ElevenLabs RAW] message.message:', message.message);
      console.log('🎙️ [ElevenLabs RAW] message.source:', message.source);
      console.log('🎙️ [ElevenLabs RAW] message type:', (message as unknown as Record<string, unknown>).type);
      console.log('🎙️ [ElevenLabs RAW] ================================');

      if (message.message) {
        const role = message.source === 'user' ? 'user' : 'assistant';

        // If the agent greets after the user already asked something, don't let it consume the pending intent.
        if (role === 'assistant' && pendingQueryIntentRef.current && isSessionGreetingMessage(message.message)) {
          return;
        }

        // Skip non-answer assistant nudges ("...", "one moment", etc.)
        if (role === 'assistant' && isTransientAssistantMessage(message.message)) {
          return;
        }

        // If we already have deterministic data for this cycle, prefer it over the agent's text.
        let assistantContent = message.message;
        if (role === 'assistant' && pendingAnswerOverrideRef.current) {
          const answerPromise = pendingAnswerOverrideRef.current;
          pendingAnswerOverrideRef.current = null;
          try {
            const override = await answerPromise;
            if (override) assistantContent = override;
          } catch (error) {
            console.warn('[Answer Override] Failed to build override:', error);
          }
        }

        // Deduplicate: Skip if this is the same message we just processed (within 2 seconds)
        const now = Date.now();
        const lastMsg = lastProcessedVoiceMessageRef.current;
        if (lastMsg && lastMsg.content === assistantContent && (now - lastMsg.timestamp) < 2000) {
          console.log('🔍 [Voice Mode] Skipping duplicate message');
          return;
        }
        lastProcessedVoiceMessageRef.current = { content: assistantContent, timestamp: now };

        const newMessageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newMessage: TranscriptMessage = {
          id: newMessageId,
          role,
          content: assistantContent,
          timestamp: new Date(),
        };
        setTranscript(prev => [...prev, newMessage]);
        setIsSending(false); // Clear sending state when we get a response

        // VOICE MODE: When the user's spoken message arrives via ElevenLabs, classify intent here
        // (typed messages go through handleSendMessage, but spoken messages do not).
        if (role === 'user') {
          const userQuery = message.message.trim();
          if (userQuery.length >= 3) {
            if (isExplainCalculationQuery(userQuery)) {
              const override = buildAveragePriceCalculationExplanation(lastAssistantTradeUIRef.current);
              if (override) {
                suppressNextTradeUICardRef.current = true;
                pendingQueryIntentRef.current = null;
                pendingTradeUIRequestRef.current = null;
                pendingAnswerOverrideRef.current = Promise.resolve(override);
                return;
              }
            }

            // VOICE MODE: Handle user accepting a suggestion (e.g., "yes" to "Would you like to know more?")
            // This mirrors the text mode handling at handleSendMessage
            const voiceSuggestionAccept = isSuggestionFollowup(userQuery) && lastSuggestionRef.current !== null;
            if (voiceSuggestionAccept && lastSuggestionRef.current) {
              console.log('📊 [Voice Suggestion Follow-up] User accepted suggestion, setting intent for:', lastSuggestionRef.current.timePeriod);
              const suggestion = lastSuggestionRef.current;
              // Create a synthetic intent to fetch fees data with the suggested period
              const suggestionIntent: QueryIntent = {
                cardType: 'fees',
                feeType: suggestion.feeType,
                timePeriod: suggestion.timePeriod,
                symbol: suggestion.symbol,
                dateFilter: {
                  type: 'range',
                  startDate: suggestion.startDate,
                  endDate: suggestion.endDate,
                  description: suggestion.timePeriod,
                },
              };
              pendingQueryIntentRef.current = suggestionIntent;
              pendingTradeUIRequestRef.current = fetchTradeData(
                suggestionIntent.symbol || '',
                suggestionIntent.cardType,
                undefined,
                suggestionIntent.timePeriod,
                {
                  feeType: suggestionIntent.feeType,
                  dateFilter: suggestionIntent.dateFilter,
                }
              );
              // Clear suggestion after use
              lastSuggestionRef.current = null;
              // Don't run further intent detection - we have what we need
              return;
            }

            const token = Date.now();
            pendingVoiceIntentTokenRef.current = token;

            // Detect if the query likely references a symbol we couldn't extract
            // (e.g., "M10 stock" where M10 is a misheard ticker)
            const queryLikelyHasSymbol = /\b(stock|ticker|shares?|borrow(?:ing)?)\b/i.test(userQuery);

            // Fast path: regex intent (sync) so we can prefetch before the assistant responds.
            console.log('🔍 [REGEX] ================================');
            console.log('🔍 [REGEX] Query:', userQuery);
            const fastIntent = detectUserQueryIntent(userQuery);

            // Determine if we should wait for LLM instead of prefetching with incomplete data
            // Wait for LLM if: intent detected but no symbol AND query likely has a symbol reference
            const shouldWaitForLLM = fastIntent && !fastIntent.symbol && queryLikelyHasSymbol;

            if (fastIntent && !shouldWaitForLLM) {
              console.log('🔍 [REGEX] ✅ Detected intent:', fastIntent.cardType, '| symbol:', fastIntent.symbol, '| timePeriod:', fastIntent.timePeriod);
              pendingQueryIntentRef.current = fastIntent;
              pendingTradeUIRequestRef.current = fetchTradeData(
                fastIntent.symbol || '',
                fastIntent.cardType,
                fastIntent.tradeType,
                fastIntent.timePeriod,
                {
                  callPut: fastIntent.callPut,
                  expiration: fastIntent.expiration,
                  accountQueryType: fastIntent.accountQueryType,
                  feeType: fastIntent.feeType,
                }
              );
              pendingAnswerOverrideRef.current = pendingTradeUIRequestRef.current.then((tradeUI) =>
                buildAnswerOverride(fastIntent, tradeUI)
              );
            } else if (shouldWaitForLLM) {
              console.log('🔍 [REGEX] ⏳ Intent detected but no symbol - waiting for LLM:', fastIntent.cardType);
              // Store intent but DON'T prefetch - let LLM provide the symbol
              pendingQueryIntentRef.current = fastIntent;
              pendingTradeUIRequestRef.current = null;
              pendingAnswerOverrideRef.current = null;
            } else {
              console.log('🔍 [REGEX] ❌ No intent detected');
              // Clear any stale pending intent from prior cycles.
              pendingQueryIntentRef.current = null;
              pendingTradeUIRequestRef.current = null;
              pendingAnswerOverrideRef.current = null;
            }

            // LLM classifier (async) - provides accurate symbol extraction
            // If regex couldn't get a symbol, LLM result will trigger the prefetch
            void (async () => {
              console.log('🤖 [LLM] ================================');
              console.log('🤖 [LLM] Query:', userQuery);
              console.log('🤖 [LLM] Calling Azure OpenAI classifier...');
              const llmIntent = await classifyIntentViaAPI(userQuery);
              if (!llmIntent) {
                console.log('🤖 [LLM] ❌ No intent returned (failed or low confidence)');
                // If we were waiting for LLM and it failed, fall back to regex intent without symbol
                if (shouldWaitForLLM && pendingQueryIntentRef.current && !pendingTradeUIRequestRef.current) {
                  console.log('🤖 [LLM] Falling back to regex intent without symbol');
                  const fallbackIntent = pendingQueryIntentRef.current;
                  pendingTradeUIRequestRef.current = fetchTradeData(
                    '',
                    fallbackIntent.cardType,
                    fallbackIntent.tradeType,
                    fallbackIntent.timePeriod,
                    {
                      callPut: fallbackIntent.callPut,
                      expiration: fallbackIntent.expiration,
                      accountQueryType: fallbackIntent.accountQueryType,
                      feeType: fallbackIntent.feeType,
                    }
                  );
                }
                return;
              }
              console.log('🤖 [LLM] ✅ Detected intent:', llmIntent.cardType, '| symbol:', llmIntent.symbol, '| timePeriod:', llmIntent.timePeriod);

              if (pendingVoiceIntentTokenRef.current !== token) return;

              // If we were waiting for LLM to provide symbol, use LLM result directly
              if (shouldWaitForLLM || !pendingTradeUIRequestRef.current) {
                console.log('🎯 [LLM] Using LLM intent (was waiting for symbol):', llmIntent);
                pendingQueryIntentRef.current = llmIntent;
                pendingTradeUIRequestRef.current = fetchTradeData(
                  llmIntent.symbol || '',
                  llmIntent.cardType,
                  llmIntent.tradeType,
                  llmIntent.timePeriod,
                  {
                    callPut: llmIntent.callPut,
                    expiration: llmIntent.expiration,
                    accountQueryType: llmIntent.accountQueryType,
                    feeType: llmIntent.feeType,
                  }
                );
                pendingAnswerOverrideRef.current = pendingTradeUIRequestRef.current.then((tradeUI) =>
                  buildAnswerOverride(llmIntent, tradeUI)
                );
                return;
              }

              if (!pendingQueryIntentRef.current) return;

              const current = pendingQueryIntentRef.current;
              // If regex detected a high-signal option pattern and LLM is not highly confident, keep regex
              if (isHighSignalOptionIntent(current) && (llmIntent.confidence ?? 0) < 0.85) {
                console.log('🤖 [LLM] Keeping regex high-signal intent:', current.cardType, '(LLM confidence:', `${((llmIntent.confidence ?? 0) * 100).toFixed(0)}%)`);
                return;
              }
              const isSame =
                current.cardType === llmIntent.cardType &&
                (current.symbol || '') === (llmIntent.symbol || '') &&
                (current.tradeType || '') === (llmIntent.tradeType || '') &&
                (current.timePeriod || '') === (llmIntent.timePeriod || '') &&
                (current.callPut || '') === (llmIntent.callPut || '') &&
                (current.expiration || '') === (llmIntent.expiration || '') &&
                (current.accountQueryType || '') === (llmIntent.accountQueryType || '') &&
                (current.feeType || '') === (llmIntent.feeType || '');

              if (isSame) return;

              console.log('🎯 [Voice LLM Classifier] Updating intent:', llmIntent);
              pendingQueryIntentRef.current = llmIntent;
              pendingTradeUIRequestRef.current = fetchTradeData(
                llmIntent.symbol || '',
                llmIntent.cardType,
                llmIntent.tradeType,
                llmIntent.timePeriod,
                {
                  callPut: llmIntent.callPut,
                  expiration: llmIntent.expiration,
                  accountQueryType: llmIntent.accountQueryType,
                  feeType: llmIntent.feeType,
                }
              );
              pendingAnswerOverrideRef.current = pendingTradeUIRequestRef.current.then((tradeUI) =>
                buildAnswerOverride(llmIntent, tradeUI)
              );
            })();
          }
        }

        // For assistant messages, compute trade UI asynchronously so the text renders first
        if (role === 'assistant') {
          const symbol = extractSymbolOrCompany(assistantContent);
          console.log('🔍 [Voice Mode] Message:', assistantContent.substring(0, 100));
          console.log('🔍 [Voice Mode] Extracted symbol:', symbol);

          void (async () => {
            if (suppressNextTradeUICardRef.current) {
              suppressNextTradeUICardRef.current = false;
              return;
            }
            let tradeUI: TradeUIData | undefined;

            // HIGHEST PRIORITY: Use UI data set directly by client tools (single source of truth)
            if (toolUIDataRef.current) {
              tradeUI = toolUIDataRef.current;
              toolUIDataRef.current = null; // Clear after use
              console.log('🎯 [Voice Tool Direct] Using UI data from client tool:', tradeUI.type);
              // Mark timestamp to prevent fallback from overriding
              lastIntentCardRenderedAtRef.current = Date.now();
            }

            // PRIMARY: Use stored intent from user's query (deterministic)
            // Skip if we already have UI data from client tool
            const pendingIntent = pendingQueryIntentRef.current;
            const pendingTradeUIRequest = pendingTradeUIRequestRef.current;
            if (!tradeUI && pendingIntent) {
              console.log('🎯 [Voice Intent-Based] Using stored intent:', pendingIntent);
              // Consume intent for this assistant response (only once we have a real assistant answer)
              pendingQueryIntentRef.current = null;
              pendingTradeUIRequestRef.current = null;

	              if (pendingIntent.cardType === 'highest-strike' && !pendingTradeUIRequest) {
	                console.log('🎯 [Voice Intent-Based] highest-strike detected - using text parsing fallback');
	                const parsedStrike = parseHighestStrikeFromText(message.message);
	                if (parsedStrike && isCompleteHighestStrikeParse(parsedStrike)) {
	                  if (pendingIntent.symbol) parsedStrike.symbol = pendingIntent.symbol;
	                  console.log('🎯 [Voice Intent-Based] Parsed highest-strike from text:', parsedStrike);
	                  tradeUI = {
	                    type: 'highest-strike',
	                    symbol: parsedStrike.symbol,
	                    tradeType: parsedStrike.tradeType,
	                    callPut: parsedStrike.callPut,
	                    data: {
	                      parsedFromText: true,
	                      ...parsedStrike
	                    }
	                  };
	                }
	              }

              if (!tradeUI && pendingTradeUIRequest) {
                const data = await pendingTradeUIRequest;
                if (data) tradeUI = data;
              }

              if (!tradeUI) {
                const intentSymbol = pendingIntent.symbol || '';
                const data = await fetchTradeData(
                  intentSymbol,
                  pendingIntent.cardType,
                  pendingIntent.tradeType,
                  pendingIntent.timePeriod,
                  {
                    callPut: pendingIntent.callPut,
                    expiration: pendingIntent.expiration,
                    accountQueryType: pendingIntent.accountQueryType,
                    feeType: pendingIntent.feeType,
                  }
                );
                if (data) {
                  tradeUI = data;
                  // Mark timestamp to prevent fallback from overriding on subsequent message events
                  lastIntentCardRenderedAtRef.current = Date.now();
                  console.log('🎯 [Voice Intent-Based] Successfully rendered card:', pendingIntent.cardType);
                }
              }
            }

            // FALLBACK: Regex-based detection on agent's response (for follow-up questions)
            // Skip fallback if an intent-based card was recently rendered (within 5 seconds)
            const voiceTimeSinceIntentCard = Date.now() - lastIntentCardRenderedAtRef.current;
            const voiceSkipFallback = voiceTimeSinceIntentCard < 5000;
            if (voiceSkipFallback && !tradeUI) {
              console.log('🔍 [Voice Mode] Skipping fallback - intent card rendered', voiceTimeSinceIntentCard, 'ms ago');
            }
            if (!tradeUI && !voiceSkipFallback) {
              const accountMatch = detectAccountBalanceQuery(message.message);
              if (accountMatch) {
                console.log('🔍 Account balance query detected:', accountMatch.queryType);
                const data = await fetchTradeData('', 'account-balance', undefined, accountMatch.timePeriod, { accountQueryType: accountMatch.queryType });
                if (data) tradeUI = data;
              }
            }
            if (!tradeUI && !voiceSkipFallback) {
              const feesMatch = detectFeesQuery(message.message);
              if (feesMatch) {
                console.log('🔍 Fees query detected:', feesMatch.feeType);
                const data = await fetchTradeData(feesMatch.symbol || '', 'fees', undefined, feesMatch.timePeriod, { feeType: feesMatch.feeType });
                if (data) tradeUI = data;
              }
            }
            if (!tradeUI && !voiceSkipFallback) {
              const expiringMatch = detectExpiringOptionsQuery(message.message);
              if (expiringMatch) {
                console.log('🔍 Expiring options detected:', expiringMatch.expiration);
                const data = await fetchTradeData(symbol || '', 'expiring-options', expiringMatch.tradeType, undefined, { expiration: expiringMatch.expiration });
                if (data) tradeUI = data;
              }
            }
            if (!tradeUI && !voiceSkipFallback && detectAllTradesQuery(message.message) && symbol) {
              console.log('🔍 All trades query detected (both stocks and options)');
              const data = await fetchTradeData(symbol, 'detailed');
              if (data) tradeUI = data;
            }
            if (!tradeUI && !voiceSkipFallback) {
              const bulkOptionsMatch = detectBulkOptionsQuery(message.message);
              if (bulkOptionsMatch) {
                console.log('🔍 Bulk options query detected:', bulkOptionsMatch);
                const data = await fetchTradeData(symbol || '', 'advanced-options', bulkOptionsMatch.tradeType, bulkOptionsMatch.timePeriod, { callPut: bulkOptionsMatch.callPut });
                if (data) tradeUI = data;
              } else {
                const lastOptionMatch = detectLastOptionQuery(message.message);
                if (lastOptionMatch && symbol) {
                  console.log('🔍 Last option trade detected:', lastOptionMatch);
                  const data = await fetchTradeData(symbol, 'last-option', lastOptionMatch.tradeType, undefined, { callPut: lastOptionMatch.callPut });
                  if (data) tradeUI = data;
                }
              }
            }
            if (!tradeUI && !voiceSkipFallback) {
              const parsedStrike = parseHighestStrikeFromText(message.message);
              if (parsedStrike && isCompleteHighestStrikeParse(parsedStrike)) {
                console.log('🎯 [Voice Text Parse] Using parsed highest-strike data from agent text:', parsedStrike);
                tradeUI = {
                  type: 'highest-strike',
                  symbol: parsedStrike.symbol,
                  tradeType: parsedStrike.tradeType,
                  callPut: parsedStrike.callPut,
                  data: {
                    parsedFromText: true,
                    ...parsedStrike
                  }
                };
              } else {
                const premiumMatch = detectTotalPremiumQuery(message.message);
                if (premiumMatch) {
                  console.log('🔍 Total premium detected:', premiumMatch);
                  const data = await fetchTradeData(symbol || '', 'total-premium', premiumMatch.tradeType, premiumMatch.timePeriod);
                  if (data) tradeUI = data;
                } else {
                  const advancedMatch = detectAdvancedOptionsQuery(message.message);
                  if (advancedMatch) {
                    console.log('🔍 Advanced options query detected:', advancedMatch);
                    const data = await fetchTradeData(symbol || '', 'advanced-options', advancedMatch.tradeType, advancedMatch.timePeriod, { callPut: advancedMatch.callPut });
                    if (data) tradeUI = data;
                  } else {
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
                    } else if (symbol) {
                      const avgPriceMatch = detectAveragePrice(message.message);
                      if (avgPriceMatch) {
                        console.log('🔍 Average price detected:', avgPriceMatch.tradeType, avgPriceMatch.timePeriod);
                        const data = await fetchTradeData(symbol, 'average-price', avgPriceMatch.tradeType, avgPriceMatch.timePeriod);
                        console.log('🔍 Fetched average price data:', data);
                        if (data) tradeUI = data;
                      } else {
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

            // SYMBOL CORRECTION: For fees queries, extract symbol from agent's response using LLM
            // The server webhook LLM corrects speech recognition errors (e.g., "M10" → "MTEN"),
            // but our local intent detection uses the user's transcribed message which has errors.
            // This re-fetches UI data with the symbol the agent actually mentioned.
            if (tradeUI && tradeUI.type === 'fees') {
              console.log('🔍 [Symbol Correction] Fees query detected, checking agent response for symbol...');
              console.log('🔍 [Symbol Correction] Current tradeUI.symbol:', tradeUI.symbol);
              try {
                const agentClassification = await classifyIntentViaAPI(assistantContent);
                const extractedSymbol = agentClassification?.symbol;
                console.log('🔍 [Symbol Correction] LLM extracted symbol from agent response:', extractedSymbol);

                // Re-fetch if agent mentioned a different symbol than what we used
                if (extractedSymbol && extractedSymbol !== tradeUI.symbol) {
                  console.log('🔍 [Symbol Correction] Symbol mismatch! Re-fetching with correct symbol:', extractedSymbol);
                  const correctedData = await fetchTradeData(
                    extractedSymbol,
                    'fees',
                    undefined,
                    (tradeUI.data as { timePeriod?: string })?.timePeriod || pendingIntent?.timePeriod,
                    { feeType: tradeUI.feeType }
                  );
                  if (correctedData) {
                    tradeUI = correctedData;
                    console.log('🔍 [Symbol Correction] ✅ Successfully re-fetched with corrected symbol');
                  }
                }
              } catch (error) {
                console.warn('🔍 [Symbol Correction] Failed to extract symbol from agent response:', error);
              }
            }

            if (tradeUI) {
              lastAssistantTradeUIRef.current = tradeUI;
              // Store suggestion for follow-up handling
              if (tradeUI.type === 'fees' && tradeUI.data) {
                const feesData = tradeUI.data as { suggestion?: { period: string; amount: number; count: number; startDate: string; endDate: string } | null; feeType?: FeeType; symbol?: string; timePeriod?: string };
                if (feesData.suggestion) {
                  lastSuggestionRef.current = {
                    feeType: tradeUI.feeType || feesData.feeType || 'commission',
                    timePeriod: feesData.suggestion.period,
                    startDate: feesData.suggestion.startDate,
                    endDate: feesData.suggestion.endDate,
                    amount: feesData.suggestion.amount,
                    count: feesData.suggestion.count,
                    symbol: feesData.symbol || tradeUI.symbol,
                  };
                }
              }
              setTranscript(prev => prev.map((m) => m.id === newMessageId ? { ...m, tradeUI } : m));
            }
          })();
        }

        // Save to database - use refs/state updater to avoid stale closure
        setCurrentConversationId(prevConvId => {
          if (prevConvId) {
            saveMessage(prevConvId, role, assistantContent, inputMode);

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
      console.error('🔴 [ElevenLabs ERROR]', error);
      console.error('🔴 [ElevenLabs ERROR] Type:', typeof error);
      console.error('🔴 [ElevenLabs ERROR] JSON:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
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
      await elevenLabsConversation.startSession({ agentId, dynamicVariables: getElevenLabsDynamicVariables() });
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
    const disableElevenLabs = process.env.NEXT_PUBLIC_DISABLE_ELEVENLABS === '1' || !agentId;
    setIsOpen(true);
    setInputMode(disableElevenLabs ? 'text' : 'voice');
    setCurrentView('chat');
    if (!currentConversationId) {
      const newId = await createConversation();
      if (newId) setCurrentConversationId(newId);
    }
    // Auto-start voice session
    if (!disableElevenLabs && elevenLabsConversation.status !== 'connected' && elevenLabsConversation.status !== 'connecting') {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        // @ts-expect-error - ElevenLabs SDK types
        await elevenLabsConversation.startSession({ agentId, dynamicVariables: getElevenLabsDynamicVariables() });
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

	    const isCalcFollowup = isExplainCalculationQuery(message);
	    const isSuggestionAccept = isSuggestionFollowup(message) && lastSuggestionRef.current !== null;
	    let intent: QueryIntent | null = null;

	    if (isCalcFollowup) {
	      const override = buildAveragePriceCalculationExplanation(lastAssistantTradeUIRef.current);
	      if (override) {
	        suppressNextTradeUICardRef.current = true;
	        pendingQueryIntentRef.current = null;
	        pendingTradeUIRequestRef.current = null;
	        pendingAnswerOverrideRef.current = Promise.resolve(override);
	      }
	    }

	    // Handle user accepting a suggestion (e.g., "yes" to "Would you like to know more?")
	    if (isSuggestionAccept && lastSuggestionRef.current) {
	      console.log('📊 [Suggestion Follow-up] User accepted suggestion, fetching data for:', lastSuggestionRef.current.timePeriod);
	      const suggestion = lastSuggestionRef.current;
	      // Create a synthetic intent to fetch fees data with the suggested period
	      // Use explicit dateFilter with startDate/endDate for reliable date handling
	      intent = {
	        cardType: 'fees',
	        feeType: suggestion.feeType,
	        timePeriod: suggestion.timePeriod,
	        symbol: suggestion.symbol,
	        // Pass dateFilter with explicit dates for the follow-up fetch
	        dateFilter: {
	          type: 'range',
	          startDate: suggestion.startDate,
	          endDate: suggestion.endDate,
	          description: suggestion.timePeriod,
	        },
	      };
	      // Clear the suggestion after using it
	      lastSuggestionRef.current = null;
	    }

	    // Handle contextual follow-up with time period change (e.g., "And what about last three months?")
	    // This preserves the previous query's context (feeType, cardType) but uses the new time period
	    const contextualTimePeriod = detectContextualTimePeriodFollowup(message);
	    const isContextualFollowup = contextualTimePeriod && lastAssistantTradeUIRef.current !== null;

	    if (isContextualFollowup && lastAssistantTradeUIRef.current && !isSuggestionAccept) {
	      const prevUI = lastAssistantTradeUIRef.current;
	      console.log('📊 [Contextual Follow-up] Detected time period change:', contextualTimePeriod, '| Previous context:', prevUI.type);

	      // Create intent based on previous query type with new time period
	      if (prevUI.type === 'fees' && prevUI.feeType) {
	        intent = {
	          cardType: 'fees',
	          feeType: prevUI.feeType,
	          timePeriod: contextualTimePeriod,
	          symbol: prevUI.symbol,
	        };
	        console.log('📊 [Contextual Follow-up] Created fees intent:', intent);
	      } else if (prevUI.type === 'account-balance' && prevUI.accountQueryType) {
	        intent = {
	          cardType: 'account-balance',
	          accountQueryType: prevUI.accountQueryType,
	          timePeriod: contextualTimePeriod,
	        };
	        console.log('📊 [Contextual Follow-up] Created account intent:', intent);
	      }
	      // Could add more types here (trades, options, etc.) as needed
	    }

	    if (!isCalcFollowup && !isSuggestionAccept && !isContextualFollowup) {
	      // Classify query intent using GPT-based LLM classifier with confidence-based selection
	      console.log('🎯 [Intent Detection] User query:', message);
	      const regexIntent = detectUserQueryIntent(message);
	      const llmIntent = await classifyIntentViaAPI(message);
	      if (llmIntent) {
	        console.log('🎯 [LLM Classifier] Intent:', llmIntent.cardType, `(${((llmIntent.confidence ?? 0) * 100).toFixed(0)}% confidence)`, '| entities:', { symbol: llmIntent.symbol, timePeriod: llmIntent.timePeriod, tradeType: llmIntent.tradeType, callPut: llmIntent.callPut });
	      }
	      if (regexIntent) {
	        console.log('🎯 [Regex Detection] Intent:', regexIntent.cardType, '| entities:', { symbol: regexIntent.symbol, timePeriod: regexIntent.timePeriod, tradeType: regexIntent.tradeType, callPut: regexIntent.callPut });
	      }
	      intent = chooseIntent(message, llmIntent, regexIntent);
	    }
	    // NOTE: cardRenderedForCycleRef is reset in render_ui client tool, NOT here
	    // Resetting here would cause late message fragments from previous query to trigger duplicates

	    let convId = currentConversationId;
    if (!convId) {
      convId = await createConversation(message.slice(0, 50));
      if (convId) setCurrentConversationId(convId);
    }

    // TEXT MODE: Use ElevenLabs text-only (no voice)
    if (inputMode === 'text') {
      const disableElevenLabs = process.env.NEXT_PUBLIC_DISABLE_ELEVENLABS === '1' || !agentId;

      // Ensure text-only session is connected
      if (!disableElevenLabs && textOnlyConversation.status !== 'connected') {
        try {
          // @ts-expect-error - ElevenLabs SDK types
          await textOnlyConversation.startSession({ agentId, dynamicVariables: getElevenLabsDynamicVariables() });
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

      if (disableElevenLabs) {
        const tradeUI = intent
          ? await fetchTradeData(
              intent.symbol || '',
              intent.cardType,
              intent.tradeType,
              intent.timePeriod,
              {
                callPut: intent.callPut,
                expiration: intent.expiration,
                accountQueryType: intent.accountQueryType,
                feeType: intent.feeType,
                dateFilter: intent.dateFilter,
              }
            )
          : null;
        const assistantText = buildAnswerOverride(intent, tradeUI) || 'I can help with that.';

        const assistantMessage: TranscriptMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant',
          content: assistantText,
          timestamp: new Date(),
          tradeUI: tradeUI || undefined,
        };

        lastAssistantTradeUIRef.current = tradeUI;
        // Store suggestion for follow-up handling
        if (tradeUI && tradeUI.type === 'fees' && tradeUI.data) {
          const feesData = tradeUI.data as { suggestion?: { period: string; amount: number; count: number; startDate: string; endDate: string } | null; feeType?: FeeType; symbol?: string; timePeriod?: string };
          if (feesData.suggestion) {
            lastSuggestionRef.current = {
              feeType: tradeUI.feeType || feesData.feeType || 'commission',
              timePeriod: feesData.suggestion.period,
              startDate: feesData.suggestion.startDate,
              endDate: feesData.suggestion.endDate,
              amount: feesData.suggestion.amount,
              count: feesData.suggestion.count,
              symbol: feesData.symbol || tradeUI.symbol,
            };
          }
        }
        setTranscript(prev => [...prev, assistantMessage]);
        setIsSending(false);
        return;
      }

		      // Store intent and prefetch the trade UI, but render it only after the assistant replies.
		      pendingQueryIntentRef.current = intent;
		      pendingTradeUIRequestRef.current = intent
		        ? fetchTradeData(
		            intent.symbol || '',
		            intent.cardType,
		            intent.tradeType,
		            intent.timePeriod,
		            {
		              callPut: intent.callPut,
		              expiration: intent.expiration,
		              accountQueryType: intent.accountQueryType,
		              feeType: intent.feeType,
		              dateFilter: intent.dateFilter,
		            }
		          )
		        : null;
		      if (pendingTradeUIRequestRef.current) {
		        pendingAnswerOverrideRef.current = pendingTradeUIRequestRef.current.then((tradeUI) => buildAnswerOverride(intent, tradeUI));
		      } else if (!pendingAnswerOverrideRef.current) {
		        pendingAnswerOverrideRef.current = null;
		      }

      // Send to ElevenLabs text-only conversation
      textOnlyConversation.sendUserMessage(message);
      setIsSending(false);
      return;
    }

    // VOICE MODE: Use ElevenLabs (voice response)
    // Ensure ElevenLabs session is connected
    if (elevenLabsConversation.status !== 'connected') {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        // @ts-expect-error - ElevenLabs SDK types
        await elevenLabsConversation.startSession({ agentId, dynamicVariables: getElevenLabsDynamicVariables() });
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

		    // Store intent and prefetch the trade UI, but render it only after the assistant replies.
		    pendingQueryIntentRef.current = intent;
		    pendingTradeUIRequestRef.current = intent
		      ? fetchTradeData(
		          intent.symbol || '',
		          intent.cardType,
		          intent.tradeType,
		          intent.timePeriod,
		          {
		            callPut: intent.callPut,
		            expiration: intent.expiration,
		            accountQueryType: intent.accountQueryType,
		            feeType: intent.feeType,
		          }
		        )
		      : null;
		    if (pendingTradeUIRequestRef.current) {
		      pendingAnswerOverrideRef.current = pendingTradeUIRequestRef.current.then((tradeUI) => buildAnswerOverride(intent, tradeUI));
		    } else if (!pendingAnswerOverrideRef.current) {
		      pendingAnswerOverrideRef.current = null;
		    }

    // Send message to ElevenLabs agent (will respond with voice)
    elevenLabsConversation.sendUserMessage(message);
    setIsSending(false);
  }, [inputValue, isSending, inputMode, currentConversationId, conversations, elevenLabsConversation, agentId, textOnlyConversation, fetchTradeData]);

  const handleEndChat = useCallback(() => {
    setTranscript([]);
    setCurrentConversationId(null);
    setCurrentView('history');
    stopVoiceSession();
  }, [stopVoiceSession]);

  const toggleMode = useCallback(async () => {
    const newMode = inputMode === 'text' ? 'voice' : 'text';
    setInputMode(newMode);

    const disableElevenLabs = process.env.NEXT_PUBLIC_DISABLE_ELEVENLABS === '1' || !agentId;
    if (disableElevenLabs) {
      // In local/test mode we don't start or stop external sessions.
      return;
    }

    if (newMode === 'text') {
      // Switching to chat mode - stop voice ElevenLabs, start text-only
      stopVoiceSession();
      if (textOnlyConversation.status !== 'connected' && textOnlyConversation.status !== 'connecting') {
        try {
          // @ts-expect-error - ElevenLabs SDK types
          await textOnlyConversation.startSession({ agentId, dynamicVariables: getElevenLabsDynamicVariables() });
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
      // Check if data already contains trades
      const queryData = data as { trades?: Array<Record<string, unknown>>; summary?: unknown; aggregations?: Aggregations; filters?: ActiveFilters };
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
              summary={(queryData.summary as {
                totalShares: number;
                totalCost: number;
                currentValue: number;
                symbol: string;
              } | null) ?? null}
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
        breakdown?: {
          totalNotional: number;
          trades: Array<{ date: string; shares: number; price: number; notional: number }>;
        };
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
              breakdown={avgData.breakdown}
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

      return (
        <div style={{ marginTop: '12px' }}>
          {advancedData.trades && advancedData.trades.length > 0 && (
            <BulkOptionsCard
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

      // Check if data was parsed from agent's text response (ensures UI matches exactly what agent said)
      const parsedData = data as { parsedFromText?: boolean } & ParsedHighestStrikeData;
      if (parsedData.parsedFromText) {
        console.log('🎯 [Render] Using parsed text data for highest-strike card');
        return (
          <div style={{ marginTop: '12px' }}>
            <HighestStrikeCard
              symbol={parsedData.symbol}
              strike={parsedData.strike}
              callPut={parsedData.callPut === 'call' ? 'Call' : 'Put'}
              tradeType={parsedData.tradeType}
              date={parsedData.date}
              expiration={parsedData.expiration}
              contracts={parsedData.contracts}
              premium={parsedData.premium}
              isHighest={parsedData.isHighest}
              datePreformatted={true}
            />
          </div>
        );
      }

      // Fallback: Use API data (legacy path)
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

        const contracts = Math.trunc(safeParseNumber(highestStrikeTrade.OptionContracts));
        const netAmount = safeParseNumber(highestStrikeTrade.NetAmount);
        const grossPremium = getOptionPremiumUSD(highestStrikeTrade);
        const totalPremium = netAmount !== 0 ? Math.abs(netAmount) : grossPremium;

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
      console.log('🎨 Data type:', typeof data);
      console.log('🎨 Data keys:', data ? Object.keys(data as object) : 'null');
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

      console.log('🎨 premiumData.aggregations:', premiumData.aggregations);
      console.log('🎨 Will render card:', !!premiumData.aggregations);
      if (premiumData.aggregations) {
        const displayTimePeriod = tradeUI.timePeriod || 'all time';
        return (
          <div style={{ marginTop: '12px' }}>
            <TotalPremiumCard
              symbol={symbol || 'Portfolio'}
              totalPremium={premiumData.aggregations.totalPremium}
              totalTrades={premiumData.aggregations.totalTrades}
              totalContracts={premiumData.aggregations.totalContracts}
              callCount={premiumData.aggregations.callCount}
              putCount={premiumData.aggregations.putCount}
              tradeType={tradeUI.tradeType || 'all'}
              timePeriod={displayTimePeriod}
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

      if (expiringData.trades && expiringData.trades.length > 0) {
        return (
          <div style={{ marginTop: '12px' }}>
            <ExpiringOptionsTable
              trades={expiringData.trades}
              expirationPeriod={tradeUI.expiration || 'tomorrow'}
              aggregations={expiringData.aggregations ? {
                tradeCount: expiringData.aggregations.tradeCount,
                totalPremium: expiringData.aggregations.totalPremium,
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

      if (lastOptionData.trades && lastOptionData.trades.length > 0) {
        // ALWAYS show single trade card for 'last-option' type - user asked for THE last trade
        // Take only the first (most recent) trade regardless of how many are in the response
        const trade = lastOptionData.trades[0];
        const isCall = trade['Call/Put'] === 'C';
        const isBuy = trade.TradeType === 'B';
        const contracts = Math.trunc(safeParseNumber(trade.OptionContracts));
        const premium = safeParseNumber(trade.OptionTradePremium);
        const netAmount = safeParseNumber(trade.NetAmount);
        const totalValue = netAmount !== 0 ? Math.abs(netAmount) : Math.abs(premium * contracts * 100);
        const strike = safeParseNumber(trade.Strike);
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
              totalValue={totalValue}
            />
          </div>
        );
      }
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
          periodMonth?: string;
          entries?: Array<{ date: string; amount: number }>;
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
        suggestion?: {
          period: string;
          amount: number;
          count: number;
          startDate: string;
          endDate: string;
        } | null;
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
              suggestion={feesData.suggestion}
            />
          </div>
        );
      }
    }

    return null;
  };

  // WebSocket keepalive to prevent turn timeout (ElevenLabs docs recommend 30s interval)
  // sendUserActivity resets the turn timeout timer, keeping the connection alive during silence
  // Store conversation in ref to avoid dependency issues
  const elevenLabsConversationRef = useRef(elevenLabsConversation);
  elevenLabsConversationRef.current = elevenLabsConversation;

  useEffect(() => {
    const isConnected = elevenLabsConversation.status === 'connected';

    if (isConnected && inputMode === 'voice') {
      // Clear any existing interval first
      if (keepaliveIntervalRef.current) {
        clearInterval(keepaliveIntervalRef.current);
      }

      // Start keepalive interval (30s as recommended by ElevenLabs docs)
      keepaliveIntervalRef.current = setInterval(() => {
        const conv = elevenLabsConversationRef.current;
        if (conv.status === 'connected') {
          // sendUserActivity resets the turn timeout timer, preventing disconnects during silence
          // Per ElevenLabs docs: "This event is primarily used to reset the turn timeout timer"
          if (typeof conv.sendUserActivity === 'function') {
            conv.sendUserActivity();
            console.log('🔄 Sent keepalive ping to ElevenLabs');
          }
        }
      }, 30000); // 30 seconds (as per ElevenLabs documentation)

      console.log('🟢 Started keepalive interval for voice connection (30s)');
    }

    return () => {
      if (keepaliveIntervalRef.current) {
        clearInterval(keepaliveIntervalRef.current);
        keepaliveIntervalRef.current = null;
        console.log('🔴 Cleared keepalive interval');
      }
      // Also clear any pending reconnection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [elevenLabsConversation.status, inputMode]);

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
      <div style={styles.widgetButton} onClick={handleOpen} data-testid="assistant-widget">
        <div style={styles.widgetOrb}>
          <div style={styles.widgetOrbHighlight} />
          <div style={styles.widgetOrbReflection} />
        </div>
        <span style={styles.widgetText}>Need help?</span>
        <button style={styles.widgetCallBtn} onClick={(e) => { e.stopPropagation(); handleOpen(); }} data-testid="assistant-open">
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
              <button onClick={toggleMode} style={styles.modeButton} data-testid="assistant-toggle-mode">
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
          <div ref={transcriptRef} style={styles.messagesContainer} data-testid="assistant-messages">
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
              <div key={message.id} data-testid="chat-message" data-role={message.role}>
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
                      <span data-testid="chat-message-text">{message.content}</span>
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
                data-testid="assistant-input"
              />
              <div style={styles.inputActions}>
                <button type="button" onClick={handleEndChat} style={styles.endChatButton} data-testid="assistant-end-chat">
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
                  data-testid="assistant-send"
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
                {transcript.map((msg) => {
                  // Debug logging for tradeUI
                  if (msg.role === 'assistant') {
                    console.log('📝 [Render] Message has tradeUI:', !!msg.tradeUI, 'type:', msg.tradeUI?.type, 'id:', msg.id);
                  }
                  return (
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
                  );
                })}
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
