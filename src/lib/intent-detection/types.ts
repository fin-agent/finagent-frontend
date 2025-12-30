// Intent Detection Types
// These types are used for GPT-based intent classification

import type { AccountQueryType } from '@/src/components/generative-ui/AccountSummary';
import type { FeeType } from '@/src/components/generative-ui/FeesSummary';

// Card types that map to UI components
export type CardType =
  | 'summary'
  | 'detailed'
  | 'stats'
  | 'profitable'
  | 'time-based'
  | 'option-stats'
  | 'average-price'
  | 'advanced-options'
  | 'highest-strike'
  | 'total-premium'
  | 'expiring-options'
  | 'last-option'
  | 'account-balance'
  | 'fees'
  // Market data card types
  | 'stock-quote'
  | 'option-quote'
  | 'price-chart'
  | 'news'
  | 'halt-status'
  // Fundamentals card types
  | 'company-overview'
  | 'fundamental-metric'
  | 'financials'
  | 'earnings'
  | 'dividend'
  | 'contextual-followup' // For time period change follow-ups (uses previous query context)
  | 'none'; // Used for entity extraction from agent responses (no UI card)

// Domain categories for intents
export type IntentDomain = 'trades' | 'options' | 'account' | 'fees' | 'positions' | 'dividends' | 'tax' | 'market' | 'fundamentals' | 'contextual';

// Intent definition for the registry
export interface IntentDefinition {
  id: string;                    // e.g., 'trades.profitable'
  domain: IntentDomain;
  cardType: CardType;            // Maps to UI card
  description: string;           // For GPT prompt - describes when to use
  examples: string[];            // Example queries for few-shot learning
  requiredEntities: string[];    // Must be extracted
  optionalEntities: string[];    // May be extracted
}

// Date filter for structured date extraction from LLM
export interface DateFilter {
  type: 'range' | 'discrete' | 'relative';
  startDate?: string;   // ISO format: "2025-06-01" (for type: 'range')
  endDate?: string;     // ISO format: "2025-06-07" (for type: 'range')
  dates?: string[];     // ["2025-07-01", "2025-08-01"] (for type: 'discrete')
  period?: string;      // "last month", "yesterday" (for type: 'relative')
  description: string;  // Human-readable: "June 1st to 7th"
}

// Entities that can be extracted from user queries
export interface ExtractedEntities {
  symbol?: string;
  timePeriod?: string;           // Keep for backwards compatibility
  dateFilter?: DateFilter;       // NEW: Structured date extraction from LLM
  tradeType?: 'buy' | 'sell';
  securityType?: 'stock' | 'option';  // Filter by instrument type
  callPut?: 'call' | 'put';
  accountQueryType?: AccountQueryType;
  feeType?: FeeType;
  expiration?: string;
  strike?: number;
  limit?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
  // Market data entities
  chartPeriod?: string;          // "1 week", "3 months", "1 year"
  // Fundamentals entities
  metricType?: string;           // "pe_ratio", "market_cap", "beta", "52_week_high", etc.
  statementType?: 'income' | 'balance' | 'cashflow';
}

// Result from GPT classification
export interface ClassificationResult {
  intent: string;              // Intent ID like 'trades.profitable'
  confidence: number;          // 0-1 confidence score
  entities: ExtractedEntities; // Extracted parameters
  cardType: CardType;
}

// Raw GPT response format (before cardType lookup)
export interface GPTClassificationResponse {
  intent: string;
  confidence: number;
  entities: ExtractedEntities;
}
