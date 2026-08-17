const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;
const SITE_URL = (process.env.SITE_URL || 'https://meu-quiz-six.vercel.app').replace(/\/$/, '');
const ASAAS_URL = process.env.ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://api-sandbox.asaas.com/v3';

const PLANS = Object.freeze({
  weekly: { name: 'Plano Semanal', value: 21.90, cycle: 'WEEKLY', days: 7 },
  monthly: { name: 'Plano Mensal', value: 75.99, cycle: 'MONTHLY', days: 30 }
});

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não configurada.`);
  return value;
}

function supabaseHeaders(token) {
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${token || serviceKey}`,
    'Content-Type': 'application/json'
  };
}

async function authenticatedUser(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const { data } = await axios.get(`${required('SUPABASE_URL')}/auth/v1/user`, {
      headers: { apikey: required('SUPABASE_ANON_KEY'), Authorization: `Bearer ${token}` }
    });
    return data;
  } catch {
    return null;
  }
}

async function profile(userId) {
  const { data } = await axios.get(
    `${required('SUPABASE_URL')}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`,
    { headers: supabaseHeaders() }
  );
  return data?.[0] || null;
}

async function requireActiveSubscription(req, res, next) {
  const user = await authenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Faça login para continuar.' });
  const p = await profile(user.id);
  const active = p?.subscription_status === 'active' &&
    p?.access_until && new Date(p.access_until).getTime() > Date.now();
  if (!active) return res.status(403).json({ error: 'Assinatura necessária.', subscriptionRequired: true });
  req.user = user;
  req.profile = p;
  next();
}

app.get('/api/config', (req, res) => {
  try {
    res.json({
      supabaseUrl: required('SUPABASE_URL'),
      supabaseAnonKey: required('SUPABASE_ANON_KEY'),
      plans: PLANS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/subscription-status', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Não autenticado.' });
    const p = await profile(user.id);
    const active = p?.subscription_status === 'active' &&
      p?.access_until && new Date(p.access_until).getTime() > Date.now();
    res.json({
      active: Boolean(active),
      plan: p?.subscription_plan || null,
      accessUntil: p?.access_until || null,
      status: active ? 'active' : (p?.subscription_status || 'inactive')
    });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível verificar a assinatura.' });
  }
});

app.post('/api/create-checkout', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Faça login para assinar.' });
    const planKey = String(req.body?.plan || '');
    const method = String(req.body?.method || 'card');
    const plan = PLANS[planKey];
    if (!plan) return res.status(400).json({ error: 'Plano inválido.' });
    if (!['card', 'pix'].includes(method)) return res.status(400).json({ error: 'Forma de pagamento inválida.' });

    const recurring = method === 'card';
    const payload = {
      billingTypes: [recurring ? 'CREDIT_CARD' : 'PIX'],
      chargeTypes: [recurring ? 'RECURRENT' : 'DETACHED'],
      minutesToExpire: 60,
      externalReference: `electrolearn:${user.id}:${planKey}`,
      callback: {
        successUrl: `${SITE_URL}/?payment=success`,
        cancelUrl: `${SITE_URL}/?payment=cancel`,
        expiredUrl: `${SITE_URL}/?payment=expired`
      },
      items: [{
        name: `ElectroLearn - ${plan.name}`,
        description: 'Acesso completo aos estudos, PDFs e quizzes do ElectroLearn',
        quantity: 1,
        value: plan.value
      }],
    };

    if (recurring) {
      payload.subscription = {
        cycle: plan.cycle,
        nextDueDate: new Date().toISOString().slice(0, 19).replace('T', ' ')
      };
    }

    const { data } = await axios.post(`${ASAAS_URL}/checkouts`, payload, {
      headers: {
        access_token: required('ASAAS_API_KEY'),
        'Content-Type': 'application/json',
        'User-Agent': 'ElectroLearn/1.0'
      }
    });

    const checkoutUrl = data.url || data.checkoutUrl || data.link;
    if (!checkoutUrl) return res.status(502).json({ error: 'O Asaas não retornou o endereço do checkout.' });
    res.json({ url: checkoutUrl });
  } catch (err) {
    const details = err.response?.data;
    console.error('Erro Asaas checkout:', details || err.message);
    const firstError = Array.isArray(details?.errors) ? details.errors[0]?.description : null;
    res.status(err.response?.status || 500).json({
      error: firstError || details?.message || 'Não foi possível abrir o pagamento agora.'
    });
  }
});

app.post('/api/webhooks/asaas', async (req, res) => {
  try {
    const receivedToken = req.headers['asaas-access-token'];
    const expectedToken = required('ASAAS_WEBHOOK_TOKEN');
    if (!receivedToken || receivedToken !== expectedToken) {
      return res.status(401).json({ error: 'Webhook não autorizado.' });
    }

    const event = req.body?.event;
    const payment = req.body?.payment;
    if (!event || !payment?.id) return res.status(200).json({ received: true });

    let externalReference = payment.externalReference;
    if (!externalReference && payment.subscription) {
      try {
        const { data } = await axios.get(`${ASAAS_URL}/subscriptions/${payment.subscription}`, {
          headers: { access_token: required('ASAAS_API_KEY'), 'User-Agent': 'ElectroLearn/1.0' }
        });
        externalReference = data.externalReference;
      } catch (err) {
        console.error('Assinatura Asaas não localizada:', err.response?.data || err.message);
      }
    }

    const match = /^electrolearn:([0-9a-f-]{36}):(weekly|monthly)$/.exec(externalReference || '');
    if (!match) return res.status(200).json({ received: true, ignored: true });
    const [, userId, planKey] = match;
    const plan = PLANS[planKey];

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      const grantUrl = `${required('SUPABASE_URL')}/rest/v1/payment_grants`;
      try {
        await axios.post(grantUrl, {
          payment_id: payment.id,
          user_id: userId,
          plan: planKey,
          event
        }, { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } });
      } catch (err) {
        if (err.response?.status === 409) return res.status(200).json({ received: true, duplicate: true });
        throw err;
      }

      const current = await profile(userId);
      const base = Math.max(Date.now(), current?.access_until ? new Date(current.access_until).getTime() : 0);
      const accessUntil = new Date(base + plan.days * 86400000).toISOString();
      await axios.patch(
        `${required('SUPABASE_URL')}/rest/v1/profiles?id=eq.${userId}`,
        {
          subscription_status: 'active',
          subscription_plan: planKey,
          access_until: accessUntil,
          asaas_subscription_id: payment.subscription || current?.asaas_subscription_id || null,
          updated_at: new Date().toISOString()
        },
        { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } }
      );
    }

    if (['PAYMENT_REFUNDED', 'PAYMENT_DELETED'].includes(event)) {
      await axios.patch(
        `${required('SUPABASE_URL')}/rest/v1/profiles?id=eq.${userId}`,
        { subscription_status: 'inactive', access_until: new Date().toISOString(), updated_at: new Date().toISOString() },
        { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } }
      );
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Erro webhook Asaas:', err.response?.data || err.message);
    res.status(500).json({ error: 'Falha ao processar webhook.' });
  }
});

function getProviderConfig() {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const providerEnv = process.env.IA_PROVIDER?.trim().toLowerCase();
  if (providerEnv === 'openai' && openaiKey) return { provider: 'openai', key: openaiKey };
  if (providerEnv === 'anthropic' && anthropicKey) return { provider: 'anthropic', key: anthropicKey };
  if (openaiKey) return { provider: 'openai', key: openaiKey };
  if (anthropicKey) return { provider: 'anthropic', key: anthropicKey };
  throw new Error('Nenhuma chave de IA configurada.');
}

async function openaiResponse({ instructions, input, model, maxOutputTokens = 1200 }) {
  const key = required('OPENAI_API_KEY');
  const payload = {
    model: model || process.env.OPENAI_MODEL || 'gpt-5-mini',
    instructions,
    input,
    max_output_tokens: maxOutputTokens
  };
  const { data } = await axios.post('https://api.openai.com/v1/responses', payload, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    timeout: 45000
  });
  const text = data.output_text || (data.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === 'output_text')
    .map(item => item.text)
    .join('');
  if (!text) throw new Error('A IA não retornou conteúdo.');
  return text;
}

async function geminiResponse({ instructions, text, attachment, json = false, maxOutputTokens = 1200 }) {
  const key = required('GEMINI_API_KEY');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const parts = [{ text }];
  if (attachment) {
    const match = String(attachment.data || '').match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error('Anexo inválido.');
    parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
  }
  const generationConfig = { maxOutputTokens, temperature: json ? 0.2 : 0.45 };
  if (json) generationConfig.responseMimeType = 'application/json';
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      system_instruction: { parts: [{ text: instructions }] },
      contents: [{ role: 'user', parts }],
      generationConfig
    },
    { headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, timeout: 30000 }
  );
  const output = data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
  if (!output) throw new Error('O Gemini não retornou conteúdo.');
  return output;
}

app.post('/api/generate-quiz', requireActiveSubscription, async (req, res) => {
  const { levelTitle, topics } = req.body;
  if (!levelTitle || !topics) return res.status(400).json({ error: 'Dados do quiz são obrigatórios.' });
  try {
    const text = await geminiResponse({
      instructions: 'Você é professor brasileiro de eletrotécnica. Seja tecnicamente preciso, considere segurança e jamais incentive trabalho energizado. Responda somente JSON válido.',
      text: `Crie 8 perguntas didáticas sobre "${String(levelTitle).slice(0,120)}", cobrindo ${String(topics).slice(0,700)}. Retorne um array JSON com exatamente 4 itens type "tf" (options ["Verdadeiro","Falso"]) e 4 itens type "disc". Cada item deve ter question, answer e explanation.`,
      json: true,
      maxOutputTokens: 1800
    });
    res.json({ output_text: text });
  } catch (err) {
    console.error('Falha quiz IA:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: 'Falha ao gerar quiz.' });
  }
});

app.post('/api/grade-quiz', requireActiveSubscription, async (req, res) => {
  try {
    const answers = Array.isArray(req.body?.answers) ? req.body.answers.slice(0, 12) : [];
    if (!answers.length) return res.status(400).json({ error: 'Respostas não recebidas.' });
    const safe = answers.map((item, index) => ({
      index,
      type: item.type === 'tf' ? 'tf' : 'disc',
      question: String(item.question || '').slice(0, 600),
      reference: String(item.reference || '').slice(0, 1000),
      explanation: String(item.explanation || '').slice(0, 1000),
      userAnswer: String(item.userAnswer || '').slice(0, 1800)
    }));
    const text = await geminiResponse({
      instructions: 'Você corrige quizzes de eletrotécnica em português do Brasil. Aceite sinônimos e respostas conceitualmente equivalentes. Não dê ponto a respostas vazias, contraditórias, perigosas ou com conceito essencial ausente. Retorne somente JSON válido.',
      text: `Corrija as respostas abaixo. Para cada uma retorne {index, correct:boolean, feedback:string, missing:string, idealAnswer:string}. Em verdadeiro/falso compare exatamente. Em discursivas avalie aderência técnica, não igualdade literal. JSON final: {"results":[...]}\n${JSON.stringify(safe)}`,
      json: true,
      maxOutputTokens: 2200
    });
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.results) || parsed.results.length !== safe.length) throw new Error('Correção incompleta.');
    res.json({ results: parsed.results });
  } catch (err) {
    console.error('Falha correção IA:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: 'Não foi possível corrigir o quiz agora.' });
  }
});

app.post('/api/ai-tutor', requireActiveSubscription, async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim().slice(0, 2500);
    const context = String(req.body?.context || '').trim().slice(0, 1200);
    const attachment = req.body?.attachment;
    if (!message && !attachment) return res.status(400).json({ error: 'Digite uma mensagem ou anexe um arquivo.' });
    if (attachment) {
      const mime = String(attachment.mime || '');
      const data = String(attachment.data || '');
      const name = String(attachment.name || 'arquivo').slice(0, 120);
      if (!/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,/.test(data)) {
        return res.status(400).json({ error: 'Envie somente PNG, JPG, WEBP ou PDF.' });
      }
      if (data.length > 4_100_000) return res.status(413).json({ error: 'O arquivo deve ter no máximo 3 MB.' });
    }
    const answer = await geminiResponse({
      maxOutputTokens: 850,
      instructions: `Você é o Tutor ElectroLearn, um assistente simpático e natural, especialista em elétrica. Pode conversar normalmente, cumprimentar, entender o contexto do aluno e responder perguntas cotidianas relacionadas ao estudo, mas mantenha o foco principal em eletricidade, eletrotécnica, eletrônica, energia, instalações, equipamentos, normas e segurança. Se o assunto fugir totalmente disso, responda brevemente e conduza a conversa de volta ao aprendizado elétrico, sem soar como robô ou bloquear a conversa. Analise fotos, esquemas e PDFs anexados; quando pedirem resumo, organize em tópicos claros. Ensine por etapas e priorize segurança: nunca oriente intervenção energizada e recomende profissional habilitado quando houver risco. Não entregue só o gabarito; explique o raciocínio. Seja direto para responder rápido.`,
      text: `${context ? `Contexto atual: ${context}\n` : ''}${message || 'Analise e explique este anexo.'}`,
      attachment
    });
    res.json({ answer });
  } catch (err) {
    console.error('Falha tutor IA:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: 'O tutor está temporariamente indisponível.' });
  }
});

app.get('/api/electric-news', requireActiveSubscription, async (req, res) => {
  try {
    const url = 'https://news.google.com/rss/search?q=energia+el%C3%A9trica+tecnologia+Brasil&hl=pt-BR&gl=BR&ceid=BR:pt-419';
    const { data } = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'ElectroLearn/2.0' } });
    const decode = value => String(value || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    const items = [...String(data).matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 12).map(match => {
      const xml = match[1];
      const pick = tag => decode(xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]);
      const rawTitle = pick('title');
      const parts = rawTitle.split(' - ');
      return { title: parts.slice(0, -1).join(' - ') || rawTitle, source: parts.at(-1) || 'Notícia', url: pick('link'), publishedAt: pick('pubDate') };
    }).filter(item => item.title && /^https?:/.test(item.url));
    res.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    res.json({ updatedAt: new Date().toISOString(), items });
  } catch (err) {
    console.error('Falha notícias:', err.message);
    res.status(502).json({ error: 'Não foi possível atualizar as notícias agora.' });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'Meu Quiz.html')));

if (require.main === module) {
  app.listen(PORT, () => console.log(`Servidor iniciado em http://localhost:${PORT}`));
}

module.exports = app;
