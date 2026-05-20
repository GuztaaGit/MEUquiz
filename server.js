const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;

function getProviderConfig() {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const providerEnv = process.env.IA_PROVIDER?.trim().toLowerCase();

  if (providerEnv === 'openai') {
    if (!openaiKey) throw new Error('OPENAI_API_KEY não configurada.');
    return {provider: 'openai', key: openaiKey};
  }
  if (providerEnv === 'anthropic') {
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY não configurada.');
    return {provider: 'anthropic', key: anthropicKey};
  }

  if (openaiKey) return {provider: 'openai', key: openaiKey};
  if (anthropicKey) return {provider: 'anthropic', key: anthropicKey};

  throw new Error('Nenhuma chave de API encontrada. Configure OPENAI_API_KEY ou ANTHROPIC_API_KEY.');
}

function buildPrompt(levelTitle, topics) {
  return `Você é professor de eletrotécnica criando perguntas didáticas para iniciantes.

Crie 8 perguntas sobre o tema "${levelTitle}" cobrindo: ${topics}.
- 4 perguntas de Verdadeiro ou Falso (type: "tf")
- 4 perguntas discursivas simples e abertas (type: "disc")
- Linguagem simples, sem jargão técnico excessivo
- Cada pergunta deve ter explicação didática clara

RETORNE APENAS o JSON abaixo, sem nenhum texto antes ou depois, sem markdown, sem blocos de código:
[{"type":"tf","question":"pergunta?","options":["Verdadeiro","Falso"],"answer":"Verdadeiro","explanation":"explicação simples"},{"type":"disc","question":"pergunta aberta?","answer":"resposta modelo","explanation":"explicação"}]

Seed de variação: ${Date.now()}`;
}

app.post('/api/generate-quiz', async (req, res) => {
  const { levelTitle, topics } = req.body;
  if (!levelTitle || !topics) {
    return res.status(400).json({ error: 'levelTitle e topics são obrigatórios.' });
  }

  let config;
  try {
    config = getProviderConfig();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const prompt = buildPrompt(levelTitle, topics);
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.key}`
  };

  const body = config.provider === 'anthropic'
    ? {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1400,
        messages: [{ role: 'user', content: prompt }]
      }
    : {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      };

  if (config.provider === 'anthropic') {
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }

  const url = config.provider === 'anthropic'
    ? 'https://api.anthropic.com/v1/messages'
    : 'https://api.openai.com/v1/chat/completions';

  try {
    const response = await axios.post(url, body, { headers });
    return res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || err.message;
    return res.status(status).json({ error: typeof message === 'string' ? message : JSON.stringify(message) });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Meu Quiz.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado em http://localhost:${PORT}`);
});
