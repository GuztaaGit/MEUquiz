const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://mock-project.supabase.co';
process.env.SUPABASE_ANON_KEY = 'mock-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
process.env.QUIZ_SIGNING_SECRET = 'mock-quiz-signing-secret-with-enough-entropy';
process.env.GEMINI_API_KEY = 'mock-gemini-key';
process.env.ADMIN_EMAILS = 'admin@electrolearn.test';

const axios = require('axios');

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@electrolearn.test',
  user_metadata: { name: 'Aluno de teste' }
};

const profile = {
  id: user.id,
  email: user.email,
  name: 'Aluno de teste',
  subscription_status: 'active',
  subscription_plan: 'monthly',
  access_until: new Date(Date.now() + 30 * 86400000).toISOString(),
  score: 0,
  progress: {},
  lesson_progress: {},
  quiz_scores: {},
  level_access_mode: 'progressive',
  level_access_levels: []
};

const quiz = [
  { type: 'tf', question: 'Corrente elétrica é medida em ampères?', answer: 'Verdadeiro', explanation: 'O ampère é a unidade de corrente.' },
  { type: 'tf', question: 'Tensão elétrica é medida em watts?', answer: 'Falso', explanation: 'Tensão é medida em volts.' },
  { type: 'tf', question: 'Um disjuntor ajuda a proteger o circuito?', answer: 'Verdadeiro', explanation: 'Ele interrompe situações anormais.' },
  { type: 'tf', question: 'É seguro trabalhar sempre com o circuito energizado?', answer: 'Falso', explanation: 'O circuito deve ser desenergizado.' },
  { type: 'disc', question: 'O que é tensão elétrica?', answer: 'É a diferença de potencial elétrico entre dois pontos.', explanation: 'A tensão impulsiona a corrente.' },
  { type: 'disc', question: 'O que é corrente elétrica?', answer: 'É o movimento ordenado de cargas elétricas.', explanation: 'Corrente representa o fluxo de cargas.' },
  { type: 'disc', question: 'Para que serve um disjuntor?', answer: 'Protege o circuito contra sobrecorrentes e curtos-circuitos.', explanation: 'O disjuntor interrompe correntes perigosas.' },
  { type: 'disc', question: 'Qual cuidado básico antecede uma intervenção?', answer: 'Desenergizar, bloquear e verificar a ausência de tensão.', explanation: 'A segurança vem antes da intervenção.' }
];

function geminiPayload(text) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function requestText(config) {
  return config?.contents?.[0]?.parts?.find(part => part.text)?.text || '';
}

axios.get = async url => {
  if (url.endsWith('/auth/v1/user')) return { data: user };
  if (url.includes('/rest/v1/profiles?')) return { data: [{ ...profile }] };
  throw new Error(`GET não simulado: ${url}`);
};

axios.patch = async (url, payload) => {
  if (!url.includes('/rest/v1/profiles?')) throw new Error(`PATCH não simulado: ${url}`);
  Object.assign(profile, payload);
  return { data: null };
};

axios.post = async (url, payload) => {
  if (!url.includes('generativelanguage.googleapis.com')) throw new Error(`POST não simulado: ${url}`);
  const prompt = requestText(payload);
  if (prompt.includes('Crie 8 perguntas')) return { data: geminiPayload(JSON.stringify(quiz)) };
  if (prompt.includes('Corrija somente as respostas discursivas')) {
    const results = quiz.slice(4).map((question, offset) => ({
      index: offset + 4,
      correct: true,
      feedback: 'Resposta tecnicamente correta.',
      missing: '',
      idealAnswer: question.answer
    }));
    return { data: geminiPayload(JSON.stringify({ results })) };
  }
  throw new Error(`Prompt Gemini não simulado: ${prompt.slice(0, 80)}`);
};

const app = require('../server');

async function main() {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: 'Bearer mock-user-token', 'Content-Type': 'application/json' };

  async function request(path, options = {}) {
    return fetch(`${baseUrl}${path}`, { headers, ...options });
  }

  async function json(path, options = {}) {
    const response = await request(path, options);
    const body = await response.json();
    return { response, body };
  }

  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.match(health.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);

    const asset = await fetch(`${baseUrl}/assets/professional.css`);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');

    const initial = await json('/api/my-progress');
    assert.equal(initial.response.status, 200);
    assert.deepEqual(initial.body.progress, {});

    const forgedProgress = await json('/api/my-progress', {
      method: 'PUT',
      body: JSON.stringify({ progress: { 60: 100 }, score: 999999 })
    });
    assert.equal(forgedProgress.response.status, 409);
    assert.deepEqual(profile.progress, {});

    const lesson = await json('/api/learning/levels/1/lessons/0/complete', { method: 'POST' });
    assert.equal(lesson.response.status, 200);
    assert.equal(lesson.body.levelProgress, 20);

    const generated = await json('/api/generate-quiz', {
      method: 'POST',
      body: JSON.stringify({ levelId: 1, levelTitle: 'Conceitos básicos', topics: 'tensão e corrente' })
    });
    assert.equal(generated.response.status, 200);
    assert.equal(generated.body.questions.length, 8);
    assert.ok(generated.body.attemptToken);
    assert.ok(generated.body.questions.every(question => !Object.hasOwn(question, 'answer')));

    const answers = quiz.map(question => question.answer);
    const graded = await json('/api/grade-quiz', {
      method: 'POST',
      body: JSON.stringify({ levelId: 1, attemptToken: generated.body.attemptToken, answers })
    });
    assert.equal(graded.response.status, 200);
    assert.equal(graded.body.quizPercent, 100);
    assert.equal(graded.body.levelProgress, 60);

    const levelTwo = await json('/api/generate-quiz', {
      method: 'POST',
      body: JSON.stringify({ levelId: 2, levelTitle: 'Lei de Ohm', topics: 'tensão, corrente e resistência' })
    });
    assert.equal(levelTwo.response.status, 200, 'O nível seguinte deve liberar quando o anterior alcançar 50%.');

    const levelThree = await json('/api/generate-quiz', {
      method: 'POST',
      body: JSON.stringify({ levelId: 3, levelTitle: 'Potência elétrica', topics: 'potência e energia' })
    });
    assert.equal(levelThree.response.status, 403, 'Um nível posterior não pode ser acessado antecipadamente.');
    assert.equal(levelThree.body.levelBlocked, true);

    const tokenParts = generated.body.attemptToken.split('.');
    const middle = Math.floor(tokenParts[1].length / 2);
    tokenParts[1] = `${tokenParts[1].slice(0, middle)}${tokenParts[1][middle] === 'A' ? 'B' : 'A'}${tokenParts[1].slice(middle + 1)}`;
    const tampered = tokenParts.join('.');
    const originalConsoleError = console.error;
    console.error = () => {};
    let tamperedAttempt;
    try {
      tamperedAttempt = await json('/api/grade-quiz', {
        method: 'POST',
        body: JSON.stringify({ levelId: 1, attemptToken: tampered, answers })
      });
    } finally {
      console.error = originalConsoleError;
    }
    assert.equal(tamperedAttempt.response.status, 400);

    await json('/api/learning/levels/1/lessons/1/complete', { method: 'POST' });
    const completed = await json('/api/learning/levels/1/lessons/2/complete', { method: 'POST' });
    assert.equal(completed.response.status, 200);
    assert.equal(completed.body.levelProgress, 100);
    assert.equal(completed.body.levelCompleted, true);

    console.log('Integração simulada aprovada: segurança, progresso, quiz e bloqueio de níveis.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
