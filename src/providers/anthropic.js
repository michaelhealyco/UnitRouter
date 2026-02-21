const https = require('https');

function convertMessages(messages) {
  let system = '';
  const msgs = [];
  for (const m of messages) {
    if (m.role === 'system') { system += (system ? '\n' : '') + m.content; continue; }
    msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }
  return { system, messages: msgs };
}

async function complete(model, messages, opts = {}) {
  const { system, messages: msgs } = convertMessages(messages);
  const body = JSON.stringify({
    model,
    max_tokens: opts.max_tokens || 4096,
    ...(system && { system }),
    messages: msgs,
    ...(opts.temperature != null && { temperature: opts.temperature }),
    stream: !!opts.stream,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    }, res => {
      if (opts.stream) return resolve(res);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve({
            id: parsed.id,
            choices: [{ index: 0, message: { role: 'assistant', content: parsed.content?.[0]?.text || '' }, finish_reason: parsed.stop_reason === 'end_turn' ? 'stop' : parsed.stop_reason }],
            usage: { prompt_tokens: parsed.usage?.input_tokens || 0, completion_tokens: parsed.usage?.output_tokens || 0, total_tokens: (parsed.usage?.input_tokens || 0) + (parsed.usage?.output_tokens || 0) },
            model: parsed.model,
          });
        } catch (e) { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function streamToOpenAI(anthropicStream, res, modelName) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  let buf = '';
  anthropicStream.on('data', chunk => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') { res.write('data: [DONE]\n\n'); return; }
      try {
        const evt = JSON.parse(data);
        if (evt.type === 'content_block_delta' && evt.delta?.text) {
          res.write(`data: ${JSON.stringify({ id: 'chatcmpl-stream', object: 'chat.completion.chunk', model: modelName, choices: [{ index: 0, delta: { content: evt.delta.text }, finish_reason: null }] })}\n\n`);
        } else if (evt.type === 'message_stop') {
          res.write(`data: ${JSON.stringify({ id: 'chatcmpl-stream', object: 'chat.completion.chunk', model: modelName, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
          res.write('data: [DONE]\n\n');
        }
      } catch {}
    }
  });
  anthropicStream.on('end', () => res.end());
}

module.exports = { complete, streamToOpenAI };
