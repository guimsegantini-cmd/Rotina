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

### 2. Configurar as chaves do projeto

```bash
cp .env.local.example .env.local
```
Preencha com os valores do passo 1 (inclusive a `VAPID key` em `NEXT_PUBLIC_FIREBASE_VAPID_KEY`).

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
2. Em **Environment Variables**, adicione as 7 chaves do seu `.env.local` (incluindo a `VAPID key`)
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

- **Academia**: ficha por dia da semana, check-in, cronômetro de descanso, checklist do treino do dia com dicas de execução, evolução de carga
- **Água**: meta calculada no questionário, anel de progresso, lembretes fracionados, com toggle para notificar ou não
- **Dieta**: refeições com horário (cada uma com toggle de notificação própria), upload do arquivo da dieta, dicas de receitas com link de busca no TikTok
- **Casa** *(novo)*: tarefas **diárias**, **semanais** (escolhendo os dias) ou **com prazo**, cada uma com checkbox de conclusão e um toggle opcional de notificação num horário específico

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
  firebase.js                # inicialização do Firebase
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
- O arquivo de dieta enviado é salvo como texto no próprio documento do
  usuário no Firestore (limite de 1MB) — para arquivos grandes, o ideal é
  Firebase Storage (não incluído).
- Os botões de receita abrem a busca do TikTok em nova aba; a API oficial do
  TikTok exige autenticação própria da plataforma.
- Notificações em segundo plano no Android/desktop funcionam mesmo sem
  instalar como PWA (Chrome já suporta); o passo de instalação na tela de
  início é especificamente uma exigência da Apple no iPhone.
