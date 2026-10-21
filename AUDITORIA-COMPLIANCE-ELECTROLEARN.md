# Auditoria inicial de privacidade, acessibilidade e conformidade — ElectroLearn

**Data:** 21/10/2026  
**Repositório:** `GuztaaGit/MEUquiz`  
**Escopo:** revisão estática do código disponível na branch `compliance-accessibility-audit-2026-10`. Este documento não é parecer jurídico nem certificação de conformidade.

## Dados informados pelo responsável
- Nome informado: Gustavo Divino.
- Tipo de vendedor informado: pessoa física.
- Contato de privacidade e suporte: eletrolearnprojeto1@gmail.com.
- CNPJ: não informado; confirmar a situação cadastral antes da publicação definitiva.
- Endereço comercial: não informado; mantido placeholder explícito.
- Tutor IA: Google Gemini.

## Alterações implementadas nesta branch
- Criadas páginas navegáveis para Política de Privacidade, Termos de Uso, Política de Cookies/Armazenamento Local e Cancelamento/Reembolso.
- Links legais incluídos no rodapé e na área de autenticação.
- Aviso de privacidade/armazenamento sem afirmar que existe consentimento de analytics; só é exibido como aviso informativo e pode ser fechado.
- Cadastro exige confirmação de leitura da Política de Privacidade. Isso não é apresentado como consentimento universal para todos os tratamentos.
- Avisos de privacidade adicionados aos fluxos de suporte, feedback e Tutor IA; Tutor IA informa que texto/imagens/PDFs são enviados ao Google Gemini.
- Contraste de textos secundários e foco visível de teclado reforçados no CSS; campos principais têm rótulos associados e controles dinâmicos de níveis têm nome acessível.
- Removidas/reformuladas frases promocionais absolutas/comparativas que não estavam comprovadas no código, sem mexer nos preços ou na integração de pagamento.
- Rotas de páginas legais adicionadas ao servidor e arquivo incluído na configuração de build da Vercel.
- Criadas verificações estáticas para os requisitos legais e de acessibilidade que podem ser testados no repositório.

## Inventário técnico de imagens, fontes e bibliotecas
- Captura local da interface: `/assets/showcase/inicio.webp`; outras sete capturas WebP estão em `assets/showcase/` e são usadas no carrossel de apresentação. Confirmar que todas representam telas próprias e que não incluem dados pessoais reais.
- Duas imagens de notícias são recebidas dinamicamente e possuem texto de notícia adjacente; o uso, a origem e os direitos das imagens devem ser confirmados com o fornecedor de notícias/fontes.
- Favicon: SVG embutido com símbolo de raio/emoji; não foi identificada biblioteca externa de ícones na página auditada.
- Fontes externas: Space Grotesk e Syne via Google Fonts. Confirmar/arquivar as licenças das famílias utilizadas e manter crédito quando exigido.
- Bibliotecas externas: jsPDF 2.5.1 via cdnjs e Supabase JS via jsDelivr (major `@2`, versão não fixada). Confirmar licença e avaliar fixação da versão do Supabase JS para builds reproduzíveis.
- Videoaulas: links externos do YouTube; não foi encontrado iframe de reprodução embutida na revisão estática.
- Rastreamento: não foram encontradas referências explícitas a Google Analytics, Meta Pixel, Hotjar ou Microsoft Clarity no HTML e servidor consultados. Isso não substitui inspeção do site publicado, configurações externas, cookies e requisições reais no navegador.

## Riscos e leis a revisar
- **LGPD — Lei nº 13.709/2018:** mapear finalidades e bases legais por operação; documentar retenção e descarte; identificar papéis e condições dos fornecedores; definir procedimento de atendimento aos titulares; avaliar transferência internacional e tratamento de anexos enviados ao Gemini.
- **CDC — Lei nº 8.078/1990:** informar identidade e meios de contato do fornecedor, preço total, duração, renovação e cancelamento de forma clara; respeitar direito de arrependimento quando aplicável; não prometer formação/certificação profissional sem respaldo.
- **Decreto nº 7.962/2013 (comércio eletrônico):** revisar informações pré-contratuais, atendimento, confirmação da contratação e mecanismo de arrependimento no fluxo de compra.
- **Marco Civil da Internet — Lei nº 12.965/2014:** revisar transparência sobre coleta/uso/armazenamento e registros aplicáveis, junto às configurações reais dos fornecedores.
- **Acessibilidade:** teste automatizado e teste manual por teclado/leitor de tela são necessários; esta revisão não é uma auditoria WCAG completa.

## Checklist
- [x] Páginas legais separadas e links navegáveis.
- [x] Identificação do responsável com dados conhecidos e placeholders para os dados ausentes.
- [x] Avisos de privacidade para cadastro, suporte, feedback e Tutor IA.
- [x] Aviso informativo sobre armazenamento local; nenhuma ferramenta opcional de analytics foi adicionada.
- [x] Reforço de contraste e foco visível.
- [x] Revisão inicial de promessas comerciais.
- [ ] Informar endereço comercial e confirmar a situação do CNPJ.
- [ ] Conferir cookies/storage/requisições no site publicado e nas configurações da Vercel, Supabase, Asaas e Google.
- [ ] Definir e documentar prazos reais de retenção e descarte.
- [ ] Confirmar direitos/licenças das imagens de notícias e das famílias tipográficas; guardar evidências.
- [ ] Executar `npm test` e teste de ponta a ponta do cadastro, checkout, webhook, cancelamento e páginas legais antes de mesclar.
- [ ] Revisão por advogado/advogada com experiência em consumidor, LGPD e contratação de serviços digitais.

**Atenção:** as páginas estão prontas para revisão funcional, mas não devem ser tratadas como aprovação jurídica final enquanto os placeholders e itens pendentes não forem resolvidos.
