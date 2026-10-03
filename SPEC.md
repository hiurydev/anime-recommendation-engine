# SPEC Técnica — Anime Recommendation Engine

**Versão:** 1.0
**Data:** 2026-10-03
**Tipo de projeto:** estudo acadêmico (pós-graduação em IA) — sistema de recomendação com TensorFlow.js
**Status:** especificação aprovada para implementação

---

## Como ler este documento

Este documento é a fonte única de verdade para a implementação. Ele foi escrito para que um
agente de IA (ou desenvolvedor) consiga implementar o projeto do zero **sem precisar tomar
decisões arquiteturais**. Onde houver mais de uma opção possível, a SPEC já escolheu uma e
registrou a escolha na seção *Decisões de arquitetura (ADR resumido)*.

Convenções:

- Tudo que estiver marcado como **OBRIGATÓRIO** faz parte do escopo mínimo.
- Tudo que estiver marcado como **OPCIONAL (extra didático)** só deve ser implementado depois
  que todos os critérios de conclusão obrigatórios estiverem atendidos.
- Nomes de arquivos, rotas, campos de banco e variáveis de ambiente devem ser seguidos
  **literalmente**, pois outras partes da SPEC dependem deles.

---

## 1. Objetivo e escopo

### 1.1 Objetivo

Construir uma aplicação web completa e didática que demonstre, na prática, o funcionamento de um
**sistema de recomendação baseado em conteúdo (content-based filtering)** usando uma rede neural
treinada com **TensorFlow.js** no backend Node.js.

O usuário marca os animes que já assistiu e atribui uma nota de 1 a 10. O sistema aprende, a
partir dessas notas e das características de cada anime (gêneros, tipo, número de episódios,
nota média da comunidade, popularidade), qual é o "gosto" daquele usuário e prevê a nota que
ele daria para os animes que ainda não assistiu. Os animes com maior nota prevista são
apresentados como recomendação.

### 1.2 Objetivos de aprendizado (o que o projeto precisa demonstrar)

1. Ingestão e normalização de um dataset real (Kaggle) para um banco de dados (MongoDB).
2. Engenharia de atributos (*feature engineering*): transformar dados categóricos e numéricos
   em vetores numéricos consumíveis por uma rede neural.
3. Construção, treino e avaliação de um modelo com TensorFlow.js (`@tensorflow/tfjs-node`).
4. Persistência e recarregamento de um modelo treinado.
5. Uso do modelo em tempo de inferência para gerar recomendações ordenadas.
6. Exposição de tudo via API REST e consumo em uma SPA Vue.js.
7. Ambiente 100% containerizado com Docker Compose.

### 1.3 Escopo — Dentro

- Importação do dataset do Kaggle (`anime.csv`) para o MongoDB via script CLI.
- Catálogo de animes com busca por nome, filtro por gênero e por tipo, paginação e ordenação.
- Perfis de usuário simples (apenas nome, **sem autenticação**).
- Avaliação de animes (nota 1–10), com criação, atualização e remoção da avaliação.
- Treino de um modelo de rede neural **por usuário**, disparado pela API.
- Geração de recomendações com explicação simples ("por que este anime foi recomendado").
- Fallback de *cold start* (poucas avaliações) por similaridade de cosseno.
- Métricas de avaliação do modelo (MAE / RMSE em conjunto de validação) exibidas na interface.
- Frontend Vue 3 SPA com 4 telas.
- Docker + Docker Compose para backend, frontend e MongoDB.

### 1.4 Escopo — Fora (não implementar)

- Autenticação, autorização, login social, JWT, senhas.
- Filtragem colaborativa com a `rating.csv` do Kaggle (73 milhões de linhas) — fora de escopo
  por custo computacional; a SPEC só usa `anime.csv`.
- Embeddings de usuário/item treinados conjuntamente (matrix factorization).
- Deploy em produção, CI/CD, HTTPS, domínio, Kubernetes.
- Testes end-to-end automatizados (apenas testes unitários pontuais são obrigatórios).
- Internacionalização, temas, acessibilidade avançada.
- Cache distribuído (Redis), filas, workers externos.
- Imagens/capas dos animes (o dataset do Kaggle não fornece URLs de imagem; a UI usa cards
  textuais). Buscar imagens em APIs externas é **fora de escopo**.

---

## 2. Decisões de arquitetura (ADR resumido)

| # | Decisão | Alternativas descartadas | Justificativa |
|---|---|---|---|
| 1 | Recomendação **content-based** com rede neural de regressão | Filtragem colaborativa; matrix factorization | Só precisa das avaliações de **um** usuário; funciona com 5–20 notas; não exige base de outros usuários |
| 2 | **Um modelo treinado por usuário**, salvo em disco | Um modelo global com embedding de usuário | Muito mais simples de entender e depurar; treino em segundos; mostra o ciclo completo treino→salvar→carregar→inferir |
| 3 | TensorFlow.js **no backend** (`@tensorflow/tfjs-node`) | TF.js no browser | Evita transferir 12k vetores de features para o browser; mantém a lógica de ML em um só lugar |
| 4 | **Sem autenticação**, usuário identificado por `userId` no `localStorage` | Login com JWT | Fora do objetivo de aprendizado; reduz drasticamente a complexidade |
| 5 | Dataset apenas `anime.csv` | `anime.csv` + `rating.csv` | `rating.csv` tem ~1.1 GB; inviável e desnecessário para content-based |
| 6 | Importação por **script CLI dentro do container do backend** | Endpoint HTTP de upload; serviço separado no compose | Mais simples, reproduzível e explícito: `docker compose run --rm backend npm run import` |
| 7 | Treino **síncrono** no request HTTP (com timeout generoso) | Fila de jobs / worker | Treino leva 1–5 s para dezenas de exemplos; fila seria overengineering |
| 8 | Parâmetros de normalização persistidos na coleção `feature_meta` | Recalcular a cada execução | Garante que treino e inferência usem exatamente a mesma escala (evita *train/serve skew*) |
| 9 | Frontend servido pelo **Vite dev server** dentro do container | Build estático + Nginx | Projeto de estudo: hot reload é mais valioso que build de produção. Build de produção é **OPCIONAL** |
| 10 | Mongoose como ODM | Driver nativo do MongoDB | Schemas explícitos e validação servem como documentação viva dos modelos |

---

## 3. Funcionalidades principais

### F1 — Catálogo de animes (OBRIGATÓRIO)
Listagem paginada dos animes importados, com:
- busca textual por nome (case-insensitive, substring);
- filtro por um ou mais gêneros (lógica AND);
- filtro por tipo (`TV`, `Movie`, `OVA`, `ONA`, `Special`, `Music`);
- ordenação por popularidade (`members`), nota da comunidade (`rating`) ou nome;
- indicação visual de quais animes o usuário já avaliou e com que nota.

### F2 — Gestão de perfis de usuário (OBRIGATÓRIO)
- Criar um perfil informando apenas um nome.
- Listar perfis existentes e selecionar um.
- O `userId` selecionado é persistido no `localStorage` do navegador.

### F3 — Avaliação de animes (OBRIGATÓRIO)
- Atribuir nota inteira de **1 a 10** a um anime (marca implicitamente como "assistido").
- Alterar a nota de um anime já avaliado (upsert).
- Remover uma avaliação.
- Tela "Minhas avaliações" com a lista completa, ordenável por nota.

### F4 — Treino do modelo (OBRIGATÓRIO)
- Botão "Treinar modelo" que dispara `POST /api/recommendations/train`.
- Exige no mínimo `MIN_RATINGS_FOR_MODEL` (padrão **5**) avaliações; abaixo disso a API
  responde 422 com mensagem explicativa.
- Resposta exibe: número de exemplos usados, épocas, loss final, MAE e RMSE de validação e
  duração do treino.

### F5 — Geração de recomendações (OBRIGATÓRIO)
- Lista de até N animes (padrão 20) nunca avaliados pelo usuário, ordenados por nota prevista.
- Cada item mostra: nome, tipo, gêneros, nota da comunidade, **nota prevista (0–10)** e uma
  explicação textual curta.
- Indicação de qual estratégia gerou a lista: `neural-network` ou `cosine-similarity`
  (fallback de cold start).

### F6 — Perfil de gosto do usuário (OBRIGATÓRIO)
- `GET /api/recommendations/:userId/profile` retorna os gêneros com maior afinidade
  (média ponderada das notas) e as estatísticas básicas do usuário.
- Exibido na tela de recomendações como lista de "seus gêneros favoritos" com barras de
  proporção.

### F7 — Métricas e transparência do modelo (OBRIGATÓRIO)
- A tela de recomendações mostra a data do último treino, nº de exemplos e MAE/RMSE.
- Se as avaliações mudaram depois do último treino, a UI exibe aviso "modelo desatualizado".

### F8 — Comparação de estratégias (OPCIONAL — extra didático)
- `GET /api/recommendations/:userId?strategy=cosine|neural` força a estratégia, permitindo
  comparar visualmente as duas listas lado a lado.

---

## 4. Arquitetura geral da aplicação

### 4.1 Visão de componentes

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                               Navegador                                      │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Frontend — Vue 3 SPA (Vite dev server, porta 5173)                    │  │
│  │  Views: Explore · MyRatings · Recommendations · AnimeDetail            │  │
│  │  Pinia stores: user · animes · ratings · recommendations               │  │
│  │  Axios (baseURL = VITE_API_URL)                                        │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
└───────────────────────────────────┼──────────────────────────────────────────┘
                                    │ HTTP/JSON (REST, CORS habilitado)
┌───────────────────────────────────▼──────────────────────────────────────────┐
│  Backend — Node.js + Express (porta 3000)                                    │
│                                                                              │
│  routes/        → definição de rotas e validação de entrada                  │
│  controllers/   → tradução HTTP ↔ serviços (sem regra de negócio)            │
│  services/      → regra de negócio (catálogo, avaliações, recomendação)      │
│  ml/            → engenharia de features, modelo, treino, inferência         │
│       ├─ features.js   (anime → vetor numérico)                             │
│       ├─ model.js      (arquitetura da rede)                                │
│       ├─ trainer.js    (treino + métricas + persistência)                   │
│       └─ recommender.js(carregar modelo + prever + ranquear)                 │
│  models/        → schemas Mongoose                                          │
│  scripts/       → import do dataset, (re)cálculo de feature_meta            │
│                                                                              │
│  ┌──────────────────────────┐        ┌──────────────────────────────────┐   │
│  │ @tensorflow/tfjs-node    │        │ Volume: /app/models              │   │
│  │ treino e inferência      │◄──────►│ models/user_<id>/model.json+bin  │   │
│  └──────────────────────────┘        └──────────────────────────────────┘   │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ Mongoose (mongodb://mongo:27017)
┌───────────────────────────────────▼──────────────────────────────────────────┐
│  MongoDB 7 (porta 27017)                                                     │
│  Coleções: animes · users · ratings · feature_meta · training_runs           │
│  Volume nomeado: mongo_data                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ script de importação (one-shot)
                       ┌────────────┴─────────────┐
                       │ ./data/anime.csv (Kaggle)│
                       └──────────────────────────┘
```

### 4.2 Camadas do backend e responsabilidades

| Camada | Pasta | Responsabilidade | Regras |
|---|---|---|---|
| Rotas | `src/routes` | Declarar caminhos HTTP, aplicar validação de entrada e delegar ao controller | Não contém lógica |
| Controllers | `src/controllers` | Ler `req`, chamar serviço, montar `res`, repassar erro ao middleware | **Nunca** acessa Mongoose nem TensorFlow direto |
| Services | `src/services` | Regra de negócio e orquestração; única camada que fala com os models | Não conhece `req`/`res` |
| ML | `src/ml` | Features, arquitetura, treino, métricas, inferência | Recebe dados puros (arrays/objetos); não acessa Mongo |
| Models | `src/models` | Schemas, índices e validações do Mongoose | Sem regra de negócio |
| Scripts | `src/scripts` | Tarefas CLI (importar dataset, recalcular metadados, limpar modelos) | Executados via `npm run` |
| Config | `src/config` | Leitura/validação de env vars, conexão com Mongo, logger | Falha rápido se env obrigatória faltar |

Regra de dependência (unidirecional): `routes → controllers → services → {models, ml}`.
Nenhuma camada pode importar de uma camada acima dela.

### 4.3 Camadas do frontend e responsabilidades

| Camada | Pasta | Responsabilidade |
|---|---|---|
| `api/` | wrappers Axios por recurso (`animes.js`, `ratings.js`, `users.js`, `recommendations.js`) | Única camada que conhece URLs da API |
| `stores/` | Pinia: estado, ações assíncronas, flags de loading/erro | Única camada que chama `api/` |
| `views/` | páginas ligadas a rotas; compõem componentes e leem stores | Sem `axios` direto |
| `components/` | componentes de apresentação reutilizáveis | Recebem `props`, emitem eventos; **não** chamam stores de escrita diretamente, salvo os casos listados na seção 13 |
| `router/` | definição das rotas e guard de "usuário selecionado" | — |

---

## 5. Stack e bibliotecas

### 5.1 Backend (`backend/package.json`)

```json
{
  "name": "anime-recommender-backend",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "import": "node src/scripts/importDataset.js",
    "features:rebuild": "node src/scripts/rebuildFeatureMeta.js",
    "models:clear": "node src/scripts/clearModels.js",
    "test": "node --test"
  },
  "dependencies": {
    "@tensorflow/tfjs-node": "^4.22.0",
    "cors": "^2.8.5",
    "csv-parse": "^5.5.6",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "mongoose": "^8.6.0",
    "morgan": "^1.10.0",
    "zod": "^3.23.8"
  }
}
```

Notas de implementação:
- Usar **ESM** (`"type": "module"`) em todo o backend.
- `@tensorflow/tfjs-node` precisa de build nativo: a imagem Docker deve ser
  `node:20-bookworm` (não Alpine) e instalar `python3`, `make`, `g++` antes do `npm install`.
- `zod` é usado apenas para validar query/body dos endpoints e as variáveis de ambiente.
- Express 4 (não 5) para evitar incompatibilidades de middleware de erro.

### 5.2 Frontend (`frontend/package.json`)

```json
{
  "name": "anime-recommender-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0"
  },
  "dependencies": {
    "axios": "^1.7.7",
    "pinia": "^2.2.2",
    "vue": "^3.5.0",
    "vue-router": "^4.4.3"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.1.0",
    "vite": "^5.4.0"
  }
}
```

Notas:
- Vue 3 com **Composition API** e `<script setup>` em todos os componentes.
- **Sem** framework de UI (Tailwind, Vuetify, etc.). CSS puro em `src/assets/main.css` usando
  variáveis CSS e no máximo CSS escopado por componente. Motivo: manter o foco no sistema de
  recomendação e evitar passo extra de build.
- `vite --host 0.0.0.0` é obrigatório para o servidor ser acessível de fora do container.

### 5.3 Infraestrutura

- Docker Engine 24+ e Docker Compose v2 (`docker compose`, sem hífen).
- Imagens base: `node:20-bookworm` (backend), `node:20-alpine` (frontend), `mongo:7`.

---

## 6. Arquitetura Docker

### 6.1 Serviços

| Serviço | Imagem/Build | Porta (host:container) | Depende de | Volumes |
|---|---|---|---|---|
| `mongo` | `mongo:7` | `27017:27017` | — | `mongo_data:/data/db` |
| `backend` | build `./backend` | `3000:3000` | `mongo` (healthy) | `./backend:/app`, `backend_node_modules:/app/node_modules`, `./data:/app/data:ro`, `models_data:/app/models` |
| `frontend` | build `./frontend` | `5173:5173` | `backend` | `./frontend:/app`, `frontend_node_modules:/app/node_modules` |

Princípios:
- O código-fonte é montado por bind mount para dar **hot reload** em dev.
- `node_modules` fica em **volume nomeado** para não ser sobrescrito pelo bind mount e para
  isolar binários nativos do host (crítico para `tfjs-node`).
- O CSV do Kaggle é montado **read-only** em `/app/data`.
- Os modelos treinados ficam em volume nomeado `models_data`, sobrevivendo a recriações do
  container.
- `mongo` tem healthcheck; `backend` só inicia depois do banco estar pronto.
- A rede default do compose é usada; o backend alcança o banco pelo hostname `mongo`.

### 6.2 Dockerfile do backend — `backend/Dockerfile`

Requisitos que a implementação deve cumprir:

```dockerfile
FROM node:20-bookworm

# Dependências de build para o binding nativo do @tensorflow/tfjs-node
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/models

EXPOSE 3000
CMD ["npm", "run", "dev"]
```

### 6.3 Dockerfile do frontend — `frontend/Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]
```

### 6.4 Estrutura do `docker-compose.yml` (raiz do repositório)

```yaml
services:
  mongo:
    image: mongo:7
    container_name: anime-mongo
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_DATABASE: ${MONGO_DB:-anime_recommender}
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 20s

  backend:
    build: ./backend
    container_name: anime-backend
    restart: unless-stopped
    ports:
      - "${BACKEND_PORT:-3000}:3000"
    environment:
      NODE_ENV: development
      PORT: 3000
      MONGO_URI: mongodb://mongo:27017/${MONGO_DB:-anime_recommender}
      CORS_ORIGIN: ${CORS_ORIGIN:-http://localhost:5173}
      DATASET_PATH: /app/data/anime.csv
      MODELS_DIR: /app/models
      MIN_RATINGS_FOR_MODEL: ${MIN_RATINGS_FOR_MODEL:-5}
      TRAIN_EPOCHS: ${TRAIN_EPOCHS:-120}
      TRAIN_BATCH_SIZE: ${TRAIN_BATCH_SIZE:-8}
      TRAIN_LEARNING_RATE: ${TRAIN_LEARNING_RATE:-0.01}
      RECOMMENDATION_MIN_MEMBERS: ${RECOMMENDATION_MIN_MEMBERS:-5000}
    volumes:
      - ./backend:/app
      - backend_node_modules:/app/node_modules
      - ./data:/app/data:ro
      - models_data:/app/models
    depends_on:
      mongo:
        condition: service_healthy

  frontend:
    build: ./frontend
    container_name: anime-frontend
    restart: unless-stopped
    ports:
      - "${FRONTEND_PORT:-5173}:5173"
    environment:
      VITE_API_URL: ${VITE_API_URL:-http://localhost:3000/api}
    volumes:
      - ./frontend:/app
      - frontend_node_modules:/app/node_modules
    depends_on:
      - backend

volumes:
  mongo_data:
  models_data:
  backend_node_modules:
  frontend_node_modules:
```

### 6.5 Comandos operacionais (devem constar no README)

```bash
# subir todo o ambiente
docker compose up -d --build

# importar o dataset do Kaggle (one-shot, após colocar data/anime.csv)
docker compose run --rm backend npm run import

# importar sobrescrevendo dados existentes
docker compose run --rm backend npm run import -- --drop

# logs
docker compose logs -f backend

# shell no backend
docker compose exec backend bash

# derrubar tudo (mantendo dados)
docker compose down

# derrubar e apagar banco + modelos
docker compose down -v
```

---

## 7. Estrutura do repositório

```
anime-recommendation-engine/
├── README.md                     # visão geral + passo a passo de execução
├── SPEC.md                       # este documento
├── docker-compose.yml
├── .env.example                  # variáveis do compose (copiar para .env)
├── .gitignore                    # node_modules, .env, data/*.csv, models/
├── data/
│   ├── .gitkeep
│   └── README.md                 # instruções de download do dataset no Kaggle
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   ├── .env.example              # uso fora do Docker (opcional)
│   └── src/
│       ├── server.js             # bootstrap: conecta Mongo e sobe o Express
│       ├── app.js                # cria o app Express, middlewares e rotas
│       ├── config/
│       │   ├── env.js            # valida e exporta env vars (zod)
│       │   ├── database.js       # connect/disconnect Mongoose
│       │   └── logger.js         # logger mínimo (console com níveis)
│       ├── models/
│       │   ├── Anime.js
│       │   ├── User.js
│       │   ├── Rating.js
│       │   ├── FeatureMeta.js
│       │   └── TrainingRun.js
│       ├── routes/
│       │   ├── index.js          # agrega todas as rotas em /api
│       │   ├── animeRoutes.js
│       │   ├── userRoutes.js
│       │   ├── ratingRoutes.js
│       │   └── recommendationRoutes.js
│       ├── controllers/
│       │   ├── animeController.js
│       │   ├── userController.js
│       │   ├── ratingController.js
│       │   └── recommendationController.js
│       ├── services/
│       │   ├── animeService.js
│       │   ├── userService.js
│       │   ├── ratingService.js
│       │   ├── trainingService.js        # orquestra: busca dados → ml/trainer → salva
│       │   └── recommendationService.js  # orquestra: carrega modelo → ml/recommender
│       ├── ml/
│       │   ├── features.js       # vocabulários, normalização, anime → vetor
│       │   ├── model.js          # createModel(inputDim)
│       │   ├── trainer.js        # trainUserModel(), métricas, save
│       │   ├── recommender.js    # loadUserModel(), predictScores()
│       │   └── cosine.js         # fallback de cold start
│       ├── middlewares/
│       │   ├── errorHandler.js
│       │   ├── notFound.js
│       │   └── validate.js       # valida req com schema zod
│       ├── utils/
│       │   ├── AppError.js       # erro com statusCode
│       │   └── parse.js          # helpers de parsing do CSV
│       ├── scripts/
│       │   ├── importDataset.js
│       │   ├── rebuildFeatureMeta.js
│       │   └── clearModels.js
│       └── tests/
│           ├── features.test.js
│           └── cosine.test.js
└── frontend/
    ├── Dockerfile
    ├── .dockerignore
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.js               # cria app, Pinia e Router
        ├── App.vue               # layout: AppHeader + <RouterView>
        ├── router/index.js
        ├── api/
        │   ├── http.js           # instância Axios + interceptor de erro
        │   ├── animes.js
        │   ├── users.js
        │   ├── ratings.js
        │   └── recommendations.js
        ├── stores/
        │   ├── userStore.js
        │   ├── animeStore.js
        │   ├── ratingStore.js
        │   └── recommendationStore.js
        ├── views/
        │   ├── ExploreView.vue
        │   ├── MyRatingsView.vue
        │   ├── RecommendationsView.vue
        │   └── AnimeDetailView.vue
        ├── components/
        │   ├── AppHeader.vue
        │   ├── UserSelector.vue
        │   ├── SearchBar.vue
        │   ├── GenreFilter.vue
        │   ├── AnimeCard.vue
        │   ├── AnimeGrid.vue
        │   ├── RatingStars.vue
        │   ├── RecommendationCard.vue
        │   ├── TrainingPanel.vue
        │   ├── TasteProfile.vue
        │   ├── Pagination.vue
        │   ├── EmptyState.vue
        │   └── LoadingSpinner.vue
        └── assets/main.css
```

---

## 8. Dataset do Kaggle

### 8.1 Dataset escolhido

- **Nome:** Anime Recommendations Database
- **Autor:** CooperUnion
- **URL:** https://www.kaggle.com/datasets/CooperUnion/anime-recommendations-database
- **Arquivo usado:** `anime.csv` (~12.294 linhas, ~1 MB) — **apenas este**
- **Arquivo ignorado:** `rating.csv` (fora de escopo, ver ADR #5)

### 8.2 Colunas de `anime.csv`

| Coluna | Tipo bruto | Descrição | Observações de qualidade |
|---|---|---|---|
| `anime_id` | int | ID no MyAnimeList | único; usado como chave natural |
| `name` | string | título | contém entidades HTML (`&quot;`, `&amp;`, `&#039;`) |
| `genre` | string | gêneros separados por `", "` | pode estar vazio |
| `type` | string | `TV`, `Movie`, `OVA`, `ONA`, `Special`, `Music` | pode estar vazio |
| `episodes` | string | número de episódios | pode ser `"Unknown"` |
| `rating` | float | nota média da comunidade (0–10) | pode estar vazio/`NaN` |
| `members` | int | nº de membros que adicionaram à lista | sempre presente |

### 8.3 Obtenção do arquivo

A SPEC suporta dois caminhos; o README deve documentar os dois e o `data/README.md` deve
repetir o passo a passo.

**Caminho A — download manual (padrão, OBRIGATÓRIO documentar):**
1. Criar conta no Kaggle e acessar a URL do dataset.
2. Clicar em *Download* e extrair o zip.
3. Copiar `anime.csv` para `./data/anime.csv` na raiz do repositório.

**Caminho B — Kaggle CLI (OPCIONAL):**
```bash
# requer ~/.kaggle/kaggle.json com credenciais da conta
pip install kaggle
kaggle datasets download -d CooperUnion/anime-recommendations-database -p ./data --unzip
rm -f ./data/rating.csv
```

O arquivo CSV **não** deve ser comitado (`data/*.csv` entra no `.gitignore`).

---

## 9. Modelos e coleções do MongoDB

Banco: `anime_recommender`.

### 9.1 `animes`

```js
// src/models/Anime.js
{
  animeId:      { type: Number, required: true, unique: true, index: true }, // anime_id do CSV
  name:         { type: String, required: true, trim: true },
  nameLower:    { type: String, required: true, index: true },  // busca case-insensitive
  genres:       { type: [String], default: [] },                 // ["Action","Comedy"]
  type:         { type: String, enum: ['TV','Movie','OVA','ONA','Special','Music','Unknown'], default: 'Unknown' },
  episodes:     { type: Number, default: null },                 // null quando "Unknown"
  rating:       { type: Number, default: null, min: 0, max: 10 },// nota da comunidade
  members:      { type: Number, default: 0 },
  features:     { type: [Number], default: [] },                 // vetor pré-computado (ver §11)
  featureVersion:{ type: Number, default: 0 }                     // versão do feature_meta usada
}
// índices: { animeId: 1 } unique, { nameLower: 1 }, { genres: 1 }, { type: 1 },
//          { members: -1 }, { rating: -1 }
// timestamps: true
```

**Decisão importante:** o vetor de features de cada anime é **pré-computado e salvo** no
documento durante a importação. Isso evita recalcular 12k vetores em cada treino/inferência e
torna a etapa de *feature engineering* explícita e inspecionável no banco.

### 9.2 `users`

```js
{
  name:          { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
  lastTrainedAt: { type: Date, default: null },
  ratingsCount:  { type: Number, default: 0 }   // desnormalizado, mantido pelo ratingService
}
// timestamps: true
```

Sem senha, sem e-mail, sem unicidade de nome (perfis homônimos são permitidos).

### 9.3 `ratings`

```js
{
  userId:  { type: ObjectId, ref: 'User',  required: true },
  animeId: { type: Number,                 required: true },  // referência por animeId do CSV
  score:   { type: Number, required: true, min: 1, max: 10 }   // inteiro
}
// índice composto único: { userId: 1, animeId: 1 } unique
// índice: { userId: 1, updatedAt: -1 }
// timestamps: true
```

Regra: `score` é validado como inteiro na camada de validação (zod) antes de chegar ao model.

### 9.4 `feature_meta`

Guarda o "dicionário" de features e os parâmetros de normalização. **Um único documento ativo**,
identificado por `version`.

```js
{
  version:      { type: Number, required: true, unique: true }, // incrementa a cada rebuild
  genreVocab:   { type: [String], required: true },  // ordem fixa; define as posições do multi-hot
  typeVocab:    { type: [String], required: true },  // ordem fixa; define o one-hot
  numeric: {
    episodes: { min: Number, max: Number },                  // sobre log1p(episodes)
    rating:   { min: Number, max: Number, median: Number },  // median usado para imputacao
    members:  { min: Number, max: Number }                   // sobre log1p(members)
  },
  inputDim:     { type: Number, required: true },   // genreVocab.length + typeVocab.length + 5
  animeCount:   { type: Number, required: true },
  isActive:     { type: Boolean, default: true }
}
// timestamps: true
```

### 9.5 `training_runs`

Histórico de treinos (um documento por treino).

```js
{
  userId:        { type: ObjectId, ref: 'User', required: true, index: true },
  featureVersion:{ type: Number, required: true },
  samples:       { type: Number, required: true },  // total de avaliações usadas
  trainSamples:  { type: Number, required: true },
  valSamples:    { type: Number, required: true },
  epochs:        { type: Number, required: true },
  finalLoss:     { type: Number, required: true },  // MSE no treino (escala 0–1)
  valLoss:       { type: Number, default: null },
  maeScore:      { type: Number, default: null },   // MAE em escala 1–10
  rmseScore:     { type: Number, default: null },   // RMSE em escala 1–10
  durationMs:    { type: Number, required: true },
  modelPath:     { type: String, required: true }   // ex: /app/models/user_<id>
}
// timestamps: true
```

A UI consome sempre o **último** `training_run` do usuário.

---

## 10. Importação do dataset para o MongoDB

Script: `backend/src/scripts/importDataset.js`
Comando: `docker compose run --rm backend npm run import [-- --drop] [--file=/app/data/anime.csv]`

### 10.1 Algoritmo (passo a passo obrigatório)

1. Carregar e validar env vars (`config/env.js`); conectar ao MongoDB.
2. Verificar existência de `DATASET_PATH` (padrão `/app/data/anime.csv`). Se não existir,
   encerrar com código 1 e mensagem instruindo o download do Kaggle (ver §8.3).
3. Se `--drop`, executar `Anime.deleteMany({})`, `FeatureMeta.deleteMany({})` e limpar os
   modelos salvos em `MODELS_DIR` (as features mudam ⇒ modelos antigos ficam inválidos).
4. Ler o CSV em streaming com `csv-parse` (`columns: true`, `skip_empty_lines: true`).
5. Para cada linha, aplicar a normalização de §10.2, produzindo um objeto "anime limpo".
6. Descartar a linha (contabilizando em `skipped`) se:
   - `anime_id` ausente ou não numérico;
   - `name` vazio após limpeza;
   - `anime_id` duplicado dentro do próprio CSV.
7. Acumular os animes limpos em memória (12k registros ≈ poucos MB — aceitável e mais simples).
8. **Primeira passada concluída** → calcular o `feature_meta` (§11.1) a partir de todos os
   animes limpos e gravar o documento com `version = (maiorVersaoExistente + 1)` e
   `isActive: true` (marcando os anteriores como `isActive: false`).
9. **Segunda passada** → para cada anime limpo, calcular `features` (§11.2) usando o
   `feature_meta` recém-criado e setar `featureVersion`.
10. Persistir com `bulkWrite` em lotes de 1000, usando `updateOne` com
    `filter: { animeId }`, `update: { $set: {...} }`, `upsert: true` (idempotente).
11. Imprimir relatório final: total de linhas lidas, inseridos, atualizados, descartados
    (com motivo agregado), gêneros distintos, `inputDim`, duração.
12. Desconectar e encerrar com código 0.

### 10.2 Tratamento e normalização dos dados do Kaggle

Regras **obrigatórias**, aplicadas na ordem abaixo:

| Campo | Transformação |
|---|---|
| `anime_id` → `animeId` | `Number(...)`; descartar se `NaN` |
| `name` → `name` | decodificar entidades HTML (`&quot;→"`, `&amp;→&`, `&#039;→'`, `&lt;→<`, `&gt;→>`, `&rsquo;→’`, `&eacute;→é`, `&hellip;→…`); `trim()`; colapsar espaços múltiplos |
| `name` → `nameLower` | `name.toLowerCase()` (usado em busca com regex ancorada e escapada) |
| `genre` → `genres` | `split(',')` → `trim()` em cada item → remover vazios → **deduplicar** → ordenar alfabeticamente. Vazio ⇒ `[]` |
| `type` → `type` | `trim()`; se vazio ou fora do enum ⇒ `'Unknown'` |
| `episodes` → `episodes` | `'Unknown'`, vazio ou não numérico ⇒ `null`; senão `Number(...)`; valores `<= 0` ⇒ `null` |
| `rating` → `rating` | vazio, `'Unknown'` ou `NaN` ⇒ `null`; senão `Number(...)` arredondado a 2 casas; fora de `[0,10]` ⇒ `null` |
| `members` → `members` | `Number(...)`; `NaN` ⇒ `0` |

Decisões de tratamento de ausência (**imputação**), usadas no vetor de features:
- `episodes === null` ⇒ valor normalizado `0` **e** flag `hasEpisodes = 0`.
- `rating === null` ⇒ valor normalizado igual à **mediana** das notas presentes (persistida em
  `feature_meta.numeric.rating.median`) **e** flag `hasRating = 0`.

As duas flags binárias entram no vetor para que a rede saiba distinguir "valor ausente
imputado" de "valor real", sem precisar descartar linhas.

### 10.3 Script `rebuildFeatureMeta.js`

Recalcula `feature_meta` e os campos `features` de todos os animes sem reimportar o CSV. Deve
ser usado quando a engenharia de features mudar. Após rodá-lo, **todos os modelos salvos são
invalidados** e devem ser apagados (`npm run models:clear`), pois `inputDim` pode ter mudado.

---

## 11. Preparação dos dados para o TensorFlow.js

### 11.1 Construção do vocabulário e dos parâmetros de normalização (`feature_meta`)

1. `genreVocab`: conjunto de todos os gêneros distintos presentes nos animes limpos, **ordenado
   alfabeticamente** (o dataset tem ~43 gêneros). A ordem alfabética garante reprodutibilidade.
2. `typeVocab`: `['TV','Movie','OVA','ONA','Special','Music','Unknown']` — ordem **fixa** e
   definida nesta SPEC (não derivada dos dados), para estabilidade.
3. `numeric.episodes`: `min` e `max` de `log1p(episodes)` entre os animes com `episodes != null`.
4. `numeric.rating`: `min`, `max` e `median` de `rating` entre os animes com `rating != null`.
5. `numeric.members`: `min` e `max` de `log1p(members)`.
6. As 5 posições finais do vetor são, **nesta ordem exata**: `episodesNorm`, `ratingNorm`,
   `membersNorm` (3 numéricas normalizadas) e `hasEpisodes`, `hasRating` (2 flags binárias).
   Portanto a fórmula obrigatória é:

> `inputDim = genreVocab.length + typeVocab.length + 5`

Com o dataset do Kaggle (`genreVocab.length == 43`, `typeVocab.length == 7`) o valor esperado é
`inputDim == 55`. O valor real deve vir sempre de `feature_meta`, nunca ser hardcoded.

### 11.2 Layout do vetor de features (`anime.features`)

Para cada anime, o vetor tem exatamente `inputDim` posições, nesta ordem:

```
[ 0 .. G-1 ]        multi-hot de gêneros     (1 se o anime tem o gênero i, senão 0)
[ G .. G+T-1 ]      one-hot de tipo          (1 na posição do type, senão 0)
[ G+T   ]           episodesNorm             minMax(log1p(episodes))        ∈ [0,1], 0 se ausente
[ G+T+1 ]           ratingNorm               minMax(rating | median)        ∈ [0,1]
[ G+T+2 ]           membersNorm              minMax(log1p(members))         ∈ [0,1]
[ G+T+3 ]           hasEpisodes              1 se episodes != null, senão 0
[ G+T+4 ]           hasRating                1 se rating   != null, senão 0
```
onde `G = genreVocab.length`, `T = typeVocab.length`.

Normalização min–max: `x_norm = (x - min) / (max - min)`, com resultado **clampado** em
`[0, 1]` (protege contra valores fora da faixa vista no treino) e `0` quando `max === min`.

Justificativa didática das escolhas (deve ser explicada no README):
- `log1p` em `episodes` e `members` porque ambas são distribuições de cauda muito longa
  (de 1 a 1.800 episódios; de 5 a 1.000.000+ membros). Sem log, 99% dos animes ficariam
  comprimidos próximos de 0.
- Multi-hot (não embedding) para gêneros: com ~43 gêneros e dezenas de exemplos de treino,
  embeddings causariam overfitting e dificultariam a interpretação.
- Todas as features em `[0, 1]`: estabiliza o treino com Adam e dispensa BatchNorm.

### 11.3 Montagem dos tensores de treino

Dado um usuário com `R` avaliações:

1. Buscar as `R` avaliações (`ratings`) do usuário.
2. Buscar os animes correspondentes (`animes.find({ animeId: { $in: [...] } })`), projetando
   `features`, `featureVersion`, `name`, `animeId`.
3. Descartar avaliações cujo anime não exista no catálogo ou cujo `featureVersion` seja
   diferente da versão ativa do `feature_meta` (e logar aviso recomendando `features:rebuild`).
4. `X = tf.tensor2d(featuresList, [N, inputDim], 'float32')`
5. `y = tf.tensor2d(scores.map(s => s / 10), [N, 1], 'float32')` — alvo normalizado em `[0,1]`
   para casar com a ativação `sigmoid` da camada de saída.
6. **Embaralhar** os pares (X, y) com semente fixa (`shuffleSeed = 42`) para reprodutibilidade;
   implementar como um shuffle de índices antes de criar os tensores.
7. Split de validação:
   - se `N >= 20`: separar 20% para validação (mínimo 4 exemplos);
   - se `N < 20`: **não** separar validação; `valSamples = 0`, `maeScore`/`rmseScore` calculados
     sobre o próprio conjunto de treino e marcados com a flag `metricsOnTrainSet: true`.
8. Liberar tensores com `tf.dispose()` / `tidy()` ao final (obrigatório — evita leak de memória
   no processo Node de longa duração).

### 11.4 Amostras negativas implícitas (OPCIONAL — extra didático)

Problema real que o projeto deve **documentar**: o usuário tende a avaliar só o que assistiu, e
tende a assistir o que já parece bom — o conjunto de treino fica enviesado para notas altas.

Mitigação opcional: sortear `min(N, 20)` animes **não avaliados** cujo `members` esteja no
quartil inferior e atribuir alvo fraco `0.30`, marcando-os como `isSyntheticNegative: true`.
Implementar **atrás da flag de ambiente** `USE_SYNTHETIC_NEGATIVES` (padrão `false`) e comparar
as recomendações com e sem a flag — essa comparação é um ótimo material de conclusão do estudo.

---

## 12. Sistema de recomendação

### 12.1 Estratégia

**Content-based filtering com regressão de nota.** O modelo aprende a função
`f(features_do_anime) → nota_prevista` a partir das notas do próprio usuário. Em inferência,
aplica-se `f` a todos os animes não avaliados e ordena-se por nota prevista.

Duas estratégias coexistem:

| Estratégia | Quando é usada | Como funciona |
|---|---|---|
| `neural-network` | `ratingsCount >= MIN_RATINGS_FOR_MODEL` **e** existe modelo salvo válido | MLP treinada (§12.2) |
| `cosine-similarity` | menos avaliações que o mínimo, **ou** nenhum modelo treinado ainda | perfil = média dos vetores de features ponderada por `(score - 5.5)`; ranking por similaridade de cosseno entre perfil e cada candidato |

O campo `strategy` na resposta da API sempre informa qual foi usada. Se o cliente passar
`?strategy=`, a escolha é forçada (OPCIONAL F8); se forçar `neural` sem modelo salvo, a API
responde **409** com instrução para treinar.

### 12.2 Arquitetura do modelo (`src/ml/model.js`)

```js
export function createModel(inputDim, learningRate) {
  const model = tf.sequential();
  model.add(tf.layers.dense({
    inputShape: [inputDim],
    units: 32,
    activation: 'relu',
    kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
  }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({
    units: 16,
    activation: 'relu',
    kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
  }));
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' })); // saída em [0,1]
  model.compile({
    optimizer: tf.train.adam(learningRate),
    loss: 'meanSquaredError',
    metrics: ['mae']
  });
  return model;
}
```

Hiperparâmetros (todos configuráveis por env var, com estes defaults):

| Parâmetro | Default | Env var |
|---|---|---|
| Unidades camada 1 | 32 | — (fixo) |
| Unidades camada 2 | 16 | — (fixo) |
| Dropout | 0.2 | — (fixo) |
| L2 | 0.01 | — (fixo) |
| Épocas | 120 | `TRAIN_EPOCHS` |
| Batch size | 8 | `TRAIN_BATCH_SIZE` |
| Learning rate | 0.01 | `TRAIN_LEARNING_RATE` |
| Early stopping | `patience: 15` sobre `val_loss` (só quando há validação) | — |

Rede pequena + L2 + dropout + early stopping porque o conjunto de treino é minúsculo
(5–200 exemplos). Essa justificativa deve constar no README como parte do aprendizado.

### 12.3 Processo de treino (`src/ml/trainer.js` + `services/trainingService.js`)

Disparado por `POST /api/recommendations/train`.

1. Validar que o usuário existe.
2. Contar avaliações; se `< MIN_RATINGS_FOR_MODEL`, lançar `AppError(422, ...)` com
   `{ required, current }` no corpo.
3. Montar `X`/`y` conforme §11.3 (via `trainingService`, que acessa Mongo).
4. Ler `feature_meta` ativo para obter `inputDim` e `version`.
5. `createModel(inputDim, TRAIN_LEARNING_RATE)`.
6. `await model.fit(X, y, { epochs, batchSize, validationData?, shuffle: true, callbacks: [earlyStopping], verbose: 0 })`.
7. Calcular métricas em **escala 1–10** sobre o conjunto de validação (ou de treino, se não
   houver validação):
   - `MAE = mean(|pred*10 - real|)`
   - `RMSE = sqrt(mean((pred*10 - real)^2))`
8. Salvar o modelo: `await model.save('file://' + MODELS_DIR + '/user_' + userId)`
   (gera `model.json` + `weights.bin`). Criar o diretório se não existir.
9. Criar documento em `training_runs` e atualizar `users.lastTrainedAt`.
10. `tf.dispose` de todos os tensores e `model.dispose()`.
11. Responder com o resumo do treino (§13.5).

Retreino simplesmente sobrescreve o modelo anterior. Não há versionamento de modelo em disco
(o histórico de métricas fica em `training_runs`).

### 12.4 Processo de inferência (`src/ml/recommender.js` + `services/recommendationService.js`)

Disparado por `GET /api/recommendations/:userId`.

1. Resolver estratégia (§12.1).
2. Carregar o modelo: `tf.loadLayersModel('file://' + MODELS_DIR + '/user_' + userId + '/model.json')`.
   - Manter um **cache em memória** `Map<userId, { model, loadedAt }>` no processo, invalidado
     quando um novo treino acontece. Evita reler o disco em cada request.
3. Selecionar candidatos no Mongo:
   ```js
   Anime.find({
     animeId: { $nin: animeIdsJaAvaliados },
     members: { $gte: RECOMMENDATION_MIN_MEMBERS },   // padrão 5000, corta obscuros/ruído
     featureVersion: versaoAtiva,
     features: { $ne: [] }
   }).select('animeId name genres type episodes rating members features')
   ```
4. Montar `tf.tensor2d(candidatos.features, [M, inputDim])` e chamar `model.predict(X)` em
   **um único batch**. Com ~12k candidatos e `inputDim ≈ 55`, isso leva poucos milissegundos.
5. `predictedScore = clamp(pred * 10, 1, 10)` arredondado a 2 casas.
6. Ordenar por `predictedScore` desc; desempate por `members` desc.
7. Aplicar `limit` (padrão 20, máximo 100).
8. Gerar `reason` (explicação) para cada item: interseção entre os gêneros do anime e os
   **3 gêneros de maior afinidade** do usuário (§12.5). Formato:
   `"Combina com seu gosto por Action e Thriller"`; se a interseção for vazia, usar
   `"Perfil semelhante aos animes que você avaliou bem"`.
9. Liberar tensores.
10. Responder com a lista + metadados do modelo.

### 12.5 Perfil de gosto (`GET /api/recommendations/:userId/profile`)

Cálculo (sem TensorFlow — é estatística simples e didática):

1. Para cada avaliação, peso `w = score - 5.5` (notas acima de 5.5 contam positivo, abaixo
   negativo).
2. Para cada gênero `g`, `affinity(g) = Σ w (avaliações cujo anime tem g) / Σ |w| (todas)`.
3. Normalizar as afinidades positivas para `[0, 1]` dividindo pela maior.
4. Retornar os 8 gêneros de maior afinidade, mais: `ratingsCount`, `averageScore`,
   `favoriteType` (tipo mais frequente entre avaliações com `score >= 7`).

### 12.6 Fallback de cosseno (`src/ml/cosine.js`)

```
profile[i] = Σ_j ( (score_j - 5.5) * features_j[i] ) / Σ_j |score_j - 5.5|
score(candidato) = cosine(profile, features_candidato)
predictedScore   = round( (cosine + 1) / 2 * 9 + 1, 2 )   // mapeia [-1,1] → [1,10]
```
Implementar em JavaScript puro (sem TF.js) — serve de **baseline** para comparar com a rede
neural, o que é parte do valor didático do projeto. Deve ter teste unitário.

---

## 13. API REST

- Base URL: `http://localhost:3000/api`
- Content-Type: `application/json; charset=utf-8`
- CORS: liberado apenas para `CORS_ORIGIN`
- Todos os `_id` do Mongo são serializados como string no campo `id`
- Validação de entrada com `zod` no middleware; erro de validação ⇒ **400**

### 13.0 Formato de erro (padrão único)

```json
{
  "error": {
    "message": "Usuário precisa de pelo menos 5 avaliações para treinar o modelo.",
    "code": "NOT_ENOUGH_RATINGS",
    "details": { "required": 5, "current": 2 }
  }
}
```

Códigos usados: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `NO_MODEL_TRAINED` (409),
`NOT_ENOUGH_RATINGS` (422), `DATASET_NOT_IMPORTED` (409), `INTERNAL_ERROR` (500).

### 13.1 Saúde e metadados

**`GET /api/health`** → 200
```json
{ "status": "ok", "mongo": "connected", "animeCount": 12294, "featureVersion": 1, "tfjs": "4.22.0" }
```

**`GET /api/genres`** → 200 — lista o `genreVocab` ativo
```json
{ "genres": ["Action", "Adventure", "Comedy", "..."] }
```

**`GET /api/meta/features`** → 200 — expõe o `feature_meta` ativo (útil para a aula/demonstração)
```json
{ "version": 1, "inputDim": 55, "genreCount": 43, "typeVocab": ["TV","Movie","OVA","ONA","Special","Music","Unknown"], "numeric": { "...": {} } }
```

### 13.2 Animes

**`GET /api/animes`**

| Query | Tipo | Default | Regras |
|---|---|---|---|
| `search` | string | — | mín. 1 char; busca em `nameLower` por substring (regex escapada) |
| `genres` | string CSV | — | `Action,Comedy` ⇒ `$all` |
| `type` | string | — | um dos valores do enum |
| `minRating` | number | — | `0..10` |
| `sort` | enum | `members` | `members` \| `rating` \| `name` |
| `order` | enum | `desc` | `asc` \| `desc` (`name` default `asc`) |
| `page` | int | `1` | `>= 1` |
| `limit` | int | `24` | `1..100` |
| `userId` | ObjectId | — | se enviado, cada item ganha `userScore` (nota do usuário ou `null`) |

Resposta 200:
```json
{
  "data": [
    { "id":"66f0...", "animeId":5114, "name":"Fullmetal Alchemist: Brotherhood",
      "genres":["Action","Adventure","Drama","Fantasy","Magic","Military","Shounen"],
      "type":"TV", "episodes":64, "rating":9.26, "members":793665, "userScore":9 }
  ],
  "pagination": { "page":1, "limit":24, "total":12294, "totalPages":513 }
}
```

**`GET /api/animes/:animeId`** → 200 com o objeto completo (incluindo `features` **apenas** se
`?includeFeatures=true`, para inspeção didática) · 404 `NOT_FOUND`.

### 13.3 Usuários

**`POST /api/users`** — body `{ "name": "Hiury" }` → 201 `{ "id":"...", "name":"Hiury", "ratingsCount":0, "lastTrainedAt":null }`
**`GET /api/users`** → 200 `{ "data": [ ... ] }` (ordenado por `createdAt` desc)
**`GET /api/users/:userId`** → 200 objeto do usuário · 404
**`DELETE /api/users/:userId`** → 204; remove em cascata as `ratings`, os `training_runs` e o
diretório de modelo do usuário.

### 13.4 Avaliações

**`GET /api/ratings?userId=<id>&limit=&page=`** → 200 — avaliações com o anime embutido:
```json
{
  "data": [
    { "id":"66f1...", "animeId":5114, "score":9,
      "anime": { "name":"Fullmetal Alchemist: Brotherhood", "type":"TV", "genres":["Action"], "rating":9.26 },
      "updatedAt":"2026-10-03T12:00:00.000Z" }
  ],
  "pagination": { "page":1, "limit":50, "total":12, "totalPages":1 }
}
```

**`PUT /api/ratings`** — **upsert** (cria ou atualiza)
```json
{ "userId": "66f0...", "animeId": 5114, "score": 9 }
```
→ 200 `{ "id":"...", "animeId":5114, "score":9, "created": false }`
Erros: 400 (score fora de 1–10 ou não inteiro), 404 (usuário ou anime inexistente).
Efeito colateral: recalcula `users.ratingsCount`.

> Decisão: usar **`PUT`** idempotente em vez de `POST` + `PATCH` separados. Simplifica o
> frontend, que só precisa de uma chamada ao mover a nota.

**`DELETE /api/ratings?userId=<id>&animeId=<n>`** → 204; recalcula `ratingsCount`.

### 13.5 Recomendações

**`POST /api/recommendations/train`** — body `{ "userId": "66f0..." }`
→ 200:
```json
{
  "userId": "66f0...",
  "trainedAt": "2026-10-03T12:34:56.000Z",
  "featureVersion": 1,
  "inputDim": 55,
  "samples": 24,
  "trainSamples": 20,
  "valSamples": 4,
  "epochs": 87,
  "epochsPlanned": 120,
  "earlyStopped": true,
  "finalLoss": 0.0121,
  "valLoss": 0.0184,
  "maeScore": 0.93,
  "rmseScore": 1.21,
  "metricsOnTrainSet": false,
  "durationMs": 1842,
  "modelPath": "/app/models/user_66f0..."
}
```
→ 422 `NOT_ENOUGH_RATINGS` quando há menos avaliações que o mínimo.
→ 409 `DATASET_NOT_IMPORTED` quando não há `feature_meta` ativo.

**`GET /api/recommendations/:userId?limit=20&strategy=`**
→ 200:
```json
{
  "strategy": "neural-network",
  "model": {
    "trainedAt": "2026-10-03T12:34:56.000Z",
    "samples": 24,
    "maeScore": 0.93,
    "rmseScore": 1.21,
    "stale": false
  },
  "candidatesEvaluated": 8231,
  "data": [
    { "animeId":9253, "name":"Steins;Gate", "type":"TV", "episodes":24,
      "genres":["Sci-Fi","Thriller"], "rating":9.17, "members":673572,
      "predictedScore":9.12,
      "reason":"Combina com seu gosto por Sci-Fi e Thriller" }
  ]
}
```
- `model.stale = true` quando existe alguma avaliação com `updatedAt > users.lastTrainedAt`.
- `model` é `null` quando `strategy === "cosine-similarity"`.
- 409 `NO_MODEL_TRAINED` se `strategy=neural` for forçada sem modelo salvo.

**`GET /api/recommendations/:userId/profile`** → 200:
```json
{
  "ratingsCount": 24,
  "averageScore": 7.8,
  "favoriteType": "TV",
  "topGenres": [
    { "genre":"Action", "affinity":1.00, "count":11 },
    { "genre":"Sci-Fi", "affinity":0.82, "count":6 }
  ]
}
```

**`DELETE /api/recommendations/:userId/model`** (OPCIONAL) → 204; apaga o modelo do disco e o
cache em memória. Útil para demonstrar o fallback de cold start.

---

## 14. Comunicação frontend ↔ backend

- Protocolo: HTTP/JSON, sem websockets, sem SSR.
- `frontend/src/api/http.js` cria a instância Axios:
  ```js
  const http = axios.create({
    baseURL: import.meta.env.VITE_API_URL, // http://localhost:3000/api
    timeout: 60000                          // treino pode levar alguns segundos
  });
  ```
- Interceptor de resposta converte `error.response.data.error` em uma `Error` com
  `message`, `code` e `details`, para as stores exibirem mensagens em português.
- O `userId` é enviado **explicitamente** em query string ou body (nunca em header de auth).
- O frontend persiste em `localStorage` apenas: `anime_rec_user_id` e `anime_rec_user_name`.
- Nenhuma chamada é feita pelo browser ao MongoDB; o banco não é exposto ao frontend.
- Debounce de **400 ms** na busca por nome (implementado no componente `SearchBar`).
- Estados obrigatórios em toda chamada: `loading`, `error`, `data` (padronizado nas stores).

---

## 15. Frontend — rotas, stores e componentes

### 15.1 Rotas (`src/router/index.js`)

| Path | Nome | View | Guard |
|---|---|---|---|
| `/` | `explore` | `ExploreView.vue` | — |
| `/my-ratings` | `my-ratings` | `MyRatingsView.vue` | exige usuário selecionado |
| `/recommendations` | `recommendations` | `RecommendationsView.vue` | exige usuário selecionado |
| `/anime/:animeId` | `anime-detail` | `AnimeDetailView.vue` | — |

Guard: se não houver `userId` no `userStore`, redireciona para `/` e sinaliza o
`UserSelector` para abrir.

### 15.2 Stores Pinia

**`userStore`** — `state: { users, currentUserId, currentUser, loading, error }`
Ações: `fetchUsers()`, `createUser(name)`, `selectUser(id)` (grava no `localStorage`),
`restoreFromStorage()`, `refreshCurrentUser()`.

**`animeStore`** — `state: { items, pagination, filters: { search, genres, type, sort, order, page, limit }, genres, loading, error }`
Ações: `fetchAnimes()`, `setFilter(patch)` (reseta `page` para 1 e refaz a busca),
`fetchGenres()`, `fetchAnimeById(animeId)`.

**`ratingStore`** — `state: { byAnimeId: {}, list, pagination, loading, error }`
Ações: `fetchRatings()`, `rate(animeId, score)` (update otimista + rollback em erro),
`removeRating(animeId)`. Getter `scoreFor(animeId)`.

**`recommendationStore`** — `state: { items, strategy, model, profile, training, loading, error }`
Ações: `train()`, `fetchRecommendations(limit)`, `fetchProfile()`.

### 15.3 Componentes principais (contratos)

| Componente | Props | Emits | Responsabilidade |
|---|---|---|---|
| `AppHeader` | — | — | título, navegação (`RouterLink`) e `UserSelector` |
| `UserSelector` | — | — | `<select>` de perfis + input para criar novo; chama `userStore` |
| `SearchBar` | `modelValue: string` | `update:modelValue` | input com debounce de 400 ms |
| `GenreFilter` | `genres: string[]`, `selected: string[]` | `update:selected` | lista de checkboxes com contador de selecionados |
| `AnimeCard` | `anime: object`, `userScore: number\|null` | `rate(animeId, score)`, `clear(animeId)` | card com nome, tipo, gêneros, nota da comunidade, `members` e `RatingStars` |
| `AnimeGrid` | `animes: array`, `scores: object` | repassa `rate`/`clear` | grid responsivo (CSS Grid, `minmax(260px, 1fr)`) |
| `RatingStars` | `modelValue: number\|null`, `max: 10` | `update:modelValue`, `clear` | 10 botões clicáveis com hover; acessível por teclado (`role="radiogroup"`) |
| `RecommendationCard` | `item: object` | — | igual ao `AnimeCard` + badge de `predictedScore` + texto `reason` |
| `TrainingPanel` | `model: object\|null`, `ratingsCount: number`, `training: boolean` | `train` | botão "Treinar modelo", métricas (MAE/RMSE/amostras/data) e aviso de modelo desatualizado |
| `TasteProfile` | `profile: object` | — | lista de `topGenres` com barra proporcional à `affinity` |
| `Pagination` | `page`, `totalPages` | `change(page)` | anterior/próximo + indicador |
| `EmptyState` | `title`, `message` | — | estado vazio reutilizável |
| `LoadingSpinner` | `label?` | — | indicador de carregamento |

### 15.4 Conteúdo de cada view

- **`ExploreView`** — `SearchBar` + `GenreFilter` + seletor de tipo/ordenação + `AnimeGrid` +
  `Pagination`. Ao avaliar um card, chama `ratingStore.rate()`.
- **`MyRatingsView`** — lista das avaliações do usuário (ordenável por nota ou data), permite
  alterar/remover nota; mostra contador e progresso até `MIN_RATINGS_FOR_MODEL`
  ("3 de 5 avaliações para liberar o treino").
- **`RecommendationsView`** — `TrainingPanel` + `TasteProfile` + lista de
  `RecommendationCard` + badge da estratégia usada. Botão "Atualizar recomendações".
- **`AnimeDetailView`** — dados completos do anime, `RatingStars` e (OPCIONAL) visualização do
  vetor de features via `?includeFeatures=true`, excelente para a demonstração acadêmica.

---

## 16. Fluxo completo da aplicação

```
┌─ 1. SETUP (uma vez) ─────────────────────────────────────────────────────────┐
│ Kaggle: baixar anime.csv  →  copiar para ./data/anime.csv                    │
│ docker compose up -d --build                                                 │
│ docker compose run --rm backend npm run import                               │
│   ├─ lê CSV em stream                                                        │
│   ├─ limpa/normaliza cada linha            (§10.2)                           │
│   ├─ calcula feature_meta (vocabs + min/max/median)   (§11.1)                │
│   ├─ calcula o vetor features de cada anime           (§11.2)                │
│   └─ grava em MongoDB: animes + feature_meta                                 │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
┌─ 2. USO ─────────────────────────▼───────────────────────────────────────────┐
│ Vue: usuário cria/seleciona perfil        → POST/GET /api/users              │
│ Vue: explora catálogo, busca, filtra      → GET  /api/animes                 │
│ Vue: dá nota 1–10 nos animes assistidos   → PUT  /api/ratings  (upsert)      │
│      MongoDB: ratings + users.ratingsCount                                   │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │  (>= 5 avaliações)
┌─ 3. TREINO ──────────────────────▼───────────────────────────────────────────┐
│ Vue: "Treinar modelo"  → POST /api/recommendations/train                     │
│   ├─ trainingService: busca ratings + features dos animes avaliados          │
│   ├─ monta X [N × inputDim] e y [N × 1] (score/10), embaralha, split 80/20   │
│   ├─ ml/model: MLP 32→dropout→16→1 (sigmoid), Adam, MSE                      │
│   ├─ ml/trainer: model.fit(..., earlyStopping) → MAE/RMSE em escala 1–10     │
│   ├─ salva em /app/models/user_<id>/ (model.json + weights.bin)              │
│   └─ grava training_runs + users.lastTrainedAt                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
┌─ 4. INFERÊNCIA ──────────────────▼───────────────────────────────────────────┐
│ Vue: abre Recomendações → GET /api/recommendations/:userId                    │
│   ├─ carrega modelo do disco (ou do cache em memória)                        │
│   ├─ candidatos = animes não avaliados, members >= 5000, featureVersion ok    │
│   ├─ model.predict(X_candidatos) em um único batch                           │
│   ├─ predictedScore = pred × 10, ordena desc, aplica limit                   │
│   ├─ gera reason a partir dos top gêneros do perfil                          │
│   └─ (sem modelo / poucas notas) → fallback cosine-similarity                │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
┌─ 5. EXIBIÇÃO ────────────────────▼───────────────────────────────────────────┐
│ Vue: RecommendationCard com nome, gêneros, nota prevista e explicação        │
│      TasteProfile com os gêneros favoritos                                   │
│      TrainingPanel com MAE/RMSE, nº de amostras e data do treino            │
│ Usuário avalia mais animes → modelo marcado como "desatualizado" → retreina  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 17. Requisitos funcionais

| ID | Requisito | Prioridade |
|---|---|---|
| RF01 | Importar `anime.csv` do Kaggle para a coleção `animes`, de forma idempotente | Obrigatório |
| RF02 | Normalizar nome, gêneros, tipo, episódios, nota e membros conforme §10.2 | Obrigatório |
| RF03 | Calcular e persistir `feature_meta` e o vetor `features` de cada anime | Obrigatório |
| RF04 | Listar animes com busca, filtro por gêneros e tipo, ordenação e paginação | Obrigatório |
| RF05 | Exibir detalhe de um anime | Obrigatório |
| RF06 | Criar, listar, selecionar e remover perfis de usuário | Obrigatório |
| RF07 | Criar/atualizar (upsert) e remover avaliação de 1 a 10 | Obrigatório |
| RF08 | Listar as avaliações do usuário com dados do anime | Obrigatório |
| RF09 | Bloquear treino com menos de `MIN_RATINGS_FOR_MODEL` avaliações, com mensagem clara | Obrigatório |
| RF10 | Treinar modelo por usuário com TensorFlow.js e salvar em disco | Obrigatório |
| RF11 | Registrar histórico de treinos em `training_runs` com MAE e RMSE | Obrigatório |
| RF12 | Gerar recomendações ordenadas por nota prevista, excluindo animes já avaliados | Obrigatório |
| RF13 | Fornecer fallback por similaridade de cosseno quando não houver modelo | Obrigatório |
| RF14 | Indicar na resposta e na UI qual estratégia foi usada | Obrigatório |
| RF15 | Exibir explicação ("por quê") em cada recomendação | Obrigatório |
| RF16 | Expor e exibir o perfil de gosto (top gêneros, média, tipo favorito) | Obrigatório |
| RF17 | Sinalizar modelo desatualizado quando houver avaliações após o último treino | Obrigatório |
| RF18 | Expor `GET /api/health` com status do banco e contagem de animes | Obrigatório |
| RF19 | Permitir forçar a estratégia via `?strategy=` para comparação | Opcional |
| RF20 | Expor o vetor de features de um anime para inspeção didática | Opcional |
| RF21 | Suportar amostras negativas sintéticas atrás de flag de ambiente | Opcional |

## 18. Requisitos não funcionais

| ID | Requisito | Critério mensurável |
|---|---|---|
| RNF01 | Ambiente 100% containerizado | `docker compose up -d --build` sobe tudo sem passo manual fora do download do CSV |
| RNF02 | Setup reproduzível | README permite ir de zero a recomendações em ≤ 10 minutos |
| RNF03 | Performance da importação | 12.294 linhas importadas em ≤ 60 s |
| RNF04 | Performance do treino | ≤ 10 s para até 200 avaliações |
| RNF05 | Performance da inferência | `GET /api/recommendations` em ≤ 1,5 s para ~12k candidatos |
| RNF06 | Performance do catálogo | `GET /api/animes` em ≤ 300 ms (com os índices de §9.1) |
| RNF07 | Sem vazamento de memória | Todo tensor criado é liberado (`tf.tidy`/`dispose`); processo estável após 50 treinos |
| RNF08 | Persistência | Dados e modelos sobrevivem a `docker compose down` (volumes nomeados) |
| RNF09 | Clareza do código | Camadas respeitadas; funções ≤ 50 linhas; nomes em inglês; comentários explicativos nos arquivos de `src/ml` |
| RNF10 | Mensagens de erro úteis | Toda falha de API retorna o formato de §13.0 com `code` e mensagem em português |
| RNF11 | Hot reload | Alterar arquivo no host reflete no container sem rebuild (backend via `node --watch`, frontend via Vite HMR) |
| RNF12 | Determinismo | Com a mesma base e as mesmas avaliações, a importação e o `feature_meta` são idênticos; o treino usa `shuffleSeed` fixo |
| RNF13 | Documentação didática | README explica, em português, a engenharia de features, a arquitetura da rede e a interpretação das métricas |
| RNF14 | Testes mínimos | Testes unitários (node:test) para `ml/features.js` e `ml/cosine.js`, executáveis com `docker compose run --rm backend npm test` |
| RNF15 | Compatibilidade | Funciona em Linux, macOS e Windows/WSL2 com Docker Desktop |
| RNF16 | Segurança básica | Sem credenciais no repositório; `.env` ignorado pelo git; MongoDB sem autenticação apenas porque é ambiente local de estudo (documentar essa limitação no README) |

---

## 19. Configuração do ambiente de desenvolvimento

### 19.1 Pré-requisitos

- Docker Engine 24+ e Docker Compose v2
- Git
- Conta no Kaggle (para baixar o dataset)
- (Opcional, para rodar fora do Docker) Node.js 20+

### 19.2 Passo a passo (deve constar no README)

```bash
# 1. clonar
git clone <repo> && cd anime-recommendation-engine

# 2. variáveis de ambiente
cp .env.example .env

# 3. dataset: baixar anime.csv do Kaggle e colocar em ./data/anime.csv
#    https://www.kaggle.com/datasets/CooperUnion/anime-recommendations-database

# 4. subir o ambiente
docker compose up -d --build

# 5. verificar
curl http://localhost:3000/api/health

# 6. importar o dataset
docker compose run --rm backend npm run import

# 7. abrir o frontend
#    http://localhost:5173
```

### 19.3 Roteiro de validação manual (smoke test)

1. `GET /api/health` → `animeCount > 12000` e `featureVersion >= 1`.
2. Criar perfil "Teste" na UI.
3. Avaliar 6 animes de gêneros parecidos (ex.: shounen de ação) com notas 8–10.
4. Clicar "Treinar modelo" → painel mostra `samples: 6`, MAE e data do treino.
5. Abrir recomendações → `strategy: "neural-network"` e a lista deve ser dominada por animes
   dos mesmos gêneros avaliados positivamente.
6. Avaliar mais 1 anime → painel exibe "modelo desatualizado".
7. `DELETE /api/recommendations/:userId/model` (ou novo usuário com 2 notas) →
   `strategy: "cosine-similarity"`.
8. `docker compose down && docker compose up -d` → dados e modelo continuam disponíveis.

---

## 20. Variáveis de ambiente

### 20.1 `.env` da raiz (consumido pelo `docker-compose.yml`)

| Variável | Default | Descrição |
|---|---|---|
| `MONGO_DB` | `anime_recommender` | nome do banco |
| `BACKEND_PORT` | `3000` | porta publicada do backend no host |
| `FRONTEND_PORT` | `5173` | porta publicada do frontend no host |
| `CORS_ORIGIN` | `http://localhost:5173` | origem permitida pelo CORS |
| `VITE_API_URL` | `http://localhost:3000/api` | URL da API usada pelo browser |
| `MIN_RATINGS_FOR_MODEL` | `5` | mínimo de avaliações para treinar |
| `TRAIN_EPOCHS` | `120` | épocas do treino |
| `TRAIN_BATCH_SIZE` | `8` | tamanho do batch |
| `TRAIN_LEARNING_RATE` | `0.01` | learning rate do Adam |
| `RECOMMENDATION_MIN_MEMBERS` | `5000` | corte de popularidade para candidatos |
| `USE_SYNTHETIC_NEGATIVES` | `false` | habilita §11.4 (opcional) |

### 20.2 Variáveis do container `backend`

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `NODE_ENV` | não | `development` | ambiente |
| `PORT` | não | `3000` | porta do Express |
| `MONGO_URI` | **sim** | — | `mongodb://mongo:27017/anime_recommender` |
| `CORS_ORIGIN` | não | `http://localhost:5173` | origem liberada |
| `DATASET_PATH` | não | `/app/data/anime.csv` | caminho do CSV dentro do container |
| `MODELS_DIR` | não | `/app/models` | diretório dos modelos salvos |
| `MIN_RATINGS_FOR_MODEL` | não | `5` | mínimo para treinar |
| `TRAIN_EPOCHS` | não | `120` | épocas |
| `TRAIN_BATCH_SIZE` | não | `8` | batch |
| `TRAIN_LEARNING_RATE` | não | `0.01` | learning rate |
| `RECOMMENDATION_MIN_MEMBERS` | não | `5000` | corte de popularidade |
| `USE_SYNTHETIC_NEGATIVES` | não | `false` | flag opcional |
| `LOG_LEVEL` | não | `info` | `debug` \| `info` \| `warn` \| `error` |

`config/env.js` valida tudo com `zod` e **encerra o processo** com mensagem clara se
`MONGO_URI` faltar ou se algum número for inválido.

### 20.3 Variáveis do container `frontend`

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `VITE_API_URL` | **sim** | `http://localhost:3000/api` | base da API (avaliada no build/dev do Vite) |

Atenção: `VITE_API_URL` é lida pelo **browser**, portanto deve apontar para `localhost` (host),
não para `backend` (hostname interno do Docker).

---

## 21. Critérios de conclusão (Definition of Done)

O projeto só é considerado concluído quando **todos** os itens abaixo estiverem verificados.

### Infraestrutura
- [ ] `docker compose up -d --build` sobe `mongo`, `backend` e `frontend` sem erro.
- [ ] `docker compose down && docker compose up -d` preserva animes, avaliações e modelos.
- [ ] Hot reload funciona no backend e no frontend.
- [ ] `.env.example` presente e `.env` ignorado pelo git.

### Dados
- [ ] `npm run import` importa > 12.000 animes e imprime relatório com descartes.
- [ ] Rodar o import duas vezes não duplica registros (idempotência).
- [ ] Todo documento em `animes` tem `features.length === feature_meta.inputDim`.
- [ ] Nenhum `features` contém `NaN`, `null` ou valor fora de `[0, 1]`.
- [ ] `feature_meta` ativo existe, com `genreVocab` ordenado e `typeVocab` na ordem da SPEC.

### Machine Learning
- [ ] Treino com 5 avaliações conclui em menos de 10 s e salva `model.json` + `weights.bin`.
- [ ] `training_runs` registra `samples`, `finalLoss`, `maeScore`, `rmseScore`, `durationMs`.
- [ ] Modelo salvo é recarregado do disco após restart do container e gera predições.
- [ ] As predições ficam na faixa `[1, 10]`.
- [ ] Teste de sanidade: usuário que avalia 8–10 só animes de "Action/Shounen" recebe
      recomendações majoritariamente desses gêneros.
- [ ] Fallback de cosseno funciona com 1–4 avaliações e a resposta informa a estratégia.
- [ ] Nenhum vazamento de tensores (`tf.memory().numTensors` estável após 10 treinos seguidos).

### API
- [ ] Todos os endpoints obrigatórios de §13 implementados com os contratos exatos.
- [ ] Erros seguem o formato de §13.0 com `code` correto.
- [ ] Validação rejeita `score` fora de 1–10, `score` não inteiro e `userId` inválido.
- [ ] `GET /api/health` reporta `mongo: "connected"` e a contagem real de animes.

### Frontend
- [ ] As 4 views implementadas e navegáveis.
- [ ] Criar e trocar de perfil funciona; seleção persiste após recarregar a página.
- [ ] Busca com debounce, filtro por gênero/tipo, ordenação e paginação funcionam.
- [ ] Avaliar, alterar e remover nota refletem imediatamente na UI.
- [ ] Tela de recomendações mostra nota prevista, explicação, estratégia, perfil de gosto e
      métricas do modelo.
- [ ] Aviso de "modelo desatualizado" aparece após nova avaliação.
- [ ] Estados de loading, erro e vazio tratados em todas as telas.
- [ ] Layout utilizável em 1366×768 e em largura de celular (~400 px).

### Qualidade e documentação
- [ ] `npm test` passa (testes de `features.js` e `cosine.js`).
- [ ] Camadas respeitadas: nenhum controller importa Mongoose; nenhum arquivo de `ml/` importa
      Mongoose; nenhuma view importa Axios diretamente.
- [ ] README em português cobre: objetivo, stack, como rodar, como baixar o dataset, explicação
      da engenharia de features, da arquitetura da rede, das métricas e das limitações conhecidas.
- [ ] Limitações documentadas explicitamente: content-based sofre de "bolha de filtro"; a base
      de treino é pequena e enviesada para notas altas; não há filtragem colaborativa; MongoDB
      roda sem autenticação por ser ambiente local.

---

## 22. Riscos conhecidos e mitigações

| Risco | Impacto | Mitigação definida nesta SPEC |
|---|---|---|
| `@tensorflow/tfjs-node` falha ao compilar em Alpine | Backend não sobe | Imagem `node:20-bookworm` + `python3 make g++` (§6.2) |
| `node_modules` do host sobrescreve o do container via bind mount | Binário nativo incompatível | Volume nomeado `backend_node_modules` (§6.1) |
| Overfitting com poucas avaliações | Recomendações sem sentido | Rede pequena, L2, dropout, early stopping (§12.2) e MAE/RMSE exibidos |
| Viés de notas altas no conjunto de treino | Modelo prevê nota alta para quase tudo | Documentar; flag opcional de negativos sintéticos (§11.4); baseline de cosseno para comparação |
| `feature_meta` mudar sem recomputar `features` | Erro de dimensão na inferência | `featureVersion` em cada anime + validação no treino/inferência + `features:rebuild` (§10.3) |
| Animes obscuros dominando o ranking | Recomendações irrelevantes | `RECOMMENDATION_MIN_MEMBERS` (padrão 5000) |
| CSV ausente ao rodar o import | Falha confusa | Mensagem explícita com link do Kaggle e código `DATASET_NOT_IMPORTED` |
| Vazamento de memória em treinos repetidos | Backend cai | `tf.tidy`/`dispose` obrigatórios + item de DoD verificando `tf.memory()` |

---

## 23. Ordem de implementação sugerida

Sequência recomendada para o agente implementador (cada etapa deve ficar funcional antes da
próxima):

1. Scaffold do repositório, `.gitignore`, `.env.example`, `docker-compose.yml`, Dockerfiles.
2. Backend mínimo: `config/env.js`, `config/database.js`, `app.js`, `server.js`,
   `GET /api/health`.
3. Models Mongoose (`Anime`, `User`, `Rating`, `FeatureMeta`, `TrainingRun`).
4. `ml/features.js` + testes unitários.
5. `scripts/importDataset.js` + `scripts/rebuildFeatureMeta.js`; rodar e validar no banco.
6. Endpoints de animes, gêneros e meta de features.
7. Endpoints de usuários e avaliações.
8. `ml/cosine.js` + testes + `GET /api/recommendations/:userId` (apenas fallback).
9. `ml/model.js`, `ml/trainer.js`, `POST /api/recommendations/train`.
10. `ml/recommender.js` + estratégia neural na rota de recomendações + cache de modelo.
11. `GET /api/recommendations/:userId/profile`.
12. Frontend: scaffold Vite, `http.js`, router, `App.vue`, `AppHeader`, `UserSelector`.
13. `ExploreView` + `AnimeGrid`/`AnimeCard`/`RatingStars`/`SearchBar`/`GenreFilter`/`Pagination`.
14. `MyRatingsView`.
15. `RecommendationsView` + `TrainingPanel` + `TasteProfile` + `RecommendationCard`.
16. `AnimeDetailView`.
17. README didático completo.
18. Passar o roteiro de validação de §19.3 e o checklist de §21.
19. Itens OPCIONAIS, se houver tempo.
