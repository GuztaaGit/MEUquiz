const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Meu Quiz.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8');
const professionalCss = fs.readFileSync(path.join(root, 'assets', 'professional.css'), 'utf8');

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
scripts.forEach((match, index) => {
  try { new Function(match[1]); } catch (error) { failures.push(`JavaScript inline ${index + 1}: ${error.message}`); }
});

const videoBlock = html.match(/const VIDEO_LESSONS\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || '';
const videos = [...videoBlock.matchAll(/\b(\d+)\s*:\s*\{title:"([^"]+)",url:"https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"\}/g)]
  .map(match => ({ level: Number(match[1]), title: match[2], id: match[3] }));
assert(videos.length === 60, `Esperadas 60 videoaulas diretas; encontradas ${videos.length}.`);
assert(new Set(videos.map(video => video.level)).size === 60, 'Existem níveis duplicados na lista de videoaulas.');
assert(new Set(videos.map(video => video.id)).size === 60, 'Existem vídeos repetidos na trilha de aprendizagem.');
assert(videos.every((video, index) => video.level === index + 1), 'As videoaulas não cobrem os níveis 1 a 60 em ordem.');
assert(!/youtube\.com\/(?:results|search)/i.test(videoBlock), 'Ainda existe link de pesquisa do YouTube nas videoaulas.');

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert(new Set(ids).size === ids.length, 'Existem IDs HTML duplicados.');
assert(!/\bcontenteditable\s*=|document\.designMode/i.test(html), 'Existe uma área editável acidentalmente na interface.');
assert((professionalCss.match(/\{/g) || []).length === (professionalCss.match(/\}/g) || []).length, 'O CSS profissional possui chaves desbalanceadas.');
assert(/<button[^>]+class="auth-tab/.test(html), 'As abas de autenticação não usam controles acessíveis.');

assert(html.includes('/assets/professional.css'), 'O design profissional não está vinculado ao HTML.');
assert(html.includes('MOTIVATION_SLOT_MS=30*60*1000'), 'As frases motivacionais não estão configuradas para mudar a cada 30 minutos.');
assert(html.includes("document.addEventListener('visibilitychange'"), 'As frases motivacionais não sincronizam quando o usuário volta para a aba.');
assert(html.includes("window.addEventListener('pageshow',scheduleMotivation)"), 'As frases motivacionais não sincronizam ao reabrir/restaurar a página.');
assert(html.includes('NEWS_SLOT_MS=30*60*1000'), 'As notícias não estão configuradas para atualizar a cada 30 minutos.');
assert(html.includes('/api/electric-news?slot='), 'As notícias não usam uma chave de cache diferente em cada ciclo de meia hora.');
assert(html.includes("window.addEventListener('pageshow',scheduleNewsRefresh)"), 'As notícias não sincronizam ao reabrir/restaurar a página.');
assert(server.includes('refreshEveryMinutes: 30'), 'A API de notícias não informa o ciclo de atualização de 30 minutos.');
assert(!server.includes('stale-while-revalidate=86400'), 'A API de notícias ainda permite reutilizar conteúdo antigo por 24 horas.');
assert(server.includes("const CANONICAL_SITE_URL = 'https://eletrolearn.vercel.app'"), 'O endereço oficial do ElectroLearn não está configurado no servidor.');
assert(server.includes('successUrl: `${SITE_URL}/?payment=success`'), 'O retorno de pagamento aprovado não usa o endereço oficial do site.');
assert(server.includes('cancelUrl: `${SITE_URL}/?payment=cancel`'), 'O retorno de pagamento cancelado não usa o endereço oficial do site.');
assert(server.includes('expiredUrl: `${SITE_URL}/?payment=expired`'), 'O retorno de pagamento expirado não usa o endereço oficial do site.');
assert(!/https:\/\/meu-quiz(?:-[a-z0-9-]+)?\.vercel\.app/i.test(`${html}\n${server}`), 'Ainda existe um endereço antigo do Meu Quiz no site ou no servidor.');
const cssVersion = html.match(/\/assets\/professional\.css\?v=([a-f0-9]{12})/)?.[1];
const expectedCssVersion = crypto.createHash('sha1').update(professionalCss).digest('hex').slice(0, 12);
assert(cssVersion === expectedCssVersion, 'A versão do CSS está desatualizada; o navegador pode manter o visual antigo em cache.');
const showcaseAssets = [...html.matchAll(/image:'(\/assets\/showcase\/[^']+)'/g)].map(match => match[1]);
assert(showcaseAssets.length === 8, `Esperadas 8 telas reais no carrossel; encontradas ${showcaseAssets.length}.`);
assert(new Set(showcaseAssets).size === 8, 'Existem telas repetidas no carrossel da apresentação.');
assert(showcaseAssets.every(asset => {
  const localPath = path.join(root, asset.replace(/^\//, ''));
  return fs.existsSync(localPath) && fs.statSync(localPath).size > 8 * 1024;
}), 'Uma ou mais capturas reais do carrossel estão ausentes ou inválidas.');
assert(html.includes('aria-roledescription="carrossel"') && html.includes('moveShowcase(-1)') && html.includes('moveShowcase(1)'), 'O carrossel não possui navegação acessível para avançar e voltar.');
assert(html.includes('showcase-description') && html.includes('showcase-dots'), 'O carrossel não atualiza a explicação e os indicadores de cada aba.');
assert(html.includes('id="mobile-nav-toggle"') && html.includes('aria-controls="main-nav"'), 'O botão lateral de atalhos não está acessível no celular.');
assert(html.includes('id="mobile-admin-shortcut"') && html.includes("available&&isAdmin"), 'O atalho ADM móvel não está protegido pela permissão administrativa.');
assert(html.includes('function openMobileNav()') && html.includes('function closeMobileNav()'), 'O painel lateral de atalhos não possui controle de abertura e fechamento.');
assert(html.includes('class="nav-item nav-item-admin"') && html.includes('id="n-admin"'), 'O atalho ADM não está no mesmo painel de navegação.');
assert(professionalCss.includes('.main-nav.mobile-open') && professionalCss.includes('width:min(84vw,330px)'), 'O painel lateral móvel não está configurado com uma área de toque adequada.');
assert(professionalCss.includes('right:0;top:calc(78px + env(safe-area-inset-top))'), 'Os atalhos móveis não estão fixados no canto superior direito.');
assert(server.includes("app.use('/assets'"), 'O servidor não está entregando os arquivos visuais.');
assert(server.includes('sealQuizAttempt') && server.includes('openQuizAttempt'), 'O gabarito do quiz não está protegido por token opaco.');
assert(server.includes("/api/learning/levels/:levelId/lessons/:lessonIndex/complete"), 'A conclusão segura de aula não está implementada.');
assert(schema.includes('lesson_progress') && schema.includes('quiz_scores'), 'O schema não contém o progresso por aula e quiz.');
assert(!/(sk-proj-|AIza[\w-]{20,}|SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+)/.test(`${html}\n${server}\n${schema}`), 'Possível chave secreta encontrada no código versionado.');

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`Verificação concluída: ${scripts.length} scripts válidos e ${videos.length} videoaulas diretas.`);
