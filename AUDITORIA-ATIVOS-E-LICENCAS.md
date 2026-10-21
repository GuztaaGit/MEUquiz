# Inventário de ativos externos e licenças — ElectroLearn

Data da revisão: 21/10/2026

Este inventário registra referências encontradas no código. A presença de um arquivo ou URL não prova, por si só, que a licença comercial ou os direitos de uso foram verificados.

## Fontes, bibliotecas e serviços externos identificados

| Ativo/serviço | Onde foi identificado | Uso | Ação de licença/privacidade |
|---|---|---|---|
| Google Fonts — Space Grotesk e Syne | `Meu Quiz.html`, Google Fonts CSS | Tipografia | Confirmar termos atuais e avaliar auto-hospedagem se a redução de requisições a terceiros for desejada. |
| jsPDF 2.5.1 | CDNJS em `Meu Quiz.html` | Geração de PDF no navegador | jsPDF é distribuído sob licença MIT no projeto upstream; manter o aviso/licença da versão exata usada e conferir dependências. |
| Supabase JS v2 | jsDelivr em `Meu Quiz.html` | Autenticação e acesso ao Supabase | Conferir licença MIT e a versão efetivamente resolvida pelo CDN; a URL usa faixa de versão, não versão fixada. |
| Google Gemini API | `server.js`, variável `GEMINI_API_KEY` | Tutor IA, geração de conteúdo e moderação | Texto, imagens e PDFs enviados ao Tutor IA são transmitidos ao Google para processamento. Revisar termos e configurações do projeto Google. |
| Supabase | Backend e configuração de autenticação | Conta, perfil, progresso e comunidade | Confirmar região, retenção, permissões e termos no painel do projeto. |
| Vercel | Configuração de implantação | Hospedagem e execução do backend | Revisar retenção de logs, acesso e contrato/configurações do projeto. |
| Asaas | Backend de pagamentos | Checkout e confirmação de pagamentos | Revisar contrato, dados compartilhados e política do fornecedor. |
| YouTube | URLs de videoaulas na trilha | Abertura de conteúdo audiovisual externo | Verificar a origem/direitos de cada vídeo e os termos do YouTube. Os links identificados são links de visualização, não evidência de autorização para redistribuir os vídeos. |
| Unsplash | URLs `images.unsplash.com` em `server.js` | Imagens temáticas para cards de notícias | Confirmar a origem e a licença aplicável a cada imagem/ID usado e guardar evidência da verificação. A auditoria não validou individualmente cada imagem. |
| Google News RSS e páginas de notícias | `server.js` | Busca e exibição de manchetes/resumos | Revisar termos, atribuição da fonte, uso de trechos e direitos de imagem; preferir título, fonte e link para o original. |
| Favicon SVG inline e emojis | `Meu Quiz.html` e interface | Identidade visual e ícones | O favicon foi definido inline no código; emojis dependem da fonte/plataforma do sistema. Não foi identificada uma biblioteca de ícones externa na inspeção estática. |

## Imagens locais encontradas

Capturas WebP em `assets/showcase/`:
- `inicio.webp`
- `estudar.webp`
- `tutor-ia.webp`
- `quiz.webp`
- `chat-global.webp`
- `mundo-eletrico.webp`
- `ranking.webp`
- `perfil.webp`

A inspeção dos nomes e do código indica que são capturas usadas para apresentar telas do produto, mas não comprova autoria. **Pendente:** confirmar que são capturas próprias e que não expõem dados reais de alunos; caso contenham dados identificáveis, substituir por dados fictícios antes de publicar.

## O que não foi comprovado

- Não foi identificado Google Analytics ou Meta Pixel nas partes do código pesquisadas. Isso não comprova ausência de scripts adicionados por configurações de implantação, extensões, fornecedores ou código não coberto pela pesquisa.
- Não foi feita inspeção de rede do site publicado, de cookies efetivamente definidos pelo navegador ou das configurações dos painéis Supabase, Vercel, Google e Asaas.
- Não foi feita verificação individual de direitos autorais para cada videoaula, imagem remota ou conteúdo de terceiros.

## Checklist antes de considerar concluído

- [ ] Guardar evidências/licenças das imagens externas e dos vídeos usados.
- [ ] Confirmar que as oito capturas locais não contêm dados pessoais reais.
- [ ] Verificar a lista real de cookies e armazenamento no navegador, incluindo sessão Supabase.
- [ ] Inspecionar a aba Network e os scripts efetivamente carregados em produção.
- [ ] Confirmar os termos e prazos de retenção dos fornecedores usados.
- [ ] Se forem adicionados analytics, publicidade ou pixels, implementar bloqueio antes da escolha do usuário e controles de recusa/retirada quando aplicável.
- [ ] Revisar juridicamente a versão final das páginas e preencher os dados comerciais pendentes.

Este documento é um inventário técnico preliminar, não uma certificação de conformidade nem um parecer jurídico.
