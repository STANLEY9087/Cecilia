# Diário de Bordo — Site 15 Anos da Cecília

**Data:** 03/09/2026

---

## Resumo do dia

Hoje foi um dia de avanços grandes no site dos 15 anos da Cecília. Implementei, integrei e testei várias funcionalidades: a página de fotos, o backend completo (Node.js + Express + SQLite + Multer), o controle de período de envio, o sistema de autenticação de administrador e o ajuste para que eu (admin) possa enviar fotos em qualquer data.

---

## O que foi feito em etapas

### 1. Revisão do projeto
- Analisei toda a estrutura: `fotos.html`, `fotos.css`, `fotos.js`, `backend/server.js`, `index.html`, `style.css`, pasta `Imagens/` e `video/`.
- Constatei que o `backend` era apenas um arquivo vazio (não um diretório) e que todos os arquivos principais existiam, porém estavam vazios.

### 2. Criação da página de Fotos (primeira versão completa)
- Criei a página `fotos.html` com a identidade visual do evento (fundo escuro, estrelas, dourado, violeta, tipografia Cormorant Garamond + Montserrat).
- Estrutura criada: header com logo "CECILIA 15" e menu (Início/Fotos), cabeçalho "MEMÓRIAS DA NOITE", card de envio de foto (arquivo, nome, mensagem), galeria responsiva e modal de visualização.
- CSS separado em `fotos.css` e JavaScript em `fotos.js`.
- Backend criado em `backend/server.js` com Express, CORS, Multer e SQLite.
- API implementada: `GET /api/fotos` e `POST /api/fotos`, com validação de extensão, MIME type, limite de 10 MB, nomes de arquivo únicos e tratamento de erros.
- Adicionei no `index.html` o link para `fotos.html`.

### 3. Teste da primeira versão
- Instalei as dependências (`express`, `cors`, `multer`, `sqlite3`).
- Subi o servidor na porta 8080 e testei o envio de uma imagem de teste, confirmando que a foto era salva em `backend/uploads/` e registrada no SQLite.

### 4. Controle do período de envio de fotos
- Defini o período permitido: início 20/12/2026 00:00:00 e fim 21/12/2026 23:59:59.
- Criei no backend as funções `getUploadStatus()` e `isPhotoUploadOpen()`.
- O upload fica bloqueado fora do período (HTTP 403), mesmo acessando diretamente a API — não depende só do JavaScript.
- Criei a rota `GET /api/fotos/status` para o frontend consultar o estado (não iniciado / aberto / encerrado).
- No frontend, a página mostra mensagens elegantes: "galeria não disponível", "envio aberto" ou "período encerrado", e desabilita o formulário quando necessário.
- Testei os três cenários (antes, durante e depois) simulando datas, sem alterar o relógio do sistema.

### 5. Limpeza das fotos de teste
- Apaguei as três imagens de teste que havia adicionado (registros do banco e arquivos em uploads), deixando a galeria limpa.

### 6. Sistema de login de administrador (somente eu envio fotos)
- Implementei autenticação com `express-session` (cookie HttpOnly), conforme solicitei.
- Criei a página `admin.html` com a mesma identidade visual, para o login.
- A senha do admin fica em `backend/.env` (variável de ambiente, não no código).
- O upload `POST /api/fotos` agora exige sessão de admin — convidados só visualizam.
- Criei as rotas `POST /api/admin/login`, `POST /api/admin/logout` e `GET /api/admin/me`.
- Testei o fluxo completo: login com senha errada (rejeitado), senha correta (aceito), upload autenticado (sucesso) e logout (bloqueio volta).

### 7. Definição da senha do admin
- Configurei a senha `Stanley@1309Ana` no arquivo `backend/.env`.
- Reiniciei o servidor e confirmei que o login com a nova senha funciona.

### 8. Solução do problema de "não consigo inserir imagem"
- Identifiquei que o upload estava bloqueado porque o período da festa ainda não tinha começado (estamos em setembro).
- Ajustei a regra: **o admin autenticado pode enviar fotos em qualquer data**, enquanto o público (não logado) continua limitado ao período da festa.
- Atualizei `backend/server.js` (o bloqueio por período só vale para quem não é admin) e `fotos.js` (formulário habilitado para o admin mesmo fora do período).
- Testei com sucesso o upload do admin fora do período e limpei os dados de teste.

---

## Conclusão / aprendizados do dia

- O projeto evoluiu de uma estrutura vazia para um site funcional de galeria de fotos com backend completo.
- Aprendi a importância de **bloquear a segurança no backend** (não apenas no frontend), para evitar burla.
- Configurei autenticação sem guardar segredos no código, usando variável de ambiente.
- Apendi que o **período de envio** deve ser flexível para o admin, permitindo testes em qualquer data.
- **Reestruturação completa** do projeto para deploy separado: Netlify (frontend estático) + Render.com (backend Node.js).
- Implementei **moderação de fotos** com status pendente/aprovado/rejeitado e painel administrativo completo.
- Criei **sistema de RSVP** para confirmação de presença dos convidados.
- Aprendi que o Netlify é apenas para arquivos estáticos e que backends precisam de serviços separados.

---

## Pendências / próximos passos (opcionais)

- ~~Criar painel administrativo para moderar/aprovar/excluir fotos.~~ ✅ Feito em 03/09/2026
- Tratar melhor o QR Code físico apontando para o endereço definitivo quando o site for hospedado.
- Definir senha definitiva e protegê-la antes da publicação.

---

## 2ª Parte — Reestruturação para Deploy (03/09/2026)

### O que foi feito

### 1. Separação em pastas: `frontend/` e `backend/`
- **`frontend/`** → Arquivos estáticos para deploy no Netlify
  - `convite/` → Página de convite (`index.html` + `style.css`)
  - `memorial/` → Galeria de fotos (`index.html` + `style.css` + `app.js`)
  - `admin/` → Login + Painel de moderação (`login.html` + `painel.html` + `painel.js` + `style.css`)
  - `assets/` → Imagens e vídeos copiados da pasta raiz
- **`backend/`** → Atualizado para deploy no Render.com

### 2. Convite isolado (`frontend/convite/`)
- `index.html` com CSS externo (extraído do inline)
- Dois botões CTA: "Fotos" e "Confirmar Presença"
- Links apontam para `../memorial/index.html`

### 3. Memorial de Fotos (`frontend/memorial/`)
- Galeria mostra **apenas fotos aprovadas** pelo admin
- Novo formulário de **confirmação de presença (RSVP)**:
  - Nome completo, email, telefone
  - Radio buttons: Vai / Não vai / Talvez
  - Número de acompanhantes (select)
  - Mensagem para a Cecília
- API do backend apontando para `https://cecilia-api.onrender.com`

### 4. Painel Administrativo (`frontend/admin/`)
- **`login.html`** → Tela de login do admin
- **`painel.html`** → Painel completo de moderação com:
  - Cards de estatísticas (total fotos, pendentes, aprovadas, convidados)
  - Abas: Fotos / Convidados
  - Filtros: Todos / Pendentes / Aprovados / Rejeitados
  - Botões: Aprovar, Rejeitar, Excluir (para cada foto)
  - Tabela de convidados com presença, acompanhantes, mensagem
  - Botão de logout

### 5. Backend atualizado (`backend/server.js`)
- **Nova tabela `convidados`**: id, nome, email, telefone, vai, num_acompanhantes, mensagem, created_at
- **Campo `status` na tabela `fotos`**: pendente / aprovado / rejeitado (migração automática)
- **Novas rotas da API**:
  - `POST /api/convidados` → Cadastro público de RSVP
  - `GET /api/convidados` → Listar convidados (admin)
  - `DELETE /api/convidados/:id` → Excluir convidado (admin)
  - `GET /api/admin/fotos` → Listar todas as fotos (admin)
  - `PATCH /api/admin/fotos/:id` → Aprovar/rejeitar foto (admin)
  - `DELETE /api/admin/fotos/:id` → Excluir foto (admin)
- **CORS configurado** para permitir o Netlify
- **Upload**: fotos do admin vão direto para "aprovado"; fotos do público vão para "pendente"

### 6. Configuração de Deploy
- **`netlify.toml`** → Configuração do build (publish: `frontend/`)
- **`.gitignore`** → Ignora node_modules, .env, *.db, uploads

### Arquitetura de Deploy
```
Netlify (estático)          Render.com (backend)
─────────────────           ─────────────────────
frontend/convite/           backend/server.js
frontend/memorial/          SQLite (cecilia.db)
frontend/admin/             uploads/
frontend/assets/
```

### URLs esperadas
- Convite: `https://cecilia15anos.netlify.app/convite/`
- Memorial: `https://cecilia15anos.netlify.app/memorial/`
- Admin: `https://cecilia15anos.netlify.app/admin/login.html`
- API: `https://cecilia-api.onrender.com/api/...`


## ainda nao fiz isso

Sim! Mas lembre-se: o backend não vai no Netlify. Só o frontend.
Como fazer deploy
1. Backend primeiro (Render.com)
O backend precisa rodar antes, porque o frontend depende dele.
1. Crie conta no render.com (https://render.com)
2. Clique em "New Web Service"
3. Conecte seu GitHub (faça push do projeto para o GitHub primeiro)
4. Configure:
- Build Command: cd backend && npm install
- Start Command: cd backend && node server.js
- Environment Variable: ADMIN_PASSWORD = Stanley@1309Ana
5. Copie a URL que o Render gerar (ex: https://cecilia-api.onrender.com)
2. Frontend no Netlify
1. Acesse netlify.com (https://netlify.com)
2. Clique em "Add new site" → "Deploy manually"
3. Arraste apenas a pasta frontend (ou crie um zip só com o conteúdo dela)
4. Pronto, já fica público
3. Atualizar a URL da API
Depois que o Render estiver rodando, edite esses 2 arquivos e substitua a URL:
- frontend/memorial/app.js → linha 3
- frontend/admin/painel.js → linha 3
Troque:
https://cecilia-api.onrender.com
Pela URL real que o Render gerou.
Depois faça upload novamente no Netlify.
Resumo rápido: Backend no Render, frontend no Netlify, atualiza a URL da API nos arquivos JS.