// Request classifier and model router

const TIERS = ['SIMPLE', 'MEDIUM', 'COMPLEX', 'REASONING'];

const REASONING_KW = /\b(step[- ]by[- ]step|chain of thought|think through|prove|proof|derive|reason|logically|analyze carefully)\b/i;
const MATH_KW = /\b(equation|integral|derivative|theorem|algorithm|optimize|probability|calculate|compute|factorial|summation|∑|∫|√)\b/i;
const CODE_KW = /```|function\s*\(|def\s+\w+|class\s+\w+|import\s+\w+|const\s+\w+\s*=|=>\s*{/;
const CREATIVE_KW = /\b(write a story|creative|poem|fiction|imagine|narrative|screenplay|dialogue)\b/i;
const MULTI_STEP = /\b(first.*then|step \d|compare and contrast|pros and cons|list \d+|multiple|several aspects)\b/i;

function classify(messages) {
  const last = messages[messages.length - 1]?.content || '';
  const allText = messages.map(m => m.content || '').join(' ');
  const len = allText.length;

  const scores = {
    length: Math.min(len / 4000, 1),
    depth: Math.min(messages.length / 10, 1),
    code: CODE_KW.test(allText) ? 0.8 : 0,
    reasoning: REASONING_KW.test(allText) ? 0.9 : 0,
    math: MATH_KW.test(allText) ? 0.85 : 0,
    creative: CREATIVE_KW.test(allText) ? 0.7 : 0,
    multiStep: MULTI_STEP.test(allText) ? 0.6 : 0,
    contextWindow: Math.min(len / 16000, 1),
  };

  const weighted = scores.length * 0.1 + scores.depth * 0.1 + scores.code * 0.15 +
    scores.reasoning * 0.2 + scores.math * 0.15 + scores.creative * 0.1 +
    scores.multiStep * 0.1 + scores.contextWindow * 0.1;

  let tier;
  if (scores.reasoning > 0.5 || scores.math > 0.5) tier = 'REASONING';
  else if (weighted > 0.5) tier = 'COMPLEX';
  else if (weighted > 0.25) tier = 'MEDIUM';
  else tier = 'SIMPLE';

  return { tier, score: weighted, scores };
}

// Model definitions: [provider, model, costTier 0-3]
const MODELS = {
  'claude-sonnet-4':    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', cost: 1, env: 'ANTHROPIC_API_KEY' },
  'claude-opus-4':      { provider: 'anthropic', model: 'claude-opus-4-20250514', cost: 3, env: 'ANTHROPIC_API_KEY' },
  'gpt-4o-mini':        { provider: 'openai', model: 'gpt-4o-mini', cost: 0, env: 'OPENAI_API_KEY' },
  'gpt-4o':             { provider: 'openai', model: 'gpt-4o', cost: 2, env: 'OPENAI_API_KEY' },
  'gemini-2.5-flash':   { provider: 'google', model: 'gemini-2.5-flash', cost: 0, env: 'GOOGLE_API_KEY' },
  'gemini-2.5-pro':     { provider: 'google', model: 'gemini-2.5-pro', cost: 2, env: 'GOOGLE_API_KEY' },
  'deepseek-chat':      { provider: 'deepseek', model: 'deepseek-chat', cost: 0, env: 'DEEPSEEK_API_KEY' },
};

// Profile → tier → preferred models (in order of preference)
const PROFILES = {
  free: {
    SIMPLE: ['gemini-2.5-flash', 'deepseek-chat', 'gpt-4o-mini'],
    MEDIUM: ['gemini-2.5-flash', 'deepseek-chat', 'gpt-4o-mini'],
    COMPLEX: ['deepseek-chat', 'gemini-2.5-flash'],
    REASONING: ['deepseek-chat', 'gemini-2.5-flash'],
  },
  eco: {
    SIMPLE: ['gpt-4o-mini', 'gemini-2.5-flash', 'deepseek-chat'],
    MEDIUM: ['gpt-4o-mini', 'gemini-2.5-flash', 'deepseek-chat'],
    COMPLEX: ['claude-sonnet-4', 'gpt-4o', 'gemini-2.5-pro'],
    REASONING: ['claude-sonnet-4', 'gemini-2.5-pro', 'deepseek-chat'],
  },
  auto: {
    SIMPLE: ['gpt-4o-mini', 'gemini-2.5-flash'],
    MEDIUM: ['claude-sonnet-4', 'gpt-4o', 'gemini-2.5-pro'],
    COMPLEX: ['claude-sonnet-4', 'claude-opus-4', 'gpt-4o', 'gemini-2.5-pro'],
    REASONING: ['claude-opus-4', 'claude-sonnet-4', 'gemini-2.5-pro'],
  },
  premium: {
    SIMPLE: ['claude-sonnet-4', 'gpt-4o', 'gemini-2.5-pro'],
    MEDIUM: ['claude-opus-4', 'gpt-4o', 'gemini-2.5-pro'],
    COMPLEX: ['claude-opus-4', 'gpt-4o', 'gemini-2.5-pro'],
    REASONING: ['claude-opus-4', 'gemini-2.5-pro'],
  },
};

function availableModels() {
  return Object.entries(MODELS).filter(([, v]) => process.env[v.env]).map(([name, v]) => ({
    id: name, provider: v.provider, cost: v.cost,
  }));
}

function route(messages, profile = 'auto', requestedModel = null) {
  // If specific model requested and available, use it
  if (requestedModel && MODELS[requestedModel] && process.env[MODELS[requestedModel].env]) {
    return { model: MODELS[requestedModel], modelName: requestedModel, tier: 'REQUESTED', score: 0 };
  }

  const { tier, score, scores } = classify(messages);
  const prefs = PROFILES[profile]?.[tier] || PROFILES.auto[tier];

  for (const name of prefs) {
    const m = MODELS[name];
    if (m && process.env[m.env]) {
      return { model: m, modelName: name, tier, score, scores };
    }
  }

  // Fallback: any available model
  for (const [name, m] of Object.entries(MODELS)) {
    if (process.env[m.env]) return { model: m, modelName: name, tier, score };
  }

  return null;
}

module.exports = { classify, route, availableModels, MODELS };
