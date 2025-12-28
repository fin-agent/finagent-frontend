/**
 * Conversation Context Store
 *
 * Tracks the last query parameters per conversation so follow-up queries
 * can inherit context (e.g., symbol) without explicit re-specification.
 *
 * Example flow:
 * 1. User: "Apple trades in January" → stores { symbol: "AAPL", ... }
 * 2. User: "How about September?" → retrieves AAPL from context
 */

interface QueryContext {
  symbol?: string;
  timePeriod?: string;
  dateFilter?: {
    type: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  };
  tradeType?: string;
  queryType?: string;
  feeType?: string;
  timestamp: number;
}

// In-memory store (in production, use Redis for multi-instance support)
const contextStore = new Map<string, QueryContext>();

// Context expires after 10 minutes of inactivity
const CONTEXT_TTL_MS = 10 * 60 * 1000;

/**
 * Generate a conversation key from available identifiers
 */
export function getConversationKey(params: {
  conversationId?: string;
  agentId?: string;
  sessionId?: string;
}): string {
  // Prefer conversationId, fall back to agentId or sessionId
  return params.conversationId || params.agentId || params.sessionId || 'default';
}

/**
 * Store query context for a conversation
 */
export function storeContext(
  conversationKey: string,
  context: Omit<QueryContext, 'timestamp'>
): void {
  // Only store if we have meaningful context
  if (!context.symbol && !context.feeType && !context.queryType) {
    return;
  }

  const existing = contextStore.get(conversationKey);

  // Merge with existing context (new values override)
  const merged: QueryContext = {
    ...existing,
    ...context,
    timestamp: Date.now(),
  };

  // Remove undefined values
  Object.keys(merged).forEach(key => {
    if (merged[key as keyof QueryContext] === undefined) {
      delete merged[key as keyof QueryContext];
    }
  });

  contextStore.set(conversationKey, merged);

  console.log(`📝 [Context] Stored for ${conversationKey}:`, {
    symbol: merged.symbol,
    timePeriod: merged.timePeriod,
    queryType: merged.queryType,
  });
}

/**
 * Retrieve context for a conversation
 */
export function getContext(conversationKey: string): QueryContext | null {
  const context = contextStore.get(conversationKey);

  if (!context) {
    return null;
  }

  // Check if context has expired
  if (Date.now() - context.timestamp > CONTEXT_TTL_MS) {
    contextStore.delete(conversationKey);
    console.log(`🕐 [Context] Expired for ${conversationKey}`);
    return null;
  }

  console.log(`📖 [Context] Retrieved for ${conversationKey}:`, {
    symbol: context.symbol,
    timePeriod: context.timePeriod,
    queryType: context.queryType,
  });

  return context;
}

/**
 * Merge incoming parameters with stored context
 * Only fills in missing values - explicit params always win
 */
export function mergeWithContext(
  conversationKey: string,
  params: {
    symbol?: string;
    timePeriod?: string;
    dateFilter?: QueryContext['dateFilter'];
    tradeType?: string;
    queryType?: string;
    feeType?: string;
  }
): typeof params & { _contextApplied?: boolean } {
  const context = getContext(conversationKey);

  if (!context) {
    return params;
  }

  const merged = { ...params };
  let contextApplied = false;

  // Only fill in missing symbol from context
  if (!merged.symbol && context.symbol) {
    merged.symbol = context.symbol;
    contextApplied = true;
    console.log(`🔗 [Context] Applied symbol from context: ${context.symbol}`);
  }

  // Only fill in missing feeType from context
  if (!merged.feeType && context.feeType) {
    merged.feeType = context.feeType;
    contextApplied = true;
    console.log(`🔗 [Context] Applied feeType from context: ${context.feeType}`);
  }

  // Only fill in missing queryType from context
  if (!merged.queryType && context.queryType) {
    merged.queryType = context.queryType;
    contextApplied = true;
    console.log(`🔗 [Context] Applied queryType from context: ${context.queryType}`);
  }

  return {
    ...merged,
    _contextApplied: contextApplied,
  };
}

/**
 * Clear context for a conversation (e.g., on disconnect)
 */
export function clearContext(conversationKey: string): void {
  contextStore.delete(conversationKey);
  console.log(`🗑️ [Context] Cleared for ${conversationKey}`);
}

/**
 * Cleanup expired contexts (call periodically)
 */
export function cleanupExpiredContexts(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, context] of contextStore.entries()) {
    if (now - context.timestamp > CONTEXT_TTL_MS) {
      contextStore.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 [Context] Cleaned up ${cleaned} expired contexts`);
  }

  return cleaned;
}

// Cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredContexts, 5 * 60 * 1000);
}
