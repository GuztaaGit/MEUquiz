const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));
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
    const plan = PLANS[planKey];
    if (!plan) return res.status(400).json({ error: 'Plano inválido.' });

    const payload = {
      billingTypes: ['CREDIT_CARD', 'PIX'],
      chargeTypes: ['RECURRENT'],
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
      customerData: {
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Aluno ElectroLearn',
        email: user.email
      },
      subscription: {
        cycle: plan.cycle,
        nextDueDate: new Date().toISOString().slice(0, 19).replace('T', ' ')
      }
    };

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

app.post('/api/generate-quiz', requireActiveSubscription, async (req, res) => {
  const { levelTitle, topics } = req.body;
  if (!levelTitle || !topics) return res.status(400).json({ error: 'Dados do quiz são obrigatórios.' });
  try {
    const config = getProviderConfig();
    const prompt = `Crie 8 perguntas didáticas de eletrotécnica para iniciantes sobre "${levelTitle}", cobrindo ${topics}. Retorne somente JSON: 4 verdadeiro/falso e 4 discursivas, com resposta e explicação.`;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` };
    const body = config.provider === 'anthropic'
      ? { model: 'claude-sonnet-4-20250514', max_tokens: 1400, messages: [{ role: 'user', content: prompt }] }
      : { model: 'gpt-3.5-turbo', temperature: 0.7, max_tokens: 1200, messages: [{ role: 'user', content: prompt }] };
    if (config.provider === 'anthropic') headers['x-api-key'] = config.key;
    const url = config.provider === 'anthropic'
      ? 'https://api.anthropic.com/v1/messages'
      : 'https://api.openai.com/v1/chat/completions';
    const response = await axios.post(url, body, { headers });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: 'Falha ao gerar quiz.' });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'Meu Quiz.html')));

if (require.main === module) {
  app.listen(PORT, () => console.log(`Servidor iniciado em http://localhost:${PORT}`));
}

module.exports = app;
