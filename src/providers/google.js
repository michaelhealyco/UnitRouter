const https = require('https');

function convertToGemini(messages) {
  let systemInstruction = '';
  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') { systemInstruction += (systemInstruction ? '\n' : '') + m.content; continue; }
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
  }
  return { systemInstruction, contents };
}

async function complete(model, messages, opts = {}) {
  const { systemInstruction, contents } = convertToGemini(messages);
  const body = JSON.stringify({
    ...(systemInstruction && { system_instruction: { parts: [{ text: systemInstruction }] } }),
    contents,
    generationConfig: {
      ...(opts.max_tokens && { maxOutputTokens: opts.max_tokens }),
      ...(opts.temperature != null && { temperature: opts.temperature }),
    },
  });

  const path = `/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) return reject(new Error(p.error.message));
          const text = p.candidates?.[0]?.content?.parts?.[0]?.text || '';
          resolve({
            id: 'gemini-' + Date.now(),
            choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
            usage: { prompt_tokens: p.usageMetadata?.promptTokenCount || 0, completion_tokens: p.usageMetadata?.candidatesTokenCount || 0, total_tokens: p.usageMetadata?.totalTokenCount || 0 },
            model,
          });
        } catch (e) { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { complete };
