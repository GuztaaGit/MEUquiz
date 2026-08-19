# ElectroLearn

Plataforma de estudo de eletrotécnica com conteúdo, PDFs, quizzes e assinaturas recorrentes pelo Asaas.

## Assinaturas

- Semanal: R$ 21,90
- Mensal: R$ 75,99
- O acesso é liberado somente por webhook autenticado após `PAYMENT_CONFIRMED` ou `PAYMENT_RECEIVED`.
- Reembolsos confirmados revogam o acesso. Cancelar a renovação não remove o período já pago.

## Configuração

1. Crie um projeto no Supabase e execute `supabase/schema.sql` no SQL Editor.
2. Copie as variáveis de `.env.example` para o projeto na Vercel.
3. No Asaas, configure o webhook:
   - URL: `https://meu-quiz-six.vercel.app/api/webhooks/asaas`
   - Token: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
   - Envio: sequencial
   - Eventos: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED`
4. Teste primeiro com `ASAAS_ENV=sandbox`. Somente depois altere para `production` e use a chave de produção.

## Antes de vender

- Configure SMTP próprio em **Supabase → Authentication → SMTP**, evitando depender do envio de teste do Supabase.
- Em **Authentication → URL Configuration**, use a URL oficial do site como `Site URL` e permita seu endereço de retorno.
- Faça uma compra real de pequeno valor por PIX e outra por cartão, verificando liberação, renovação e cancelamento.
- Confirme `ASAAS_ENV=production`, chave de produção, chave PIX e webhook ativo.
- Preencha `ADMIN_EMAILS` e mantenha todas as chaves apenas nas variáveis de ambiente da Vercel.
- Revise profissionalmente o conteúdo técnico e as informações legais antes de campanhas pagas.

Nunca coloque chaves secretas no HTML ou no GitHub.
