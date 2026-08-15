# Gestor de tarefas — PRD de reconstrução

**Documento de requisitos para reconstruir o sistema do zero · 15 de agosto de 2026**

Companheiros deste documento:
- [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) — a linguagem visual, os tokens e os componentes. **Normativo.**
- [`PRD.md`](./PRD.md) — a v1, o corte de 40 minutos do build ao vivo (histórico)
- [`PRD-v2.md`](./PRD-v2.md) — o argumento de produto, a tese "a regra muda de casa" (histórico)

---

## Parte 0 · Como usar este documento

Os PRDs anteriores contam **por que** o sistema existe e **como ele nasceu**. Este conta
**o que precisa estar de pé no fim** — com regras numeradas, esquema de banco, contrato de
API e critérios de aceite verificáveis.

É escrito para ser entregue a alguém — pessoa ou agente — que **não viu o código atual** e
precisa reconstruir o sistema inteiro. Toda decisão que parece arbitrária tem o motivo
escrito ao lado, porque decisão sem motivo é a primeira a ser "simplificada" na
reconstrução, e várias delas custaram um bug para serem descobertas.

**Como ler as marcações:**

| Marca | Significado |
|---|---|
| **RN-xx** | Regra de negócio. Tem teste automatizado obrigatório. |
| **RT-xx** | Requisito técnico. Não é negociável na reconstrução. |
| **H-xx** | História de usuário, com critérios de aceite. |
| ⚠️ | Armadilha encontrada rodando o sistema de verdade. Ver Parte 16. |

**Duas frases que decidem tudo o que vem abaixo:**

> **Registrar custa uma frase.** Se registrar voltar a custar um formulário, o sistema
> morre — todos os outros recursos dependem de a base estar cheia.

> **Sem IA, o sistema inteiro continua funcionando.** A IA acrescenta prioridade,
> dependência e ordem do dia. Ela nunca é caminho crítico para guardar, listar ou concluir.

---

## Parte 1 · O produto em uma página

### O que é

Um gerenciador de tarefas **pessoal, de um usuário só**, que roda na máquina do dono, e que
**o agente de IA dele sabe operar** pela mesma API que o painel usa.

Cards num quadro, projetos com pipeline próprio, tags livres, e uma camada de IA que
prioriza contra o contexto que o **usuário** escreveu, acha dependências entre tarefas e
avisa o que cada conclusão destravou.

### O problema

Um gerenciador comum assume que a dificuldade está em **lembrar**. Para boa parte das
pessoas a dificuldade está em **escolher** e em **começar**.

- Vinte itens abertos, todos "média" — a lista não diz por onde começar.
- Coisas dependem de coisas, e isso não está escrito em lugar nenhum. Você descobre que
  estava travado no dia em que já era tarde.
- Concluir não devolve nada. Some da lista, e pronto.
- A ordem do dia é montada na base do humor — cinco trocas de contexto num dia que poderia
  ter tido duas.

**O sistema existe para responder uma pergunta, várias vezes por dia: *e agora?***

### Para quem

Duas pessoas, e as duas ganham coisas diferentes:

| | Ganha |
|---|---|
| **Quem trava para decidir** (TDAH, sobrecarga) | O modo "e agora?", o teto de três, o aviso de desbloqueio, atraso sem vermelho |
| **Quem já é muito produtivo** | Dependência explícita (não descobre bloqueio tarde) e encadeamento (troca menos de contexto) |

### Os sete princípios inegociáveis

1. **Registrar custa uma frase.** Título é o único campo obrigatório em qualquer entrada.
2. **Sem IA o sistema funciona.** Degradação silenciosa: os botões de IA somem, o resto fica.
3. **A IA sugere; o usuário decide.** Prioridade posta à mão nunca é sobrescrita.
   Dependência sugerida não trava nada.
4. **Uma API só.** O painel e o agente consomem exatamente as mesmas rotas. Não existe
   endpoint "só para o agente" — se existisse, um dos dois ficaria desatualizado.
5. **Regra de negócio mora num módulo só.** API, CLI, Telegram e rotinas de IA chamam de lá.
6. **O sistema não mede produtividade.** Nada de relatório, gráfico ou métrica de
   desempenho pessoal. Um sistema que mede o quanto você produziu produz culpa, e culpa é o
   que trava as pessoas que ele quer ajudar.
7. **A tranca é opcional por construção.** Clone limpo sem `.env` sobe aberto e ouvindo só
   em `127.0.0.1`. A tranca acende quando existe credencial configurada.

---

## Parte 2 · O escopo

### Vai ter

**Organização**
- Cards num quadro visual, arrastáveis entre colunas
- Projetos, com um projeto padrão `Dia a dia` criado sozinho
- Pipeline próprio por projeto (as colunas do quadro)
- Tags livres, várias por card, atravessando projetos
- Contexto por projeto — texto livre que alimenta a IA

**Inteligência** (quatro rotinas em lote + uma porta de entrada)
- Priorização automática contra o contexto do projeto
- Priorização **sugerida** quando o projeto não tem contexto
- Detecção de dependência entre cards, como sugestão a confirmar
- Aviso de desbloqueio ao concluir — **sem IA nenhuma**, é consulta ao banco
- Ordem do dia (encadeamento por contexto de execução)
- Sugestão de quebra para cards parados
- Interpretação de frase solta no Telegram: pergunta ou anotação?

**Operação**
- Registrar por frase · concluir · adiar · listar · filtrar · mover
- Modo "e agora?" — **uma** tarefa na tela, com o porquê e três botões
- Telegram como entrada e saída, com allowlist e pareamento por código
- Todas as operações acessíveis ao agente pela mesma API
- Chaves de API criadas no painel, uma por agente, com papel e escopo de IA
- **A API documentada em OpenAPI 3.1, com página de leitura** (Parte 8)

### Não vai ter

Nada aqui é esquecimento — é escopo, e cada linha tem motivo.

| Fora | Por quê |
|---|---|
| Cadastro de usuário, "esqueci minha senha", segundo usuário | É uma fechadura, não uma portaria. Um usuário só. |
| Colaboração, comentários, menções, atribuir tarefa a outra pessoa | Muda o produto inteiro |
| Anexos e arquivos dentro do card | Muda o modelo de armazenamento inteiro |
| Relatórios de produtividade, gráficos, métricas de desempenho | Produzem culpa. Princípio 6. |
| Aplicativo de celular próprio | O celular entra pelo Telegram — é o argumento de não construir app |
| Integração com calendário ou e-mail | É trabalho do agente, não da aplicação |
| Cobrança, planos, multi-tenant | Fora da tese |

### A linha divisória: aplicação × agente

Esta tabela é a tese do produto, e ela decide o que entra no código.

| **APLICAÇÃO** — recorrente, previsível, agendado | **AGENTE** — esporádico, sempre diferente |
|---|---|
| Guardar, listar, filtrar, mover card | Entender pedido torto em português |
| Manter projetos, pipelines e tags | Conversar sobre o que está travado, e por quê |
| Priorizar em lote contra o contexto | Analisar um período: *"por que o projeto X não andou?"* |
| Detectar dependência em lote | Cruzar o sistema com o que **não** está nele |
| Avisar desbloqueio | Ajudar a escrever o contexto de um projeto novo |
| Montar a ordem do dia | Casos não previstos — que são a maioria |
| Mandar o resumo na hora marcada | |

**Em uma frase:** se você consegue escrever o passo a passo, é aplicação; se toda vez é
diferente, é agente.

---

## Parte 3 · Arquitetura e stack

### RT-01 · A stack é obrigatória

| Camada | Escolha | Por que essa |
|---|---|---|
| Runtime | **Node.js ≥ 22.5**, ESM (`"type": "module"`) | `node:sqlite` embutido |
| Banco | **SQLite via `node:sqlite`** (`DatabaseSync`) | Sem módulo nativo para compilar — é o que costuma falhar no Windows sem build tools |
| HTTP | **Express 5** | Um processo, uma porta |
| Painel | **React 19 + Vite 7** | — |
| Estilo | **Tailwind CSS 4** (`@theme`), sem config JS | Ver [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) |
| Drag & drop | **`@dnd-kit/core`** | Acessível, e a distância de ativação resolve o clique-vira-arrasto |
| IA | **`@anthropic-ai/sdk`**, modelo padrão `claude-sonnet-5` | Saída estruturada por *tool use* |
| Doc da API | **OpenAPI 3.1 gerado em módulo + `@scalar/express-api-reference`** | Parte 8 |
| Testes | **`node --test`** nativo | Zero dependência de teste |

**Sem dependência de nuvem, sem conta, sem serviço externo obrigatório.** As únicas chamadas
de rede que o sistema faz são para a API da Anthropic e para a API do Telegram — e as duas
são opcionais.

### RT-02 · Um processo, uma porta

`npm start` compila o painel e sobe o servidor. O mesmo Express serve:

- `/api/*` — a API (painel e agente)
- `/docs` e `/openapi.json` — a documentação
- tudo o mais — o painel compilado (`dist/`), com rota curinga devolvendo `index.html`

⚠️ **A ordem do middleware não é estética:**

```
express.json({ limit: '100kb' })
  ↓
porteiro          ← ANTES dos arquivos estáticos, senão o painel inteiro é servido a quem não entrou
  ↓
limitarTaxa
  ↓
/api → permissoes → rotas
  ↓
documentacao      ← ANTES do curinga do painel, senão o curinga engole /docs
  ↓
express.static(dist) + curinga /^(?!\/api).*/
  ↓
tratarErros
```

### RT-03 · A organização dos arquivos

```
gestor-tarefas/
├── server/
│   ├── db.js            ← banco, migrações, constantes compartilhadas, ErroDeRegra
│   ├── regras.js        ← TODAS as regras de negócio moram aqui
│   ├── rotas.js         ← a API HTTP: traduz HTTP → regras.js, sem regra própria
│   ├── openapi.js       ← o contrato, em OpenAPI 3.1, gerado a partir de db.js/chaves.js
│   ├── documentacao.js  ← serve /openapi.json e a página /docs
│   ├── auth.js          ← porteiro, permissões, limite de taxa
│   ├── chaves.js        ← as chaves de API criadas no painel
│   ├── ia.js            ← as rotinas de IA, em lote
│   ├── telegram.js      ← allowlist, pareamento, comandos
│   ├── escutar.js       ← o processo separado de long polling
│   ├── resumo.js        ← o resumo diário no Telegram
│   ├── analisar.js      ← a rotina de madrugada
│   ├── env.js           ← leitura do .env sem dependência
│   └── index.js         ← o servidor
├── src/                 ← o painel (React)
│   ├── index.css        ← O DESIGN SYSTEM — ver DESIGN-SYSTEM.md
│   ├── fontes.css       ← @font-face das fontes locais
│   ├── fontes/          ← .woff2 locais (NÃO vêm de CDN)
│   ├── api.js           ← o cliente HTTP do painel
│   ├── App.jsx
│   └── componentes/
├── cli/
│   ├── tarefas.js       ← a linha de comando do agente
│   ├── chave.js         ← gera uma chave forte
│   └── demo.js          ← remonta o quadro de demonstração
├── testes/              ← as regras, escritas como teste
└── tarefas.db           ← os dados (criado na primeira execução)
```

**RT-04 · A regra de ouro:** regra de negócio só existe em `server/regras.js`. A API, a CLI,
o Telegram e as rotinas de IA chamam de lá. Se uma regra fosse reescrita na tela, painel e
agente passariam a discordar sobre o que o sistema faz.

### RT-05 · Data e hora sempre no fuso local

⚠️ `toISOString()` converte para UTC. No Brasil isso faz "hoje" virar amanhã depois das 21h:
um card criado às 22h nasceria com a data do dia seguinte e sumiria da lista de hoje. Num
gestor de tarefas isso não é detalhe.

Formatos gravados no banco:
- data: `YYYY-MM-DD` (local)
- data e hora: `YYYY-MM-DDTHH:MM:SS` (local, sem `Z`, sem offset)

---

## Parte 4 · O modelo de dados

### RT-06 · O esquema é versionado por `PRAGMA user_version`, e cada versão é migração

Nenhuma versão recria tabela. Quem tem um banco da v1 aponta o sistema novo para ele e os
dados continuam lá, com as colunas novas ao lado. A migração roda sozinha na primeira
conexão, antes de a primeira requisição ser aceita.

| Versão | O que acrescenta |
|---|---|
| 1 | `tarefas` (o card da v1) |
| 2 | `projetos`, `etapas`, `tags`, `card_tags`, `dependencias` + colunas novas em `tarefas` |
| 3 | `chaves` + coluna `origem` em `tarefas` |
| 4 | `telegram_chats`, `pareamentos`, `config` |

Ligar sempre, na abertura da conexão: `PRAGMA foreign_keys = ON` e `PRAGMA journal_mode = WAL`.

### O esquema completo

```sql
-- v1 -----------------------------------------------------------------------
CREATE TABLE tarefas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo     TEXT NOT NULL,
  tipo       TEXT NOT NULL DEFAULT 'tarefa',   -- tarefa | ideia
  data       TEXT NOT NULL,                    -- YYYY-MM-DD local
  status     TEXT NOT NULL DEFAULT 'aberta',   -- aberta | feita (DERIVADO da etapa)
  tema       TEXT,                             -- resquício da v1; substituído por tags
  prioridade TEXT NOT NULL DEFAULT 'media',    -- alta | media | baixa
  criado_em  TEXT NOT NULL
);

-- v2: colunas acrescentadas em `tarefas` via ALTER TABLE ---------------------
--   descricao            TEXT
--   projeto_id           INTEGER REFERENCES projetos(id)
--   etapa_id             INTEGER REFERENCES etapas(id)
--   prioridade_origem    TEXT NOT NULL DEFAULT 'ia'    -- usuario | ia
--   prioridade_sugerida  INTEGER NOT NULL DEFAULT 0
--   justificativa        TEXT
--   hoje                 INTEGER NOT NULL DEFAULT 0    -- "hoje de verdade"
--   movido_em            TEXT
-- v3: origem              TEXT                          -- qual chave registrou

CREATE TABLE projetos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL UNIQUE,
  contexto  TEXT,
  arquivado INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);

CREATE TABLE etapas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  posicao    INTEGER NOT NULL,
  UNIQUE (projeto_id, nome)
);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE                    -- sempre normalizado
);

CREATE TABLE card_tags (
  card_id INTEGER NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
  PRIMARY KEY (card_id, tag_id)
);

CREATE TABLE dependencias (
  card_id       INTEGER NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  depende_de_id INTEGER NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  confirmada    INTEGER NOT NULL DEFAULT 0,     -- 0 = sugestão da IA, não trava nada
  criada_em     TEXT NOT NULL,
  PRIMARY KEY (card_id, depende_de_id)
);

CREATE INDEX idx_tarefas_projeto ON tarefas(projeto_id);
CREATE INDEX idx_tarefas_status  ON tarefas(status);
CREATE INDEX idx_tarefas_data    ON tarefas(data);

-- v3 -----------------------------------------------------------------------
CREATE TABLE chaves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,                    -- como você reconhece a chave depois
  prefixo    TEXT NOT NULL,                    -- os 11 primeiros caracteres, para a tela
  hash       TEXT NOT NULL UNIQUE,             -- sha256. SÓ o hash é guardado
  papel      TEXT NOT NULL DEFAULT 'convidado',-- dono | convidado
  pode_ia    INTEGER NOT NULL DEFAULT 0,
  criada_em  TEXT NOT NULL,
  ultimo_uso TEXT,
  revogada   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_chaves_hash ON chaves(hash);

-- v4 -----------------------------------------------------------------------
CREATE TABLE telegram_chats (
  chat_id    TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  pareado_em TEXT NOT NULL,
  ultimo_uso TEXT,
  ativo      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE pareamentos (
  codigo    TEXT PRIMARY KEY,                  -- 6 dígitos
  criado_em TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  usado_por TEXT                               -- chat_id que consumiu; uso único
);

CREATE TABLE config (                          -- configuração que vive no banco
  chave TEXT PRIMARY KEY,                      -- ex.: telegram_offset
  valor TEXT
);
```

### RT-07 · Constantes compartilhadas

Estas vivem em `db.js` (e `PAPEIS` em `chaves.js`) e são **importadas** por quem precisar —
regras, OpenAPI, testes. Nunca redigitadas.

```js
TIPOS                    = ['tarefa', 'ideia']
PRIORIDADES              = ['alta', 'media', 'baixa']
ORIGENS                  = ['usuario', 'ia']
PAPEIS                   = ['dono', 'convidado']
PROJETO_PADRAO           = 'Dia a dia'
PIPELINE_PADRAO          = ['A fazer', 'Fazendo', 'Feito']
TETO_DO_DIA              = 3
DIAS_ATE_SUGERIR_QUEBRA  = 7
```

### RT-08 · A primeira execução

Ao migrar para a v2, o sistema:
1. cria o projeto `Dia a dia` com o pipeline `A fazer → Fazendo → Feito`, **se não houver
   nenhum projeto**;
2. adota os cards órfãos da v1: todos vão para o projeto padrão — card já concluído entra
   na **última** etapa, o resto na **primeira**.

Nenhuma linha é perdida na migração. É o ponto inteiro dela.

### RT-09 · O erro de regra é uma classe

```js
class ErroDeRegra extends Error {   // mensagem escrita para o usuário LER
  constructor(mensagem, status = 400)
}
```

A mensagem sobe até a tela e até o agente. Ela é em português, e quando um card ou projeto
não é encontrado **ela diz quais existem** — é o que faz o agente perguntar em vez de criar
um parecido.

---

## Parte 5 · As regras de negócio

Todas moram em `server/regras.js`. Todas têm teste (Parte 12).

### Cards

| # | Regra |
|---|---|
| **RN-01** | Não existe card sem título. Título vazio ou só espaço é recusado. |
| **RN-02** | Só o título é obrigatório. Projeto padrão = `Dia a dia`; etapa padrão = a primeira do pipeline; data padrão = hoje; tipo padrão = `tarefa`; prioridade padrão = `media`. |
| **RN-03** | `tipo` só aceita `tarefa` ou `ideia`. `prioridade` só aceita `alta`, `media`, `baixa`. Valor fora da lista é recusado com a mensagem dizendo o que veio. |
| **RN-04** | **`status` é derivado da etapa, nunca digitado.** Card na última etapa do pipeline é `feita`; em qualquer outra é `aberta`. |
| **RN-05** | A última etapa é a de conclusão **só se o pipeline tiver mais de uma etapa**. Projeto de etapa única não tem etapa de conclusão — card não pode nascer concluído. |
| **RN-06** | Mover para a etapa de conclusão **conclui** o card, e a resposta traz o que aquilo destravou. |
| **RN-07** | Concluir tira o card do "hoje de verdade" (`hoje = 0`). |
| **RN-08** | **Adiar muda a data. Não conclui, não apaga, e tira o card do teto do dia** — adiar é justamente dizer "hoje não". |
| **RN-09** | Card já concluído não é adiado: erra pedindo para reabrir antes. |
| **RN-10** | Reabrir move o card de volta para a **primeira** etapa do pipeline. |
| **RN-11** | No máximo **três** (`TETO_DO_DIA`) cards abertos podem estar marcados como "hoje de verdade". O quarto é recusado com a mensagem explicando por quê. |
| **RN-12** | Card concluído não entra no "hoje de verdade". |
| **RN-13** | **Prioridade posta pelo usuário nunca é sobrescrita pela IA.** Alterar prioridade pela API carimba `prioridade_origem = 'usuario'` e zera `prioridade_sugerida`. |
| **RN-14** | Aceitar a sugestão de prioridade carimba `prioridade_origem = 'usuario'` — a sugestão vira decisão, e a IA não encosta mais nela. |
| **RN-15** | Recusar a sugestão volta a prioridade para `media`, limpa a justificativa e também carimba `usuario`. |
| **RN-16** | A **origem** do card vem de quem autenticou, **nunca do corpo da requisição**. Se viesse do corpo, um agente se apresentaria como outro. |
| **RN-17** | A origem também vira tag, etiquetada: `"agente da Maria"` → tag `via-agente-da-maria`. Assim o filtro de tag que já existe serve para ver o que cada agente escreveu. |

### Projetos e pipelines

| # | Regra |
|---|---|
| **RN-18** | Existe sempre um projeto `Dia a dia`, criado na primeira execução. Ele **não pode ser arquivado**. |
| **RN-19** | Nome de projeto é único. Criar um repetido responde 409. |
| **RN-20** | Projeto é buscado por **id ou nome**, sem diferenciar maiúscula. Não achou → 404 **listando os que existem**. Nunca adivinha o parecido. |
| **RN-21** | Um projeto precisa de pelo menos uma etapa. |
| **RN-22** | Duas etapas com o mesmo nome no mesmo projeto não são aceitas. |
| **RN-23** | Redefinir o pipeline **não perde card**: etapa que continua existindo (mesmo nome) mantém os cards; renomear e reordenar são operações sem perda. |
| **RN-24** | **Remover uma etapa que tem cards é recusado**, dizendo quantos cards estão nela. Para onde eles vão é decisão do usuário, não do sistema. |
| **RN-25** | Depois de redefinir o pipeline, o `status` de todos os cards do projeto é ressincronizado a partir das etapas novas (RN-04). |

### Tags

| # | Regra |
|---|---|
| **RN-26** | Tag é normalizada: sem `#` na frente, sem espaço nas pontas, minúscula. `#Ligação`, `ligação` e ` LIGAÇÃO ` são a mesma tag. |
| **RN-27** | A etiqueta de origem passa por transliteração: sem acento, sem espaço, sem símbolo — `[^a-z0-9]+` vira `-`. |
| **RN-28** | Várias tags por card, atravessando projetos. A listagem de tags traz a contagem de usos, mais usadas primeiro. |

### Dependências

| # | Regra |
|---|---|
| **RN-29** | **A IA sugere, o usuário confirma.** Dependência com `confirmada = 0` **não bloqueia nada**. |
| **RN-30** | Um card está **aguardando** quando tem dependência **confirmada** cujo alvo ainda está aberto. |
| **RN-31** | Card aguardando **não some e não é escondido** — aparece marcado, dizendo aguardando o quê. Esconder o que está travado é fingir que ele não existe. |
| **RN-32** | Um card não pode depender dele mesmo. |
| **RN-33** | **Dependência circular é recusada na hora, mostrando as duas pontas** (título e id de cada uma). A verificação é uma busca em profundidade sobre o grafo inteiro, não só o par. |
| **RN-34** | **Desbloqueio não usa IA.** Ao concluir, o sistema lista os cards que dependiam deste, estão abertos, e **não estão mais aguardando nada**. É uma consulta ao banco. |
| **RN-35** | Se a conclusão não destravou nada, **não aparece nada** — sem mensagem de consolo. |

### Consultas

| # | Regra |
|---|---|
| **RN-36** | A **lista de hoje** é: tarefas **abertas**, tipo `tarefa`, com data **até hoje**, ordenadas por prioridade. **Ideia não entra na lista de hoje** — é guardada, mas não cobra. |
| **RN-37** | O **modo "e agora?"** devolve **um** card: candidatos são as tarefas abertas até hoje que **não estão aguardando**, ordenadas por (1) marcado como hoje, (2) prioridade, (3) data, (4) id. Devolve também quantos restam e o porquê da escolha. |
| **RN-38** | O porquê da escolha usa a justificativa da IA quando existe; senão explica pela regra que decidiu (marcado como hoje / venceu / maior prioridade / mais antiga). |
| **RN-39** | `pular` no "e agora?" é acumulativo na sessão: *"me mostra outra"* não tem penalidade e não faz pergunta. |
| **RN-40** | **Atrasados** = tarefas abertas com data anterior a hoje. |
| **RN-41** | **Replanejar** adia em bloco tudo que está atrasado para uma data nova, e devolve quantos foram. Existe para que atraso não vire tela vermelha acumulando culpa. |
| **RN-42** | **Cards parados** = abertos cujo `movido_em` (ou `criado_em`) é anterior a N dias atrás. |
| **RN-43** | Busca por trecho do título devolve **todos** os parecidos, de propósito. O agente tem ordem de perguntar qual é — não de escolher o primeiro. |

### RN-44 · O interpretador de data

Uma função só, usada por `adiar` e `replanejar`. Aceita, devolvendo `YYYY-MM-DD`:

| Entrada | Resultado |
|---|---|
| `2026-08-16` | ela mesma |
| `hoje` · `amanha` · `amanhã` · `depois de amanha` | 0, +1, +2 dias |
| `3d` · `3 dias` | +3 dias |
| `segunda` … `domingo` (com ou sem acento, com ou sem `-feira`) | o próximo dia daquele nome; se hoje for esse dia, a semana que vem |
| `16/08` · `16-08` · `16/08/26` · `16/08/2026` | dia/mês brasileiro; ano corrente quando omitido |
| qualquer outra coisa | `null` → erro dizendo que não entendeu |

---

## Parte 6 · A inteligência

Quatro rotinas de análise, mais uma porta de entrada no Telegram. Todas rodam **na
aplicação**, em lote, na hora marcada — não a cada clique.

### RT-10 · As três leis das chamadas de IA

**1. Uma chamada por lote, nunca uma por card.** O prompt recebe o contexto dos projetos e a
lista inteira de cards abertos. Priorizar a cada clique é o jeito de transformar um gestor
de tarefas numa fatura.

**2. Saída estruturada por *tool use* obrigatório.** `tools: [ferramenta]` +
`tool_choice: { type: 'tool', name: ... }`. Nunca JSON extraído de texto.

**3. ⚠️ A resposta do modelo é validada duas vezes:**

- **Ids alucinados são descartados em silêncio.** Toda resposta é conferida contra os ids
  que foram enviados no prompt. O que não bater não vira escrita no banco.
- **A FORMA também é validada.** `tool_choice` garante que a ferramenta seja chamada; **não**
  garante que cada campo venha no tipo pedido. Numa rodada real um campo veio como objeto
  onde o schema pedia lista e derrubou a rota com 500. Toda saída passa por uma coerção
  (`comoLista`) antes de virar `.map`/`.filter`. *Confiar na forma da resposta de um modelo
  é o mesmo erro de confiar no corpo de uma requisição.*

### RT-11 · Como um card é descrito ao modelo

Uma linha por card, com id, título, descrição, projeto, etapa, data, tags e prioridade
atual **com a origem dela**.

⚠️ **E o que o card BLOQUEIA entra nessa linha, obrigatoriamente.** Sem isso o modelo põe o
gargalo abaixo do que ele trava — e como o modo "e agora?" pula o que está aguardando, o
sistema nunca sugere destravar. Foi o pior bug encontrado, e ele é invisível em teste sem
chave de API.

### 6.1 · Priorização

**Entrada:** o contexto de todos os projetos + os cards abertos **cuja prioridade não é do
usuário** (RN-13).

**Instrução ao modelo:**
- Use somente os ids da lista. Não invente card.
- Com contexto, a prioridade sai do contexto — e a justificativa **cita** ele.
- Sem contexto, use o que dá para inferir: data próxima, dependência, esforço aparente.
- Não use "alta" para tudo. Se mais de um terço da lista for alta, nada é alta.
- **Card que BLOQUEIA outro nunca tem prioridade menor que o que ele bloqueia.**
- A justificativa é uma frase, em português, escrita para o dono da tarefa ler.

**Saída:** `[{ id, prioridade, justificativa }]`

**RN-45 · Projeto sem contexto gera SUGESTÃO, não decisão.** O card recebe
`prioridade_sugerida = 1` e o painel mostra o pedido de confirmação **no próprio card**, não
escondido numa gaveta.

**RN-46 · O fim do laço.** Depois de **três** sugestões aceitas num projeto sem contexto, o
sistema oferece transformar o padrão observado em contexto escrito: *"parece que aqui o que
tem data marcada vem primeiro. Quer que eu escreva isso no contexto do projeto?"* Com IA ele
traz um rascunho; sem IA a caixa vem em branco — **e a caixa em branco já é o ganho, porque
o pedido é o que faltava.** A contagem é da sessão, em memória: se o servidor reinicia, a
oferta espera as próximas três. É de propósito, para não perseguir a pessoa entre um dia e
outro.

### 6.2 · Relação e dependência

**Instrução:**
- Só proponha o par quando um card REALMENTE não pode ser feito antes do outro.
- **Semelhança de assunto NÃO é dependência.** Duas gravações do mesmo curso são independentes.
- Na dúvida, não proponha. Uma sugestão errada custa mais que uma sugestão a menos: quem
  recebe dez palpites ruins para de ler os palpites.

**Saída:** `[{ card_id, depende_de_id, porque }]`

Gravadas **sempre como `confirmada = 0`** (RN-29). Pares já existentes e pares que fechariam
ciclo são descartados sem derrubar a rodada.

### 6.3 · Desbloqueio

**Não usa IA nenhuma** (RN-34). Vale reparar nisso: a funcionalidade que mais parece
inteligente é a mais burra do sistema.

Esta é, junto com o modo "e agora?", a funcionalidade mais importante do produto. Concluir
uma tarefa e ver duas outras acenderem é a diferença entre riscar item de lista e sentir que
a semana andou.

### 6.4 · Ordem do dia (encadeamento)

**Instrução:**
- Agrupe por **contexto de execução**, não por assunto: as ligações juntas, o que exige foco
  num bloco só, o que é de cinco minutos encaixado entre as coisas.
- Troca de contexto é o custo que você está tentando reduzir.
- Máximo de **quatro** blocos. Um dia com sete blocos não é um dia organizado.
- **O que BLOQUEIA outra tarefa vem cedo**, mesmo que pareça pequeno ou administrativo.
- Nada de frase de motivação. O recado é prático ou não existe.

**Saída:** `{ blocos: [{ nome, porque, cards: [id] }], recado }`. Blocos que ficam vazios
depois do filtro de ids são descartados.

### 6.5 · Sugestão de quebra

Card parado na mesma etapa há mais de sete dias raramente é preguiça — quase sempre é uma
tarefa grande demais disfarçada de tarefa.

**Instrução:**
- Cada parte precisa ser fazível numa sentada, e a **primeira** precisa ser fácil de começar.
- De dois a quatro pedaços. Mais que isso é outro projeto, não uma quebra.
- Se um card já for pequeno e específico, não o inclua.
- ⚠️ Se nenhum card precisar ser quebrado, devolva a lista **vazia** — não uma frase
  explicando. *O campo é uma lista, sempre.*

**RN-47:** sugerir **não altera nada**. Aplicar a quebra cria as partes (herdando projeto,
etapa, tipo, data e tags do original) e **apaga o card original**. É decisão do usuário, e a
tela avisa que o original será apagado.

### 6.6 · A porta do Telegram: pergunta ou anotação?

A IA decide se a frase solta é **consulta** ou **registro**, e no caso de consulta escolhe os
**filtros** — nunca executa nada. Quem consulta o banco continua sendo `regras.js`, com as
mesmas funções que o painel usa. *Modelo escolhendo parâmetro é uma coisa; modelo mexendo em
card é outra, e esta porta não abre a segunda.*

**Instrução:**
- Pergunta é consulta mesmo sem ponto de interrogação.
- Imperativo ou assunto solto é registro.
- **Na dúvida, escolha REGISTRO.** Perder uma anotação é pior que responder demais: quem
  quer consultar tem os comandos, quem perdeu a anotação não tem nada.
- `projeto` e `tag` só saem da lista que vier no prompt. Nome que não estiver lá não existe.
- Em registro, `titulo` é a frase sem os rodeios: *"preciso lembrar de ligar pro dentista"*
  vira *"ligar pro dentista"*.

**RN-48 · Todo caminho de falha cai no lado que não perde nada.** Sem chave de IA → registra.
IA fora do ar → registra. Leitura errada → o comando `/registrar` recupera a última frase
tratada como pergunta e a anota como deveria ter sido.

### RN-49 · Quando cada rotina roda, e o que custa

| Rotina | Quando | Custo |
|---|---|---|
| Priorização | 1× por dia, de madrugada, em lote · e sob demanda no painel | Uma chamada por lote |
| Relação e dependência | 1× por dia, em lote | Uma chamada por lote |
| **Desbloqueio** | na hora da conclusão | **Nenhum — é consulta ao banco** |
| Ordem do dia | sob demanda, e junto do resumo | Uma chamada |
| Sugestão de quebra | 1× por semana, ou sob demanda | Uma chamada |
| Interpretação de frase | a cada frase solta no Telegram | Uma chamada curta |

### RN-50 · Degradação

**Sem chave de API ou sem internet, o sistema inteiro continua funcionando** — só não
prioriza, não sugere dependência e não monta a ordem do dia. O quadro, os filtros, o
registro, os comandos do Telegram e a CLI nunca dependem de IA. **Na tela, os botões de IA
simplesmente não aparecem** (via `GET /api/ia/disponivel`). Esta regra não é negociável: um
gerenciador de tarefas inutilizável offline é um gerenciador de tarefas que se perde.

---

## Parte 7 · A API HTTP

### RT-12 · Uma API só, e ela é a mesma para os dois

O painel React consome estas rotas, e o agente consome exatamente estas rotas. Não existe
uma segunda porta feita só para o agente.

Todas as rotas ficam sob `/api`. Todas devolvem JSON. Erro é sempre
`{ "erro": "mensagem em português" }` com status 4xx/5xx.

### RT-13 · O índice de bolso: `GET /api/operacoes`

Uma lista das operações principais, **descritas em português**, uma frase cada. O agente lê
a descrição e escolhe qual usar — do mesmo jeito que lê a descrição de uma Skill. A resposta
aponta para o contrato completo:

```json
{
  "sistema": "Gestor de tarefas",
  "comoUsar": "Todas as rotas devolvem JSON. Se algo der errado, vem { \"erro\": ... } com status 4xx. Quando não achar um card ou projeto pelo nome, a mensagem diz quais existem — pergunte ao usuário em vez de criar um parecido.",
  "contrato": { "openapi": "/openapi.json", "paraLer": "/docs", "sobre": "..." },
  "operacoes": [{ "rota": "GET /api/hoje", "descricao": "..." }]
}
```

### As 41 rotas

**Projetos**

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/projetos` | Lista projetos com pipeline e contexto. `?arquivados=true` inclui os arquivados |
| POST | `/api/projetos` | Cria projeto com nome, contexto e pipeline próprio |
| PATCH | `/api/projetos/:id` | Muda contexto, pipeline e/ou arquivado. `:id` aceita id ou nome |
| GET | `/api/projetos/:id/oferta-contexto` | A oferta da RN-46, ou `null` |
| POST | `/api/projetos/:id/oferta-contexto/dispensar` | Zera a contagem de confirmações |

**Cards**

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/cards` | Lista com filtros: `projeto`, `status` (aberto\|feito\|todos), `tag`, `tipo`, `busca`, `hoje` |
| POST | `/api/cards` | Cria. Só o título é obrigatório. Origem vem do porteiro (RN-16) |
| GET | `/api/cards/:id` | Um card, enriquecido |
| PATCH | `/api/cards/:id` | Muda título, descrição, tipo, data, prioridade, tags, projeto, etapa |
| DELETE | `/api/cards/:id` | Apaga |
| POST | `/api/cards/:id/mover` | Move de etapa. Devolve `{ card, desbloqueadas }` |
| POST | `/api/cards/:id/concluir` | Conclui. Devolve `{ card, desbloqueadas }` |
| POST | `/api/cards/:id/reabrir` | Volta para a primeira etapa |
| POST | `/api/cards/:id/adiar` | Adia. Corpo `{ data }` em português (RN-44) |
| POST | `/api/cards/:id/hoje` | Marca/desmarca "hoje de verdade". Corpo `{ valor }` |
| POST | `/api/cards/:id/prioridade/aceitar` | Aceita a sugestão (RN-14) |
| POST | `/api/cards/:id/prioridade/recusar` | Recusa a sugestão (RN-15) |
| GET | `/api/hoje` | A lista de hoje (RN-36) |
| GET | `/api/proxima` | UMA tarefa (RN-37). `?projeto=` e `?pular=1,2,3` |
| GET | `/api/atrasados` | O que venceu e continua aberto |
| POST | `/api/replanejar` | Adia em bloco. Corpo `{ data }` |
| GET | `/api/tags` | As tags com contagem de usos |

**Dependências**

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/cards/:id/dependencias` | Cria. Corpo `{ dependeDeId, confirmada }` |
| PATCH | `/api/cards/:id/dependencias/:outroId` | Confirma ou desconfirma |
| DELETE | `/api/cards/:id/dependencias/:outroId` | Remove |

**IA**

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/ia/priorizar` | Repriorriza os abertos. Corpo `{ projeto }` opcional |
| POST | `/api/ia/relacionar` | Procura dependências e propõe |
| GET | `/api/ia/ordem-do-dia` | A ordem sugerida, em blocos |
| POST | `/api/ia/quebrar` | Sugere quebras. Corpo `{ dias }` |
| POST | `/api/cards/:id/quebrar` | Aplica a quebra. Corpo `{ partes: [titulo] }` |
| POST | `/api/ia/escrever-contexto` | Rascunho de contexto (RN-46). Corpo `{ projeto }` |
| GET | `/api/ia/disponivel` | `{ disponivel }` — há chave **e** esta credencial tem escopo de IA |

**Chaves**

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/chaves` | Lista (só prefixo, nunca o segredo) |
| POST | `/api/chaves` | Cria. **Devolve o segredo UMA vez.** Corpo `{ nome, papel, pode_ia }` |
| PATCH | `/api/chaves/:id` | Altera papel e/ou escopo de IA |
| POST | `/api/chaves/:id/revogar` | Revoga |

**Telegram**

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/telegram` | `{ bot, chats }` — se há bot configurado e a allowlist |
| POST | `/api/telegram/codigo` | Gera código de pareamento. 503 se não há bot |
| DELETE | `/api/telegram/chats/:id` | Desativa um chat da allowlist |

**Meta**

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/operacoes` | O índice de bolso (RT-13) |
| GET | `/api/eu` | `{ papel, pode_ia, origem }` — quem sou eu na visão do servidor |

### RT-14 · O card enriquecido

Toda rota que devolve card devolve a **mesma forma**, enriquecida a partir das tabelas
relacionadas:

```jsonc
{
  "id": 12, "titulo": "gravar a aula 3", "descricao": null,
  "tipo": "tarefa", "data": "2026-08-15", "status": "aberta",
  "prioridade": "alta", "prioridade_origem": "ia", "prioridade_sugerida": false,
  "justificativa": "Bloqueia a edição da aula 3, e o contexto diz que gravação vem primeiro.",
  "projeto": "Curso", "etapa": "Roteiro", "etapa_posicao": 1,
  "tags": ["exige-foco", "via-agente-da-maria"],
  "hoje": true,
  "origem": "agente da Maria",
  "aguardando":   [{ "id": 9, "titulo": "comprar o microfone" }],   // só confirmadas e abertas
  "dependencias": [{ "id": 9, "titulo": "comprar o microfone", "status": "aberta", "confirmada": true }],
  "criado_em": "2026-08-10T09:14:00", "movido_em": "2026-08-14T18:02:00"
}
```

Booleanos do SQLite (`0`/`1`) são convertidos para `true`/`false` na saída. A API nunca
devolve inteiro onde a semântica é booleana.

---

## Parte 8 · A documentação da API — **requisito de primeira classe**

> Esta parte é um requisito de entrega, não um "nice to have". Um sistema cuja promessa é
> *"o seu agente sabe operar"* sem contrato publicado é um sistema que obriga cada agente a
> descobrir a API por tentativa e erro.

### RT-15 · O contrato é OpenAPI 3.1, servido pela própria aplicação

```
GET /openapi.json     → o documento OpenAPI 3.1 completo
GET /docs             → a página de leitura, renderizada com Scalar
```

Os dois ficam **atrás da mesma tranca do resto do sistema**: se o painel pede senha, a
documentação pede também. Nada de documentação pública num sistema privado.

**Para o agente, o `openapi.json` é o que importa.** É o contrato: dá para gerar cliente a
partir dele, validar uma resposta contra ele, ou simplesmente lê-lo antes da primeira
chamada. Ele é servido localmente e não depende de mais nada.

### RT-16 · A página é o Scalar; o CDN é configurável

`/docs` usa [`@scalar/express-api-reference`](https://scalar.com), que busca o renderizador
num CDN. Consequência que precisa estar escrita:

- **Offline, `/docs` fica em branco e o `/openapi.json` continua inteiro.** A página é para
  gente ler; o contrato é o que o agente consome, e o contrato nunca depende de rede.
- Quem quiser servir o renderizador de outro lugar (rede fechada, arquivo próprio) aponta
  `DOCS_CDN` no `.env`.

O botão "testar" da página bate na **mesma origem**, então a credencial que abriu o painel
já vale — não é preciso colar chave nenhuma para experimentar uma chamada.

*(Swagger UI é alternativa aceitável e cumpre o mesmo requisito. O Scalar é a escolha
padrão por ser uma dependência só, sem servir bundle próprio.)*

### RT-17 · O documento é um MÓDULO, não um `.json` parado numa pasta

O spec é **gerado em código**, e os valores que a API aceita são **importados** de onde as
regras vivem:

```js
import { TIPOS, PRIORIDADES, PIPELINE_PADRAO, PROJETO_PADRAO,
         TETO_DO_DIA, DIAS_ATE_SUGERIR_QUEBRA } from './db.js'
import { PAPEIS } from './chaves.js'
```

Um arquivo JSON escrito à mão começa correto e envelhece errado: alguém acrescenta uma
prioridade em `db.js` e a documentação continua jurando que existem três. **Aqui isso não dá
para acontecer sem quebrar o import.**

O que continua sendo trabalho humano: **descrever o que cada rota FAZ**. Isso nenhum gerador
tira do código — e é a parte que o leitor, gente ou agente, realmente lê.

### RT-18 · O teste que impede a documentação de envelhecer

Documentação de API não erra quando é escrita — erra seis meses depois, quando alguém
acrescenta uma rota e não volta no documento. A partir daí ela é **pior que documentação
nenhuma**, porque quem lê confia.

Então isso é **teste** (`npm test`), e o build quebra:

| O teste verifica | Se falhar, a mensagem diz |
|---|---|
| Toda rota registrada no Express está documentada | **qual** rota está faltando |
| Toda rota documentada ainda existe no Express | **qual** rota sobrou |
| Os enums do spec batem com as constantes importadas | qual valor divergiu |
| O documento é OpenAPI 3.1 válido e tem `info`, `paths`, `components` | o que falta |

**O que o teste NÃO garante** — e isto precisa estar escrito para ninguém se enganar: que a
*descrição* de cada rota esteja certa. Isso continua sendo leitura humana.

### RT-19 · O que cada descrição precisa ter

Escrever "cria um card" não serve. Cada operação documenta:

1. **O que ela faz**, em português, para gente e agente lerem.
2. **O que ela garante** — a regra de negócio por trás, com o número (RN-xx) quando houver.
3. **Os parâmetros e o corpo**, com exemplos reais (`amanha`, `sexta`, `3d`, `16/08`).
4. **A forma exata da resposta**, incluindo os campos derivados (`aguardando`, `dependencias`).
5. **Os erros possíveis**, com o formato `{ erro }` e o significado de cada status.

Exemplo do padrão de descrição esperado, no schema de erro:

> *"Todo erro tem esta forma, e a mensagem é escrita em português para ser lida — por gente
> ou por agente. Quando um card ou projeto não é encontrado pelo nome, a mensagem diz quais
> existem, para o agente perguntar em vez de criar um parecido."*

### RT-20 · Os esquemas de segurança no documento

O documento declara as três formas de entrar (Parte 9), com a explicação de qual serve a
quem:

```yaml
components:
  securitySchemes:
    senhaDoPainel:  { type: http,   scheme: basic }              # gente
    chaveBearer:    { type: http,   scheme: bearer }             # agente
    chaveNoHeader:  { type: apiKey, in: header, name: X-API-Key } # agente
```

---

## Parte 9 · Quem pode entrar

### O princípio: uma fechadura, não uma portaria

O sistema é **de um usuário só**. Mas ele precisa ser alcançável pelo agente, e o que é
alcançável precisa de tranca. Então existem credenciais — e **nenhum cadastro**: não há
segundo usuário, não há recuperação de senha, não há livro de visitas.

### RT-21 · Duas portas, de propósito

| Porta | Para quem | Como |
|---|---|---|
| `AUTH_USUARIO` + `AUTH_SENHA` | **Gente** | HTTP Basic — o navegador pede ao abrir o painel |
| Chave de API | **Agente** | `Authorization: Bearer <chave>` ou `X-API-Key: <chave>` |

A senha é sua e você digita; a chave é do agente, vive em arquivo de configuração e pode ser
trocada sozinha. **Uma não vale pela outra** — a chave não é aceita como senha nem a senha
como chave.

### RT-22 · As chaves são criadas no painel, e só o hash é guardado

Uma chave por agente: assim dá para revogar uma sem derrubar as outras, e cada card mostra
de quem veio.

- Formato: `gt_` + 24 bytes aleatórios em base64url.
- Guardado: `sha256(chave)` + os 11 primeiros caracteres, só para a tela dizer qual é qual.
- **A chave aparece uma única vez**, na resposta que a cria. Depois disso nem o sistema sabe
  qual era. *Chave que dá para reler no banco é senha em texto claro com outro nome.*
- Autenticar registra `ultimo_uso` — é o que permite olhar a lista depois do evento e revogar
  as outras sem medo.

O `API_KEY` do `.env` continua existindo como **chave-mestra**: a apólice para o caso de
você revogar a última chave de dono por engano. *Um sistema que consegue se trancar do lado
de fora não é seguro, é frágil.*

### RT-23 · Escopo tem duas dimensões, independentes

| | O que decide |
|---|---|
| **Papel** | `dono` faz tudo · `convidado` registra, conclui, adia e move |
| **Escopo de IA** (`pode_ia`) | se a chave pode disparar as rotinas que gastam a conta da Anthropic |

São separadas de propósito: existe convidado de confiança que roda IA, e existe agente
organizador que é dono e nunca gasta a conta. Amarrar as duas coisas num "nível de acesso"
só obrigaria a escolher entre confiar e economizar.

**O que o convidado não pode**, e o motivo de cada família:

| Bloqueio | Família | Por quê |
|---|---|---|
| `DELETE` qualquer coisa · aplicar quebra | **destruir** | Um agente confuso não some com o card que você ia mostrar |
| Criar/alterar projeto · replanejar em bloco | **reestruturar** | Ninguém reestrutura o quadro no meio da apresentação |
| Ver/criar/alterar chaves · parear Telegram | **reestruturar** | — |
| Rotas `/ia/*` sem `pode_ia` | **gastar** | As rotinas correm na **sua** conta da Anthropic |

| | Dono | Convidado |
|---|---|---|
| Ler tudo | sim | sim |
| Registrar, concluir, adiar, mover | sim | sim |
| Apagar card · quebrar card | sim | **não** |
| Criar e alterar projeto e pipeline | sim | **não** |
| Replanejar em bloco | sim | **não** |
| Ver e criar chaves | sim | **não** |
| Rodar as rotinas de IA | conforme `pode_ia` | conforme `pode_ia` |
| Limite de chamadas por minuto | 600 | 60 |

### RT-24 · O porteiro, em ordem

```
1. Sem tranca configurada E sem chave apresentada  → dono, pode_ia, origem null
2. Chave apresentada:
   a. bate com API_KEY do .env            → dono,      pode_ia=true,  origem "chave-mestra"
   b. bate com API_KEY_CONVIDADO (legado) → convidado, pode_ia=false, origem "convidado"
   c. bate com uma chave do banco         → papel/pode_ia/nome da chave
   d. não bate com nada                   → 401 "Chave de API inválida ou revogada."
3. Senha exigida: confere HTTP Basic      → dono, ou 401 COM WWW-Authenticate
4. Só chave configurada, requisição sem nenhuma → 401 pedindo o cabeçalho
```

⚠️ **Três detalhes que custaram bug:**

- **A chave é conferida mesmo com a tranca do `.env` desligada.** Uma versão devolvia "dono"
  antes de olhar a chave quando não havia `.env`, e três coisas quebravam de uma vez: chave
  do banco ignorada, card sem etiqueta de origem, e chave revogada continuando a entrar.
  *Ausência de tranca significa "não exijo credencial" — nunca "aceito qualquer uma".*
- **Chave errada responde 401 SEM `WWW-Authenticate`.** Com o cabeçalho, quem estivesse
  depurando o agente pelo navegador levaria uma caixa de senha na cara. Por isso a chave é
  conferida **antes** da senha.
- **Comparação em tempo constante** (`timingSafeEqual`) nas duas portas — e quando os
  tamanhos diferem, compara mesmo assim, para o tempo não denunciar o tamanho da senha.

### RT-25 · Limite de taxa

Janela deslizante de um minuto, por `papel:ip`. 600/min para dono, 60/min para convidado.
Excedeu → `429` com `Retry-After: 60`.

**Não é defesa contra ataque — é defesa contra agente em laço**, que faz centenas de chamadas
sem má intenção nenhuma. Numa demonstração com quarenta agentes, basta um para derrubar a
experiência de todos.

A janela é em memória e some no restart, de propósito: persistir isso exigiria mais um
armazenamento para resolver um problema de noventa minutos.

### RT-26 · Atrás de proxy reverso

`ATRAS_DE_PROXY=true` liga `trust proxy`. Sem isso o limite de taxa conta todo mundo como o
mesmo visitante, porque as chamadas chegam com o IP do proxy.

### RT-27 · O bind é a tranca que vem antes da senha

Padrão: `HOST=127.0.0.1`. O sistema **não existe** para o resto da rede. `HOST=0.0.0.0` é
opt-in explícito.

⚠️ `::1` (localhost do IPv6) conta como local. Esquecer dele faria o servidor achar que está
exposto quando não está.

### RT-28 · Exposto e sem credencial: o servidor **recusa subir**

As chaves criadas no painel são **aditivas** — dão acesso a quem as tem, não exigem
credencial de quem não tem. Se `HOST` não é local e o `.env` não tem nem senha nem
chave-mestra, o processo imprime o motivo e sai com código 1.

*Falhar ao subir é escandaloso, e é de propósito: um contêiner que não sobe se conserta em
dois minutos; um que sobe aberto se descobre tarde.*

---

## Parte 10 · O Telegram

### O problema que a allowlist resolve

Um bot do Telegram é **público por natureza**. Qualquer pessoa que descubra o nome dele abre
uma conversa e começa a falar. **O token protege o bot de ser *operado* por terceiros; não
protege de ser *conversado* por terceiros.**

Guardar um `chat_id` fixo no `.env` responde *para quem mandar* e não responde *quem pode
falar* — que é a pergunta que importa quando o sistema está num domínio público.

### RN-51 · A allowlist e o pareamento

- O bot **só atende chat que está na allowlist e ativo**.
- Entrar na allowlist exige um **código gerado no painel**: seis dígitos, quinze minutos,
  uso único. Gerado com CSPRNG (`randomInt`), não `Math.random` — é uma credencial, mesmo
  que curta e efêmera.
- **Quem não está na lista recebe SÓ a instrução de pareamento.** Nada de conteúdo, e nada
  de "não autorizado" com detalhe. Para quem está de fora, o sistema não conta o que existe
  do outro lado.
- Remover alguém da lista é um clique, e o bot para de responder na hora.

### RT-29 · O bot é processo separado, em long polling

`npm run telegram` roda `server/escutar.js`. Se ele cair — rede, token trocado, Telegram
fora do ar — **o painel e a API não sentem**.

⚠️ **O `offset` do `getUpdates` fica no banco** (tabela `config`, chave `telegram_offset`).
Sem isso, reiniciar o processo faria o bot reprocessar mensagens antigas e registrar tudo de
novo.

### Os comandos

Manda qualquer frase e vira card. Pergunta é respondida (6.6). Além disso:

| Comando | O que faz |
|---|---|
| `/parear <código>` | Entra na allowlist. Funciona **antes** da autorização — é a única que funciona |
| `/start` · `/ajuda` · `/help` | A lista de comandos |
| `/hoje` | A lista de hoje |
| `/proxima [projeto]` | A próxima tarefa, com o porquê |
| `/listar [projeto]` | O que está aberto |
| `/buscar <texto>` | Procura por trecho no título e na descrição |
| `/atrasados` | O que venceu e continua aberto |
| `/projetos` | Os projetos, com etapas e contagem de abertos |
| `/concluir <id>` | Conclui e **diz o que isso destravou** |
| `/adiar <id> <data>` | Aceita `amanhã`, `sexta`, `3d`, `16/08` |
| `/foco <id>` | Marca como uma das três coisas de hoje |
| `/registrar` | Registra a última frase que a IA leu como pergunta (RN-48) |

**RN-52 · Comando desconhecido NÃO vira card.** Errar o nome de um comando é exatamente
como o quadro enche de lixo. Responde dizendo que não conhece, e mostra a lista.

**RT-30 · ⚠️ Todo texto escrito por gente é escapado antes de entrar na mensagem.** O
Telegram usa Markdown: um título com `_` ou `*` solto faz o `sendMessage` voltar 400 e a
resposta some sem deixar rastro — o card fica criado e a pessoa acha que o bot ignorou.
*Conteúdo escrito por gente nunca pode quebrar a mensagem que o carrega.*

**RT-31 · `/comando@nome_do_bot`** é como o Telegram entrega comando dentro de grupo. O
parser precisa aceitar o sufixo.

**RN-53 · O `ErroDeRegra` vai inteiro para o chat.** A mensagem foi escrita para a pessoa
ler. Qualquer outro erro sobe e é registrado no terminal, sem vazar para a conversa.

---

## Parte 11 · A interface

> **A linguagem visual é normativa e vive em [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md).**
> Esta parte descreve as telas e os comportamentos; o documento de design descreve as cores,
> a tipografia, os componentes e as regras de uso.

### As telas

**1 · O quadro** (padrão)

Cabeçalho fixo com a marca, as abas de projeto (uma por projeto + `+`), e os botões de
`contexto`, `chaves`, `telegram` e `E agora?`. Abaixo, a barra de filtros: status
(aberto/feito/todos), tag, busca — e, **só se a IA estiver disponível**, os quatro botões
das rotinas.

Abaixo, a **faixa de atrasados** (se houver): quantos venceram, com "trazer tudo para hoje"
e "adiar uma semana".

Abaixo, **o campo de registro**: um input só, com placeholder dizendo para qual projeto o
card vai. Enter registra e limpa.

E o quadro: uma coluna por etapa do pipeline, com contagem, e os cards dentro.

**2 · O modo "e agora?"**

**Um** card, centralizado, grande. A justificativa embaixo. Três botões: *Feito* · *Não dá
agora* · *Me mostra outra*. E, discreto, quantos restam depois desta.

*Uma lista de vinte itens é a tela que trava; uma tarefa é a tela que destrava.*

**3 · Detalhe do card** (modal)

Título, descrição, projeto, etapa, tipo, data, tags, prioridade com a origem, dependências
(confirmar/recusar/remover), e as ações.

**4 · Painel do projeto** (modal) — contexto e pipeline
**5 · Novo projeto** (modal) — nome e pipeline inicial
**6 · Chaves** (modal, só dono) — a lista, a criação, e a tela que mostra o segredo uma vez
**7 · Telegram** (modal, só dono) — o estado do bot, a allowlist, e o gerador de código
**8 · Ordem do dia** (modal) — os blocos, com o porquê de cada um
**9 · Quebras** (modal) — os cards grandes demais e as partes propostas
**10 · Oferta de contexto** (modal) — a RN-46

### RT-32 · Os comportamentos que não são negociáveis

| # | Comportamento |
|---|---|
| **RT-32.1** | ⚠️ O drag & drop tem **distância mínima de ativação**. Sem ela, clicar num card vira um arrasto de zero pixel e o card nunca abre. |
| **RT-32.2** | ⚠️ Cada card carrega `aria-label` próprio, com título, etapa, prioridade e o que aguarda. O dnd-kit entrega `role="button"` **sem nome** — sem o label, a coluna vira uma fileira de "botão, botão, botão" na leitura de tela. |
| **RT-32.3** | Card também abre por teclado (Enter/Espaço). |
| **RT-32.4** | Os botões dentro do card (aceitar/recusar sugestão) **param a propagação** — senão abrem o card junto. |
| **RT-32.5** | Os botões de IA **não aparecem** quando `GET /api/ia/disponivel` responde `false` (RN-50). |
| **RT-32.6** | `chaves` e `telegram` só aparecem para `papel === 'dono'` (`GET /api/eu`). |
| **RT-32.7** | **Atraso não vira vermelho.** Card vencido não pinta a tela e não acumula alerta — só a faixa discreta com a oferta de replanejamento. |
| **RT-32.8** | O aviso de desbloqueio aparece como notificação **listando o que foi destravado**, e some sozinho em ~9s. |
| **RT-32.9** | A confirmação de prioridade sugerida acontece **no próprio card**, não escondida numa gaveta. |
| **RT-32.10** | `prefers-reduced-motion` desliga todas as animações e transições. |
| **RT-32.11** | ⚠️ O cálculo de "hoje/amanhã/ontem" compara **meia-noite local com meia-noite local**. Com o alvo ao meio-dia, a diferença de "hoje" dava meio dia, o arredondamento subia para 1, e hoje virava amanhã. |

---

## Parte 12 · Testes e critérios de aceite

### RT-33 · A suíte, com `node --test`

| Arquivo | Cobre |
|---|---|
| `testes/regras.test.js` | RN-01 a RN-44, RN-47 |
| `testes/auth.test.js` | RT-21 a RT-25: porteiro, papéis, escopo de IA, limite de taxa |
| `testes/telegram.test.js` | RN-51 a RN-53: allowlist, pareamento, comandos, escape de Markdown |
| `testes/openapi.test.js` | RT-18: rota nova sem doc quebra o build; doc órfã também |

Os testes rodam contra um banco temporário (variável `BANCO`), **sem chave de API e sem
rede**. Nenhum teste depende da Anthropic ou do Telegram.

### As regras, em português, que o `npm test` garante

- Não existe card sem título.
- Adiar muda a data. Não conclui e não apaga nada.
- Card feito não volta para a lista de hoje.
- A última etapa do pipeline é a de conclusão; o status vem dela, nunca é digitado.
- **Prioridade que você pôs na mão nunca é sobrescrita pela IA.**
- No máximo **três** cards podem ser "hoje de verdade".
- Dependência **sugerida** não trava nada; só a **confirmada** trava.
- Dependência circular é recusada na hora, mostrando as duas pontas.
- Ideia é guardada, mas não aparece na lista de tarefas de hoje.
- **Sem chave de IA, tudo acima continua valendo.**
- Toda rota da API está documentada, e toda rota documentada existe.

### O que os testes não cobrem, e precisa de rodada manual

⚠️ Estas três só aparecem **rodando contra a API real**, com chave:

1. A **forma** da resposta do modelo (RT-10.3) — o teste com mock sempre devolve a forma certa.
2. O efeito de **`BLOQUEIA` no prompt** (RT-11) na qualidade da priorização.
3. A **descrição** de cada rota no OpenAPI estar correta (RT-18).

---

## Parte 13 · CLI, scripts e operação

### Os scripts

```bash
npm start            # compila o painel e sobe o servidor — um comando, uma porta
npm run dev          # painel com recarga na 5173, API na 3000
npm run build        # compila o painel para dist/
npm test             # as regras
npm run servidor     # só o servidor, sem recompilar
npm run telegram     # o bot escutando (processo separado)
npm run resumo       # manda o resumo do dia no Telegram
npm run analisar     # a rotina de madrugada: priorizar + relacionar
npm run chave        # gera uma chave forte para colar no .env
npm run demo -- --sim  # apaga tudo e remonta o quadro de demonstração
npm run tarefas -- <comando>   # a CLI do agente
```

### RT-34 · A CLI

```bash
npm run tarefas -- hoje --texto
npm run tarefas -- criar "ligar pro contador" --tags ligacao,5min
npm run tarefas -- adiar 12 sexta
npm run tarefas -- concluir 7
npm run tarefas -- ajuda
```

A CLI **fala HTTP com a mesma API** — não acessa o banco direto. E lê a credencial do `.env`
sozinha: você nunca digita chave.

### RT-35 · O agendamento é do sistema operacional, não do processo

O sistema não acorda sozinho — quem acorda é o computador.

- **Windows**: Agendador de Tarefas → tarefa diária → programa `npm`, argumentos
  `run resumo` (18h) e `run analisar` (5h), iniciar em: a pasta do projeto.
- **Mac/Linux**: `cron` ou `launchd` com os mesmos dois horários.

### RT-36 · Os dados

Um arquivo só: `tarefas.db`, na raiz. Backup é copiar esse arquivo. Levar para outro
computador é copiar esse arquivo. Ele **não vai para o git**.

### RT-37 · Numa VPS

1. **HTTPS não é opcional.** HTTP Basic manda usuário e senha em base64, que é texto claro.
2. Dentro do contêiner, `HOST=0.0.0.0` — é a única situação em que `HOST` muda. Seguro
   **porque a porta não é publicada**: só o proxy reverso, na mesma rede Docker, alcança.
3. `ATRAS_DE_PROXY=true`, senão o limite de taxa conta todo mundo como o mesmo visitante.
4. `.env` com senha trocada, `API_KEY` gerada, e **teto de gasto** na chave da Anthropic.
5. As chaves dos agentes **não vão no `.env`** — cria no painel, uma por pessoa.
6. `npm run telegram` é um segundo serviço, mesma imagem, mesmo volume do banco.

---

## Parte 14 · A ordem de construção

Sete fatias, cada uma testável sozinha, na ordem em que cada uma faz a seguinte valer mais.

| # | Fatia | Depende de | Entrega |
|---|---|---|---|
| **1** | Banco, migrações, `regras.js`, API mínima (criar/listar/concluir/adiar) e o projeto padrão | — | O card sabe onde mora |
| **2** | Pipeline por projeto e o quadro de cards com drag & drop | 1 | O quadro aparece |
| **3** | Tags e filtros combinados | 2 | O corte transversal |
| **4** | **A documentação da API** (OpenAPI + `/docs` + o teste da RT-18) | 1 | O contrato publicado — **e ela vem cedo de propósito: escrita depois, ela nasce desatualizada** |
| **5** | Contexto do projeto + priorização em lote + a oferta de contexto | 1 | A primeira IA da aplicação |
| **6** | Dependência, desbloqueio e o modo "e agora?" | 5 | **O coração do produto** |
| **7** | Ordem do dia, sugestão de quebra, resumo | 6 | A rotina fechada |

**A fatia 6 é a razão de o produto existir.** As anteriores são infraestrutura para ela. Se
o tempo acabar, ela é a última a ser cortada.

**A fatia de acesso** — senha, chaves com escopo, limite de taxa, allowlist do Telegram —
entra quando (e só quando) o sistema sair da máquina. Um sistema de um usuário só em
`localhost` não precisa de nada disso. **Sair da máquina é o que cria a necessidade**, e a
fatia inteira existe para responder uma pergunta que o produto não tinha antes: *quem é
você?*

---

## Parte 15 · As histórias e os critérios de aceite

**H-01 — Registrar custa uma frase**
Como **dono do negócio**, quero **registrar escrevendo uma frase**, para **não perder o
pensamento preenchendo formulário**.
- Escrevo no campo e dou Enter; o card existe, no projeto que está aberto.
- Nenhum outro campo é obrigatório.
- O card nasce com data de hoje, tipo tarefa, prioridade média, na primeira etapa.

**H-02 — Cards num quadro**
Como **dono do negócio**, quero **ver minhas tarefas como cards num quadro**, para **bater o
olho e entender em que pé está cada coisa**.
- Uma coluna por etapa do pipeline do projeto, com contagem.
- Arrasto um card de coluna e a mudança persiste depois de fechar e abrir.
- Arrastar para a última coluna **conclui** o card.
- Clicar no card abre o detalhe — clicar, não arrastar (RT-32.1).

**H-03 — Projetos**
- Existe `Dia a dia` desde a primeira execução, sem eu criar nada.
- Crio um projeto novo com nome e ele aparece no seletor.
- Todo card pertence a exatamente um projeto e pode ser movido entre projetos.

**H-04 — Pipeline próprio**
- Defino as etapas de um projeto, na ordem, e o quadro passa a mostrar essas colunas.
- Renomear ou reordenar etapa não perde card.
- Apagar etapa com cards me obriga a escolher para onde eles vão.

**H-05 — Tags**
- Adiciono várias tags a um card, escrevendo.
- Filtro o quadro por tag, e o filtro combina com o de status e com a busca.
- Tag já usada é sugerida — não crio `#ligacao` e `#ligações`.

**H-06 — Contexto do projeto**
- Escrevo o contexto em texto livre, sem formulário.
- Depois de salvar, a próxima priorização daquele projeto **cita o contexto** na justificativa.
- Projeto sem contexto continua funcionando, em modo sugestão.

**H-07 — Prioridade automática**
- Todo card aberto tem prioridade e uma justificativa de uma linha.
- Se eu mudar a prioridade na mão, ela **não** é sobrescrita na rodada seguinte.
- Sem contexto no projeto, a prioridade aparece **como sugestão a confirmar**, no card.
- Depois de três confirmações, o sistema oferece escrever o contexto por mim.

**H-08 — Dependência**
- O sistema propõe dependências e eu confirmo ou recuso.
- Card aguardando outro aparece marcado, e a marcação diz **aguardando o quê**.
- Dependência circular é recusada na hora, mostrando as duas pontas.
- Sugestão não confirmada não trava nada.

**H-09 — Desbloqueio**
- Ao concluir, aparece na hora a lista do que foi destravado.
- Se não destravou nada, não aparece nada.
- Funciona **com a IA desligada**.

**H-10 — E agora?**
- A tela mostra **um** card, com a justificativa e três ações.
- *Me mostra outra* traz a próxima da fila, sem penalidade e sem pergunta.
- O que está aguardando dependência confirmada **não** é oferecido.

**H-11 — O dia tem teto**
- Marco no máximo três cards como "hoje de verdade".
- O quarto é recusado com uma mensagem que explica o porquê, não um erro seco.
- Concluir ou adiar tira o card do teto.

**H-12 — Atraso sem culpa**
- Card vencido **não pinta a tela de vermelho** e não acumula alerta.
- Uma faixa discreta oferece replanejar em bloco.

**H-13 — Ordem do dia**
- Recebo a ordem sugerida, agrupada por contexto de execução, com o porquê em uma linha.
- No máximo quatro blocos.
- O que bloqueia outra tarefa vem cedo.

**H-14 — O agente opera tudo isso**
Como **dono do negócio**, quero **falar com meu agente sobre projetos, tags e etapas**, para
**não ter que abrir a tela para nada que seja rápido**.
- *"cria uma tarefa no projeto Curso: gravar a aula 3"* → card no projeto certo, na primeira etapa.
- *"o que me destravou hoje?"* → o agente responde consultando o sistema.
- *"move a gravação da aula 2 para editado"* → o card muda de etapa.
- Se o agente não achar o projeto ou o card, ele **pergunta** — não cria parecido, porque a
  mensagem de erro lista o que existe.

**H-15 — O agente descobre a API sozinho**
Como **dono de um agente**, quero **que ele leia o contrato antes da primeira chamada**, para
**não ter que ensinar a API na mão**.
- `GET /api/operacoes` devolve o índice em português, apontando para o contrato.
- `GET /openapi.json` devolve OpenAPI 3.1 válido, com todas as rotas, parâmetros e respostas.
- `/docs` abre a página navegável, atrás da mesma tranca.
- Uma rota nova sem documentação **quebra o `npm test`**, dizendo qual é.

**H-16 — O celular, sem aplicativo**
- Mando uma frase ao bot e ela vira card, com a origem registrada.
- Mando uma pergunta e recebo a resposta — e se ele errar, `/registrar` conserta.
- Quem não está na allowlist recebe só a instrução de pareamento.

**H-17 — Chaves por agente**
- Crio uma chave no painel, com nome, papel e escopo de IA.
- A chave aparece **uma vez** e nunca mais.
- Revogo uma sem derrubar as outras, e cada card mostra de qual agente veio.

---

## Parte 16 · As armadilhas conhecidas

Cada uma custou um bug. Reconstruir sem ler esta lista é reencontrar todas.

| # | Armadilha | Sintoma |
|---|---|---|
| 1 | `toISOString()` no cálculo de "hoje" | Card criado depois das 21h nasce com a data de amanhã e some da lista |
| 2 | Comparar meia-noite com meio-dia no formatador de data | "hoje" aparece como "amanhã" |
| 3 | Confiar na **forma** da saída do modelo | Campo vem objeto onde o schema pedia lista → 500 |
| 4 | Ids alucinados escritos no banco | Cards que não existem sendo atualizados |
| 5 | Prompt sem o que o card **BLOQUEIA** | O gargalo fica abaixo do que ele trava, e o "e agora?" nunca sugere destravar |
| 6 | Porteiro **depois** dos arquivos estáticos | O painel inteiro é servido a quem não entrou |
| 7 | `documentacao` **depois** do curinga do painel | `/docs` devolve o `index.html` |
| 8 | Devolver "dono" antes de olhar a chave quando não há `.env` | Chave revogada continua entrando; card sem etiqueta de origem |
| 9 | `WWW-Authenticate` na resposta de chave errada | Caixa de senha aparecendo do nada para quem depura o agente |
| 10 | Esquecer `::1` na verificação de "é local?" | O servidor se recusa a subir achando que está exposto |
| 11 | `offset` do `getUpdates` só em memória | Reiniciar o bot reprocessa mensagens antigas e duplica cards |
| 12 | Não escapar Markdown no Telegram | `sendMessage` volta 400, a resposta some, o card fica criado e a pessoa acha que o bot ignorou |
| 13 | Comando desconhecido virando card | O quadro enche de lixo |
| 14 | Drag & drop sem distância mínima de ativação | Clique vira arrasto de zero pixel e o card nunca abre |
| 15 | Card sem `aria-label` | A coluna vira "botão, botão, botão" na leitura de tela |
| 16 | Botão dentro do card sem `stopPropagation` | Aceitar a sugestão abre o modal do card junto |
| 17 | Enum do OpenAPI digitado à mão | A doc jura que existem três prioridades depois que a quarta foi criada |
| 18 | `ATRAS_DE_PROXY` esquecido atrás de proxy | O limite de taxa conta todo mundo como o mesmo visitante |
| 19 | Sugestão da IA gravada como `confirmada = 1` | A IA passa a travar o trabalho de alguém por um palpite |
| 20 | Redefinir pipeline apagando etapa com cards | Cards somem sem ninguém decidir para onde iam |

---

## Anexo A · As variáveis de ambiente

Nada aqui é obrigatório. Sem nenhuma dessas linhas o sistema abre, guarda, lista, filtra,
conclui e adia normalmente, ouvindo só nesta máquina.

| Variável | Padrão | Para quê |
|---|---|---|
| `AUTH_USUARIO` / `AUTH_SENHA` | vazio | A senha do painel (HTTP Basic). Vazio = sem tranca |
| `API_KEY` | vazio | A **chave-mestra** de dono. As do dia a dia se criam no painel |
| `API_KEY_CONVIDADO` | vazio | Legado, aposentada. Deixe em branco |
| `HOST` | `127.0.0.1` | Onde escutar. `0.0.0.0` é opt-in explícito |
| `PORTA` | `3000` | — |
| `ATRAS_DE_PROXY` | `false` | Liga `trust proxy` |
| `DOCS_CDN` | vazio | De onde `/docs` busca o renderizador. Vazio = CDN oficial |
| `ANTHROPIC_API_KEY` | vazio | Sem ela, as rotinas de IA não rodam e os botões somem |
| `MODELO_IA` | `claude-sonnet-5` | O modelo das rotinas em lote |
| `TELEGRAM_BOT_TOKEN` | vazio | O bot. Quem pode falar é decidido por pareamento |
| `TELEGRAM_CHAT_ID` | vazio | Atalho: fixa o destinatário do **resumo** e ignora a allowlist |
| `BANCO` | `./tarefas.db` | Caminho do banco. Usado pelos testes |

---

## Anexo B · Glossário

| Termo | O que é |
|---|---|
| **Card** | Uma tarefa ou ideia. A unidade do sistema. |
| **Projeto** | O container. Todo card pertence a exatamente um. |
| **Pipeline** | A lista ordenada de etapas de um projeto. Vira as colunas do quadro. |
| **Etapa** | Uma coluna. A última do pipeline é a de conclusão. |
| **Tag** | Texto livre, várias por card, atravessa projetos. As que mais valem são as de **modo de execução** (`#5min`, `#exige-foco`), não as de assunto — o assunto já é o projeto. |
| **Contexto** | O texto onde o usuário diz o que faz uma tarefa ser urgente naquele projeto. Alimenta a IA. |
| **Hoje de verdade** | O card marcado como uma das três coisas do dia (`TETO_DO_DIA`). |
| **Aguardando** | Card com dependência **confirmada** ainda aberta. |
| **Desbloqueio** | O que a conclusão de um card destravou. Consulta ao banco, sem IA. |
| **Origem** | De qual chave/agente/chat o card veio. Vem do porteiro, nunca do corpo. |
| **Papel** | `dono` ou `convidado`. Independente do escopo de IA. |
| **Escopo de IA** | Se a chave pode disparar as rotinas que gastam a conta da Anthropic. |
