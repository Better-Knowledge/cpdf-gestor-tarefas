# Gestor de tarefas — PRD v2, o sistema completo

**Documento de requisitos · versão 2 · 14 de agosto de 2026**
Continuação de [`PRD.md`](./PRD.md) (v1 — o corte de 15/08)

> **Este documento não é projetado durante o build ao vivo.** A v1 é o que nasce em 40
> minutos na Turma Básica; a v2 é para onde o sistema cresce depois. Mostrar a v2 antes de
> a v1 estar de pé desfaz o argumento do escopo pequeno.

---

## Parte 0 · A tese: a regra muda de casa

No Bloco 2 a turma escreveu uma Skill que **agrupa por tema, atribui prioridade e acha
relação entre as anotações**. Aquilo é lógica de negócio morando **no agente**, e foi a
escolha certa: no começo isso é esporádico e sempre diferente.

Com o sistema de pé e trezentas tarefas dentro dele, as mesmas três coisas passam a
acontecer **toda hora e quase sempre iguais**. Pela régua — frequência × variação — elas
mudam de casa: **saem do agente e entram na aplicação.**

| Nasceu no agente (Bloco 2) | Vira, na v2 | Por que migrou |
|---|---|---|
| Agrupar por tema | **Tags**, atribuídas em lote pela aplicação | Recorrente e quase sempre igual |
| Atribuir prioridade | **Priorização automática** contra o contexto do projeto | Roda todo dia, no mesmo formato |
| Achar relação entre anotações | **Detecção de dependência** entre cards | Precisa varrer a base inteira, sempre |
| Nada disso acontecia sozinho | **Rotina diária de análise**, na hora marcada | Agendado é aplicação. Sempre |

**E o ganho não é economia — é espaço.** Tirar do agente o que é repetitivo libera ele
para o que só ele faz: *"por que eu não avancei no projeto do curso esse mês?"*, *"olha
minha agenda de amanhã e me diz o que é realista"*, *"esse cliente reclamou de prazo três
vezes — o que está travando?"*. Perguntas que ninguém consegue prever, e que por isso nunca
viram funcionalidade.

> **A frase que resume:** o que é previsível vira sistema; o que é imprevisível fica com o
> agente. Todo item que migra é um item a menos disputando a atenção dele.

**Consequência de custo, que é o outro lado da mesma moeda.** A aplicação prioriza a base
inteira **uma vez por dia, em lote** — uma chamada de IA. Se a mesma priorização morasse no
agente, ela aconteceria a cada vez que alguém abrisse a lista.

---

## Parte 1 · O problema que a v1 não resolve

A v1 resolveu registrar: custa uma frase, e a lista existe num lugar só.

O que ela não resolve aparece na terceira semana, com duzentos cards dentro:

- **A lista de hoje não diz por onde começar.** Vinte itens abertos, todos "média".
- **Nem toda tarefa é do mesmo assunto.** Uma gravação de aula e uma ligação para o
  contador não têm o mesmo caminho até ficarem prontas, e mesmo assim vivem na mesma lista.
- **Coisas dependem de coisas**, e isso não está escrito em lugar nenhum. Você descobre que
  estava travado no dia em que já era tarde.
- **Concluir não devolve nada.** Some da lista, e pronto. O esforço não vira progresso
  visível.
- **A ordem do dia é montada na base do humor.** Cinco trocas de contexto num dia que
  poderia ter tido duas.

E há um problema anterior a todos esses: **decidir o que fazer agora é, para muita gente, a
parte mais cara do trabalho.** Para quem tem TDAH, uma lista de vinte itens não é
informação — é paralisia. Para quem é altamente produtivo, o gargalo deixou de ser
capacidade e passou a ser sequenciamento.

**Este sistema existe para responder uma pergunta, bem, várias vezes por dia: *e agora?***

---

## Parte 2 · O escopo

### Vai ter

**Organização**
- **Cards** — cada tarefa é um card, num quadro visual, arrastável entre colunas
- **Projetos** — o card mora num projeto; existe um projeto padrão, **Dia a dia**
- **Pipelines por projeto** — cada projeto define suas próprias colunas (etapas)
- **Tags próprias da tarefa** — livres, várias por card, independentes de projeto e etapa
- **Contexto do projeto** — um texto onde o usuário diz o que importa naquele projeto

**Inteligência**
- **Priorização automática** de cada card contra o contexto do projeto
- **Priorização sugerida** quando o projeto não tem contexto — sugere e pede confirmação
- **Detecção de relação e dependência** entre cards, como sugestão a confirmar
- **Aviso de desbloqueio** — ao concluir um card, o sistema diz o que aquilo destravou
- **Insight de encadeamento** — a ordem sugerida para o dia, e o porquê dela
- **Sugestão de quebra** — card parado há muito tempo provavelmente é grande demais

**Operação**
- Tudo o que a v1 já fazia: registrar por frase · concluir · adiar · listar · filtrar
- **Modo "e agora?"** — a tela que mostra **uma** tarefa, a próxima, com a justificativa
- **O resumo diário** no Telegram, agora com o que foi destravado e a ordem sugerida
- **Todas as operações acessíveis ao agente** — inclusive as novas

### Não vai ter, nem na v2

- Colaboração em tempo real, comentários, menções, atribuir tarefa a outra pessoa
- Anexos e arquivos dentro do card
- Relatórios gerenciais, gráficos de produtividade, métricas de desempenho pessoal
- Aplicativo de celular próprio — o celular continua entrando pelo Telegram
- Integração com calendário
- Cobrança, planos, contas de usuário

> **Sobre os relatórios de produtividade:** ficam de fora de propósito. Um sistema que mede
> quanto você produziu é um sistema que produz culpa, e culpa é exatamente o que trava as
> pessoas que este produto quer ajudar. O sistema mostra **o que vem agora**, não **o quanto
> você falhou ontem**.

---

## Parte 3 · Os objetos do sistema

### Projeto

O container. Todo card pertence a exatamente um projeto.

| Campo | Tipo | Observação |
|---|---|---|
| `nome` | texto | obrigatório |
| `contexto` | texto livre | o que importa aqui — alimenta a IA |
| `pipeline` | lista ordenada de etapas | próprio do projeto |
| `arquivado` | sim/não | projeto some do quadro sem perder histórico |

**Existe sempre um projeto padrão, `Dia a dia`**, criado na primeira execução, com o
pipeline mais simples possível: `A fazer → Fazendo → Feito`. Quem nunca criar um segundo
projeto tem, na prática, a v1 com cards. **Ninguém é obrigado a organizar nada para começar
a usar.**

**O contexto do projeto** é o campo mais importante e o menos óbvio. É onde o usuário
escreve, em português, o que faz uma tarefa ser urgente ali dentro. Exemplo real:

> *"Curso de agentes. A turma começa em 3 de setembro e não muda. Qualquer coisa que
> bloqueie a gravação das aulas vem antes de qualquer coisa de divulgação. Material de aula
> tem que estar pronto uma semana antes da aula acontecer. Coisa de plataforma pode
> esperar — a turma é pequena e eu aguento na mão."*

Três frases assim mudam a priorização de forma visível. **Sem contexto o sistema funciona**
— só passa a sugerir em vez de decidir.

### Pipeline

A lista ordenada de etapas de um projeto. É o que vira as colunas do quadro.

- `Dia a dia` → **A fazer · Fazendo · Feito**
- `Curso` → **Ideia · Roteiro · Gravado · Editado · Publicado**
- `Cliente` → **Proposta · Aprovado · Em execução · Entregue · Pago**

Regras: toda etapa tem nome e posição · a **última etapa é a de conclusão** (entrar nela é
concluir o card) · renomear ou reordenar etapa não move card de lugar · apagar uma etapa que
tem cards exige dizer para onde eles vão.

### Card

| Campo | Tipo | Preenchido por |
|---|---|---|
| `titulo` | texto | quem registra — **obrigatório** |
| `descricao` | texto | opcional |
| `projeto` | um projeto | padrão: `Dia a dia` |
| `etapa` | uma etapa do pipeline do projeto | padrão: a primeira |
| `tags` | lista de textos | usuário e IA |
| `tipo` | ideia **ou** tarefa | usuário; a IA deduz se não for dito |
| `data` | um dia | padrão: hoje |
| `status` | aberta **ou** feita | derivado da etapa |
| `prioridade` | alta · média · baixa | IA, contra o contexto |
| `prioridade_origem` | usuário **ou** IA | **quem decidiu fica registrado** |
| `justificativa` | texto curto | por que a IA priorizou assim |
| `depende_de` | lista de cards | sugerida pela IA, **confirmada pelo usuário** |
| `criado_em`, `movido_em` | data e hora | sistema |

**`prioridade_origem` não é detalhe.** Prioridade posta pelo usuário **nunca** é
sobrescrita pela IA — no máximo a IA discorda por escrito, numa linha. É a diferença entre
uma ferramenta que ajuda e uma que insiste.

### Tag

Texto livre, várias por card, atravessa projetos. Serve ao corte que o pipeline não dá:
`#ligacao`, `#5min`, `#exige-foco`, `#esperando-terceiro`, `#casa`.

As tags que mais valem são as de **modo de execução**, não as de assunto — o assunto já é o
projeto. `#5min` e `#exige-foco` são o que permite o sistema montar um bloco coerente de
trabalho.

---

## Parte 4 · A inteligência

Quatro análises. Todas rodam **na aplicação**, em lote, na hora marcada — não a cada clique.

### 4.1 Priorização

**Com contexto:** a IA lê o contexto do projeto e o card, e atribui `alta`, `média` ou
`baixa` com uma linha de justificativa que cita o contexto. *"Alta — bloqueia a gravação da
aula 3, e o contexto diz que gravação vem antes de divulgação."*

**Sem contexto:** a IA **não decide, sugere.** O card fica com a prioridade proposta
marcada como sugestão, e o painel mostra um pedido de confirmação. Depois de três
confirmações no mesmo projeto, o sistema oferece transformar o padrão observado em contexto
escrito — *"parece que aqui o que tem data marcada vem primeiro. Quer que eu escreva isso no
contexto do projeto?"*

**Nunca sobrescreve prioridade posta à mão.**

### 4.2 Relação e dependência

Varre os cards abertos procurando pares em que um precisa acontecer antes do outro, e
propõe: *"'Contratar o editor' provavelmente precisa acontecer antes de 'Editar a aula 2'.
É isso?"*

Regras que não se negociam:
- **A IA sugere, o usuário confirma.** Dependência não confirmada não bloqueia nada.
- Dependência **não esconde** card — marca como *aguardando*, e diz aguardando o quê.
- Ciclo de dependência é recusado na hora, com as duas pontas na tela.

### 4.3 Desbloqueio

Quando um card é concluído, o sistema **diz na hora o que aquilo destravou**:

> ✓ *Contratar o editor* — feito.
> **Isso destravou 2 tarefas:** Editar a aula 2 · Editar a aula 3.

Esta é, junto com o modo "e agora?", a funcionalidade mais importante do produto. Concluir
uma tarefa e ver duas outras acenderem é a diferença entre riscar item de lista e sentir que
a semana andou.

### 4.4 Encadeamento

Uma vez por dia, a IA propõe **a ordem do dia** — não a lista, a ordem — agrupando o que
compartilha contexto de execução: as três ligações juntas, o bloco de foco quando a agenda
está livre, o que é de cinco minutos encaixado nas frestas. Sempre com o porquê em uma
linha, e sempre reordenável na mão.

### 4.5 Sugestão de quebra

Card parado na mesma etapa há mais de sete dias raramente é preguiça — quase sempre é uma
tarefa grande demais disfarçada de tarefa. O sistema propõe dois ou três cards menores no
lugar, e o usuário aceita, edita ou ignora.

### Quando cada uma roda

| Análise | Quando | Custo |
|---|---|---|
| Priorização | 1× por dia, de madrugada, em lote · e ao criar card | Uma chamada por lote |
| Relação e dependência | 1× por dia, em lote | Uma chamada por lote |
| Desbloqueio | na hora da conclusão | Nenhuma — é consulta ao banco |
| Encadeamento | 1× por dia, junto com o resumo | Uma chamada |
| Sugestão de quebra | 1× por semana | Uma chamada |

**O desbloqueio não usa IA nenhuma** — as dependências já estão gravadas, é uma consulta.
Vale reparar nisso: a funcionalidade que mais parece inteligente é a mais burra do sistema.

---

## Parte 5 · Desenhado para quem trava

Um gerenciador de tarefas comum assume que a dificuldade está em lembrar. Para boa parte
das pessoas a dificuldade está em **escolher** e em **começar**. Cinco decisões de produto
saem daí, e nenhuma delas é enfeite.

**1 · Uma coisa por vez.** O modo **"e agora?"** mostra **um** card — o próximo — com a
justificativa em uma linha e três botões: *feito* · *não dá agora* · *me mostra outra*. Uma
lista de vinte itens é a tela que trava; uma tarefa é a tela que destrava. É a tela padrão
para quem quiser deixar assim.

**2 · O dia tem teto.** No máximo **três** cards podem estar marcados como *hoje de
verdade*. O resto continua no quadro, sem sumir e sem cobrar. Um dia com três coisas
possíveis é um dia que termina inteiro; um dia com vinte termina sempre em dívida.

**3 · Progresso visível a cada conclusão.** O aviso de desbloqueio (4.3) existe por isso.
Fechar o loop é o que mantém a pessoa voltando amanhã.

**4 · Atraso não vira vermelho.** Card com data vencida **não pinta a tela de vermelho e não
acumula alerta.** Uma vez por semana o sistema oferece um replanejamento em bloco: *"12
cards passaram da data. Quer adiar todos para a semana que vem, ou revisar um por um?"*
Culpa acumulada é o que faz as pessoas abandonarem gerenciador de tarefas — e a que faz
abandonarem mais rápido é a lista vermelha de segunda de manhã.

**5 · Entrar continua custando uma frase.** Nada do que a v2 acrescenta pode transformar o
registro em formulário. Card novo nasce com uma frase; projeto, etapa, tags e prioridade
são preenchidos depois, pela IA ou por ninguém. **Se registrar voltar a custar caro, o
sistema morre — todos os outros recursos dependem de a base estar cheia.**

**E para quem já é muito produtivo:** o valor não está em nenhum item acima isoladamente —
está em 4.2 e 4.4. Dependência explícita elimina o retrabalho de descobrir bloqueio tarde, e
encadeamento elimina troca de contexto. Quem já entrega muito não precisa de motivação;
precisa de sequenciamento.

---

## Parte 6 · As histórias e os critérios

**H8 — Cards num quadro**
Como **dono do negócio**, quero **ver minhas tarefas como cards num quadro**, para **bater o
olho e entender em que pé está cada coisa**.
- O quadro mostra uma coluna por etapa do pipeline do projeto.
- Arrasto um card de coluna e a mudança persiste depois de fechar e abrir.
- Arrastar para a última coluna **conclui** o card.

**H9 — Projetos**
Como **dono do negócio**, quero **separar minhas tarefas por projeto**, para **não misturar
o curso com o cliente com a casa**.
- Existe um projeto `Dia a dia` desde a primeira execução, sem eu criar nada.
- Crio um projeto novo com nome e ele aparece no seletor.
- Todo card pertence a exatamente um projeto e pode ser movido entre projetos.

**H10 — Pipeline próprio**
Como **dono do negócio**, quero **etapas diferentes em cada projeto**, para **o quadro
refletir como aquele trabalho acontece de verdade**.
- Defino as etapas de um projeto, na ordem, e o quadro passa a mostrar essas colunas.
- Renomear ou reordenar etapa não perde card.
- Apagar etapa com cards me obriga a escolher para onde eles vão.

**H11 — Tags**
Como **dono do negócio**, quero **marcar tarefas com tags minhas**, para **cortar a lista
por um critério que não é o projeto**.
- Adiciono várias tags a um card, escrevendo.
- Filtro o quadro por tag, e o filtro combina com o de status.
- Tag já usada é sugerida ao digitar — não crio `#ligacao` e `#ligações`.

**H12 — Contexto do projeto**
Como **dono do negócio**, quero **escrever o que importa num projeto**, para **o sistema
priorizar do meu jeito, e não do jeito genérico**.
- Escrevo o contexto em texto livre, sem formulário.
- Depois de salvar, a próxima priorização daquele projeto **cita o contexto** na
  justificativa.
- Projeto sem contexto continua funcionando, em modo sugestão.

**H13 — Prioridade automática**
Como **pessoa que trava para decidir**, quero **que o sistema priorize por mim**, para **não
gastar minha melhor hora do dia decidindo o que fazer**.
- Todo card aberto tem prioridade e uma justificativa de uma linha.
- Se eu mudar a prioridade na mão, ela **não** é sobrescrita na rodada seguinte.
- Sem contexto no projeto, a prioridade aparece **como sugestão a confirmar**.

**H14 — Dependência**
Como **dono do negócio**, quero **saber o que depende do quê**, para **não descobrir tarde
que estava travado**.
- O sistema propõe dependências e eu confirmo ou recuso.
- Card aguardando outro aparece marcado, e a marcação diz **aguardando o quê**.
- Dependência circular é recusada na hora, mostrando as duas pontas.

**H15 — Desbloqueio**
Como **pessoa que precisa ver progresso**, quero **saber o que a tarefa que acabei de fazer
destravou**, para **sentir que a semana andou**.
- Ao concluir, aparece na hora a lista do que foi destravado.
- Se não destravou nada, não aparece nada — sem mensagem de consolo.
- O que foi destravado hoje entra no resumo das 18h.

**H16 — E agora?**
Como **pessoa com dificuldade de começar**, quero **uma tela que me mostre só a próxima
tarefa**, para **não travar olhando uma lista**.
- A tela mostra **um** card, com a justificativa e três ações.
- *Me mostra outra* traz a próxima da fila, sem penalidade e sem pergunta.
- Posso deixar essa tela como a tela de abertura.

**H17 — Ordem do dia**
Como **pessoa muito produtiva**, quero **uma ordem sugerida para o dia**, para **agrupar o
que é parecido e trocar menos de contexto**.
- Uma vez por dia recebo a ordem sugerida, com o porquê em uma linha.
- Consigo reordenar na mão, e a minha ordem manda.
- A ordem chega junto do resumo das 18h, para o dia seguinte.

**H18 — O agente opera tudo isso**
Como **dono do negócio**, quero **falar com meu agente sobre projetos, tags e etapas**, para
**não ter que abrir a tela para nada que seja rápido**.
- *"cria uma tarefa no projeto Curso: gravar a aula 3"* → card no projeto certo, na primeira
  etapa.
- *"o que me destravou hoje?"* → o agente responde consultando o sistema.
- *"move a gravação da aula 2 para editado"* → o card muda de etapa.
- Se o agente não achar o projeto ou o card, ele **pergunta** — não cria parecido.

---

## Parte 7 · Quem faz o quê, na v2

| **APLICAÇÃO** (recorrente, previsível, agendado) | **AGENTE** (esporádico, sempre diferente) |
|---|---|
| Guardar, listar, filtrar, mover card | Entender pedido torto em português |
| Manter projetos, pipelines e tags | Conversar sobre o que está travado, e por quê |
| **Priorizar em lote contra o contexto** | Analisar um período: *"por que o projeto X não andou?"* |
| **Detectar dependência em lote** | Cruzar o sistema com o que **não** está nele — agenda, e-mail, conversa |
| **Avisar desbloqueio** | Ajudar a **escrever o contexto** de um projeto novo |
| **Montar a ordem do dia** | Casos não previstos — que são a maioria dos casos |
| **Mandar o resumo às 18h, sozinho** | |

**A linha divisória, em uma frase:** se você consegue escrever o passo a passo, é
aplicação; se toda vez é diferente, é agente.

**E repare no que aconteceu com o agente.** Ele não perdeu função — perdeu **tarefa
braçal**. Quanto mais o sistema absorve do que é repetitivo, mais sobra do agente para o
que ninguém conseguiu prever. Um agente que passa o dia classificando tarefa é um agente
caro fazendo trabalho barato.

---

## Parte 8 · A ordem de construção

A v2 não é um pedido. São seis fatias, cada uma testável sozinha, na ordem em que cada uma
faz a seguinte valer mais.

| # | Fatia | Depende de | Entrega |
|---|---|---|---|
| **1** | Projetos e o projeto padrão `Dia a dia` | v1 de pé | Card sabe onde mora |
| **2** | Pipeline por projeto e o quadro de cards | 1 | O Trello aparece |
| **3** | Tags e filtros combinados | 2 | O corte transversal |
| **4** | Contexto do projeto + priorização em lote | 1 | A primeira IA da aplicação |
| **5** | Dependência, desbloqueio e o modo "e agora?" | 4 | O coração do produto |
| **6** | Ordem do dia, sugestão de quebra, resumo ampliado | 5 | A rotina fechada |

**A fatia 5 é a razão de o produto existir.** As quatro anteriores são infraestrutura para
ela. Se o tempo acabar, ela é a última a ser cortada.

---

## Anexo · Nota técnica

Continua valendo tudo do [Anexo C da v1](./PRD.md): Node 22.5+, SQLite pelo
`node:sqlite`, React com Vite servido pelo mesmo Express da API, regra de negócio num módulo
só, data e hora sempre no fuso local.

O que a v2 acrescenta:

- **Tabelas novas:** `projetos`, `etapas`, `tags`, `card_tags`, `dependencias`. O card é a
  tabela `tarefas` da v1 com colunas novas via `ALTER TABLE` — **migração, não recriação.**
  O esquema é versionado por `PRAGMA user_version`: 1 é a v1, 2 é a v2, e a migração roda
  sozinha na primeira execução.
- **Chamada de IA:** `@anthropic-ai/sdk`, modelo `claude-sonnet-5`, chave no `.env`. **Uma
  chamada por lote, nunca uma por card** — o prompt recebe o contexto do projeto e a lista
  inteira de cards abertos. Saída estruturada por *tool use* obrigatório (`tool_choice`), e
  não JSON extraído de texto.
- **Ids alucinados são descartados em silêncio.** Toda resposta do modelo é conferida contra
  os ids que foram enviados no prompt. O que não bater, não vira escrita no banco.
- **Agendamento:** o mesmo mecanismo do resumo das 18h (Agendador de Tarefas no Windows,
  `launchd`/`cron` no Mac), com uma rodada `npm run analisar` de madrugada.
- **Degradação:** sem chave de API ou sem internet, **o sistema inteiro continua
  funcionando** — só não prioriza, não sugere dependência e não monta a ordem do dia. O
  quadro, os filtros e o registro nunca dependem de IA. Na tela, os botões de IA
  simplesmente não aparecem. Esta regra não é negociável: um gerenciador de tarefas
  inutilizável offline é um gerenciador de tarefas que se perde.
- **Drag & drop:** `@dnd-kit/core`, com distância mínima de ativação — sem ela, clicar num
  card vira um arrasto de zero pixel e o card nunca abre. O card carrega `aria-label`
  próprio: sem isso a coluna vira uma fileira de "botão, botão, botão" na leitura de tela.
- **Operações para o agente:** as da v1 mais `projetos`, `etapa`, `tags`, `dependencias`,
  `proxima` (o "e agora?"), `atrasados`, `replanejar` e as quatro rotinas de IA. Todas na
  mesma API `/api` que o painel consome, listadas em `/api/operacoes` com descrição em
  português. **Envelopar como MCP é o passo seguinte, não este.**
