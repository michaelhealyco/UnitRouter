const http = require('http');
const { route, availableModels, MODELS } = require('./router');
const cache = require('./cache');
const anthropic = require('./providers/anthropic');
const openai = require('./providers/openai');
const google = require('./providers/google');
const deepseek = require('./providers/deepseek');

const PORT = parseInt(process.env.UNITROUTER_PORT || '8402');
const DEFAULT_PROFILE = process.env.UNITROUTER_DEFAULT_PROFILE || 'auto';

// Usage stats
const stats = { requests: 0, byModel: {}, byTier: {}, errors: 0, startedAt: new Date().toISOString() };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

async function handleCompletion(req, res) {
  const body = JSON.parse(await readBody(req));
  const { messages, model: requestedModel, stream, max_tokens, temperature } = body;

  if (!messages?.length) return json(res, 400, { error: { message: 'messages required' } });

  // Extract profile from model field (e.g. "auto", "premium") or header
  const profile = ['free', 'eco', 'auto', 'premium'].includes(requestedModel) ? requestedModel
    : req.headers['x-unitrouter-profile'] || DEFAULT_PROFILE;
  const specificModel = ['free', 'eco', 'auto', 'premium'].includes(requestedModel) ? null : requestedModel;

  const result = route(messages, profile, specificModel);
  if (!result) return json(res, 503, { error: { message: 'No providers available' } });

  const { model: modelDef, modelName, tier } = result;
  stats.requests++;
  stats.byModel[modelName] = (stats.byModel[modelName] || 0) + 1;
  stats.byTier[tier] = (stats.byTier[tier] || 0) + 1;

  // Check cache (non-streaming only)
  if (!stream) {
    const cached = cache.get(messages, modelName);
    if (cached) {
      cached._cached = true;
      cached._routed = { model: modelName, tier, profile };
      return json(res, 200, cached);
    }
  }

  try {
    const opts = { max_tokens, temperature, stream };
    let response;

    if (modelDef.provider === 'anthropic') {
      response = await anthropic.complete(modelDef.model, messages, opts);
      if (stream) return anthropic.streamToOpenAI(response, res, modelName);
    } else if (modelDef.provider === 'openai') {
      response = await openai.complete(modelDef.model, messages, opts);
      if (stream) return openai.streamPassthrough(response, res);
    } else if (modelDef.provider === 'google') {
      if (stream) {
        // Google doesn't easily stream in same format; fall back to non-stream
        response = await google.complete(modelDef.model, messages, { max_tokens, temperature });
      } else {
        response = await google.complete(modelDef.model, messages, opts);
      }
    } else if (modelDef.provider === 'deepseek') {
      response = await deepseek.complete(modelDef.model, messages, opts);
      if (stream) return openai.streamPassthrough(response, res);
    }

    // Normalize response to OpenAI format
    response.object = 'chat.completion';
    response._routed = { model: modelName, provider: modelDef.provider, tier, profile };

    if (!stream) cache.set(messages, modelName, response);
    json(res, 200, response);
  } catch (err) {
    stats.errors++;
    console.error(`[${modelName}] Error:`, err.message);
    json(res, 502, { error: { message: err.message, model: modelName, provider: modelDef.provider } });
  }
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }

  const url = req.url.split('?')[0];

  try {
    if (url === '/health' && req.method === 'GET') {
      return json(res, 200, {
        status: 'ok', version: '1.0.0', uptime: process.uptime(),
        providers: Object.entries({ ANTHROPIC_API_KEY: 'anthropic', OPENAI_API_KEY: 'openai', GOOGLE_API_KEY: 'google', DEEPSEEK_API_KEY: 'deepseek' })
          .filter(([k]) => process.env[k]).map(([, v]) => v),
      });
    }

    if (url === '/v1/models' && req.method === 'GET') {
      const models = availableModels();
      return json(res, 200, {
        object: 'list',
        data: [...models.map(m => ({ id: m.id, object: 'model', owned_by: m.provider })),
          ...['free', 'eco', 'auto', 'premium'].map(p => ({ id: p, object: 'model', owned_by: 'unitrouter', description: `${p} routing profile` }))],
      });
    }

    if (url === '/v1/chat/completions' && req.method === 'POST') {
      return await handleCompletion(req, res);
    }

    if (url === '/stats' && req.method === 'GET') {
      return json(res, 200, { ...stats, cache: cache.stats() });
    }

    json(res, 404, { error: { message: 'Not found' } });
  } catch (err) {
    console.error('Server error:', err);
    json(res, 500, { error: { message: 'Internal server error' } });
  }
});

server.listen(PORT, () => {
  const providers = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEEPSEEK_API_KEY'].filter(k => process.env[k]);
  console.log(`⚡ UnitRouter v1.0.0 listening on :${PORT}`);
  console.log(`  Providers: ${providers.map(k => k.replace('_API_KEY', '').toLowerCase()).join(', ')}`);
  console.log(`  Default profile: ${DEFAULT_PROFILE}`);
});
