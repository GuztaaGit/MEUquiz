const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const SITE = {
  name: 'ElectroLearn',
  seller: 'Gustavo Divino',
  email: 'eletrolearnprojeto1@gmail.com',
  address: '[PREENCHER: endereço para contato comercial do vendedor]',
  cnpj: '[PREENCHER/CONFIRMAR: situação do CNPJ; o número não foi informado pelo responsável].'
};

const pages = {
  '/politica-de-privacidade': {
    title: 'Política de Privacidade',
    description: 'Como a ElectroLearn trata dados pessoais.',
    body: `
      <p class="notice"><strong>Informação pendente:</strong> o endereço comercial do responsável ainda não foi informado. Esta página é uma versão operacional e precisa ser revisada antes de ser considerada juridicamente final.</p>
      <h2>1. Quem é responsável pelos dados</h2>
      <p>A plataforma ElectroLearn é operada por <strong>${escapeHtml(SITE.seller)}</strong>, declarado como vendedor pessoa física. Contato para privacidade e suporte: <a href="mailto:${SITE.email}">${SITE.email}</a>. Endereço para contato: <strong>${escapeHtml(SITE.address)}</strong>. CNPJ/situação cadastral: ${escapeHtml(SITE.cnpj)}</p>
      <h2>2. Dados tratados e finalidades</h2>
      <ul>
        <li><strong>Conta:</strong> nome, e-mail e dados de autenticação para criar, proteger e administrar o acesso.</li>
        <li><strong>Assinatura e pagamentos:</strong> plano, situação da assinatura, datas de acesso e identificadores de transação necessários para confirmar pagamentos, prestar suporte e administrar o acesso. O processamento de pagamento é feito pelo Asaas.</li>
        <li><strong>Aprendizagem:</strong> progresso, resultados de quizzes, aulas concluídas e preferências necessárias para manter a experiência de estudo.</li>
        <li><strong>Comunidade e suporte:</strong> mensagens publicadas, solicitações, feedback e informações enviadas voluntariamente pelo usuário.</li>
        <li><strong>Tutor IA:</strong> texto de perguntas e, quando enviados, imagens e documentos que o usuário escolher compartilhar para receber uma resposta.</li>
        <li><strong>Registros técnicos:</strong> dados de conexão e registros de segurança que possam ser gerados pelo serviço de hospedagem, autenticação e infraestrutura.</li>
      </ul>
      <h2>3. Tutor IA e serviços externos</h2>
      <p>O Tutor IA utiliza a API do Google Gemini. O conteúdo enviado ao Tutor IA é transmitido ao Google para processar a solicitação. Não envie senhas, documentos de identidade, dados financeiros ou informações pessoais de terceiros em perguntas, imagens ou PDFs. O tratamento realizado pelo fornecedor também está sujeito aos termos e políticas dele. Consulte a documentação oficial do <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">Gemini API</a> e a <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Política de Privacidade do Google</a>.</p>
      <p>A operação também depende de serviços de infraestrutura e autenticação, incluindo Supabase e Vercel, e de processamento de pagamentos pelo Asaas. Bibliotecas externas e fontes podem ser carregadas de CDNs e do Google Fonts, o que pode gerar requisições aos respectivos fornecedores.</p>
      <h2>4. Bases e compartilhamento</h2>
      <p>Esta política descreve o tratamento à luz da Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD). A base legal deve ser avaliada por finalidade e registrada pelo responsável; a simples leitura desta política não é tratada como consentimento geral.</p>
      <p>Os dados são tratados conforme a finalidade de cada operação e a base legal aplicável, como execução do serviço contratado, cumprimento de obrigações legais ou regulatórias, exercício regular de direitos, legítimo interesse quando cabível ou consentimento quando necessário. Não declare consentimento como base universal para todas as operações. Os dados podem ser compartilhados com fornecedores necessários à operação, com autoridades quando houver obrigação válida e nos demais casos permitidos por lei. A plataforma não declara vender dados pessoais.</p>
      <h2>5. Armazenamento e segurança</h2>
      <p>Os dados ficam armazenados pelo tempo necessário às finalidades descritas, à manutenção da conta, à resolução de solicitações, à segurança e ao cumprimento de obrigações aplicáveis. Os prazos exatos de retenção e descarte precisam ser definidos e documentados pelo responsável. São adotadas medidas técnicas de proteção, mas nenhum serviço conectado à internet pode prometer segurança absoluta.</p>
      <h2>6. Direitos e solicitações</h2>
      <p>Você pode solicitar informações sobre o tratamento, acesso, correção, atualização, anonimização, bloqueio, eliminação quando cabível, portabilidade quando aplicável, informações sobre compartilhamento e revisão de decisões automatizadas nos termos da legislação. Envie a solicitação para <a href="mailto:${SITE.email}">${SITE.email}</a>. Poderemos pedir informações proporcionais para confirmar sua identidade e proteger a conta. A exclusão pode não abranger dados cuja conservação seja necessária ou legalmente exigida.</p>
      <h2>7. Crianças e adolescentes</h2>
      <p>A plataforma não deve ser utilizada por crianças sem observância das regras legais aplicáveis e da participação do responsável quando exigida. Se você acredita que dados de uma criança foram enviados indevidamente, entre em contato pelo e-mail acima.</p>
      <h2>8. Atualizações</h2>
      <p>Esta política pode ser atualizada para refletir mudanças reais no serviço ou na legislação. A data de revisão será indicada no topo da página.</p>`
  },
  '/termos-de-uso': {
    title: 'Termos de Uso',
    description: 'Condições de acesso e utilização da ElectroLearn.',
    body: `
      <p class="notice"><strong>Informação pendente:</strong> o endereço comercial do responsável ainda não foi informado. Estes termos não substituem revisão jurídica individualizada.</p>
      <h2>1. Responsável e contato</h2>
      <p>ElectroLearn é operada por <strong>${escapeHtml(SITE.seller)}</strong>, declarado como vendedor pessoa física. Contato: <a href="mailto:${SITE.email}">${SITE.email}</a>. Endereço: <strong>${escapeHtml(SITE.address)}</strong>. CNPJ: ${escapeHtml(SITE.cnpj)}</p>
      <h2>2. O que o serviço oferece</h2>
      <p>A ElectroLearn oferece recursos digitais de apoio ao estudo de eletrotécnica, incluindo trilha de níveis, materiais de estudo, quizzes, vídeos, Tutor IA e comunidade. O conteúdo é educacional e não representa, por si só, curso técnico reconhecido, diploma, registro profissional ou certificação oficial.</p>
      <h2>3. Conta e segurança</h2>
      <p>Forneça dados corretos, proteja sua senha e não compartilhe o acesso. Você é responsável pelas atividades realizadas na sua conta, ressalvadas as responsabilidades que a lei atribui ao fornecedor. Não use a plataforma para fraude, ataques, violação de direitos ou publicação de conteúdo ilegal, discriminatório, ameaçador ou abusivo.</p>
      <h2>4. Planos, cobrança e acesso</h2>
      <p>Os preços apresentados na página de contratação são: plano semanal de R$ 21,90 por 7 dias e plano mensal de R$ 75,99 por 30 dias, sujeitos à confirmação no checkout. O cartão pode envolver renovação recorrente conforme a oferta apresentada no momento da compra. O pagamento por PIX libera o período adquirido e não deve ser tratado como renovação automática. O acesso é liberado após a confirmação do pagamento pelo sistema. Consulte as regras de cancelamento e reembolso antes da contratação.</p>
      <p>Cancelar uma renovação futura não significa necessariamente encerrar imediatamente um período já pago; o acesso contratado permanece conforme a informação exibida na conta, salvo hipóteses legais ou de reembolso aplicáveis.</p>
      <h2>5. Tutor IA e materiais enviados</h2>
      <p>Respostas geradas por IA podem conter erros, omissões ou informações desatualizadas. Confira informações técnicas importantes em fontes confiáveis e não use a IA como única base para decisões de segurança. Ao enviar texto, imagem ou PDF, envie somente material que você tenha direito de compartilhar e evite dados pessoais desnecessários.</p>
      <h2>6. Segurança elétrica</h2>
      <p>O conteúdo não substitui formação, autorização, normas técnicas, análise de risco, supervisão ou profissional legalmente habilitado. Não realize intervenções em circuitos energizados com base apenas em material da plataforma. Siga os procedimentos de segurança, bloqueio, verificação de ausência de tensão e uso de equipamentos de proteção aplicáveis.</p>
      <h2>7. Disponibilidade e propriedade intelectual</h2>
      <p>Podem ocorrer manutenções, indisponibilidades ou alterações para manter o serviço seguro e funcional. Os materiais próprios da plataforma não podem ser copiados, revendidos ou redistribuídos sem autorização, ressalvados os direitos legais do usuário e materiais de terceiros sujeitos às respectivas licenças.</p>
      <h2>8. Atendimento e legislação</h2>
      <p>Dúvidas, reclamações ou solicitações: <a href="mailto:${SITE.email}">${SITE.email}</a>. Estes termos devem ser interpretados de acordo com a legislação brasileira aplicável, sem limitar direitos obrigatórios do consumidor.</p>`
  },
  '/politica-de-cookies': {
    title: 'Política de Cookies e Armazenamento Local',
    description: 'Informações sobre cookies, armazenamento no navegador e recursos de terceiros.',
    body: `
      <p class="notice"><strong>Estado da auditoria:</strong> na revisão estática do código consultado não foram identificadas referências a Google Analytics ou Meta Pixel. Isso não comprova a ausência de rastreadores no ambiente publicado, em configurações externas ou em scripts carregados posteriormente.</p>
      <h2>1. O que usamos</h2>
      <p>A aplicação usa armazenamento no navegador para funções necessárias, como manter dados de sessão/autenticação conforme a configuração do Supabase, guardar progresso e conteúdo em cache. O código consultado também carrega a biblioteca do Supabase por CDN, a biblioteca jsPDF por CDN e fontes do Google Fonts. Essas requisições podem transmitir dados técnicos como endereço IP, agente do navegador e informações da requisição aos respectivos fornecedores.</p>
      <h2>2. Cookies e tecnologias semelhantes</h2>
      <p>Cookies são pequenos arquivos gravados pelo navegador. Armazenamento local (localStorage) é uma tecnologia diferente, embora também guarde dados no dispositivo. A aplicação pode depender dessas tecnologias para login e funcionamento. A lista exata de cookies e chaves deve ser conferida no navegador e nos painéis dos fornecedores antes da publicação definitiva desta política.</p>
      <h2>3. Análise e publicidade</h2>
      <p>Não foi identificada, nos trechos de código auditados, uma integração explícita com Google Analytics ou Meta Pixel. Não foi habilitada nesta implementação nenhuma nova ferramenta de publicidade ou análise. Se ferramentas opcionais forem adicionadas no futuro, a implementação deverá ser revista para bloquear sua execução antes da escolha exigida pela legislação e oferecer uma opção real de recusa quando aplicável.</p>
      <h2>4. Gerenciar dados no navegador</h2>
      <p>Você pode gerenciar cookies e armazenamento pelas configurações do navegador. Bloquear ou apagar dados necessários pode encerrar sua sessão ou impedir recursos da plataforma. Isso não elimina automaticamente os dados mantidos nos sistemas do serviço ou dos fornecedores.</p>
      <h2>5. Contato</h2>
      <p>Para dúvidas sobre privacidade e tecnologias de armazenamento, escreva para <a href="mailto:${SITE.email}">${SITE.email}</a>.</p>`
  },
  '/cancelamento-e-reembolso': {
    title: 'Cancelamento e Reembolso',
    description: 'Regras para cancelamento de renovação e solicitações de reembolso.',
    body: `
      <p class="notice"><strong>Importante:</strong> esta política não restringe direitos obrigatórios previstos na legislação de consumo. As condições finais devem ser revisadas por profissional jurídico.</p>
      <h2>1. Planos e cobrança</h2>
      <p>Os preços apresentados na página de contratação são: semanal de R$ 21,90 por 7 dias e mensal de R$ 75,99 por 30 dias, sujeitos à confirmação no checkout. Confira o preço, a duração e a condição de renovação antes de concluir a compra.</p>
      <h2>2. Cancelar renovação</h2>
      <p>Quando houver assinatura recorrente no cartão, a renovação futura pode ser cancelada na área <strong>Perfil → Minha assinatura</strong>, conforme os recursos disponíveis na conta. O cancelamento da renovação impede novas cobranças recorrentes futuras após o processamento do cancelamento, mas não implica, por si só, reembolso automático de um período já pago. O acesso e eventuais exceções legais seguem a contratação e a legislação aplicável. Pagamentos por PIX correspondem ao período adquirido e não renovam automaticamente.</p>
      <h2>3. Solicitar reembolso ou exercer direito de arrependimento</h2>
      <p>O artigo 49 do Código de Defesa do Consumidor (Lei nº 8.078/1990) prevê direito de arrependimento nas contratações fora do estabelecimento comercial, observadas as condições legais aplicáveis. Esta política não pretende limitar esse direito. A aplicação e o termo inicial no caso concreto de serviço digital devem ser confirmados em revisão jurídica.</p>
      <p>Envie a solicitação para <a href="mailto:${SITE.email}">${SITE.email}</a> usando o e-mail cadastrado e, se disponível, a identificação da cobrança. Informe apenas os dados necessários para localizar a transação. O pedido será analisado sem afastar o direito de arrependimento quando aplicável, nem outros direitos previstos no Código de Defesa do Consumidor. Esta política não cria prazos menores que os previstos em lei.</p>
      <h2>4. Falhas de pagamento e acesso</h2>
      <p>Se o pagamento foi confirmado e o acesso não foi liberado, entre em contato pelo e-mail acima e inclua a data aproximada, o plano e a identificação da transação, evitando enviar dados completos do cartão ou senhas.</p>
      <h2>5. Responsável</h2>
      <p>ElectroLearn — responsável declarado: <strong>${escapeHtml(SITE.seller)}</strong>, pessoa física. Endereço: <strong>${escapeHtml(SITE.address)}</strong>. CNPJ: ${escapeHtml(SITE.cnpj)}. Atendimento: <a href="mailto:${SITE.email}">${SITE.email}</a>.</p>`
  }
};

function renderLegalPage(pathname) {
  const page = pages[pathname];
  if (!page) return null;
  const links = Object.entries(pages).map(([href, item]) =>
    `<a href="${href}"${href === pathname ? ' aria-current="page"' : ''}>${escapeHtml(item.title)}</a>`
  ).join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${escapeHtml(page.description)}">
<meta name="theme-color" content="#050814">
<title>${escapeHtml(page.title)} — ElectroLearn</title>
<style>
:root{color-scheme:dark;--bg:#050814;--panel:#101a31;--text:#f4f6ff;--muted:#c0c9df;--link:#9cc4ff;--border:#33415f}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 12% 0,#17254a 0,transparent 35rem),var(--bg);color:var(--text);font:16px/1.75 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header,main,footer{width:min(900px,calc(100% - 32px));margin:auto}header{padding:28px 0 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{font-weight:800;font-size:1.15rem;text-decoration:none;color:var(--text)}nav{display:flex;gap:10px;flex-wrap:wrap}nav a, a{color:var(--link);text-underline-offset:3px}nav a{font-size:.82rem}
main{padding:28px 24px 36px;background:rgba(16,26,49,.88);border:1px solid var(--border);border-radius:18px;margin-top:24px;margin-bottom:32px}
h1{font-size:clamp(1.8rem,5vw,2.5rem);line-height:1.2;margin:.1rem 0 .4rem}h2{font-size:1.08rem;margin:1.7rem 0 .4rem}p,li{color:var(--muted)}li{margin:.4rem 0}.notice{border:1px solid #8a682d;background:#2a2416;padding:12px 14px;border-radius:12px;color:#fff1ce}.notice strong{color:#ffdb8b}
footer{padding:0 0 32px;color:#c0c9df;font-size:.85rem}footer a{margin-right:12px}.back{display:inline-block;margin-top:8px}
:focus-visible{outline:3px solid #ffcf70;outline-offset:3px}::selection{background:#466bb8;color:white}
@media(max-width:560px){main{padding:22px 17px}header{align-items:flex-start}nav{gap:7px}}
</style>
</head>
<body>
<header><a class="brand" href="/">⚡ ElectroLearn</a><nav aria-label="Páginas legais">${links}</nav></header>
<main><p><a href="/">← Voltar para a ElectroLearn</a></p><h1>${escapeHtml(page.title)}</h1><p><strong>Última revisão do texto:</strong> 21/10/2026</p>${page.body}</main>
<footer><strong>Contato:</strong> <a href="mailto:${SITE.email}">${SITE.email}</a><br>Responsável declarado: ${escapeHtml(SITE.seller)} (pessoa física).<br>Endereço: ${escapeHtml(SITE.address)}<br><a class="back" href="/">Voltar ao site</a></footer>
</body>
</html>`;
}

module.exports = { renderLegalPage, legalPaths: Object.keys(pages) };
