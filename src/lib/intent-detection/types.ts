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
  | 'fees';

// Domain categories for intents
export type IntentDomain = 'trades' | 'options' | 'account' | 'fees' | 'positions' | 'dividends' | 'tax';

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

// Entities that can be extracted from user queries
export interface ExtractedEntities {
  symbol?: string;
  timePeriod?: string;
  tradeType?: 'buy' | 'sell';
  callPut?: 'call' | 'put';
  accountQueryType?: AccountQueryType;
  feeType?: FeeType;
  expiration?: string;
  strike?: number;
  limit?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
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
