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
import { StockQuoteCard } from './generative-ui/StockQuoteCard';
import { CompanyOverviewCard } from './generative-ui/CompanyOverviewCard';
import { OptionQuoteCard } from './generative-ui/OptionQuoteCard';
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
  type: 'summary' | 'detailed' | 'stats' | 'profitable' | 'time-based' | 'option-stats' | 'average-price' | 'advanced-options' | 'highest-strike' | 'total-premium' | 'expiring-options' | 'last-option' | 'account-balance' | 'fees' | 'options'
    // Market data types
    | 'stock-quote' | 'option-quote' | 'price-chart' | 'news' | 'halt-status'
    // Fundamentals types
    | 'company-overview' | 'fundamental-metric' | 'financials' | 'earnings' | 'dividend'
    // Contextual follow-up (detected by LLM, merged with previous context)
    | 'contextual-followup';
  symbol: string;
  tradeType?: 'buy' | 'sell' | 'all';
  timePeriod?: string;
  dateFilter?: {
    type: 'range' | 'discrete' | 'relative';
    startDate?: string;
    endDate?: string;
    dates?: string[];
    description?: string;
  };
  callPut?: 'call' | 'put';
  expiration?: string;
  queryType?: string; // For options queries
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
  securityType?: 'stock' | 'option';  // Filter by instrument type
  timePeriod?: string;
  callPut?: 'call' | 'put';
  expiration?: string;
  accountQueryType?: AccountQueryType;
  feeType?: FeeType;
  dateFilter?: { type: string; startDate?: string; endDate?: string; description: string };
}

interface QueryIntentWithConfidence extends QueryIntent {
  confidence?: number;
}

/**
 * LLM-first intent selection - uses LLM classifier as the sole source of truth
 * No regex fallback - the LLM handles all intent detection
 */
function chooseIntent(
  userQuery: string,
  llmIntent: QueryIntentWithConfidence | null
): QueryIntent | null {
  if (llmIntent) {
    console.log('🎯 [Intent] LLM classified:', llmIntent.cardType, `(${((llmIntent.confidence ?? 0) * 100).toFixed(0)}% confidence)`);
    return llmIntent;
  }

  console.log('🎯 [Intent] LLM returned no match for query:', userQuery.slice(0, 50));
  return null;
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

// NOTE: detectContextualTimePeriodFollowup regex function has been REMOVED
// Contextual follow-up detection is now handled by LLM classification (intent: contextual.time_period_followup)
// The LLM approach is more flexible and handles natural language variations better

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
      // Webhook returns flat structure (tradeCount, stockCount, etc. at top level)
      tradeCount?: number;
      stockCount?: number;
      optionCount?: number;
      totalValue?: number;
      timePeriod?: string;
      displayRange?: string;
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
    // Read from flat structure (webhook returns tradeCount not totalTrades)
    const totalTrades = d.tradeCount ?? 0;
    const stockCount = d.stockCount ?? 0;
    const optionCount = d.optionCount ?? 0;
    const totalValue = d.totalValue ?? 0;
    // Ensure desc is always a string (webhook may return object for timePeriod)
    const rawDesc = d.timePeriod || tradeUI.timePeriod || intent.timePeriod || '';
    const desc = typeof rawDesc === 'string' ? rawDesc : (rawDesc as { description?: string })?.description || '';
    const range = d.displayRange ? ` from ${d.displayRange}` : '';
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
    // Webhook returns transformed camelCase data, not raw database fields
    const d = tradeUI.data as {
      trades?: Array<{
        id: number;
        date: string;
        symbol: string;
        underlyingSymbol?: string;
        tradeType: string;      // 'B' or 'S'
        callPut: string;        // 'C' or 'P'
        strike: number;
        expiration: string;
        contracts: number;
        premium: number;        // Already absolute value of NetAmount
        premiumPerContract: number;
      }>;
    };

    const trades = d.trades || [];
    if (!trades.length) return null;

    // Get the most recent (first) trade
    const trade = trades[0];
    const underlying = trade.underlyingSymbol || parseOCCOptionSymbolDetails(trade.symbol)?.underlying || tradeUI.symbol || 'unknown';
    const contracts = Math.trunc(trade.contracts);
    const strike = trade.strike;
    // Webhook already provides premium as absolute value
    const totalPremium = trade.premium;
    const perContract = trade.premiumPerContract;
    const callPut = trade.callPut === 'C' ? 'call' : 'put';
    const action = trade.tradeType === 'B' ? 'bought' : 'sold';
    const premiumVerb = trade.tradeType === 'B' ? 'paying' : 'collecting';
    const displayDate = formatDateForHighestStrikeCard(trade.date);
    const displayExpiration = formatDateForHighestStrikeCard(trade.expiration);

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
      asOfDate?: string; // API returns asOfDate, not date
      timePeriod?: string; // API returns timePeriod for balance trends
      cashBalance?: number;
      accountEquity?: number;
      dayTradingBP?: number;
      stockLMV?: number;
      stockSMV?: number;
      optionsLMV?: number;
      optionsSMV?: number;
      houseRequirement?: number;
      houseExcessDeficit?: number;
      // Flat fields returned by API for balance trends
      avgBalance?: number;
      maxBalance?: number;
      minBalance?: number;
      maxBalanceDate?: string;
      minBalanceDate?: string;
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

    if (!d || d.error) return null;

    const queryType = tradeUI.accountQueryType || d.queryType || intent.accountQueryType || 'account_summary';

    // Handle balance trends first (they use timePeriod, not date)
    if (queryType === 'debit_balances' || queryType === 'credit_balances') {
      // Construct balanceTrend from flat API fields if not already present
      let trend = d.balanceTrend;
      if (!trend && d.avgBalance !== undefined) {
        trend = {
          average: d.avgBalance,
          highest: d.maxBalance || 0,
          highestDate: d.maxBalanceDate || '',
          lowest: d.minBalance || 0,
          lowestDate: d.minBalanceDate || '',
          period: d.timePeriod || '',
        };
      }
      if (!trend) return null;

      const monthLabel = trend.periodMonth || trend.period;
      const average = formatUSDCurrency(trend.average);
      const highestAmount = formatUSDCurrency(trend.highest);
      const lowestAmount = formatUSDCurrency(trend.lowest);
      const highestDate = formatCalendarDate(trend.highestDate);
      const lowestDate = formatCalendarDate(trend.lowestDate);

      const balanceType = queryType === 'debit_balances' ? 'debit' : 'credit';
      return `Your average ${balanceType} balance for ${monthLabel} is ${average}.\nThe highest ${balanceType} balance was on ${highestDate} at ${highestAmount}.\nThe lowest ${balanceType} balance was on ${lowestDate} at ${lowestAmount}.`;
    }

    // For other query types, we need a date
    const dateValue = d?.date || d?.asOfDate;
    if (!dateValue) return null;
    const asOfDate = formatCalendarDate(dateValue);

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

    const jsonResponse = await response.json() as { result: ClassificationResult | null };
    const { result } = jsonResponse;

    // DEBUG: Log the raw API response to verify dateFilter is present
    console.log('🔍 [LLM Classifier] Raw API response:', JSON.stringify(jsonResponse, null, 2));
    console.log('🔍 [LLM Classifier] result.entities:', result?.entities);
    console.log('🔍 [LLM Classifier] result.entities.dateFilter:', result?.entities?.dateFilter);

    if (!result) {
      console.log('[LLM Classifier] No confident match from GPT');
      return null;
    }

    // Map ClassificationResult to QueryIntentWithConfidence format (includes confidence)
    return {
      cardType: result.cardType as QueryIntent['cardType'],
      symbol: result.entities.symbol,
      tradeType: result.entities.tradeType,
      securityType: result.entities.securityType,  // stock/option filter
      timePeriod: result.entities.timePeriod,
      callPut: result.entities.callPut,
      expiration: result.entities.expiration,
      accountQueryType: result.entities.accountQueryType,
      feeType: result.entities.feeType,
      dateFilter: result.entities.dateFilter,
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

// NOTE: ALL regex-based detection/parsing functions have been REMOVED.
// We use LLM-only architecture for intent detection and entity extraction.
// - Intent classification: LLM classifier at /api/classify-intent
// - Entity extraction: LLM extracts symbol, timePeriod, dateFilter, etc.
// - UI data: Tool functions set toolUIDataRef.current with structured webhook data
// - No text parsing: Webhooks return structured uiData, no need to parse agent text

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
  // Supports both fees and trades suggestions
  const lastSuggestionRef = useRef<{
    type: 'fees' | 'trades';
    feeType?: FeeType;  // Only for fees type
    cardType?: string;  // Original card type for trades
    timePeriod: string;
    startDate: string;
    endDate: string;
    amount?: number;    // For fees
    count: number;
    symbol?: string;
    tradeType?: string; // For trades
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
  // Promise that resolves when tool function sets toolUIDataRef (for voice mode sync)
  // Message handler awaits this to ensure UI data is ready before rendering
  const pendingToolDataPromiseRef = useRef<Promise<TradeUIData | null> | null>(null);
  const resolveToolDataPromiseRef = useRef<((data: TradeUIData | null) => void) | null>(null);
  // Promise that resolves when the LLM classifier completes (for voice mode)
  // Tool functions await this to ensure dateFilter/entities are available
  const pendingLLMClassifierPromiseRef = useRef<Promise<QueryIntent | null> | null>(null);

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

  // Create a promise that will be resolved when tool function sets UI data
  // This prevents the race condition where message handler runs before tool fetch completes
  function startToolDataPromise(): void {
    pendingToolDataPromiseRef.current = new Promise((resolve) => {
      resolveToolDataPromiseRef.current = resolve;
      // Auto-resolve after 5 seconds to prevent infinite waiting if tool doesn't complete
      setTimeout(() => {
        if (resolveToolDataPromiseRef.current === resolve) {
          console.log('⚠️ [Tool Data Promise] Auto-resolved after 5s timeout');
          resolve(null);
          resolveToolDataPromiseRef.current = null;
        }
      }, 5000);
    });
    console.log('🔧 [Tool Data Promise] Created new promise, awaiting tool data...');
  }

  // Resolve the promise when tool function sets UI data
  function resolveToolDataPromise(data: TradeUIData | null): void {
    if (resolveToolDataPromiseRef.current) {
      console.log('🔧 [Tool Data Promise] Resolving with data:', data ? data.type : 'null');
      resolveToolDataPromiseRef.current(data);
      resolveToolDataPromiseRef.current = null;
    }
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

    // Helper: Await LLM classifier if it's still running (fixes race condition)
    // Tool functions call this to ensure dateFilter is available before making API calls
    const awaitLLMClassifier = async (): Promise<QueryIntent | null> => {
      if (pendingLLMClassifierPromiseRef.current) {
        console.log('⏳ [Tool] Awaiting LLM classifier...');
        const result = await pendingLLMClassifierPromiseRef.current;
        console.log('✅ [Tool] LLM classifier complete:', result ? `${result.cardType} | dateFilter: ${JSON.stringify(result.dateFilter)}` : 'null');
        return result;
      }
      return pendingQueryIntentRef.current;
    };

    const get_trade_summary = async (parameters: Record<string, unknown>) => {
      // UNIFIED INTENT: "How many trades" and "Show my trades" are the same intent
      // Both now route to detailed-trades endpoint for consistent UI
      console.log('📊 [Trade Summary Tool] ================================');
      console.log('📊 [Trade Summary Tool] Parameters:', JSON.stringify(parameters, null, 2));
      console.log('📊 [Trade Summary Tool] Note: Routing to detailed-trades for unified experience');

      // CRITICAL: Await LLM classifier to get dateFilter (fixes race condition)
      const llmIntent = await awaitLLMClassifier();

      // CRITICAL: Use LLM classifier's values when ElevenLabs doesn't provide them
      const rawSymbol = getToolSymbol(parameters);
      const llmSymbol = llmIntent?.symbol;
      const symbol = llmSymbol || rawSymbol;

      const rawTimePeriod = getString(parameters, 'time_period');
      const llmTimePeriod = llmIntent?.timePeriod;
      const timePeriod = rawTimePeriod || llmTimePeriod;

      const rawDateFilter = parameters.date_filter as Record<string, unknown> | undefined;
      const llmDateFilter = llmIntent?.dateFilter;
      const dateFilter = rawDateFilter || llmDateFilter;

      console.log('📊 [Trade Summary Tool] Raw symbol:', rawSymbol, '| LLM symbol:', llmSymbol, '| Using:', symbol);
      console.log('📊 [Trade Summary Tool] Raw timePeriod:', rawTimePeriod, '| LLM timePeriod:', llmTimePeriod, '| Using:', timePeriod);
      console.log('📊 [Trade Summary Tool] Raw dateFilter:', rawDateFilter, '| LLM dateFilter:', llmDateFilter);

      // SINGLE FETCH: Use detailed-trades endpoint which returns full data + counts
      const voicePayload = await postJson('/api/elevenlabs/detailed-trades', { symbol, time_period: timePeriod, date_filter: dateFilter });

      // Store UI data as 'detailed' type for TradesTable rendering
      // CRITICAL: Include timePeriod and dateFilter for proper date filtering in UI
      if (voicePayload && typeof voicePayload === 'object' && 'uiData' in voicePayload) {
        toolUIDataRef.current = { type: 'detailed', symbol: symbol || '', data: voicePayload.uiData, timePeriod, dateFilter: dateFilter as TradeUIData['dateFilter'] };
        console.log('📊 [Trade Summary Tool] Set toolUIDataRef (detailed type) from voice response:', toolUIDataRef.current);
        resolveToolDataPromise(toolUIDataRef.current);
      } else {
        resolveToolDataPromise(null);
      }

      console.log('📊 [Trade Summary Tool] ================================');
      return unwrapResponse(voicePayload);
    };

    const get_detailed_trades = async (parameters: Record<string, unknown>) => {
      console.log('📊 [Detailed Trades Tool] ================================');
      console.log('📊 [Detailed Trades Tool] Parameters:', JSON.stringify(parameters, null, 2));

      // CRITICAL: Await LLM classifier to get dateFilter (fixes race condition)
      const llmIntent = await awaitLLMClassifier();

      // CRITICAL: Use LLM classifier's values when ElevenLabs doesn't provide them
      const rawSymbol = getToolSymbol(parameters);
      const llmSymbol = llmIntent?.symbol;
      const symbol = llmSymbol || rawSymbol;

      const rawTimePeriod = getString(parameters, 'time_period');
      const llmTimePeriod = llmIntent?.timePeriod;
      const timePeriod = rawTimePeriod || llmTimePeriod;

      const rawDateFilter = parameters.date_filter as Record<string, unknown> | undefined;
      const llmDateFilter = llmIntent?.dateFilter;
      const dateFilter = rawDateFilter || llmDateFilter;

      console.log('📊 [Detailed Trades] Raw symbol:', rawSymbol, '| LLM symbol:', llmSymbol, '| Using:', symbol);
      console.log('📊 [Detailed Trades] Raw timePeriod:', rawTimePeriod, '| LLM timePeriod:', llmTimePeriod, '| Using:', timePeriod);
      console.log('📊 [Detailed Trades] Raw dateFilter:', rawDateFilter, '| LLM dateFilter:', llmDateFilter);

      // SINGLE FETCH: Voice endpoint returns BOTH response AND uiData
      const voicePayload = await postJson('/api/elevenlabs/detailed-trades', { symbol, time_period: timePeriod, date_filter: dateFilter });

      // Store UI data from voice response (guaranteed sync)
      // CRITICAL: Include timePeriod and dateFilter for proper date filtering in UI
      if (voicePayload && typeof voicePayload === 'object' && 'uiData' in voicePayload) {
        toolUIDataRef.current = { type: 'detailed', symbol: symbol || '', data: voicePayload.uiData, timePeriod, dateFilter: dateFilter as TradeUIData['dateFilter'] };
        console.log('📊 [Detailed Trades Tool] Set toolUIDataRef from voice response:', toolUIDataRef.current);
        resolveToolDataPromise(toolUIDataRef.current);
      } else {
        resolveToolDataPromise(null);
      }

      console.log('📊 [Detailed Trades Tool] ================================');
      return unwrapResponse(voicePayload);
    };

    const get_trade_stats = async (parameters: Record<string, unknown>) => {
      console.log('📊 [Trade Stats Tool] ================================');
      console.log('📊 [Trade Stats Tool] Parameters:', JSON.stringify(parameters, null, 2));

      // CRITICAL: Await LLM classifier to get dateFilter (fixes race condition)
      const llmIntent = await awaitLLMClassifier();

      // CRITICAL: Use LLM classifier's values when ElevenLabs doesn't provide them
      const rawSymbol = getToolSymbol(parameters);
      const llmSymbol = llmIntent?.symbol;
      const symbol = llmSymbol || rawSymbol;

      const rawTradeType = getString(parameters, 'trade_type');
      const llmTradeType = llmIntent?.tradeType;
      const tradeType = rawTradeType || llmTradeType;

      const rawTimePeriod = getString(parameters, 'time_period');
      const llmTimePeriod = llmIntent?.timePeriod;
      const timePeriod = rawTimePeriod || llmTimePeriod;

      const rawDateFilter = parameters.date_filter as Record<string, unknown> | undefined;
      const llmDateFilter = llmIntent?.dateFilter;
      const dateFilter = rawDateFilter || llmDateFilter;

      console.log('📊 [Trade Stats] Using symbol:', symbol, '| timePeriod:', timePeriod, '| dateFilter:', dateFilter);

      // SINGLE FETCH: Voice endpoint returns BOTH response AND uiData
      const voicePayload = await postJson('/api/elevenlabs/trade-stats', { symbol, trade_type: tradeType, time_period: timePeriod, date_filter: dateFilter });

      // Store UI data from voice response (guaranteed sync)
      // Transform webhook format to UI expected format
      if (voicePayload && typeof voicePayload === 'object' && 'uiData' in voicePayload) {
        const webhookData = voicePayload.uiData;
        const stockStats = webhookData.stockStats;

        // Transform stockStats to match UI expected field names
        const transformedStats = stockStats ? {
          symbol: webhookData.symbol,
          tradeType: (webhookData.tradeType || 'all') as 'buy' | 'sell' | 'all',
          timePeriod: webhookData.timePeriod || timePeriod || null,
          highestPrice: stockStats.highestPrice,
          highestPriceDate: stockStats.highestDate,  // Map highestDate → highestPriceDate
          highestPriceShares: stockStats.highestShares,  // Map highestShares → highestPriceShares
          lowestPrice: stockStats.lowestPrice,
          lowestPriceDate: stockStats.lowestDate,  // Map lowestDate → lowestPriceDate
          lowestPriceShares: stockStats.lowestShares,  // Map lowestShares → lowestPriceShares
          averagePrice: stockStats.avgPrice,  // Map avgPrice → averagePrice
          totalTrades: stockStats.tradeCount,  // Map tradeCount → totalTrades
          totalShares: stockStats.totalShares,
          totalValue: stockStats.totalValue,
        } : null;

        toolUIDataRef.current = {
          type: 'stats',
          symbol: symbol || '',
          tradeType: tradeType as 'buy' | 'sell' | undefined,
          timePeriod,
          data: transformedStats ? { stats: transformedStats } : null,  // Nest under 'stats' as expected
          optionData: null  // Voice endpoint focuses on stock stats (options handled by options tool)
        };
        console.log('📊 [Trade Stats Tool] Set toolUIDataRef from voice response:', toolUIDataRef.current);
        resolveToolDataPromise(toolUIDataRef.current);
      } else {
        resolveToolDataPromise(null);
      }

      console.log('📊 [Trade Stats Tool] ================================');
      return unwrapResponse(voicePayload);
    };

    const get_profitable_trades = async (parameters: Record<string, unknown>) => {
      console.log('📊 [Profitable Trades Tool] ================================');
      console.log('📊 [Profitable Trades Tool] Parameters:', JSON.stringify(parameters, null, 2));

      // CRITICAL: Await LLM classifier to get dateFilter (fixes race condition)
      const llmIntent = await awaitLLMClassifier();

      // CRITICAL: Use LLM classifier's values when ElevenLabs doesn't provide them
      const rawSymbol = getToolSymbol(parameters);
      const llmSymbol = llmIntent?.symbol;
      const symbol = llmSymbol || rawSymbol;

      const rawTimePeriod = getString(parameters, 'time_period');
      const llmTimePeriod = llmIntent?.timePeriod;
      const timePeriod = rawTimePeriod || llmTimePeriod;

      const rawDateFilter = parameters.date_filter as Record<string, unknown> | undefined;
      const llmDateFilter = llmIntent?.dateFilter;
      const dateFilter = rawDateFilter || llmDateFilter;

      console.log('📊 [Profitable Trades] Using symbol:', symbol, '| timePeriod:', timePeriod, '| dateFilter:', dateFilter);

      // SINGLE FETCH: Voice endpoint returns BOTH response AND uiData
      const voicePayload = await postJson('/api/elevenlabs/profitable-trades', { symbol, time_period: timePeriod, date_filter: dateFilter });

      // Store UI data from voice response (guaranteed sync)
      // Transform webhook format to UI expected format
      if (voicePayload && typeof voicePayload === 'object' && 'uiData' in voicePayload) {
        const webhookData = voicePayload.uiData;
        const transformedData = {
          symbol: webhookData.symbol,
          totalProfitableTrades: webhookData.tradeCount || 0,  // Map tradeCount → totalProfitableTrades
          totalProfit: webhookData.totalProfit || 0,
          trades: webhookData.profitableTrades || [],  // Map profitableTrades → trades
        };
        toolUIDataRef.current = { type: 'profitable', symbol: symbol || '', timePeriod, data: transformedData };
        console.log('📊 [Profitable Trades Tool] Set toolUIDataRef from voice response:', toolUIDataRef.current);
        resolveToolDataPromise(toolUIDataRef.current);
      } else {
        resolveToolDataPromise(null);
      }

      console.log('📊 [Profitable Trades Tool] ================================');
      return unwrapResponse(voicePayload);
    };

    const get_time_based_trades = async (parameters: Record<string, unknown>) => {
      console.log('📊 [Time Based Trades Tool] ================================');
      console.log('📊 [Time Based Trades Tool] Parameters:', JSON.stringify(parameters, null, 2));

      // CRITICAL: Await LLM classifier to get dateFilter (fixes race condition)
      const llmIntent = await awaitLLMClassifier();

      // CRITICAL: Use LLM classifier's values when ElevenLabs doesn't provide them
      const rawSymbol = getToolSymbol(parameters);
      const llmSymbol = llmIntent?.symbol;
      const symbol = llmSymbol || rawSymbol;

      const rawTimePeriod = getString(parameters, 'time_period');
      const llmTimePeriod = llmIntent?.timePeriod;
      const timePeriod = rawTimePeriod || llmTimePeriod;

      const rawDateFilter = parameters.date_filter as Record<string, unknown> | undefined;
      const llmDateFilter = llmIntent?.dateFilter;
      const dateFilter = rawDateFilter || llmDateFilter;

      const calculation = getString(parameters, 'calculation');
      const tradeType = getString(parameters, 'trade_type');

      console.log('📊 [Time Based Trades] Using symbol:', symbol, '| timePeriod:', timePeriod, '| dateFilter:', dateFilter);

      // SINGLE FETCH: Voice endpoint returns BOTH response AND uiData
      const voicePayload = await postJson('/api/elevenlabs/time-trades', { symbol, time_period: timePeriod, calculation, trade_type: tradeType, date_filter: dateFilter });

      // Store UI data from voice response (guaranteed sync)
      if (voicePayload && typeof voicePayload === 'object' && 'uiData' in voicePayload) {
        toolUIDataRef.current = { type: 'time-based', symbol: symbol || '', timePeriod, data: voicePayload.uiData };
        console.log('📊 [Time Based Trades Tool] Set toolUIDataRef from voice response:', toolUIDataRef.current);
        // Resolve promise so message handler knows data is ready
        resolveToolDataPromise(toolUIDataRef.current);
      } else {
        // No uiData in response - still resolve to prevent waiting
        resolveToolDataPromise(null);
      }

      console.log('📊 [Time Based Trades Tool] ================================');
      return unwrapResponse(voicePayload);
    };

    const get_advanced_trades = async (parameters: Record<string, unknown>) => {
      console.log('📊 [Advanced Trades Tool] ================================');
      console.log('📊 [Advanced Trades Tool] Parameters:', JSON.stringify(parameters, null, 2));

      // CRITICAL: Await LLM classifier to get dateFilter (fixes race condition)
      const llmIntent = await awaitLLMClassifier();

      // CRITICAL: Use LLM classifier's values when ElevenLabs doesn't provide them
      const rawSymbol = getToolSymbol(parameters);
      const llmSymbol = llmIntent?.symbol;
      const symbol = llmSymbol || rawSymbol;

      const rawTradeType = getString(parameters, 'trade_type');
      const llmTradeType = llmIntent?.tradeType;
      const tradeType = rawTradeType || llmTradeType;

      const rawCallPut = getString(parameters, 'call_put');
      const llmCallPut = llmIntent?.callPut;
      const callPut = rawCallPut || llmCallPut;

      const rawTimePeriod = getString(parameters, 'time_period');
      const llmTimePeriod = llmIntent?.timePeriod;
      const timePeriod = rawTimePeriod || llmTimePeriod;

      const rawDateFilter = parameters.date_filter as Record<string, unknown> | undefined;
      const llmDateFilter = llmIntent?.dateFilter;
      const dateFilter = rawDateFilter || llmDateFilter;

      const securityType = getString(parameters, 'security_type');
      const fromDate = getString(parameters, 'from_date');
      const toDate = getString(parameters, 'to_date');
      const expiration = getString(parameters, 'expiration') || llmIntent?.expiration;

      console.log('📊 [Advanced Trades] Using symbol:', symbol, '| timePeriod:', timePeriod, '| dateFilter:', dateFilter);

      // SINGLE FETCH: Voice endpoint returns BOTH response AND uiData
      const voicePayload = await postJson('/api/elevenlabs/advanced-query', {
        symbol, security_type: securityType, trade_type: tradeType, call_put: callPut,
        from_date: fromDate, to_date: toDate, expiration,
        time_period: timePeriod, date_filter: dateFilter,
        strike: parameters['strike'], aggregation: getString(parameters, 'aggregation'),
        limit: parameters['limit'], order_by: getString(parameters, 'order_by'),
      });

      // Store UI data from voice response (guaranteed sync)
      if (voicePayload && typeof voicePayload === 'object' && 'uiData' in voicePayload) {
        toolUIDataRef.current = {
          type: 'advanced-options',
          symbol: symbol || '',
          tradeType: tradeType as 'buy' | 'sell' | undefined,
          callPut: callPut as 'call' | 'put' | undefined,
          expiration,
          data: voicePayload.uiData
        };
        console.log('📊 [Advanced Trades Tool] Set toolUIDataRef from voice response:', toolUIDataRef.current);
        resolveToolDataPromise(toolUIDataRef.current);
      } else {
        resolveToolDataPromise(null);
      }

      console.log('📊 [Advanced Trades Tool] ================================');
      return unwrapResponse(voicePayload);
    };

    const get_account_balance = async (parameters: Record<string, unknown>) => {
      console.log('💰 [Account Balance Tool] ================================');
      console.log('💰 [Account Balance Tool] Parameters:', JSON.stringify(parameters, null, 2));

      // CRITICAL: Await LLM classifier to get dateFilter (fixes race condition)
      const llmIntent = await awaitLLMClassifier();

      // CRITICAL: Use LLM classifier's values when ElevenLabs doesn't provide them
      const rawQueryType = getString(parameters, 'query_type');
      const llmQueryType = llmIntent?.accountQueryType;
      const queryType = rawQueryType || llmQueryType;

      const rawTimePeriod = getString(parameters, 'time_period');
      const llmTimePeriod = llmIntent?.timePeriod;
      const timePeriod = rawTimePeriod || llmTimePeriod;

      const rawDateFilter = parameters.date_filter as Record<string, unknown> | undefined;
      const llmDateFilter = llmIntent?.dateFilter;
      const dateFilter = rawDateFilter || llmDateFilter;

      console.log('💰 [Account Balance] Using queryType:', queryType, '| timePeriod:', timePeriod, '| dateFilter:', dateFilter);

      // SINGLE FETCH: Voice endpoint returns BOTH response AND uiData
      const voicePayload = await postJson('/api/elevenlabs/account-balance', { query_type: queryType, time_period: timePeriod, date_filter: dateFilter });

      // Store UI data from voice response (guaranteed sync)
      if (voicePayload && typeof voicePayload === 'object' && 'uiData' in voicePayload) {
        toolUIDataRef.current = {
          type: 'account-balance',
          symbol: '',
          accountQueryType: queryType as AccountQueryType,
          data: voicePayload.uiData
        };
        console.log('💰 [Account Balance Tool] Set toolUIDataRef from voice response:', toolUIDataRef.current);
        resolveToolDataPromise(toolUIDataRef.current);
      } else {
        resolveToolDataPromise(null);
      }

      const result = unwrapResponse(voicePayload);
      console.log('💰 [Account Balance Tool] Webhook Response:', result);
      console.log('💰 [Account Balance Tool] ================================');
      return result;
    };

    const get_fees = async (parameters: Record<string, unknown>) => {
      console.log('💸 [Fees Tool] ================================');
      console.log('💸 [Fees Tool] Parameters:', JSON.stringify(parameters, null, 2));

      // CRITICAL: Await LLM classifier to get dateFilter (fixes race condition)
      const llmIntent = await awaitLLMClassifier();

      // CRITICAL: Use LLM classifier's values when ElevenLabs doesn't provide them
      const rawFeeType = getString(parameters, 'fee_type');
      const llmFeeType = llmIntent?.feeType;
      const feeType = rawFeeType || llmFeeType;

      const rawTimePeriod = getString(parameters, 'time_period');
      const llmTimePeriod = llmIntent?.timePeriod;
      const timePeriod = rawTimePeriod || llmTimePeriod;

      const rawDateFilter = parameters.date_filter as Record<string, unknown> | undefined;
      const llmDateFilter = llmIntent?.dateFilter;
      const dateFilter = rawDateFilter || llmDateFilter;

      // CRITICAL: Use LLM-corrected symbol from intent classifier if available
      // This fixes speech-to-text errors like "M10" → "MTEN"
      const rawSymbol = getToolSymbol(parameters);
      const llmSymbol = llmIntent?.symbol;
      const symbol = llmSymbol || rawSymbol;

      console.log('💸 [Fees Tool] Using symbol:', symbol, '| feeType:', feeType, '| timePeriod:', timePeriod, '| dateFilter:', dateFilter);

      // SINGLE FETCH: Voice endpoint returns BOTH response AND uiData
      const voicePayload = await postJson('/api/elevenlabs/fees', { fee_type: feeType, time_period: timePeriod, symbol, date_filter: dateFilter });

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
        resolveToolDataPromise(toolUIDataRef.current);
      } else {
        resolveToolDataPromise(null);
      }

      const result = unwrapResponse(voicePayload);
      console.log('💸 [Fees Tool] Webhook Response:', result);
      console.log('💸 [Fees Tool] ================================');
      return result;
    };

    // Dedicated Options tool for all options queries
    // Query types: bulk, last, expiring, highest_strike, total_premium
    const get_options = async (parameters: Record<string, unknown>) => {
      console.log('📈 [Options Tool] ================================');
      console.log('📈 [Options Tool] Parameters:', JSON.stringify(parameters, null, 2));

      // CRITICAL: Await LLM classifier to get dateFilter (fixes race condition)
      const llmIntent = await awaitLLMClassifier();

      // CRITICAL: Use LLM classifier's values when ElevenLabs doesn't provide them
      const queryType = getString(parameters, 'query_type') || 'bulk';

      const rawSymbol = getToolSymbol(parameters);
      const llmSymbol = llmIntent?.symbol;
      const symbol = llmSymbol || rawSymbol;

      const rawCallPut = getString(parameters, 'call_put');
      const llmCallPut = llmIntent?.callPut;
      const callPut = rawCallPut || llmCallPut;

      const rawTradeType = getString(parameters, 'trade_type');
      const llmTradeType = llmIntent?.tradeType;
      const tradeType = rawTradeType || llmTradeType;

      const rawTimePeriod = getString(parameters, 'time_period');
      const llmTimePeriod = llmIntent?.timePeriod;
      const timePeriod = rawTimePeriod || llmTimePeriod;

      const rawDateFilter = parameters.date_filter as Record<string, unknown> | undefined;
      const llmDateFilter = llmIntent?.dateFilter;
      const dateFilter = rawDateFilter || llmDateFilter;

      const rawExpiration = getString(parameters, 'expiration');
      const llmExpiration = llmIntent?.expiration;
      const expiration = rawExpiration || llmExpiration;

      console.log('📈 [Options] Using symbol:', symbol, '| timePeriod:', timePeriod, '| dateFilter:', dateFilter);

      // SINGLE FETCH: Voice endpoint returns BOTH response AND uiData
      const voicePayload = await postJson('/api/elevenlabs/options', {
        query_type: queryType,
        symbol,
        call_put: callPut,
        trade_type: tradeType,
        time_period: timePeriod,
        expiration,
        date_filter: dateFilter,
      });

      // Store UI data from voice response (guaranteed sync)
      // Map queryType to specific UI types for renderTradeUI
      if (voicePayload && typeof voicePayload === 'object' && 'uiData' in voicePayload) {
        const typeMap: Record<string, TradeUIData['type']> = {
          'highest_strike': 'highest-strike',
          'total_premium': 'total-premium',
          'last': 'last-option',
          'expiring': 'expiring-options',
          'bulk': 'advanced-options',
        };
        const uiType = typeMap[queryType] || 'advanced-options';

        toolUIDataRef.current = {
          type: uiType,
          queryType,
          symbol: symbol || '',
          callPut: callPut as 'call' | 'put' | undefined,
          tradeType: tradeType as 'buy' | 'sell' | undefined,
          timePeriod,
          expiration,
          data: voicePayload.uiData,
        };
        console.log('📈 [Options Tool] Set toolUIDataRef from voice response:', toolUIDataRef.current);
        resolveToolDataPromise(toolUIDataRef.current);
      } else {
        resolveToolDataPromise(null);
      }

      console.log('📈 [Options Tool] ================================');
      return unwrapResponse(voicePayload);
    };

    return {
      get_trade_summary,
      get_detailed_trades,
      get_trade_stats,
      get_profitable_trades,
      get_time_based_trades,
      get_advanced_trades,
      get_options,
      get_account_balance,
      get_fees,

      // Aliases (in case tool names are camelCased in ElevenLabs UI)
      getTradeSummary: get_trade_summary,
      getDetailedTrades: get_detailed_trades,
      getTradeStats: get_trade_stats,
      getProfitableTrades: get_profitable_trades,
      getTimeBasedTrades: get_time_based_trades,
      getAdvancedTrades: get_advanced_trades,
      getOptions: get_options,
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

        // For assistant messages, log the message (symbol comes from LLM classifier, not regex)
        console.log('🔍 [Text Mode] Message:', assistantContent.substring(0, 150));

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

          // CRITICAL: Wait for tool function to complete before checking toolUIDataRef
          // This prevents the race condition where message handler runs before tool fetch completes
          if (pendingToolDataPromiseRef.current) {
            console.log('⏳ [Text Mode] Awaiting tool data promise...');
            const toolData = await pendingToolDataPromiseRef.current;
            pendingToolDataPromiseRef.current = null;  // Clear after awaiting
            console.log('✅ [Text Mode] Tool data promise resolved:', toolData ? toolData.type : 'null');
          }

          // HIGHEST PRIORITY: Use UI data set directly by client tools (single source of truth)
          if (toolUIDataRef.current) {
            tradeUI = toolUIDataRef.current;
            toolUIDataRef.current = null; // Clear after use
            console.log('🎯 [Tool Direct] Using UI data from client tool:', tradeUI.type);
            // Mark timestamp to prevent fallback from overriding
            lastIntentCardRenderedAtRef.current = Date.now();
          }

          // CRITICAL: Await LLM classifier before checking pendingIntent
          // The classifier runs async in user message handler and may not have finished yet
          if (!tradeUI && pendingLLMClassifierPromiseRef.current) {
            console.log('⏳ [Text Mode] Awaiting LLM classifier promise...');
            await pendingLLMClassifierPromiseRef.current;
            pendingLLMClassifierPromiseRef.current = null;  // Clear after awaiting
            console.log('✅ [Text Mode] LLM classifier promise resolved');
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

            // NOTE: highest-strike and other option types are now handled by tool functions
            // setting toolUIDataRef.current with the correct type. No text parsing needed.

            // Prefer the prefetched trade UI if available
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
                  dateFilter: pendingIntent.dateFilter,
                  securityType: pendingIntent.securityType,
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

          // NOTE: Regex-based fallbacks have been REMOVED.
          // The LLM classifier + pendingIntent is the single source of truth for text mode.
          // If pendingIntent didn't provide data, there's no fallback.
          if (!tradeUI) {
            console.log('⚠️ [Text Mode] No UI data available - LLM intent classification did not match');
          }

          if (tradeUI) {
            lastAssistantTradeUIRef.current = tradeUI;
            // Store suggestion for follow-up handling (supports both fees and trades)
            if (tradeUI.type === 'fees' && tradeUI.data) {
              const feesData = tradeUI.data as { suggestion?: { period: string; amount: number; count: number; startDate: string; endDate: string } | null; feeType?: FeeType; symbol?: string; timePeriod?: string };
              if (feesData.suggestion) {
                lastSuggestionRef.current = {
                  type: 'fees',
                  feeType: tradeUI.feeType || feesData.feeType || 'commission',
                  timePeriod: feesData.suggestion.period,
                  startDate: feesData.suggestion.startDate,
                  endDate: feesData.suggestion.endDate,
                  amount: feesData.suggestion.amount,
                  count: feesData.suggestion.count,
                  symbol: feesData.symbol || tradeUI.symbol,
                };
              }
            } else if ((tradeUI.type === 'time-based' || tradeUI.type === 'detailed') && tradeUI.data) {
              // Handle trade suggestions (from time-based or detailed queries)
              const tradesData = tradeUI.data as { suggestion?: { period: string; count: number; startDate: string; endDate: string } | null; symbol?: string | null; timePeriod?: string };
              if (tradesData.suggestion) {
                lastSuggestionRef.current = {
                  type: 'trades',
                  cardType: tradeUI.type,
                  timePeriod: tradesData.suggestion.period,
                  startDate: tradesData.suggestion.startDate,
                  endDate: tradesData.suggestion.endDate,
                  count: tradesData.suggestion.count,
                  symbol: tradesData.symbol || tradeUI.symbol,
                  tradeType: tradeUI.tradeType,
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
    type: TradeUIData['type'],
    tradeType?: 'buy' | 'sell' | 'all',
    timePeriod?: string,
    extraParams?: { callPut?: 'call' | 'put'; expiration?: string; aggregation?: string; accountQueryType?: AccountQueryType; feeType?: FeeType; includeTrades?: boolean; dateFilter?: { type: string; startDate?: string; endDate?: string; description: string }; queryType?: string; strike?: number; chartPeriod?: string; securityType?: 'stock' | 'option' }
  ): Promise<TradeUIData | null> => {
    try {
      let endpoint: string;
      let body: Record<string, unknown> = { symbol };

      // === MARKET DATA HANDLERS ===

      if (type === 'stock-quote') {
        // Use market-data webhook for stock quotes
        endpoint = '/api/elevenlabs/market-data';
        body = {
          query_type: 'stock_quote',
          symbol,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, data: uiData };
      }

      if (type === 'option-quote') {
        // Use market-data webhook for option quotes
        endpoint = '/api/elevenlabs/market-data';
        body = {
          query_type: 'option_quote',
          symbol,
          strike: extraParams?.strike,
          call_put: extraParams?.callPut,
          expiration: extraParams?.expiration,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, data: uiData };
      }

      if (type === 'price-chart') {
        // Use market-data webhook for historical charts
        endpoint = '/api/elevenlabs/market-data';
        body = {
          query_type: 'historical',
          symbol,
          chart_period: extraParams?.chartPeriod || timePeriod || '1 month',
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, data: uiData };
      }

      if (type === 'news') {
        // Use market-data webhook for news
        endpoint = '/api/elevenlabs/market-data';
        body = {
          query_type: 'news',
          symbol: symbol || undefined,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, data: uiData };
      }

      if (type === 'halt-status') {
        // Use market-data webhook for halt status
        endpoint = '/api/elevenlabs/market-data';
        body = {
          query_type: 'halt',
          symbol: symbol || undefined,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, data: uiData };
      }

      // === FUNDAMENTALS DATA HANDLERS ===

      if (type === 'company-overview') {
        // Use fundamentals webhook for company overview
        endpoint = '/api/elevenlabs/fundamentals';
        body = {
          query_type: 'overview',
          symbol,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, data: uiData };
      }

      if (type === 'fundamental-metric') {
        // Use fundamentals webhook for specific metrics
        endpoint = '/api/elevenlabs/fundamentals';
        body = {
          query_type: 'metric',
          symbol,
          metric_type: extraParams?.queryType, // metric type like pe_ratio, market_cap, etc.
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, data: uiData };
      }

      if (type === 'financials') {
        // Use fundamentals webhook for financial statements
        endpoint = '/api/elevenlabs/fundamentals';
        body = {
          query_type: 'financials',
          symbol,
          statement_type: extraParams?.queryType || 'income', // income, balance, cashflow
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, data: uiData };
      }

      if (type === 'earnings') {
        // Use fundamentals webhook for earnings data
        endpoint = '/api/elevenlabs/fundamentals';
        body = {
          query_type: 'earnings',
          symbol,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, data: uiData };
      }

      if (type === 'dividend') {
        // Use fundamentals webhook for dividend data
        endpoint = '/api/elevenlabs/fundamentals';
        body = {
          query_type: 'dividend',
          symbol,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, data: uiData };
      }

      // === EXISTING TRADE DATA HANDLERS ===

      if (type === 'account-balance') {
        // SINGLE FETCH: Use voice endpoint with uiData
        endpoint = '/api/elevenlabs/account-balance';
        body = { query_type: extraParams?.accountQueryType, time_period: timePeriod };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol: '', accountQueryType: extraParams?.accountQueryType, data: uiData };
      } else if (type === 'fees') {
        // SINGLE FETCH: Use voice endpoint with uiData
        endpoint = '/api/elevenlabs/fees';
        body = {
          fee_type: extraParams?.feeType,
          time_period: timePeriod,
          symbol: symbol || undefined,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, feeType: extraParams?.feeType, timePeriod, data: uiData };
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
        // SINGLE FETCH: Use voice endpoint with uiData
        endpoint = '/api/elevenlabs/options';
        body = {
          query_type: 'last',
          symbol: symbol || undefined,
          trade_type: tradeType,
          call_put: extraParams?.callPut,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return {
          type,
          symbol,
          tradeType,
          callPut: extraParams?.callPut,
          data: uiData
        };
      } else if (type === 'advanced-options' || type === 'highest-strike' || type === 'total-premium' || type === 'expiring-options') {
        // SINGLE FETCH: Use voice endpoint with uiData
        // Map type to query_type for options webhook
        const queryTypeMap: Record<string, string> = {
          'advanced-options': 'bulk',
          'highest-strike': 'highest_strike',
          'total-premium': 'total_premium',
          'expiring-options': 'expiring',
        };
        endpoint = '/api/elevenlabs/options';
        body = {
          query_type: queryTypeMap[type] || 'bulk',
          symbol: symbol || undefined,
          trade_type: tradeType,
          call_put: extraParams?.callPut,
          time_period: timePeriod || undefined,
          expiration: extraParams?.expiration || undefined,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const rawUiData = voicePayload?.uiData || voicePayload;

        // Transform webhook response to match BulkOptionsCard expected format
        // Webhook returns lowercase fields (contracts, premium) but card expects uppercase (OptionContracts, NetAmount)
        // Webhook returns 'summary' but card expects 'aggregations'
        const uiData = {
          ...rawUiData,
          // Map trades from webhook format to BulkOptionsCard format
          trades: rawUiData.trades?.map((t: { id?: number; date?: string; symbol?: string; underlyingSymbol?: string; tradeType?: string; callPut?: string; strike?: number; expiration?: string; contracts?: number; premium?: number; premiumPerContract?: number }) => ({
            TradeID: t.id,
            Date: t.date,
            Symbol: t.symbol,
            UnderlyingSymbol: t.underlyingSymbol,
            TradeType: t.tradeType,
            'Call/Put': t.callPut,
            Strike: String(t.strike || 0),
            Expiration: t.expiration,
            OptionContracts: String(t.contracts || 0),
            NetAmount: String(t.premium || 0),
            OptionTradePremium: t.premiumPerContract ? String(t.premiumPerContract) : undefined,
          })) || [],
          // Map summary to aggregations
          aggregations: rawUiData.summary ? {
            tradeCount: rawUiData.summary.tradeCount,
            totalTrades: rawUiData.summary.tradeCount,
            totalContracts: rawUiData.summary.totalContracts,
            totalPremium: rawUiData.summary.totalPremium,
            avgPremium: rawUiData.summary.avgPremiumPerShare,
            sharesCovered: rawUiData.summary.sharesCovered,
            callCount: rawUiData.summary.callCount,
            putCount: rawUiData.summary.putCount,
          } : undefined,
        };

        return {
          type,
          symbol,
          tradeType,
          timePeriod,
          callPut: extraParams?.callPut,
          expiration: extraParams?.expiration,
          data: uiData
        };
      } else if (type === 'summary') {
        // SINGLE FETCH: Use voice endpoint with uiData
        endpoint = '/api/elevenlabs/trade-summary';
        body = { symbol, time_period: timePeriod, date_filter: extraParams?.dateFilter };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, timePeriod, data: uiData };
      } else if (type === 'stats') {
        // SINGLE FETCH: Use voice endpoint with uiData
        const res = await fetch('/api/elevenlabs/trade-stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol,
            trade_type: tradeType,
            time_period: timePeriod,
            date_filter: extraParams?.dateFilter, // LLM-resolved dates for quarters, months, etc.
          }),
        });
        const voicePayload = await res.json();
        const rawUiData = voicePayload?.uiData || {};
        const rawStats = rawUiData.stockStats || {};

        // Transform webhook response to match TradeStats/TimePeriodStats component expected format
        // Webhook returns: avgPrice, highestDate, lowestDate, highestShares, lowestShares, tradeCount
        // Component expects: averagePrice, highestPriceDate, lowestPriceDate, highestPriceShares, lowestPriceShares, totalTrades
        const transformedStats = {
          symbol: rawUiData.symbol || symbol,
          year: new Date().getFullYear(),
          tradeType: (rawUiData.tradeType?.toLowerCase() === 'sell' ? 'sell' : rawUiData.tradeType?.toLowerCase() === 'buy' ? 'buy' : 'all') as 'buy' | 'sell' | 'all',
          timePeriod: rawUiData.timePeriod || timePeriod || null,
          highestPrice: rawStats.highestPrice || 0,
          highestPriceDate: rawStats.highestDate || '',
          highestPriceShares: rawStats.highestShares || 0,
          lowestPrice: rawStats.lowestPrice || 0,
          lowestPriceDate: rawStats.lowestDate || '',
          lowestPriceShares: rawStats.lowestShares || 0,
          averagePrice: rawStats.avgPrice || 0,
          totalTrades: rawStats.tradeCount || 0,
          totalShares: rawStats.totalShares || 0,
          totalValue: rawStats.totalValue || 0,
        };

        return { type, symbol, tradeType, timePeriod, data: { stats: transformedStats }, optionData: null };
      } else if (type === 'option-stats') {
        // Use options endpoint for option stats
        endpoint = '/api/elevenlabs/options';
        body = { query_type: 'bulk', symbol, trade_type: tradeType };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, tradeType, data: uiData };
      } else if (type === 'profitable') {
        // SINGLE FETCH: Use voice endpoint with uiData
        endpoint = '/api/elevenlabs/profitable-trades';
        body = { symbol, time_period: timePeriod };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const rawUiData = voicePayload?.uiData || voicePayload;

        // Transform webhook response to match ProfitableTrades component expected format
        // Webhook returns: tradeCount, profitableTrades
        // Component expects: totalProfitableTrades, trades
        const uiData = {
          symbol: rawUiData.symbol || symbol,
          totalProfitableTrades: rawUiData.tradeCount || 0,
          totalProfit: rawUiData.totalProfit || 0,
          trades: rawUiData.profitableTrades || [],
          topTrade: rawUiData.topTrade || null,
        };

        return { type, symbol, timePeriod, data: uiData };
      } else if (type === 'time-based') {
        // SINGLE FETCH: Use voice endpoint with uiData
        endpoint = '/api/elevenlabs/time-trades';
        body = { symbol: symbol || null, time_period: timePeriod };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const rawUiData = voicePayload?.uiData || voicePayload;

        // Transform webhook response to match TimeBasedTrades expected format
        // Webhook returns flat structure: tradeCount, stockCount, timePeriod (string), etc.
        // Component expects: timePeriod (object), summary (object), trades (array)
        const uiData = {
          timePeriod: {
            description: rawUiData.timePeriod || timePeriod || 'selected period',
            displayRange: rawUiData.displayRange || rawUiData.dateRange || '',
            tradingDays: rawUiData.tradingDays || 1,
          },
          summary: {
            totalTrades: rawUiData.tradeCount || 0,
            stockCount: rawUiData.stockCount || 0,
            optionCount: rawUiData.optionCount || 0,
            totalValue: rawUiData.totalValue || 0,
            averagePrice: rawUiData.avgValue || undefined,
          },
          trades: rawUiData.trades || [],
          symbol: rawUiData.symbol || symbol || null,
        };

        return { type, symbol, timePeriod, data: uiData };
      } else if (type === 'detailed') {
        // SINGLE FETCH: Use voice endpoint with uiData
        endpoint = '/api/elevenlabs/detailed-trades';
        body = {
          symbol,
          time_period: timePeriod,
          date_filter: extraParams?.dateFilter,
          trade_type: tradeType,  // buy/sell filter
          security_type: extraParams?.securityType,  // stock/option filter
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return { type, symbol, timePeriod, tradeType, dateFilter: extraParams?.dateFilter as TradeUIData['dateFilter'], data: uiData };
      } else if (type === 'options') {
        // SINGLE FETCH: Use voice endpoint with uiData
        endpoint = '/api/elevenlabs/options';
        body = {
          query_type: extraParams?.queryType || 'bulk',
          symbol: symbol || undefined,
          trade_type: tradeType,
          call_put: extraParams?.callPut,
          time_period: timePeriod || undefined,
          expiration: extraParams?.expiration || undefined,
        };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData || voicePayload;
        return {
          type,
          symbol,
          tradeType,
          timePeriod,
          queryType: extraParams?.queryType,
          callPut: extraParams?.callPut,
          expiration: extraParams?.expiration,
          data: uiData
        };
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
            // Supports both fees and trades suggestions
            const voiceSuggestionAccept = isSuggestionFollowup(userQuery) && lastSuggestionRef.current !== null;
            if (voiceSuggestionAccept && lastSuggestionRef.current) {
              console.log('📊 [Voice Suggestion Follow-up] User accepted suggestion, setting intent for:', lastSuggestionRef.current.timePeriod, '(type:', lastSuggestionRef.current.type, ')');
              const suggestion = lastSuggestionRef.current;

              // Create a synthetic intent based on suggestion type
              let suggestionIntent: QueryIntent;
              if (suggestion.type === 'trades') {
                // Trade suggestion - use time-based card type
                suggestionIntent = {
                  cardType: 'time-based',
                  timePeriod: suggestion.timePeriod,
                  symbol: suggestion.symbol,
                  tradeType: suggestion.tradeType as 'buy' | 'sell' | undefined,
                  dateFilter: {
                    type: 'range',
                    startDate: suggestion.startDate,
                    endDate: suggestion.endDate,
                    description: suggestion.timePeriod,
                  },
                };
              } else {
                // Fees suggestion (default for backwards compatibility)
                suggestionIntent = {
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
              }

              pendingQueryIntentRef.current = suggestionIntent;
              pendingTradeUIRequestRef.current = fetchTradeData(
                suggestionIntent.symbol || '',
                suggestionIntent.cardType,
                suggestionIntent.tradeType,
                suggestionIntent.timePeriod,
                {
                  feeType: suggestionIntent.feeType,
                  dateFilter: suggestionIntent.dateFilter,
                  securityType: suggestionIntent.securityType,
                }
              );
              // Clear suggestion after use
              lastSuggestionRef.current = null;
              // Don't run further intent detection - we have what we need
              return;
            }

            // ============================================================
            // VOICE MODE: LLM-ONLY INTENT DETECTION
            //
            // In voice mode, ElevenLabs webhook returns uiData which flows
            // through toolUIDataRef. We use LLM classification ONLY for:
            // 1. Logging/debugging
            // 2. Card type inference (when webhook doesn't provide it)
            //
            // We do NOT call fetchTradeData() here to avoid voice/UI drift.
            // The webhook uiData is the SINGLE SOURCE OF TRUTH.
            // ============================================================

            const token = Date.now();
            pendingVoiceIntentTokenRef.current = token;

            // Clear any stale pending state
            pendingQueryIntentRef.current = null;
            pendingTradeUIRequestRef.current = null;
            pendingAnswerOverrideRef.current = null;
            toolUIDataRef.current = null;  // Clear any stale UI data

            // Start a promise that will be resolved when the tool function sets UI data
            // This prevents the race condition where message handler runs before tool completes
            startToolDataPromise();

            // LLM classifier (async) - for logging and card type inference only
            // No fetchTradeData calls - webhook uiData is the data source
            // CRITICAL: Store the Promise so tool functions can await it for dateFilter
            const classifierPromise = (async (): Promise<QueryIntent | null> => {
              console.log('🤖 [LLM-ONLY] ================================');
              console.log('🤖 [LLM-ONLY] Query:', userQuery);
              console.log('🤖 [LLM-ONLY] Classifying intent (no prefetch - using webhook uiData)...');

              const llmIntent = await classifyIntentViaAPI(userQuery);

              if (pendingVoiceIntentTokenRef.current !== token) return null;

              if (llmIntent) {
                console.log('🤖 [LLM-ONLY] ✅ Intent:', llmIntent.cardType, '| symbol:', llmIntent.symbol, '| timePeriod:', llmIntent.timePeriod, '| dateFilter:', JSON.stringify(llmIntent.dateFilter));
                // Store intent for card type inference (used if toolUIDataRef not set)
                pendingQueryIntentRef.current = llmIntent;
                return llmIntent;
              } else {
                console.log('🤖 [LLM-ONLY] ❌ No intent detected');
                return null;
              }
            })();
            pendingLLMClassifierPromiseRef.current = classifierPromise;
          }
        }

        // For assistant messages, compute trade UI asynchronously so the text renders first
        if (role === 'assistant') {
          // Symbol comes from LLM classifier, not regex extraction
          console.log('🔍 [Voice Mode] Message:', assistantContent.substring(0, 100));

          void (async () => {
            if (suppressNextTradeUICardRef.current) {
              suppressNextTradeUICardRef.current = false;
              return;
            }
            let tradeUI: TradeUIData | undefined;

            // CRITICAL: Wait for tool function to complete before checking toolUIDataRef
            // This prevents the race condition where message handler runs before tool fetch completes
            if (pendingToolDataPromiseRef.current) {
              console.log('⏳ [Voice Mode] Awaiting tool data promise...');
              const toolData = await pendingToolDataPromiseRef.current;
              pendingToolDataPromiseRef.current = null;  // Clear after awaiting
              console.log('✅ [Voice Mode] Tool data promise resolved:', toolData ? toolData.type : 'null');
            }

            // DEBUG: Log the state of toolUIDataRef.current
            console.log('🔍 [Voice Mode] toolUIDataRef.current:', toolUIDataRef.current ? 'SET' : 'NULL');
            if (toolUIDataRef.current) {
              console.log('🔍 [Voice Mode] toolUIDataRef type:', toolUIDataRef.current.type);
              console.log('🔍 [Voice Mode] toolUIDataRef data has trades:', !!(toolUIDataRef.current.data as { trades?: unknown[] })?.trades);
            }

            // HIGHEST PRIORITY: Use UI data set directly by client tools (single source of truth)
            if (toolUIDataRef.current) {
              tradeUI = toolUIDataRef.current;
              toolUIDataRef.current = null; // Clear after use
              console.log('🎯 [Voice Tool Direct] Using UI data from client tool:', tradeUI.type);
              // Mark timestamp to prevent fallback from overriding
              lastIntentCardRenderedAtRef.current = Date.now();
            }

            // CRITICAL: Await LLM classifier before checking pendingIntent
            // The classifier runs async in user message handler and may not have finished yet
            // This fixes the race condition where assistant message arrives before LLM classification completes
            if (!tradeUI && pendingLLMClassifierPromiseRef.current) {
              console.log('⏳ [Voice Mode] Awaiting LLM classifier promise...');
              await pendingLLMClassifierPromiseRef.current;
              pendingLLMClassifierPromiseRef.current = null;  // Clear after awaiting
              console.log('✅ [Voice Mode] LLM classifier promise resolved');
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

              // NOTE: highest-strike and other option types are now handled by tool functions
              // setting toolUIDataRef.current with the correct type. No text parsing needed.

              // NOTE: In new LLM-only architecture, pendingTradeUIRequest is null
              // (we don't prefetch in voice mode - webhook uiData is the source)
              if (!tradeUI && pendingTradeUIRequest) {
                const data = await pendingTradeUIRequest;
                if (data) tradeUI = data;
              }

              // FALLBACK: If webhook didn't provide uiData (toolUIDataRef was null),
              // fetch data based on LLM intent. This should be rare in voice mode.
              if (!tradeUI) {
                console.log('⚠️ [Voice Fallback] No webhook uiData - fetching from UI endpoint');
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
                    dateFilter: pendingIntent.dateFilter,
                    securityType: pendingIntent.securityType,
                  }
                );
                if (data) {
                  tradeUI = data;
                  // Mark timestamp to prevent fallback from overriding on subsequent message events
                  lastIntentCardRenderedAtRef.current = Date.now();
                  console.log('🎯 [Voice Fallback] Rendered card from UI endpoint:', pendingIntent.cardType);
                }
              }
            }

            // NOTE: Regex-based fallbacks have been REMOVED.
            // The LLM classifier + tool function architecture is the single source of truth.
            // If toolUIDataRef.current is not set, the tool function didn't run or failed.
            // No secondary fetches based on regex parsing of agent responses.
            if (!tradeUI) {
              console.log('⚠️ [Voice Mode] No UI data available - toolUIDataRef was not set by tool function');
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
              // Store suggestion for follow-up handling (supports both fees and trades)
              if (tradeUI.type === 'fees' && tradeUI.data) {
                const feesData = tradeUI.data as { suggestion?: { period: string; amount: number; count: number; startDate: string; endDate: string } | null; feeType?: FeeType; symbol?: string; timePeriod?: string };
                if (feesData.suggestion) {
                  lastSuggestionRef.current = {
                    type: 'fees',
                    feeType: tradeUI.feeType || feesData.feeType || 'commission',
                    timePeriod: feesData.suggestion.period,
                    startDate: feesData.suggestion.startDate,
                    endDate: feesData.suggestion.endDate,
                    amount: feesData.suggestion.amount,
                    count: feesData.suggestion.count,
                    symbol: feesData.symbol || tradeUI.symbol,
                  };
                }
              } else if ((tradeUI.type === 'time-based' || tradeUI.type === 'detailed') && tradeUI.data) {
                // Handle trade suggestions (from time-based or detailed queries)
                const tradesData = tradeUI.data as { suggestion?: { period: string; count: number; startDate: string; endDate: string } | null; symbol?: string | null; timePeriod?: string };
                if (tradesData.suggestion) {
                  lastSuggestionRef.current = {
                    type: 'trades',
                    cardType: tradeUI.type,
                    timePeriod: tradesData.suggestion.period,
                    startDate: tradesData.suggestion.startDate,
                    endDate: tradesData.suggestion.endDate,
                    count: tradesData.suggestion.count,
                    symbol: tradesData.symbol || tradeUI.symbol,
                    tradeType: tradeUI.tradeType,
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
        // Load messages into unified transcript
        // NOTE: Historical messages display as text only (no UI cards).
        // We use LLM-only architecture for intent detection, and tradeUI data
        // is not persisted to the database. Users can re-ask questions to get UI cards.
        const loadedMessages: TranscriptMessage[] = data.messages.map(
          (msg: { id: string; role: string; content: string; created_at: string }) => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: new Date(msg.created_at),
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
	    // Supports both fees and trades suggestions
	    if (isSuggestionAccept && lastSuggestionRef.current) {
	      console.log('📊 [Suggestion Follow-up] User accepted suggestion, fetching data for:', lastSuggestionRef.current.timePeriod, '(type:', lastSuggestionRef.current.type, ')');
	      const suggestion = lastSuggestionRef.current;

	      // Create a synthetic intent based on suggestion type
	      if (suggestion.type === 'trades') {
	        // Trade suggestion - use time-based card type
	        intent = {
	          cardType: 'time-based',
	          timePeriod: suggestion.timePeriod,
	          symbol: suggestion.symbol,
	          tradeType: suggestion.tradeType as 'buy' | 'sell' | undefined,
	          dateFilter: {
	            type: 'range',
	            startDate: suggestion.startDate,
	            endDate: suggestion.endDate,
	            description: suggestion.timePeriod,
	          },
	        };
	      } else {
	        // Fees suggestion (default for backwards compatibility)
	        intent = {
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
	      }
	      // Clear the suggestion after using it
	      lastSuggestionRef.current = null;
	    }

	    if (!isCalcFollowup && !isSuggestionAccept) {
	      // LLM-first intent classification for ALL queries (including contextual follow-ups)
	      console.log('🎯 [Intent Detection] User query:', message);
	      const llmIntent = await classifyIntentViaAPI(message);
	      if (llmIntent) {
	        console.log('🎯 [LLM Classifier] Intent:', llmIntent.cardType, `(${((llmIntent.confidence ?? 0) * 100).toFixed(0)}% confidence)`, '| entities:', { symbol: llmIntent.symbol, timePeriod: llmIntent.timePeriod, tradeType: llmIntent.tradeType, callPut: llmIntent.callPut, feeType: llmIntent.feeType });
	      }

	      // Handle contextual follow-up detected by LLM (e.g., "And what about last three months?")
	      // LLM classifies as contextual.time_period_followup, we merge with previous context
	      if (llmIntent?.cardType === 'contextual-followup' && lastAssistantTradeUIRef.current) {
	        const prevUI = lastAssistantTradeUIRef.current;
	        const newTimePeriod = llmIntent.timePeriod || 'this year';
	        const newDateFilter = llmIntent.dateFilter;
	        console.log('📊 [LLM Contextual Follow-up] Time period change:', newTimePeriod, '| Previous context:', prevUI.type);

	        // Create intent based on previous query type with new time period from LLM
	        if (prevUI.type === 'fees' && prevUI.feeType) {
	          intent = {
	            cardType: 'fees',
	            feeType: prevUI.feeType,
	            timePeriod: newTimePeriod,
	            symbol: prevUI.symbol,
	            dateFilter: newDateFilter,
	          };
	          console.log('📊 [LLM Contextual Follow-up] Created fees intent:', intent);
	        } else if (prevUI.type === 'account-balance' && prevUI.accountQueryType) {
	          intent = {
	            cardType: 'account-balance',
	            accountQueryType: prevUI.accountQueryType,
	            timePeriod: newTimePeriod,
	            dateFilter: newDateFilter,
	          };
	          console.log('📊 [LLM Contextual Follow-up] Created account intent:', intent);
	        } else if (prevUI.type === 'time-based' || prevUI.type === 'detailed' || prevUI.type === 'profitable' || prevUI.type === 'stats') {
	          // Handle trades-related follow-ups
	          // Filter out 'all' from tradeType since QueryIntent only accepts 'buy' | 'sell'
	          const tradeTypeForIntent = prevUI.tradeType === 'all' ? undefined : prevUI.tradeType;
	          intent = {
	            cardType: prevUI.type,
	            symbol: prevUI.symbol,
	            timePeriod: newTimePeriod,
	            tradeType: tradeTypeForIntent,
	            dateFilter: newDateFilter,
	          };
	          console.log('📊 [LLM Contextual Follow-up] Created trades intent:', intent);
	        } else if (prevUI.type === 'advanced-options' || prevUI.type === 'total-premium' || prevUI.type === 'highest-strike') {
	          // Handle options-related follow-ups
	          const optionTradeType = prevUI.tradeType === 'all' ? undefined : prevUI.tradeType;
	          intent = {
	            cardType: prevUI.type,
	            symbol: prevUI.symbol,
	            timePeriod: newTimePeriod,
	            tradeType: optionTradeType,
	            callPut: prevUI.callPut,
	            dateFilter: newDateFilter,
	          };
	          console.log('📊 [LLM Contextual Follow-up] Created options intent:', intent);
	        }
	      } else {
	        // Regular intent (not a contextual follow-up)
	        intent = chooseIntent(message, llmIntent);
	      }
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
                securityType: intent.securityType,
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
        // Store suggestion for follow-up handling (supports both fees and trades)
        if (tradeUI && tradeUI.type === 'fees' && tradeUI.data) {
          const feesData = tradeUI.data as { suggestion?: { period: string; amount: number; count: number; startDate: string; endDate: string } | null; feeType?: FeeType; symbol?: string; timePeriod?: string };
          if (feesData.suggestion) {
            lastSuggestionRef.current = {
              type: 'fees',
              feeType: tradeUI.feeType || feesData.feeType || 'commission',
              timePeriod: feesData.suggestion.period,
              startDate: feesData.suggestion.startDate,
              endDate: feesData.suggestion.endDate,
              amount: feesData.suggestion.amount,
              count: feesData.suggestion.count,
              symbol: feesData.symbol || tradeUI.symbol,
            };
          }
        } else if (tradeUI && (tradeUI.type === 'time-based' || tradeUI.type === 'detailed') && tradeUI.data) {
          // Handle trade suggestions (from time-based or detailed queries)
          const tradesData = tradeUI.data as { suggestion?: { period: string; count: number; startDate: string; endDate: string } | null; symbol?: string | null; timePeriod?: string };
          if (tradesData.suggestion) {
            lastSuggestionRef.current = {
              type: 'trades',
              cardType: tradeUI.type,
              timePeriod: tradesData.suggestion.period,
              startDate: tradesData.suggestion.startDate,
              endDate: tradesData.suggestion.endDate,
              count: tradesData.suggestion.count,
              symbol: tradesData.symbol || tradeUI.symbol,
              tradeType: tradeUI.tradeType,
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
		              securityType: intent.securityType,
		            }
		          )
		        : null;
		      if (pendingTradeUIRequestRef.current) {
		        pendingAnswerOverrideRef.current = pendingTradeUIRequestRef.current.then((tradeUI) => buildAnswerOverride(intent, tradeUI));
		      } else if (!pendingAnswerOverrideRef.current) {
		        pendingAnswerOverrideRef.current = null;
		      }

      // Clear stale UI data and start promise for sync
      toolUIDataRef.current = null;
      startToolDataPromise();

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
		            dateFilter: intent.dateFilter,
		            securityType: intent.securityType,
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
    const { type, symbol, data, timePeriod, dateFilter } = tradeUI;

    if (type === 'summary') {
      // Use structured uiData from webhook (no regex parsing needed)
      const summaryData = data as {
        symbol?: string;
        stockTrades?: number;
        optionTrades?: number;
        totalTrades?: number;
        buyTrades?: number;
        sellTrades?: number;
      };

      // Webhook returns structured data with stockTrades/optionTrades
      if (summaryData.stockTrades !== undefined || summaryData.optionTrades !== undefined) {
        return (
          <div style={{ marginTop: '12px' }}>
            <TradeSummary
              symbol={summaryData.symbol || symbol}
              stockCount={summaryData.stockTrades || 0}
              optionCount={summaryData.optionTrades || 0}
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
      // Use the already-fetched uiData from the tool function
      // The tool function calls /api/elevenlabs/detailed-trades which returns both response + uiData
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uiDataFromTool = data as any;

      // If we have trades data, render TradesTable directly (no additional fetch)
      if (uiDataFromTool?.trades && Array.isArray(uiDataFromTool.trades)) {
        // Map API response to Trade[] format expected by TradesTable
        // Add dummy TradeID and GrossAmount for compatibility
        const trades = uiDataFromTool.trades.map((t: Record<string, unknown>, idx: number) => ({
          TradeID: idx + 1,
          Date: t.Date || '',
          Symbol: t.Symbol || '',
          SecurityType: t.SecurityType || '',
          TradeType: t.TradeType || '',
          StockTradePrice: t.StockTradePrice || '0',
          StockShareQty: t.StockShareQty || '0',
          OptionContracts: t.OptionContracts || '0',
          OptionTradePremium: t.OptionTradePremium || '0',
          GrossAmount: t.NetAmount || '0', // Use NetAmount as fallback for GrossAmount
          NetAmount: t.NetAmount || '0',
          Strike: t.Strike,
          Expiration: t.Expiration,
          'Call/Put': t['Call/Put'],
        }));

        return (
          <div style={{ marginTop: '12px' }}>
            <TradesTable
              trades={trades}
              summary={{
                totalShares: uiDataFromTool.totalShares || 0,
                totalCost: uiDataFromTool.totalValue || 0,
                currentValue: 0,
                symbol: uiDataFromTool.symbol || symbol,
              }}
            />
          </div>
        );
      }

      // Fallback: If no trades data, use DetailedTradesLoader (should be rare)
      // CRITICAL: Pass timePeriod and dateFilter to get correct date-filtered results
      return (
        <div style={{ marginTop: '12px' }}>
          <DetailedTradesLoader symbol={symbol} timePeriod={timePeriod} dateFilter={dateFilter} />
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

      // Use structured API data from webhook (no text parsing needed)
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
      // Webhook returns transformed camelCase data, not raw database fields
      const lastOptionData = data as {
        trades: Array<{
          id: number;
          date: string;
          symbol: string;
          underlyingSymbol?: string;
          tradeType: string;      // 'B' or 'S'
          callPut: string;        // 'C' or 'P'
          strike: number;
          expiration: string;
          contracts: number;
          premium: number;        // Already absolute value of NetAmount
          premiumPerContract: number;
        }>;
        summary?: {
          tradeCount: number;
          totalContracts: number;
          totalPremium: number;
          avgPremiumPerShare: number;
          sharesCovered: number;
          callCount: number;
          putCount: number;
        };
      };

      if (lastOptionData.trades && lastOptionData.trades.length > 0) {
        // ALWAYS show single trade card for 'last-option' type - user asked for THE last trade
        // Take only the first (most recent) trade regardless of how many are in the response
        const trade = lastOptionData.trades[0];
        const isCall = trade.callPut === 'C';
        const isBuy = trade.tradeType === 'B';
        const contracts = Math.trunc(trade.contracts);
        // Webhook already calculates premium as absolute NetAmount
        const totalValue = trade.premium;
        const strike = trade.strike;
        // Use underlyingSymbol for options (e.g., "AAPL") instead of full option symbol
        const displaySymbol = trade.underlyingSymbol || trade.symbol;

        return (
          <div style={{ marginTop: '12px' }}>
            <LastOptionTradeCard
              symbol={displaySymbol}
              callPut={isCall ? 'Call' : 'Put'}
              tradeType={isBuy ? 'buy' : 'sell'}
              strike={strike}
              expiration={trade.expiration}
              tradeDate={trade.date}
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
        date?: string;
        asOfDate?: string; // API returns asOfDate, not date
        timePeriod?: string; // API returns timePeriod for balance trends
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
        // Flat fields returned by API for balance trends
        avgBalance?: number;
        maxBalance?: number;
        minBalance?: number;
        maxBalanceDate?: string;
        minBalanceDate?: string;
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

      // Handle both date and asOfDate (API returns asOfDate)
      const dateValue = accountData.date || accountData.asOfDate;

      // Construct balanceTrend from flat API fields if not already present
      // API returns avgBalance, maxBalance, etc. but component expects nested balanceTrend
      let balanceTrend = accountData.balanceTrend;
      if (!balanceTrend && accountData.avgBalance !== undefined) {
        balanceTrend = {
          average: accountData.avgBalance,
          highest: accountData.maxBalance || 0,
          highestDate: accountData.maxBalanceDate || '',
          lowest: accountData.minBalance || 0,
          lowestDate: accountData.minBalanceDate || '',
          period: accountData.timePeriod || '',
        };
        console.log('🔧 Constructed balanceTrend from flat API fields:', balanceTrend);
      }

      if (dateValue || balanceTrend) {
        return (
          <div style={{ marginTop: '12px' }}>
            <AccountSummary
              queryType={tradeUI.accountQueryType || accountData.queryType || 'account_summary'}
              date={dateValue || ''}
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
              balanceTrend={balanceTrend}
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

    // === MARKET DATA CARDS ===

    if (type === 'stock-quote') {
      console.log('🎨 Rendering stock quote card with data:', data);
      const quoteData = data as {
        symbol: string;
        companyName?: string;
        price: number;
        change: number;
        changePercent: number;
        bid: number;
        bidSize: number;
        ask: number;
        askSize: number;
        mid: number;
        spread: number;
        spreadPercent: number;
        volume: number;
        dayHigh: number;
        dayLow: number;
        dayOpen: number;
        prevClose: number;
        timestamp: string;
        isMarketOpen: boolean;
      };

      if (quoteData.price !== undefined) {
        return (
          <div style={{ marginTop: '12px' }}>
            <StockQuoteCard
              symbol={quoteData.symbol}
              companyName={quoteData.companyName}
              price={quoteData.price}
              change={quoteData.change}
              changePercent={quoteData.changePercent}
              bid={quoteData.bid}
              bidSize={quoteData.bidSize}
              ask={quoteData.ask}
              askSize={quoteData.askSize}
              mid={quoteData.mid}
              spread={quoteData.spread}
              spreadPercent={quoteData.spreadPercent}
              volume={quoteData.volume}
              dayHigh={quoteData.dayHigh}
              dayLow={quoteData.dayLow}
              dayOpen={quoteData.dayOpen}
              prevClose={quoteData.prevClose}
              timestamp={quoteData.timestamp}
              isMarketOpen={quoteData.isMarketOpen}
            />
          </div>
        );
      }
    }

    if (type === 'option-quote') {
      console.log('🎨 Rendering option quote card with data:', data);
      const optionData = data as {
        type: 'option-quote';
        occSymbol: string;
        displayName: string;
        underlying: string;
        expiration: string;
        strike: number;
        optionType: 'call' | 'put';
        bid: number;
        bidSize: number;
        ask: number;
        askSize: number;
        mid: number;
        spread: number;
        last: number | null;
        lastSize: number | null;
        volume?: number;
        openInterest?: number;
        impliedVolatility?: number;
        greeks?: {
          delta?: number;
          gamma?: number;
          theta?: number;
          vega?: number;
        };
        timestamp: string;
      };

      if (optionData.underlying) {
        return (
          <div style={{ marginTop: '12px' }}>
            <OptionQuoteCard data={optionData} />
          </div>
        );
      }
    }

    // === FUNDAMENTALS CARDS ===

    if (type === 'company-overview') {
      console.log('🎨 Rendering company overview card with data:', data);
      const overviewData = data as {
        type: 'company-overview';
        symbol: string;
        name: string;
        description: string;
        exchange: string;
        sector: string;
        industry: string;
        marketCap: number;
        peRatio: number | null;
        eps: number | null;
        dividendYield: number | null;
        fiftyTwoWeekHigh: number;
        fiftyTwoWeekLow: number;
        beta: number | null;
      };

      if (overviewData.symbol) {
        return (
          <div style={{ marginTop: '12px' }}>
            <CompanyOverviewCard data={overviewData} />
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
function DetailedTradesLoader({ symbol, timePeriod, dateFilter }: {
  symbol: string;
  timePeriod?: string;
  dateFilter?: {
    type: 'range' | 'discrete' | 'relative';
    startDate?: string;
    endDate?: string;
    dates?: string[];
    description?: string;
  };
}) {
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
        // SINGLE FETCH: Use voice endpoint with uiData
        // CRITICAL: Pass time_period and date_filter to get correct date-filtered results
        const res = await fetch('/api/elevenlabs/detailed-trades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, time_period: timePeriod, date_filter: dateFilter }),
        });
        const voicePayload = await res.json();
        const uiData = voicePayload?.uiData;
        if (uiData?.trades) {
          setTradesData(uiData);
        }
      } catch (error) {
        console.error('Error loading trades:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [symbol, timePeriod, dateFilter]);

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
