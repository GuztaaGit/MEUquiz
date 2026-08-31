const express = require('express');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '4mb' }));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co",
      "form-action 'self'"
    ].join('; ')
  });
  if (req.path.startsWith('/api/') && req.path !== '/api/electric-news') res.set('Cache-Control', 'no-store');
  next();
});
app.use('/assets', express.static(path.join(__dirname, 'assets'), {
  immutable: true,
  maxAge: '365d',
  fallthrough: false
}));
const PORT = process.env.PORT || 3000;
const CANONICAL_SITE_URL = 'https://eletrolearn.vercel.app';
const configuredSiteUrl = (process.env.SITE_URL || CANONICAL_SITE_URL).replace(/\/$/, '');
const SITE_URL = /^https:\/\/meu-quiz(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(configuredSiteUrl)
  ? CANONICAL_SITE_URL
  : configuredSiteUrl;
const ASAAS_URL = process.env.ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://api-sandbox.asaas.com/v3';

const PLANS = Object.freeze({
  weekly: { name: 'Plano Semanal', value: 21.90, cycle: 'WEEKLY', days: 7 },
  monthly: { name: 'Plano Mensal', value: 75.99, cycle: 'MONTHLY', days: 30 }
});
const TOTAL_LEVELS = 60;
const LESSONS_PER_LEVEL = 3;
const LEVEL_ACCESS_MODES = new Set(['progressive', 'all', 'custom', 'blocked']);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não configurada.`);
  return value;
}

function secureTokenEquals(received, expected) {
  const left = Buffer.from(String(received || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
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

function hasPaidAccess(p) {
  return ['active', 'cancelled'].includes(p?.subscription_status) &&
    p?.access_until && new Date(p.access_until).getTime() > Date.now();
}

function normalizeLevelAccess(p) {
  const mode = LEVEL_ACCESS_MODES.has(p?.level_access_mode) ? p.level_access_mode : 'progressive';
  const levels = [...new Set((Array.isArray(p?.level_access_levels) ? p.level_access_levels : [])
    .map(Number)
    .filter(level => Number.isInteger(level) && level >= 1 && level <= TOTAL_LEVELS))]
    .sort((a, b) => a - b);
  return { mode, levels };
}

function hasLevelAccess(p, levelId) {
  const id = Number(levelId);
  if (!Number.isInteger(id) || id < 1 || id > TOTAL_LEVELS) return false;
  const access = normalizeLevelAccess(p);
  if (access.mode === 'all') return true;
  if (access.mode === 'blocked') return false;
  if (access.mode === 'custom') return access.levels.includes(id);
  const progress = p?.progress && typeof p.progress === 'object' ? p.progress : {};
  return id === 1 || Number(progress[id] || 0) >= 100 || Number(progress[id - 1] || 0) >= 50;
}

function normalizeProgressMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, TOTAL_LEVELS).flatMap(([key, raw]) => {
    const level = Number(key);
    if (!Number.isInteger(level) || level < 1 || level > TOTAL_LEVELS) return [];
    return [[String(level), Math.max(0, Math.min(100, Math.round(Number(raw) || 0)))]];
  }));
}

function normalizeLessonProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, TOTAL_LEVELS).flatMap(([key, raw]) => {
    const level = Number(key);
    if (!Number.isInteger(level) || level < 1 || level > TOTAL_LEVELS) return [];
    const lessons = [...new Set((Array.isArray(raw) ? raw : [])
      .map(Number)
      .filter(index => Number.isInteger(index) && index >= 0 && index < LESSONS_PER_LEVEL))]
      .sort((a, b) => a - b);
    return [[String(level), lessons]];
  }));
}

function normalizeQuizScores(value) {
  return normalizeProgressMap(value);
}

function calculateLevelProgress(completedLessons, quizScore) {
  const lessons = Math.max(0, Math.min(LESSONS_PER_LEVEL, Number(completedLessons) || 0));
  const quiz = Math.max(0, Math.min(100, Number(quizScore) || 0));
  if (lessons === LESSONS_PER_LEVEL && quiz >= 70) return 100;
  return Math.min(99, Math.round(lessons * 20 + quiz * 0.4));
}

function quizSigningKey() {
  return process.env.QUIZ_SIGNING_SECRET?.trim() || required('SUPABASE_SERVICE_ROLE_KEY');
}

function quizEncryptionKey() {
  return crypto.createHash('sha256').update(quizSigningKey()).digest();
}

function sealQuizAttempt(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', quizEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

function openQuizAttempt(token, userId, levelId) {
  const [ivRaw, encryptedRaw, tagRaw, extra] = String(token || '').split('.');
  if (!ivRaw || !encryptedRaw || !tagRaw || extra) throw new Error('Tentativa de quiz inválida. Gere um novo quiz.');
  let payload;
  try {
    const iv = Buffer.from(ivRaw, 'base64url');
    const encrypted = Buffer.from(encryptedRaw, 'base64url');
    const tag = Buffer.from(tagRaw, 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length > 64 * 1024) throw new Error('Formato inválido.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', quizEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
  } catch {
    throw new Error('Tentativa de quiz inválida. Gere um novo quiz.');
  }
  if (payload?.userId !== userId || Number(payload?.levelId) !== Number(levelId) || Number(payload?.expiresAt) < Date.now()) {
    throw new Error('Esta tentativa expirou. Gere um novo quiz.');
  }
  if (!Array.isArray(payload.questions) || !payload.questions.length) throw new Error('Tentativa de quiz incompleta.');
  return payload;
}

function normalizeQuizQuestion(item, index) {
  const type = item?.type === 'tf' ? 'tf' : 'disc';
  const question = String(item?.question || '').trim().slice(0, 600);
  let answer = String(item?.answer || '').trim().slice(0, 1000);
  const explanation = String(item?.explanation || '').trim().slice(0, 1000);
  if (!question || !answer) throw new Error(`Pergunta ${index + 1} incompleta.`);
  if (type === 'tf') {
    const normalized = answer.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/^(verdadeiro|true|v)$/.test(normalized)) answer = 'Verdadeiro';
    else if (/^(falso|false|f)$/.test(normalized)) answer = 'Falso';
    else throw new Error(`Gabarito da pergunta ${index + 1} inválido.`);
  }
  const options = type === 'tf' ? ['Verdadeiro', 'Falso'] : [];
  return { type, question, answer, explanation, options };
}

async function saveLearningState(userId, state) {
  await axios.patch(`${required('SUPABASE_URL')}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    score: state.score,
    progress: state.progress,
    lesson_progress: state.lessonProgress,
    quiz_scores: state.quizScores,
    updated_at: new Date().toISOString()
  }, { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } });
}

const requestBuckets = new Map();
function rateLimit({ windowMs, max, prefix }) {
  return (req, res, next) => {
    const identity = req.user?.id || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const key = `${prefix}:${identity}`;
    const now = Date.now();
    const current = requestBuckets.get(key);
    if (!current || current.resetAt <= now) requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
    else {
      current.count += 1;
      if (current.count > max) {
        res.set('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
        return res.status(429).json({ error: 'Muitas tentativas. Aguarde um pouco e tente novamente.' });
      }
    }
    if (requestBuckets.size > 5000) {
      for (const [bucketKey, bucket] of requestBuckets) if (bucket.resetAt <= now) requestBuckets.delete(bucketKey);
    }
    next();
  };
}

async function requireActiveSubscription(req, res, next) {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Faça login para continuar.' });
    const p = await profile(user.id);
    const active = hasPaidAccess(p);
    if (!active) return res.status(403).json({ error: 'Assinatura necessária.', subscriptionRequired: true });
    req.user = user;
    req.profile = p;
    next();
  } catch (err) {
    console.error('Falha ao validar assinatura:', err.response?.data || err.message);
    res.status(503).json({ error: 'Não foi possível validar sua assinatura agora. Tente novamente em instantes.' });
  }
}

function requireLevelAccess(req, res, next) {
  const levelId = Number(req.body?.levelId);
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > TOTAL_LEVELS) {
    return res.status(400).json({ error: 'Informe um nível válido.' });
  }
  if (!hasLevelAccess(req.profile, levelId)) {
    return res.status(403).json({
      error: 'Este nível não está liberado para a sua conta.',
      levelBlocked: true,
      levelAccess: normalizeLevelAccess(req.profile)
    });
  }
  req.levelId = levelId;
  next();
}

async function requireAuthenticated(req, res, next) {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Faça login para continuar.' });
    req.user = user;
    req.profile = await profile(user.id);
    next();
  } catch (err) {
    console.error('Falha ao validar usuário:', err.response?.data || err.message);
    res.status(503).json({ error: 'Não foi possível validar sua conta agora. Tente novamente em instantes.' });
  }
}
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || 'gustavodivino886@gmail.com')
    .split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
);

async function requireAdmin(req, res, next) {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Faça login para continuar.' });
    if (!ADMIN_EMAILS.has(String(user.email || '').toLowerCase())) {
      return res.status(403).json({ error: 'Acesso exclusivo do administrador.' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('Falha ao validar administrador:', err.response?.data || err.message);
    res.status(503).json({ error: 'Não foi possível validar o acesso administrativo agora.' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'electrolearn' });
});

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
    const active = hasPaidAccess(p);
    res.json({
      active: Boolean(active),
      plan: p?.subscription_plan || null,
      accessUntil: p?.access_until || null,
      status: p?.subscription_status || 'inactive',
      recurring: Boolean(p?.asaas_subscription_id),
      isAdmin: ADMIN_EMAILS.has(String(user.email || '').toLowerCase()),
      levelAccess: normalizeLevelAccess(p)
    });
  } catch (err) {
    res.status(500).json({ error: 'Não foi possível verificar a assinatura.' });
  }
});

app.get('/api/my-progress', requireActiveSubscription, async (req, res) => {
  res.json({
    score: Number(req.profile?.score || 0),
    progress: normalizeProgressMap(req.profile?.progress),
    lessonProgress: normalizeLessonProgress(req.profile?.lesson_progress),
    quizScores: normalizeQuizScores(req.profile?.quiz_scores)
  });
});

app.put('/api/my-progress', requireActiveSubscription, async (req, res) => {
  res.status(409).json({
    error: 'O progresso agora é atualizado automaticamente ao concluir aulas e quizzes.',
    score: Number(req.profile?.score || 0),
    progress: normalizeProgressMap(req.profile?.progress)
  });
});

app.post('/api/learning/levels/:levelId/lessons/:lessonIndex/complete', requireActiveSubscription, async (req, res) => {
  try {
    const levelId = Number(req.params.levelId);
    const lessonIndex = Number(req.params.lessonIndex);
    if (!Number.isInteger(levelId) || levelId < 1 || levelId > TOTAL_LEVELS ||
        !Number.isInteger(lessonIndex) || lessonIndex < 0 || lessonIndex >= LESSONS_PER_LEVEL) {
      return res.status(400).json({ error: 'Aula inválida.' });
    }
    if (!hasLevelAccess(req.profile, levelId)) {
      return res.status(403).json({
        error: 'Este nível não está liberado para a sua conta.',
        levelBlocked: true,
        levelAccess: normalizeLevelAccess(req.profile)
      });
    }
    const lessonProgress = normalizeLessonProgress(req.profile?.lesson_progress);
    const quizScores = normalizeQuizScores(req.profile?.quiz_scores);
    const progress = normalizeProgressMap(req.profile?.progress);
    const completed = new Set(lessonProgress[levelId] || []);
    completed.add(lessonIndex);
    lessonProgress[levelId] = [...completed].sort((a, b) => a - b);
    progress[levelId] = Math.max(Number(progress[levelId] || 0), calculateLevelProgress(completed.size, quizScores[levelId] || 0));
    const score = Object.values(progress).reduce((total, value) => total + Number(value || 0), 0);
    await saveLearningState(req.user.id, { score, progress, lessonProgress, quizScores });
    res.json({
      saved: true,
      score,
      progress,
      lessonProgress,
      quizScores,
      levelProgress: progress[levelId],
      levelCompleted: progress[levelId] >= 100
    });
  } catch (err) {
    console.error('Falha ao concluir aula:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível concluir a aula. Verifique a atualização do banco e tente novamente.' });
  }
});

app.get('/api/leaderboard', requireActiveSubscription, async (req, res) => {
  try {
    const { data } = await axios.get(`${required('SUPABASE_URL')}/rest/v1/profiles?ranking_visible=eq.true&select=id,email,name,score,progress&order=score.desc&limit=100`, { headers: supabaseHeaders() });
    res.json({ entries: (data || []).map(p => ({ name: p.name || p.email?.split('@')[0] || 'Aluno', score: Number(p.score || 0), done: Object.values(p.progress || {}).filter(value => Number(value) >= 100).length, isCurrent: p.id === req.user.id })) });
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
      return { id: user.id, email: user.email, name: p.name || user.user_metadata?.name || '', createdAt: user.created_at, lastSignInAt: user.last_sign_in_at, plan: p.subscription_plan || null, status: p.subscription_status || 'inactive', accessUntil: p.access_until || null, score: Number(p.score || 0), rankingVisible: p.ranking_visible !== false, levelAccess: normalizeLevelAccess(p) };
    });
    res.json({ users });
  } catch (err) {
    console.error('Falha admin users:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível carregar os usuários.' });
  }
});

app.get('/api/support/tickets/mine', requireAuthenticated, async (req, res) => {
  try {
    const { data } = await axios.get(`${required('SUPABASE_URL')}/rest/v1/support_tickets?user_id=eq.${encodeURIComponent(req.user.id)}&select=*&order=created_at.desc&limit=20`, { headers: supabaseHeaders() });
    res.json({ tickets: data || [] });
  } catch (err) {
    console.error('Falha suporte:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível carregar suas mensagens.' });
  }
});

app.post('/api/support/tickets', requireAuthenticated, rateLimit({ windowMs: 10 * 60 * 1000, max: 5, prefix: 'support' }), async (req, res) => {
  try {
    const subject = String(req.body?.subject || 'Ajuda geral').trim().slice(0, 120);
    const message = String(req.body?.message || '').trim();
    if (message.length < 5 || message.length > 2000) return res.status(400).json({ error: 'Escreva uma mensagem entre 5 e 2000 caracteres.' });
    const payload = { user_id: req.user.id, user_name: req.profile?.name || req.user.user_metadata?.name || 'Aluno', user_email: req.user.email || '', subject, message };
    const { data } = await axios.post(`${required('SUPABASE_URL')}/rest/v1/support_tickets`, payload, { headers: { ...supabaseHeaders(), Prefer: 'return=representation' } });
    res.status(201).json({ ticket: data?.[0] });
  } catch (err) {
    console.error('Falha ao enviar suporte:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível enviar sua mensagem.' });
  }
});

app.post('/api/feedback', requireAuthenticated, rateLimit({ windowMs: 60 * 60 * 1000, max: 5, prefix: 'feedback' }), async (req, res) => {
  try {
    const rating = Number(req.body?.rating);
    const message = String(req.body?.message || '').trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Escolha de 1 a 5 estrelas.' });
    if (message.length < 5 || message.length > 1200) return res.status(400).json({ error: 'Escreva um feedback entre 5 e 1200 caracteres.' });
    const payload = { user_id: req.user.id, user_name: req.profile?.name || req.user.user_metadata?.name || 'Aluno', user_email: req.user.email || '', rating, message };
    await axios.post(`${required('SUPABASE_URL')}/rest/v1/feedback_entries`, payload, { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } });
    res.status(201).json({ saved: true });
  } catch (err) {
    console.error('Falha feedback:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível salvar seu feedback.' });
  }
});

app.get('/api/admin/support', requireAdmin, async (req, res) => {
  try {
    const [{ data }, { data: profiles }] = await Promise.all([
      axios.get(`${required('SUPABASE_URL')}/rest/v1/support_tickets?select=*&order=created_at.desc&limit=500`, { headers: supabaseHeaders() }),
      axios.get(`${required('SUPABASE_URL')}/rest/v1/profiles?select=id,subscription_plan,subscription_status,access_until`, { headers: supabaseHeaders() })
    ]);
    const byId = new Map((profiles || []).map(item => [item.id, item]));
    res.json({ tickets: (data || []).map(ticket => ({ ...ticket, profile: byId.get(ticket.user_id) || null })) });
  } catch (err) { res.status(500).json({ error: 'Não foi possível carregar o suporte.' }); }
});

app.patch('/api/admin/support/:id', requireAdmin, async (req, res) => {
  try {
    const status = ['open', 'in_progress', 'resolved'].includes(req.body?.status) ? req.body.status : 'open';
    const adminReply = String(req.body?.adminReply || '').trim().slice(0, 2000) || null;
    await axios.patch(`${required('SUPABASE_URL')}/rest/v1/support_tickets?id=eq.${encodeURIComponent(req.params.id)}`, { status, admin_reply: adminReply, updated_at: new Date().toISOString() }, { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } });
    res.json({ updated: true });
  } catch (err) { res.status(500).json({ error: 'Não foi possível atualizar o atendimento.' }); }
});

app.get('/api/admin/feedback', requireAdmin, async (req, res) => {
  try {
    const { data } = await axios.get(`${required('SUPABASE_URL')}/rest/v1/feedback_entries?select=*&order=created_at.desc&limit=500`, { headers: supabaseHeaders() });
    res.json({ feedback: data || [] });
  } catch (err) { res.status(500).json({ error: 'Não foi possível carregar os feedbacks.' }); }
});

app.get('/api/admin/community', requireAdmin, async (req, res) => {
  try {
    const [{ data: messages }, { data: profiles }] = await Promise.all([
      axios.get(`${required('SUPABASE_URL')}/rest/v1/community_messages?select=id,user_id,author_name,message,is_bot,created_at&order=created_at.desc&limit=500`, { headers: supabaseHeaders() }),
      axios.get(`${required('SUPABASE_URL')}/rest/v1/profiles?select=id,email,name,chat_muted_until`, { headers: supabaseHeaders() })
    ]);
    const profileById = new Map((profiles || []).map(item => [item.id, item]));
    res.json({ messages: (messages || []).map(message => ({ ...message, profile: message.user_id ? profileById.get(message.user_id) || null : null })) });
  } catch (err) {
    console.error('Falha admin comunidade:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível carregar a moderação do chat.' });
  }
});

app.delete('/api/admin/community/messages/:id', requireAdmin, async (req, res) => {
  try {
    await axios.delete(`${required('SUPABASE_URL')}/rest/v1/community_messages?id=eq.${encodeURIComponent(req.params.id)}`, { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: 'Não foi possível apagar a mensagem.' }); }
});

app.delete('/api/admin/community/messages', requireAdmin, async (req, res) => {
  try {
    await axios.delete(`${required('SUPABASE_URL')}/rest/v1/community_messages?id=gt.0`, { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } });
    res.json({ cleared: true });
  } catch (err) { res.status(500).json({ error: 'Não foi possível limpar o Chat Global.' }); }
});

app.patch('/api/admin/community/users/:id/mute', requireAdmin, async (req, res) => {
  try {
    const hours = Number(req.body?.hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 87600) return res.status(400).json({ error: 'Informe uma duração entre 0 e 87600 horas.' });
    const mutedUntil = hours === 0 ? null : new Date(Date.now() + hours * 3600000).toISOString();
    await axios.patch(`${required('SUPABASE_URL')}/rest/v1/profiles?id=eq.${encodeURIComponent(req.params.id)}`, { chat_muted_until: mutedUntil, updated_at: new Date().toISOString() }, { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } });
    res.json({ updated: true, mutedUntil });
  } catch (err) { res.status(500).json({ error: 'Não foi possível alterar o silenciamento.' }); }
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

app.patch('/api/admin/users/:id/levels', requireAdmin, async (req, res) => {
  try {
    const mode = String(req.body?.mode || '');
    if (!LEVEL_ACCESS_MODES.has(mode)) return res.status(400).json({ error: 'Modo de acesso inválido.' });
    const levels = [...new Set((Array.isArray(req.body?.levels) ? req.body.levels : [])
      .map(Number)
      .filter(level => Number.isInteger(level) && level >= 1 && level <= TOTAL_LEVELS))]
      .sort((a, b) => a - b);
    if (mode === 'custom' && !levels.length) {
      return res.status(400).json({ error: 'Selecione pelo menos um nível ou use “Bloquear todos”.' });
    }
    const levelAccess = { mode, levels: mode === 'custom' ? levels : [] };
    await axios.patch(`${required('SUPABASE_URL')}/rest/v1/profiles?id=eq.${encodeURIComponent(req.params.id)}`, {
      level_access_mode: levelAccess.mode,
      level_access_levels: levelAccess.levels,
      updated_at: new Date().toISOString()
    }, { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } });
    res.json({ updated: true, levelAccess });
  } catch (err) {
    console.error('Falha ao alterar níveis:', err.response?.data || err.message);
    res.status(500).json({ error: 'Não foi possível alterar o acesso aos níveis. Execute a atualização do banco no Supabase e tente novamente.' });
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
    const { data: targetUser } = await axios.get(`${required('SUPABASE_URL')}/auth/v1/admin/users/${encodeURIComponent(req.params.id)}`, { headers: supabaseHeaders() });
    const email = String(targetUser?.email || '').trim();
    if (!email) return res.status(404).json({ error: 'Conta não encontrada.' });
    const recoverUrl = `${required('SUPABASE_URL')}/auth/v1/recover?redirect_to=${encodeURIComponent(SITE_URL)}`;
    await axios.post(recoverUrl, { email }, { headers: { apikey: required('SUPABASE_ANON_KEY'), 'Content-Type': 'application/json' } });
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

app.post('/api/create-checkout', requireAuthenticated, rateLimit({ windowMs: 10 * 60 * 1000, max: 8, prefix: 'checkout' }), async (req, res) => {
  try {
    const user = req.user;
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

app.post('/api/subscription/cancel', requireActiveSubscription, rateLimit({ windowMs: 60 * 60 * 1000, max: 3, prefix: 'cancel' }), async (req, res) => {
  try {
    const subscriptionId = req.profile?.asaas_subscription_id;
    if (!subscriptionId) return res.status(400).json({ error: 'Este plano não possui renovação automática ativa.' });
    await axios.delete(`${ASAAS_URL}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: { access_token: required('ASAAS_API_KEY'), 'User-Agent': 'ElectroLearn/1.0' }
    });
    await axios.patch(`${required('SUPABASE_URL')}/rest/v1/profiles?id=eq.${req.user.id}`, {
      subscription_status: 'cancelled',
      asaas_subscription_id: null,
      updated_at: new Date().toISOString()
    }, { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } });
    res.json({ cancelled: true, accessUntil: req.profile.access_until });
  } catch (err) {
    console.error('Falha ao cancelar assinatura:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: 'Não foi possível cancelar a renovação agora. Fale com o suporte.' });
  }
});

app.post('/api/webhooks/asaas', async (req, res) => {
  try {
    const receivedToken = req.headers['asaas-access-token'];
    const expectedToken = required('ASAAS_WEBHOOK_TOKEN');
    if (!secureTokenEquals(receivedToken, expectedToken)) {
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
      let grantInserted = false;
      try {
        await axios.post(grantUrl, {
          payment_id: payment.id,
          user_id: userId,
          plan: planKey,
          event
        }, { headers: { ...supabaseHeaders(), Prefer: 'return=minimal' } });
        grantInserted = true;
      } catch (err) {
        if (err.response?.status === 409) return res.status(200).json({ received: true, duplicate: true });
        throw err;
      }

      const current = await profile(userId);
      const base = Math.max(Date.now(), current?.access_until ? new Date(current.access_until).getTime() : 0);
      const accessUntil = new Date(base + plan.days * 86400000).toISOString();
      try {
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
      } catch (err) {
        if (grantInserted) await axios.delete(`${grantUrl}?payment_id=eq.${encodeURIComponent(payment.id)}`, { headers: supabaseHeaders() }).catch(() => {});
        throw err;
      }
    }

    if (event === 'PAYMENT_REFUNDED') {
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

app.post('/api/generate-study', requireActiveSubscription, requireLevelAccess, rateLimit({ windowMs: 10 * 60 * 1000, max: 20, prefix: 'study-ai' }), async (req, res) => {
  try {
    const levelId = req.levelId;
    const levelTitle = String(req.body?.levelTitle || '').trim().slice(0, 120);
    const topics = String(req.body?.topics || '').trim().slice(0, 700);
    if (!levelTitle || !topics) return res.status(400).json({ error: 'Dados do nível são obrigatórios.' });
    const text = await geminiResponse({
      instructions: 'Você é professor brasileiro de eletrotécnica. Produza material correto, didático, prudente e compatível com normas brasileiras. Nunca oriente trabalho energizado. Retorne somente JSON válido.',
      text: `Crie uma aula para o Nível ${levelId}: "${levelTitle}", sobre ${topics}. Retorne um array JSON com exatamente 3 módulos. Cada módulo deve conter: title, intro, formula (string ou null), hl, secs (array com exatamente 2 objetos {h,b}), ex ({t,b}) e diag (um entre circuit, ohm, current, voltage, resistance, power, series, parallel, safety). Explique fundamentos, aplicação prática e segurança. Não prometa certificação profissional.`,
      json: true,
      maxOutputTokens: 2400
    });
    const lessons = JSON.parse(text);
    if (!Array.isArray(lessons) || lessons.length !== 3 || lessons.some(item => !item?.title || !item?.intro || !Array.isArray(item?.secs))) throw new Error('Aula incompleta.');
    res.json({ lessons });
  } catch (err) {
    console.error('Falha material IA:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: 'Não foi possível preparar este material agora.' });
  }
});

app.post('/api/generate-quiz', requireActiveSubscription, requireLevelAccess, rateLimit({ windowMs: 10 * 60 * 1000, max: 20, prefix: 'quiz-ai' }), async (req, res) => {
  const { levelTitle, topics } = req.body;
  if (!levelTitle || !topics) return res.status(400).json({ error: 'Dados do quiz são obrigatórios.' });
  try {
    const text = await geminiResponse({
      instructions: 'Você é professor brasileiro de eletrotécnica. Seja tecnicamente preciso, considere segurança e jamais incentive trabalho energizado. Responda somente JSON válido.',
      text: `Crie 8 perguntas didáticas sobre "${String(levelTitle).slice(0,120)}", cobrindo ${String(topics).slice(0,700)}. Retorne um array JSON com exatamente 4 itens type "tf" (options ["Verdadeiro","Falso"]) e 4 itens type "disc". Cada item deve ter question, answer e explanation.`,
      json: true,
      maxOutputTokens: 1800
    });
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length !== 8) throw new Error('Quiz incompleto.');
    const questions = parsed.map(normalizeQuizQuestion);
    const trueFalse = questions.filter(question => question.type === 'tf').length;
    if (trueFalse !== 4) throw new Error('O quiz deve conter quatro questões de verdadeiro ou falso.');
    const attemptToken = sealQuizAttempt({
      version: 1,
      userId: req.user.id,
      levelId: req.levelId,
      expiresAt: Date.now() + 45 * 60 * 1000,
      questions
    });
    res.json({
      questions: questions.map(({ type, question, options }) => ({ type, question, options })),
      attemptToken,
      expiresInSeconds: 2700
    });
  } catch (err) {
    console.error('Falha quiz IA:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: 'Falha ao gerar quiz.' });
  }
});

app.post('/api/grade-quiz', requireActiveSubscription, requireLevelAccess, rateLimit({ windowMs: 10 * 60 * 1000, max: 30, prefix: 'grade-ai' }), async (req, res) => {
  try {
    const attempt = openQuizAttempt(req.body?.attemptToken, req.user.id, req.levelId);
    const submitted = Array.isArray(req.body?.answers) ? req.body.answers.slice(0, attempt.questions.length) : [];
    if (submitted.length !== attempt.questions.length) return res.status(400).json({ error: 'Responda todas as questões antes de concluir.' });
    const safe = attempt.questions.map((question, index) => ({
      index,
      type: question.type,
      question: question.question,
      reference: question.answer,
      explanation: question.explanation,
      userAnswer: String(submitted[index] || '').trim().slice(0, 1800)
    }));
    if (safe.some(answer => !answer.userAnswer)) return res.status(400).json({ error: 'Responda todas as questões antes de concluir.' });

    let results = safe.filter(answer => answer.type === 'tf').map(answer => {
      const correct = answer.userAnswer.toLowerCase() === answer.reference.toLowerCase();
      return {
        index: answer.index,
        correct,
        feedback: correct ? 'Resposta correta.' : 'A alternativa escolhida não corresponde ao gabarito.',
        missing: correct ? '' : `O gabarito desta afirmação é “${answer.reference}”.`,
        idealAnswer: answer.reference
      };
    });
    const discursive = safe.filter(answer => answer.type === 'disc');
    try {
      const text = await geminiResponse({
        instructions: 'Você corrige quizzes de eletrotécnica em português do Brasil. Aceite sinônimos e respostas conceitualmente equivalentes. Não dê ponto a respostas vazias, contraditórias, perigosas ou com conceito essencial ausente. Retorne somente JSON válido.',
        text: `Corrija somente as respostas discursivas abaixo. Para cada uma retorne {index, correct:boolean, feedback:string, missing:string, idealAnswer:string}. Avalie aderência técnica e conceitos essenciais, não igualdade literal. JSON final: {"results":[...]}\n${JSON.stringify(discursive)}`,
        json: true,
        maxOutputTokens: 2200
      });
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.results) || parsed.results.length !== discursive.length) throw new Error('Correção incompleta.');
      const expectedIndexes = new Set(discursive.map(answer => answer.index));
      const aiResults = parsed.results.map((result, position) => ({
        index: expectedIndexes.has(Number(result?.index)) ? Number(result.index) : discursive[position].index,
        correct: result?.correct === true,
        feedback: String(result?.feedback || '').slice(0, 1000),
        missing: String(result?.missing || '').slice(0, 1000),
        idealAnswer: String(result?.idealAnswer || discursive[position].reference).slice(0, 1200)
      }));
      if (new Set(aiResults.map(result => result.index)).size !== discursive.length) throw new Error('Índices de correção inválidos.');
      results.push(...aiResults);
    } catch (gradingError) {
      console.error('Correção IA em modo seguro:', gradingError.response?.data || gradingError.message);
      results.push(...discursive.map(answer => ({
        index: answer.index,
        correct: false,
        feedback: 'A resposta discursiva não recebeu ponto porque a correção inteligente ficou temporariamente indisponível.',
        missing: 'Compare sua resposta com a referência e tente novamente.',
        idealAnswer: answer.reference
      })));
    }
    results.sort((a, b) => a.index - b.index);

    const correct = results.filter(result => result.correct).length;
    const quizPercent = Math.round(correct / results.length * 100);
    const lessonProgress = normalizeLessonProgress(req.profile?.lesson_progress);
    const quizScores = normalizeQuizScores(req.profile?.quiz_scores);
    const progress = normalizeProgressMap(req.profile?.progress);
    quizScores[req.levelId] = Math.max(Number(quizScores[req.levelId] || 0), quizPercent);
    const completedLessons = (lessonProgress[req.levelId] || []).length;
    progress[req.levelId] = Math.max(Number(progress[req.levelId] || 0), calculateLevelProgress(completedLessons, quizScores[req.levelId]));
    const score = Object.values(progress).reduce((total, value) => total + Number(value || 0), 0);
    await saveLearningState(req.user.id, { score, progress, lessonProgress, quizScores });
    res.json({
      results,
      correct,
      total: results.length,
      quizPercent,
      quizBest: quizScores[req.levelId],
      levelProgress: progress[req.levelId],
      levelCompleted: progress[req.levelId] >= 100,
      score,
      progress,
      lessonProgress,
      quizScores
    });
  } catch (err) {
    console.error('Falha correção IA:', err.response?.data || err.message);
    const message = /tentativa|expirou|quiz inválid/i.test(err.message || '') ? err.message : 'Não foi possível corrigir o quiz agora.';
    res.status(/tentativa|expirou|quiz inválid/i.test(err.message || '') ? 400 : (err.response?.status || 500)).json({ error: message });
  }
});

app.post('/api/ai-tutor', requireActiveSubscription, rateLimit({ windowMs: 10 * 60 * 1000, max: 35, prefix: 'tutor-ai' }), async (req, res) => {
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
    const status = Number(err.response?.status || 500);
    const friendly = status === 429
      ? 'O Tutor está recebendo muitas perguntas agora. Aguarde um instante e tente novamente.'
      : status === 401 || status === 403
        ? 'O Tutor precisa de uma atualização de configuração. A equipe já pode verificar isso pelo painel técnico.'
        : status === 404
          ? 'O Tutor está sendo atualizado. Tente novamente em alguns minutos.'
          : 'O Tutor não conseguiu responder agora. Sua mensagem não foi perdida; tente novamente em instantes.';
    res.status(status).json({ error: friendly, code });
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

app.post('/api/community/messages', requireActiveSubscription, rateLimit({ windowMs: 60 * 1000, max: 10, prefix: 'community' }), async (req, res) => {
  try {
    const mutedUntil = req.profile?.chat_muted_until ? new Date(req.profile.chat_muted_until) : null;
    if (mutedUntil && mutedUntil.getTime() > Date.now()) {
      return res.status(403).json({ error: `Você está silenciado no Chat Global até ${mutedUntil.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.` });
    }
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
      const batchText = String(batch);
      const jsonText = batchText.split('\n').find(line => line.trim().startsWith('[["wrb.fr"')) || batchText.replace(/^\)\]\}'\s*/, '');
      const outer = JSON.parse(jsonText);
      const row = outer.find(entry => entry?.[0] === 'wrb.fr' && entry?.[1] === 'Fbv4je');
      const resolved = row?.[2] ? JSON.parse(row[2])?.[1] : null;
      return /^https?:\/\//i.test(resolved || '') ? resolved : googleUrl;
    };
    const thematicImages = [
      'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1466611653911-95081537e5b7?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1597404294360-feeeda04612e?auto=format&fit=crop&w=900&q=80'
    ];
    const baseItems = [...String(data).matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10).map((match, index) => {
      const xml = match[1];
      const pick = tag => decode(xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]);
      const rawTitle = pick('title');
      const parts = rawTitle.split(' - ');
      const mediaImage = decode(xml.match(/<(?:media:content|enclosure)[^>]+url=["']([^"']+)["']/i)?.[1]);
      return { title: parts.slice(0, -1).join(' - ') || rawTitle, source: parts.at(-1) || 'Notícia', url: pick('link'), publishedAt: pick('pubDate'), image: mediaImage, summary: cleanText(pick('description')), thematicImage: thematicImages[index % thematicImages.length] };
    }).filter(item => item.title && /^https?:/.test(item.url));
    const items = await Promise.all(baseItems.map(async item => {
      try {
        const articleUrl = await resolveGoogleNewsUrl(item.url);
        const response = await axios.get(articleUrl, { timeout: 5500, maxContentLength: 1200000, headers: { 'User-Agent': `Mozilla/5.0 (compatible; ElectroLearn/2.0; +${CANONICAL_SITE_URL})` } });
        const html = String(response.data || '').slice(0, 1200000);
        const description = meta(html, 'og:description') || meta(html, 'twitter:description') || meta(html, 'description');
        const image = meta(html, 'og:image') || meta(html, 'twitter:image');
        const actualUrl = response.request?.res?.responseUrl || articleUrl;
        const googleResult = /(?:google\.com|googleusercontent\.com|gstatic\.com)/i.test(actualUrl);
        const cleanDescription = cleanText(description || item.summary);
        const usableDescription = !googleResult && !/comprehensive up-to-date news coverage|google news/i.test(cleanDescription) ? cleanDescription : '';
        const usableImage = !googleResult && /^https?:\/\//i.test(image) && !/(?:googleusercontent|gstatic|google\.com)/i.test(image) ? image : '';
        return { ...item, url: actualUrl, image: usableImage || item.image || item.thematicImage, summary: (usableDescription || `Entenda os destaques de ${item.title.toLowerCase()} e sua importância para energia, tecnologia e o setor elétrico.`).slice(0, 240) };
      } catch {
        return { ...item, image: item.image || item.thematicImage, summary: `Entenda os destaques de ${item.title.toLowerCase()} e sua importância para energia, tecnologia e o setor elétrico.`.slice(0, 240) };
      }
    }));
    const newsSlot = Math.floor(Date.now() / (30 * 60 * 1000));
    res.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=60');
    res.set('X-ElectroLearn-News-Slot', String(newsSlot));
    res.json({
      updatedAt: new Date().toISOString(),
      nextRefreshAt: new Date((newsSlot + 1) * 30 * 60 * 1000).toISOString(),
      refreshEveryMinutes: 30,
      items
    });
  } catch (err) {
    console.error('Falha notícias:', err.message);
    res.status(502).json({ error: 'Não foi possível atualizar as notícias agora.' });
  }
});

app.get('/', (req, res) => {
  // O HTML sempre é revalidado. Os assets continuam com cache longo e usam
  // uma versão no URL, evitando que uma atualização visual fique presa no
  // cache do navegador ou da CDN.
  res.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.sendFile(path.join(__dirname, 'Meu Quiz.html'));
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Servidor iniciado em http://localhost:${PORT}`));
}

module.exports = app;
