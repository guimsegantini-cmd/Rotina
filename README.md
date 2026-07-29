# Rotina — Gestão de Saúde

App Next.js (PWA) com:
- **Login por e-mail sem senha** (Firebase Auth — link mágico)
- **Dados sincronizados na nuvem** (Firestore)
- **Notificações push reais** (Firebase Cloud Messaging + Cloud Function agendada), incluindo no iPhone (instalado como PWA)
- Quatro rotinas: **Academia**, **Água**, **Dieta** e **Casa** (tarefas diárias/semanais/com prazo)
- Cada lembrete (água, refeição, tarefa) pode ser **ativado ou desativado individualmente**

---

## Passo a passo completo

### 1. Criar o projeto no Firebase

1. https://console.firebase.google.com → **Adicionar projeto** → nome (ex: `rotina-saude`)
2. Dentro do projeto, clique em **`</>`** (Web) → crie o app da Web → **guarde a tela com o `firebaseConfig`**
3. **Build → Authentication → Get started → Sign-in method → Email/Password**: ative **Email/Password** e **Email link (passwordless sign-in)**
4. **Build → Firestore Database → Create database** (modo Production) → aba **Rules** → cole o conteúdo de `firestore.rules` → Publish
5. **Configurações do projeto → Cloud Messaging → Web Push certificates → Generate key pair** → guarde essa chave (é a `VAPID key`)
6. No topo, clique na engrenagem → **Configurações do projeto → Uso e faturamento → Modificar plano → Blaze (pay as you go)**. É necessário só pra rodar a Cloud Function agendada (o item 3 abaixo explica o custo).
7. **(opcional, para leitura de PDF por IA na Dieta e na Ficha) Build → App Check** → registre seu app Web com o provedor **reCAPTCHA Enterprise** (o fluxo guiado cria a chave no Google Cloud pra você) → guarde a **site key**. Depois, em **App Check → APIs**, confira se a API "Gemini Developer API" está marcada como **Enforced**. Sem esse passo, o resto do app funciona normalmente — só a leitura automática de arquivo por IA fica desativada.

### 2. Configurar as chaves do projeto

```bash
cp .env.local.example .env.local
```
Preencha com os valores do passo 1 (inclusive a `VAPID key` em `NEXT_PUBLIC_FIREBASE_VAPID_KEY` e, se configurou o passo 7, a `site key` do reCAPTCHA em `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`).

Rodando localmente sem essa chave configurada, a leitura de PDF por IA
mostra um erro claro ao tentar usar — o resto do app funciona normalmente.
Se quiser testar localmente com a chave configurada, ative o provedor de
debug do App Check (o navegador vai logar um "debug token" no console na
primeira execução; cadastre-o em **App Check → seu app → gerenciar tokens
de depuração**).

### 3. Publicar a Cloud Function (envia os pushes agendados)

Essa é a parte que faz as notificações chegarem **mesmo com o app fechado**.

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # escolha o projeto que você criou
cd functions
npm install
cd ..
firebase deploy --only functions
```

Isso publica a função `enviarLembretes`, que roda **a cada 15 minutos** no
servidor do Firebase, olha os lembretes de todos os usuários e dispara os
pushes que estiverem no horário e marcados como "notificar".

**Sobre custo**: o plano Blaze cobra por uso, mas o Cloud Scheduler dá 3 jobs
grátis por mês e as Cloud Functions têm 2 milhões de invocações grátis por
mês — para uso pessoal (uma função rodando a cada 15 min = ~2.880
execuções/mês) isso fica dentro da faixa gratuita; o custo esperado é R$0.

### 4. Rodar localmente (opcional)

```bash
npm install
npm run dev
```

### 5. Publicar no GitHub

```bash
git init
git add .
git commit -m "App com Firebase, PWA, push e aba Casa"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

### 6. Publicar na Vercel

1. vercel.com → **Add New → Project** → importe o repositório
2. Em **Environment Variables**, adicione as chaves do seu `.env.local` (incluindo a `VAPID key` e, se usar, a `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`)
3. **Deploy**

### 7. Autorizar o domínio da Vercel no Firebase

**Authentication → Settings → Authorized domains → Add domain** → cole o
domínio da Vercel (ex: `rotina-saude.vercel.app`), sem `https://`.

### 8. Instalar como PWA no iPhone (necessário para notificações)

O iOS só entrega notificações push para apps instalados na tela de início
(a partir do iOS 16.4). No Safari do iPhone:

1. Abra o link do seu app publicado na Vercel
2. Toque no ícone de **Compartilhar** (o quadrado com a seta para cima)
3. **Adicionar à Tela de Início**
4. Abra o app **pelo ícone na tela de início** (não pelo Safari) e faça login
5. No questionário ou na aba Água, ative a notificação — o iPhone vai pedir
   permissão

Sem esses passos (instalar via "Adicionar à Tela de Início"), o iPhone não
entrega push nenhum para sites comuns abertos no navegador.

---

## O que tem em cada aba

- **Academia**: ficha por dia da semana (importável de .txt/.csv/.md ou de um PDF lido por IA), check-in, cronômetro de descanso (anel de progresso), checklist do treino do dia com dicas de execução, evolução de carga
- **Água**: meta calculada no questionário, anel de progresso, lembretes fracionados, com toggle para notificar ou não
- **Dieta**: refeições por dia da semana com horário (cada uma com toggle de notificação própria), upload de arquivo (.txt/.csv/.md ou PDF de plano alimentar em qualquer formato, lido por IA), dicas de receitas com link para o app do TikTok
- **Casa**: tarefas **diárias**, **semanais** (escolhendo os dias) ou **pontuais** (data única, sem repetição), cada uma com checkbox de conclusão e um toggle opcional de notificação num horário específico
- Cada aba (Água, Dieta, Casa) tem um toggle próprio para ligar/desligar as notificações daquela aba inteira

## Como funcionam as notificações agora

Duas camadas, trabalhando juntas:
1. **Em primeiro plano** (app aberto): checagem local a cada 20s, mostra toast e notificação do navegador — funciona em qualquer dispositivo, sem depender do Firebase.
2. **Em segundo plano / app fechado**: a Cloud Function `enviarLembretes` (servidor) verifica os lembretes marcados como "notificar" de todos os usuários a cada 15 minutos e envia push de verdade via Firebase Cloud Messaging. É essa camada que faz funcionar no iPhone com o app fechado — desde que instalado como PWA (passo 8).

## Estrutura

```
app/
  page.js                # redireciona conforme login/perfil
  login/page.js            # login por e-mail (link mágico)
  questionario/page.js     # questionário + cálculo da meta de água
  dashboard/page.js        # painel: Academia / Água / Dieta / Casa
  RegisterSW.js             # registra o service worker do PWA
lib/
  firebase.js                # inicialização do Firebase (+ App Check e AI Logic)
  ai.js                        # leitura de PDF (dieta/ficha) via Gemini
  AuthProvider.js              # contexto do usuário logado
  db.js                         # leitura/escrita no Firestore
  water.js                       # cálculo da meta de água e horários
  messaging.js                    # ativação de push no cliente (FCM)
functions/
  index.js                        # Cloud Function agendada (envia os pushes)
public/
  manifest.json                    # manifesto do PWA
  icon-192.png, icon-512.png, apple-touch-icon.png
  firebase-messaging-sw.js          # gerado automaticamente (não editar)
scripts/
  generate-sw.js                     # gera o service worker a partir do .env.local
firestore.rules                       # cada usuário só acessa os próprios dados
firebase.json                         # config de deploy das Functions/Firestore
```

## Limitações / próximos passos possíveis

- A tolerância da Cloud Function é de ±7 minutos em torno do horário marcado
  (ela roda a cada 15 min) — não é um segundo exato, mas é confiável.
- O arquivo enviado (dieta/ficha) é salvo como texto/base64 no próprio
  documento do usuário no Firestore (limite de 1MB por documento) — para
  arquivos grandes, o ideal é Firebase Storage (não incluído).
- A leitura por IA (Gemini, via Firebase AI Logic) tem um custo pequeno por
  arquivo enviado — dentro da faixa gratuita do backend "Gemini Developer
  API" para uso pessoal, mas depende da sua cota no Google Cloud.
- Os botões de receita abrem a busca do TikTok em nova aba; a API oficial do
  TikTok exige autenticação própria da plataforma.
- Notificações em segundo plano no Android/desktop funcionam mesmo sem
  instalar como PWA (Chrome já suporta); o passo de instalação na tela de
  início é especificamente uma exigência da Apple no iPhone.
