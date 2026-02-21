const https = require('https');

async function complete(model, messages, opts = {}) {
  const body = JSON.stringify({
    model,
    messages,
    ...(opts.max_tokens && { max_tokens: opts.max_tokens }),
    ...(opts.temperature != null && { temperature: opts.temperature }),
    stream: !!opts.stream,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    }, res => {
      if (opts.stream) return resolve(res);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed);
        } catch (e) { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function streamPassthrough(srcStream, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  srcStream.pipe(res);
}

module.exports = { complete, streamPassthrough };
