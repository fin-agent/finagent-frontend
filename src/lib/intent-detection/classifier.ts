// Intent Classifier
// Uses Azure OpenAI GPT for intent classification

import OpenAI from 'openai';
import { buildDeveloperPrompt } from './prompt';
import { intentRegistry } from './intents/registry';
import type { ClassificationResult, ExtractedEntities, GPTClassificationResponse } from './types';

// Azure OpenAI configuration using OpenAI SDK (Microsoft's recommended approach)
const endpoint = process.env.AZURE_OPENAI_ENDPOINT || 'https://finagent-dev-resource.openai.azure.com/openai/v1/';
const deploymentName = process.env.AZURE_OPENAI_MODEL || 'gpt-5.2';
const apiKey = process.env.AZURE_OPENAI_API_KEY || '';

const openai = new OpenAI({
  baseURL: endpoint,
  apiKey: apiKey,
});

// Cache the developer prompt since it doesn't change
let cachedDeveloperPrompt: string | null = null;

function getDeveloperPrompt(): string {
  if (!cachedDeveloperPrompt) {
    cachedDeveloperPrompt = buildDeveloperPrompt(intentRegistry);
  }
  return cachedDeveloperPrompt;
}

export async function classifyIntent(userQuery: string): Promise<ClassificationResult | null> {
  try {
    const startTime = Date.now();
    const developerPrompt = getDeveloperPrompt();

    const response = await openai.chat.completions.create({
      model: deploymentName,
      messages: [
        { role: 'developer' as const, content: developerPrompt },
        { role: 'user', content: userQuery },
      ],
      temperature: 0.1, // Low temp for consistent classification
      max_completion_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const elapsed = Date.now() - startTime;
    const content = response.choices[0]?.message?.content;

    if (!content) {
      console.warn('[Intent Classifier] Empty response from GPT');
      return null;
    }

    const result = JSON.parse(content) as GPTClassificationResponse;

    console.log(`[Intent Classifier] Query: "${userQuery.substring(0, 50)}..." -> Intent: ${result.intent} (${(result.confidence * 100).toFixed(0)}% conf) [${elapsed}ms]`);
    console.log('[Intent Classifier] Entities:', result.entities);

    // Handle unknown intent
    if (result.intent === 'unknown' || result.confidence < 0.3) {
      console.log('[Intent Classifier] No confident match found');
      return null;
    }

    // Look up card type from registry
    const intentDef = intentRegistry.find(i => i.id === result.intent);
    if (!intentDef) {
      console.warn(`[Intent Classifier] Unknown intent ID: ${result.intent}`);
      return null;
    }

    return {
      intent: result.intent,
      confidence: result.confidence,
      entities: result.entities,
      cardType: intentDef.cardType,
    };
  } catch (error) {
    console.error('[Intent Classifier] Classification error:', error);
    return null;
  }
}

// Re-export types for convenience
export type { ClassificationResult, ExtractedEntities };
