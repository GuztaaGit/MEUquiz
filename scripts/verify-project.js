const fs = require('fs');
const path = require('path');

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
