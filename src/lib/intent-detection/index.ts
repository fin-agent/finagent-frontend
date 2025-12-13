// Intent Detection Module
// Main exports for GPT-based intent classification

export { classifyIntent } from './classifier';
export type {
  CardType,
  IntentDomain,
  IntentDefinition,
  ExtractedEntities,
  ClassificationResult,
  GPTClassificationResponse,
} from './types';
export { intentRegistry } from './intents/registry';
export { buildDeveloperPrompt } from './prompt';
