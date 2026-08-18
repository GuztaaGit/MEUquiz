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

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || 'gustavodivino886@gmail.com')
    .split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
);

async function requireAdmin(req, res, next) {
  const user = await authenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Faça login para continuar.' });
  if (!ADMIN_EMAILS.has(String(user.email || '').toLowerCase())) {
    return res.status(403).json({ error: 'Acesso exclusivo do administrador.' });
  }
  req.user = user;
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

app.get('/api/my-progress', requireActiveSubscription, async (req, res) => {
  res.json({ score: Number(req.profile?.score || 0), progress: req.profile?.progress || {} });
});

app.put('/api/my-progress', requireActiveSubscription, async (req, res) => {
  try {
    const score = Math.max(0, Math.min(10000000, Number(req.body?.score || 0)));
    const rawProgress = req.body?.progress && typeof req.body.progress === 'object' ? req.body.progress : {};
    const progress = Object.fromEntries(Object.entries(rawProgress).slice(0, 50).map(([key, value]) => [String(key), Math.max(0, Math.min(100, Number(value || 0)))]));
    await axios.patch(`${required('SUPABASE_URL')}/rest/v1/profiles?id=eq.${req.user.id}`, {
      score: Math.round(score), progress, ranking_visible: true, updated_at: new Date().toISOString()
    }, { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } });
    res.json({ saved: true });
  } catch (err) {
    console.error('Falha ao salvar progresso:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível salvar o progresso.' });
  }
});

app.get('/api/leaderboard', requireActiveSubscription, async (req, res) => {
  try {
    const { data } = await axios.get(`${required('SUPABASE_URL')}/rest/v1/profiles?ranking_visible=eq.true&select=id,email,name,score,progress&order=score.desc&limit=100`, { headers: supabaseHeaders() });
    res.json({ entries: (data || []).map(p => ({ name: p.name || p.email?.split('@')[0] || 'Aluno', email: p.email, score: Number(p.score || 0), done: Object.values(p.progress || {}).filter(value => Number(value) >= 100).length })) });
  } catch (err) {
    console.error('Falha ranking:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível carregar o ranking.' });
  }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const [{ data: authData }, { data: profiles }] = await Promise.all([
      axios.get(`${required('SUPABASE_URL')}/auth/v1/admin/users?page=1&per_page=1000`, { headers: supabaseHeaders() }),
      axios.get(`${required('SUPABASE_URL')}/rest/v1/profiles?select=*&order=created_at.desc`, { headers: supabaseHeaders() })
    ]);
    const profileById = new Map((profiles || []).map(p => [p.id, p]));
    const users = (authData?.users || []).map(user => {
      const p = profileById.get(user.id) || {};
      return { id: user.id, email: user.email, name: p.name || user.user_metadata?.name || '', createdAt: user.created_at, lastSignInAt: user.last_sign_in_at, plan: p.subscription_plan || null, status: p.subscription_status || 'inactive', accessUntil: p.access_until || null, score: Number(p.score || 0), rankingVisible: p.ranking_visible !== false };
    });
    res.json({ users });
  } catch (err) {
    console.error('Falha admin users:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível carregar os usuários.' });
  }
});

app.patch('/api/admin/users/:id/subscription', requireAdmin, async (req, res) => {
  try {
    const plan = ['weekly', 'monthly'].includes(req.body?.plan) ? req.body.plan : null;
    const status = ['active', 'inactive', 'cancelled'].includes(req.body?.status) ? req.body.status : 'inactive';
    const days = Math.max(0, Math.min(3650, Number(req.body?.days || 0)));
    const accessUntil = status === 'active' ? new Date(Date.now() + days * 86400000).toISOString() : new Date().toISOString();
    await axios.patch(`${required('SUPABASE_URL')}/rest/v1/profiles?id=eq.${encodeURIComponent(req.params.id)}`, { subscription_plan: plan, subscription_status: status, access_until: accessUntil, updated_at: new Date().toISOString() }, { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } });
    res.json({ updated: true, accessUntil });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível alterar a assinatura.' });
  }
});

app.delete('/api/admin/users/:id/ranking', requireAdmin, async (req, res) => {
  try {
    await axios.patch(`${required('SUPABASE_URL')}/rest/v1/profiles?id=eq.${encodeURIComponent(req.params.id)}`, { score: 0, progress: {}, ranking_visible: false, updated_at: new Date().toISOString() }, { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } });
    res.json({ removed: true });
  } catch { res.status(500).json({ error: 'Não foi possível remover do ranking.' }); }
});

app.post('/api/admin/users/:id/password-reset', requireAdmin, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    if (!email) return res.status(400).json({ error: 'E-mail obrigatório.' });
    await axios.post(`${required('SUPABASE_URL')}/auth/v1/recover`, { email, redirect_to: SITE_URL }, { headers: { apikey: required('SUPABASE_ANON_KEY'), 'Content-Type': 'application/json' } });
    res.json({ sent: true });
  } catch (err) {
    console.error('Falha reset:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível enviar a redefinição.' });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    if (req.user.id === req.params.id) return res.status(400).json({ error: 'Você não pode excluir sua própria conta administrativa.' });
    await axios.delete(`${required('SUPABASE_URL')}/auth/v1/admin/users/${encodeURIComponent(req.params.id)}`, { headers: supabaseHeaders() });
    res.json({ deleted: true });
  } catch (err) {
    console.error('Falha excluir usuário:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível excluir a conta.' });
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
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
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
    const googleError = err.response?.data?.error;
    const code = googleError?.status || err.code || 'ERRO_INTERNO';
    const rawMessage = googleError?.message || err.message || 'Falha desconhecida.';
    const safeMessage = String(rawMessage)
      .replace(/AIza[\w-]+/g, '[chave protegida]')
      .replace(/sk-[\w-]+/g, '[chave protegida]')
      .slice(0, 500);
    console.error('Falha tutor IA:', { status: err.response?.status, code, message: safeMessage });
    res.status(err.response?.status || 500).json({
      error: `Tutor indisponível (${code}): ${safeMessage}`
    });
  }
});

app.post('/api/community/heartbeat', requireActiveSubscription, async (req, res) => {
  try {
    await axios.post(`${required('SUPABASE_URL')}/rest/v1/community_presence?on_conflict=user_id`, {
      user_id: req.user.id,
      updated_at: new Date().toISOString()
    }, { headers: { ...supabaseHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' } });
    res.json({ active: true });
  } catch (err) {
    console.error('Falha presença:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível registrar sua presença.' });
  }
});

app.get('/api/community', requireActiveSubscription, async (req, res) => {
  try {
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const [{ data: presence }, { data: messages }] = await Promise.all([
      axios.get(`${required('SUPABASE_URL')}/rest/v1/community_presence?updated_at=gte.${encodeURIComponent(since)}&select=user_id`, { headers: supabaseHeaders() }),
      axios.get(`${required('SUPABASE_URL')}/rest/v1/community_messages?select=id,user_id,author_name,message,is_bot,created_at&order=created_at.desc&limit=100`, { headers: supabaseHeaders() })
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({ online: (presence || []).length, messages: (messages || []).reverse(), userId: req.user.id });
  } catch (err) {
    console.error('Falha comunidade:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível carregar o Chat Global.' });
  }
});

app.post('/api/community/messages', requireActiveSubscription, async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Digite uma mensagem.' });
    if (message.length > 600) return res.status(400).json({ error: 'A mensagem pode ter no máximo 600 caracteres.' });

    let moderation;
    try {
      const output = await geminiResponse({
        instructions: `Você modera um chat brasileiro de estudantes. Retorne apenas JSON válido com allowed (boolean), category e reason em português. Permita conversa informal, discordância respeitosa e palavrões leves não dirigidos a alguém. Bloqueie racismo e intolerância contra raça, cor, origem, nacionalidade, religião, sexo, orientação sexual, identidade ou deficiência; bullying e humilhação dirigida; ameaça; assédio sexual; incentivo a automutilação; exposição de dados pessoais; e ataques graves contra pessoas ou grupos. Não bloqueie uma mensagem apenas porque cita um termo ofensivo para denunciar, explicar ou estudar o assunto.`,
        text: `Classifique esta mensagem antes da publicação:\n${message}`,
        json: true,
        maxOutputTokens: 220
      });
      moderation = JSON.parse(output);
    } catch (err) {
      console.error('Falha moderação:', err.response?.data || err.message);
      return res.status(503).json({ error: 'A moderação está indisponível agora. Tente novamente em instantes.' });
    }
    if (moderation?.allowed !== true) {
      return res.status(422).json({ error: moderation?.reason || 'Mensagem bloqueada pelas regras de convivência.' });
    }

    const authorName = String(req.profile?.name || req.user?.user_metadata?.name || req.user?.email?.split('@')[0] || 'Aluno').slice(0, 80);
    const { data } = await axios.post(`${required('SUPABASE_URL')}/rest/v1/community_messages`, {
      user_id: req.user.id, author_name: authorName, message, is_bot: false
    }, { headers: { ...supabaseHeaders(), Prefer: 'return=representation' } });

    const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const mentionedLeo = /(^|\W)leo(\W|$)/.test(normalized);
    const mentionedMarina = /(^|\W)marina(\W|$)/.test(normalized);
    const shouldReply = mentionedLeo || mentionedMarina || Math.random() < 0.22;
    let botMessage = null;
    if (shouldReply) {
      try {
        const bot = mentionedMarina ? { name: 'Marina', style: 'acolhedora, organizada e boa em explicar conceitos passo a passo' } : { name: 'Léo', style: 'bem-humorado, direto e apaixonado por elétrica e tecnologia' };
        const reply = await geminiResponse({
          instructions: `Você é ${bot.name}, um bot comunitário do ElectroLearn, ${bot.style}. Todos veem um selo BOT ao lado do seu nome. Responda em português brasileiro com até 350 caracteres. Participe naturalmente, ajude principalmente em elétrica e estudos, não finja ser humano, não invente experiências pessoais e respeite as regras contra ofensas, preconceito e riscos elétricos.`,
          text: `${authorName} escreveu no Chat Global: "${message}". Responda apenas se agregar algo; seja natural e breve.`,
          maxOutputTokens: 180
        });
        const cleanReply = String(reply).trim().slice(0, 600);
        if (cleanReply) {
          const { data: insertedBot } = await axios.post(`${required('SUPABASE_URL')}/rest/v1/community_messages`, {
            user_id: null, author_name: bot.name, message: cleanReply, is_bot: true
          }, { headers: { ...supabaseHeaders(), Prefer: 'return=representation' } });
          botMessage = insertedBot?.[0] || null;
        }
      } catch (err) {
        console.error('Bot comunitário não respondeu:', err.response?.data || err.message);
      }
    }
    res.status(201).json({ message: data?.[0], botMessage });
  } catch (err) {
    console.error('Falha ao publicar mensagem:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível publicar a mensagem.' });
  }
});

app.get('/api/electric-news', requireActiveSubscription, async (req, res) => {
  try {
    const url = 'https://news.google.com/rss/search?q=energia+el%C3%A9trica+tecnologia+Brasil&hl=pt-BR&gl=BR&ceid=BR:pt-419';
    const { data } = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'ElectroLearn/2.0' } });
    const decode = value => String(value || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const cleanText = value => decode(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const meta = (html, property) => decode(html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'))?.[1] || '');
    const resolveGoogleNewsUrl = async googleUrl => {
      if (!/news\.google\.com\/rss\/articles\//i.test(googleUrl)) return googleUrl;
      const id = googleUrl.match(/\/articles\/([^?]+)/)?.[1];
      if (!id) return googleUrl;
      const { data: splash } = await axios.get(googleUrl, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const timestamp = String(splash).match(/data-n-a-ts="([^"]+)"/)?.[1];
      const signature = String(splash).match(/data-n-a-sg="([^"]+)"/)?.[1];
      if (!timestamp || !signature) return googleUrl;
      const request = ['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'BR:pt-419', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(timestamp), signature];
      const form = new URLSearchParams({ 'f.req': JSON.stringify([[['Fbv4je', JSON.stringify(request), null, 'generic']]]) });
      const { data: batch } = await axios.post('https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je', form.toString(), { timeout: 5000, headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } });
      const outer = JSON.parse(String(batch).replace(/^\)\]\}'\s*/, ''));
      const row = outer.find(entry => entry?.[0] === 'wrb.fr' && entry?.[1] === 'Fbv4je');
      const resolved = row?.[2] ? JSON.parse(row[2])?.[1] : null;
      return /^https?:\/\//i.test(resolved || '') ? resolved : googleUrl;
    };
    const baseItems = [...String(data).matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10).map(match => {
      const xml = match[1];
      const pick = tag => decode(xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]);
      const rawTitle = pick('title');
      const parts = rawTitle.split(' - ');
      const mediaImage = decode(xml.match(/<(?:media:content|enclosure)[^>]+url=["']([^"']+)["']/i)?.[1]);
      return { title: parts.slice(0, -1).join(' - ') || rawTitle, source: parts.at(-1) || 'Notícia', url: pick('link'), publishedAt: pick('pubDate'), image: mediaImage, summary: cleanText(pick('description')) };
    }).filter(item => item.title && /^https?:/.test(item.url));
    const items = await Promise.all(baseItems.map(async item => {
      try {
        const articleUrl = await resolveGoogleNewsUrl(item.url);
        const response = await axios.get(articleUrl, { timeout: 5500, maxContentLength: 1200000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ElectroLearn/2.0; +https://meu-quiz-six.vercel.app)' } });
        const html = String(response.data || '').slice(0, 1200000);
        const description = meta(html, 'og:description') || meta(html, 'twitter:description') || meta(html, 'description');
        const image = meta(html, 'og:image') || meta(html, 'twitter:image');
        return { ...item, url: response.request?.res?.responseUrl || articleUrl, image: /^https?:\/\//i.test(image) ? image : item.image, summary: cleanText(description || item.summary).slice(0, 240) };
      } catch {
        return { ...item, summary: cleanText(item.summary).slice(0, 240) };
      }
    }));
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
