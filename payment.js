let paymentConfig = null;
let supabaseClient = null;
let currentSession = null;
let subscriptionActive = false;

(async function initPayments(){
  try {
    paymentConfig = await fetch('/api/config').then(r => r.json());
    if (!paymentConfig.supabaseUrl) throw new Error(paymentConfig.error || 'Configuração indisponível');
    supabaseClient = window.supabase.createClient(paymentConfig.supabaseUrl, paymentConfig.supabaseAnonKey);
    const { data } = await supabaseClient.auth.getSession();
    currentSession = data.session;
    if (currentSession) await enterAuthenticatedApp(currentSession.user);
  } catch (err) {
    console.error(err);
    document.getElementById('lerr').textContent = 'Sistema de acesso temporariamente indisponível.';
  }
})();

async function doLogin(){
  const email = document.getElementById('le').value.trim();
  const password = document.getElementById('lp').value;
  const err = document.getElementById('lerr');
  err.style.display = 'none';
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    err.textContent = 'E-mail ou senha incorretos.';
    err.style.display = 'block';
    return;
  }
  currentSession = data.session;
  await enterAuthenticatedApp(data.user);
}

async function doRegister(){
  const name = document.getElementById('rn').value.trim();
  const email = document.getElementById('re').value.trim();
  const password = document.getElementById('rp').value;
  const err = document.getElementById('rerr');
  if (!name || !email || password.length < 6) {
    err.textContent = 'Preencha todos os campos corretamente.';
    err.style.display = 'block';
    return;
  }
  const { data, error } = await supabaseClient.auth.signUp({
    email, password, options: { data: { name } }
  });
  if (error) {
    err.textContent = error.message.includes('registered') ? 'E-mail já cadastrado.' : 'Não foi possível criar a conta.';
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';
  if (!data.session) {
    err.textContent = 'Cadastro criado. Confirme o e-mail e depois entre.';
    err.style.color = 'var(--green)';
    err.style.display = 'block';
    return;
  }
  currentSession = data.session;
  await enterAuthenticatedApp(data.user);
}

function demoLogin(){
  toast('O acesso de convidado foi removido. Crie uma conta e assine um plano.', 'err');
}

async function enterAuthenticatedApp(user){
  const email = user.email;
  const name = user.user_metadata?.name || email.split('@')[0];
  me = email;
  if (!DB.users[email]) DB.users[email] = { n: name };
  DB.users[email].n = name;
  if (!DB.progress[email]) DB.progress[email] = {};
  if (DB.scores[email] === undefined) DB.scores[email] = 0;
  save();

  document.getElementById('tav').textContent = name[0].toUpperCase();
  document.getElementById('tname').textContent = name;
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  await refreshSubscription();
}

async function authFetch(url, options = {}){
  const token = currentSession?.access_token;
  return fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
  });
}

async function refreshSubscription(){
  const res = await authFetch('/api/subscription-status');
  if (res.status === 401) return doLogout();
  const status = await res.json();
  subscriptionActive = Boolean(status.active);
  if (subscriptionActive) {
    document.querySelector('.main-nav').style.display = '';
    go('dashboard');
  } else {
    document.querySelector('.main-nav').style.display = 'none';
    renderPaywall(status);
  }
}

function renderPaywall(status = {}){
  const weekly = paymentConfig.plans.weekly;
  const monthly = paymentConfig.plans.monthly;
  document.getElementById('mc').innerHTML = `
    <div style="max-width:760px;margin:2rem auto;text-align:center">
      <div class="bolt">🔒</div>
      <h2 style="font-size:1.7rem;margin:.8rem 0">Assine para liberar o ElectroLearn</h2>
      <p style="color:var(--text2);margin-bottom:1.5rem">Todo o conteúdo, PDFs e quizzes são liberados automaticamente após a confirmação real do pagamento pelo Asaas.</p>
      ${new URLSearchParams(location.search).get('payment') === 'success'
        ? '<div class="hl" style="margin-bottom:1rem">Pagamento enviado. Assim que o Asaas confirmar, o acesso será liberado.</div>' : ''}
      <div class="lvl-grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));text-align:left">
        <div class="pcard">
          <span class="chip on">SEMANAL</span>
          <h3 style="font-size:2rem;margin:1rem 0">R$ 21,90</h3>
          <p style="color:var(--text2);margin-bottom:1rem">Cobrança recorrente a cada 7 dias.</p>
          <button class="btn btn-primary" onclick="subscribe('weekly')">Assinar semanal</button>
        </div>
        <div class="pcard" style="border-color:var(--accent)">
          <span class="chip on">MENSAL</span>
          <h3 style="font-size:2rem;margin:1rem 0">R$ 75,99</h3>
          <p style="color:var(--text2);margin-bottom:1rem">Cobrança recorrente mensal.</p>
          <button class="btn btn-primary" onclick="subscribe('monthly')">Assinar mensal</button>
        </div>
      </div>
      <button class="btn btn-ghost" style="margin-top:1rem" onclick="refreshSubscription()">Já paguei — verificar novamente</button>
    </div>`;
}

async function subscribe(plan){
  const button = event?.currentTarget;
  if (button) { button.disabled = true; button.textContent = 'Abrindo pagamento…'; }
  try {
    const res = await authFetch('/api/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ plan })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    location.href = data.url;
  } catch (err) {
    toast(err.message || 'Não foi possível abrir o pagamento.', 'err');
    if (button) { button.disabled = false; button.textContent = plan === 'weekly' ? 'Assinar semanal' : 'Assinar mensal'; }
  }
}

async function doLogout(){
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentSession = null;
  subscriptionActive = false;
  me = null;
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('auth-screen').classList.add('active');
}

const originalGo = go;
go = function(target){
  if (!subscriptionActive) return renderPaywall();
  return originalGo(target);
};

const originalFetchQuiz = fetchQuiz;
fetchQuiz = async function(id){
  if (!subscriptionActive) return renderPaywall();
  return originalFetchQuiz(id);
};
