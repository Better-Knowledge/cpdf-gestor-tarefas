# Gestor de tarefas — PRD

**Documento de requisitos · versão 1 · 15 de agosto de 2026**
Turma Básica — Agentes e Sistemas com IA · Comunidade Profissionais do Futuro

Quatro partes, mais **uma seção que quase nenhum PRD tem**. Duas páginas.
Está aqui, constrói. Não está, **não constrói hoje**.

---

## Parte 1 · O problema

O dia inteiro aparecem coisas para fazer e ideias para não esquecer — no meio de uma
reunião, no carro, respondendo cliente. Anotar em algum lugar significa parar o que se
está fazendo, e por isso a maior parte não é anotada. O que sobra fica espalhado entre
papel, bloco de notas do celular e mensagem para si mesmo no WhatsApp.

O resultado é sempre o mesmo: no fim do dia ninguém sabe o que ficou aberto, e na semana
seguinte a mesma coisa é lembrada de novo, do zero.

**Este sistema existe para que registrar custe uma frase, e para que a lista do que falta
exista em um lugar só.**

---

## Parte 2 · O escopo

### Vai ter

- Registrar uma tarefa
- Marcar como feita
- Adiar para outro dia
- Ver a lista de hoje
- Filtrar por aberto / feito / todos
- **Criar, concluir e adiar falando** com o agente
- **O resumo do dia chegando às 18h** no Telegram

### Não vai ter

- Login e senha
- Mais de um usuário
- Anexo
- **Aplicativo de celular próprio** — o celular entra pelo Telegram, que já está instalado
- Relatório
- Integração com calendário
- E-mail

> **Por que a lista da direita existe.** Tudo que não estiver escrito aqui, o agente
> preenche por conta própria — e amanhã existe uma tela de login que ninguém pediu e que
> agora tem que ser mantida. Ele não erra por falta de inteligência; erra por falta de
> instrução.
>
> **Escopo pequeno é decisão, não limitação de tempo.** Um sistema maior não resolveria
> melhor o problema da Parte 1.

---

## Parte 3 · As histórias

A fórmula: **como QUEM, quero O QUÊ, para POR QUÊ.** O *para* é a parte que quase ninguém
escreve, e é a que diz ao agente o que fazer quando o caso não estava previsto.

**H1 — Registrar**
Como **dono do negócio**, quero **registrar uma tarefa escrevendo uma frase**, para
**tirar ela da cabeça sem parar o que estou fazendo**.

**H2 — Concluir**
Como **dono do negócio**, quero **marcar uma tarefa como feita**, para **a lista de hoje
mostrar só o que ainda falta**.

**H3 — Adiar**
Como **dono do negócio**, quero **adiar uma tarefa para outro dia**, para **o que não cabe
hoje parar de me cobrar hoje**.

**H4 — Ver a lista de hoje**
Como **dono do negócio**, quero **ver numa tela o que está aberto hoje**, para **bater o
olho e saber o que falta**.

**H5 — Filtrar**
Como **dono do negócio**, quero **filtrar entre aberto, feito e todos**, para **achar uma
coisa específica sem ler a lista inteira**.

**H6 — Falar com o agente**
Como **dono do negócio**, quero **adiar uma tarefa falando com o meu agente**, para **não
precisar parar o que estou fazendo e abrir uma tela**.

**H7 — O resumo das 18h**
Como **dono do negócio**, quero **receber às 18h, no Telegram, o resumo do que fiz e do
que ficou aberto**, para **fechar o dia sem abrir o computador**.

---

## Parte 4 · Os critérios de aceite

Como se sabe que cada história ficou pronta. Sem esta parte, *pronto* é opinião.

**H1 — Registrar**
- Registro uma tarefa com uma frase e ela aparece na lista.
- Fecho o programa, abro de novo, e ela continua lá.
- Se eu não disser a data, ela entra como **hoje**.
- Se eu disser que é uma **ideia**, ela é guardada como ideia e **não** aparece na lista de
  tarefas de hoje.
- Uma tarefa **sem título** não é aceita.

**H2 — Concluir**
- Clico em concluir e a tarefa sai da lista de abertas.
- Ela **não volta** para a lista de hoje no dia seguinte.
- Ela continua existindo — aparece no filtro *feito* e no filtro *todos*.

**H3 — Adiar**
- Adio uma tarefa para outro dia e ela **some da lista de hoje**.
- No dia para o qual foi adiada, ela **aparece** na lista de hoje.
- Adiar **não** marca como feita, e **não** apaga nada.

**H4 — Ver a lista de hoje**
- Abro o painel e vejo, sem clicar em nada, as tarefas abertas de hoje.
- Cada linha mostra o título, a data e a prioridade.
- Se não houver nada aberto hoje, a tela diz isso — não fica em branco.

**H5 — Filtrar**
- Existem três filtros: **aberto**, **feito**, **todos**.
- Trocar de filtro muda a lista na hora, sem recarregar a página na mão.

**H6 — Falar com o agente**
- Digo ao agente *"adia a ligação pro contador pra sexta"* e, ao atualizar o painel, a
  tarefa está com a nova data.
- Funciona igual para **criar** e para **concluir**.
- Se o agente não achar a tarefa que eu citei, ele **pergunta qual é** — não cria uma nova
  nem chuta.
- O agente **não** guarda nada em arquivo de texto à parte: tudo o que ele registra vai
  para o mesmo lugar que o painel lê.

**H7 — O resumo das 18h**
- Às 18h chega uma mensagem no Telegram sem que eu peça.
- A mensagem tem: o que foi concluído hoje, o que ficou aberto, e o que está atrasado.
- Se o dia estiver vazio, a mensagem diz isso em uma linha.

---

## Parte 5 · Quem faz o quê: o agente ou a aplicação

**A seção que quase nenhum PRD tem** — e a que mais economiza dinheiro.

A régua é a mesma de sempre: **frequência × variação**. Toda hora e sempre igual, é
aplicação. De vez em quando e sempre diferente, é agente. **E o que precisa acontecer
sozinho, na hora marcada, é aplicação — sempre.**

| **APLICAÇÃO** | **AGENTE** |
|---|---|
| Guardar | Entender *"adia a ligação pro contador pra sexta"* |
| Listar | Deduzir se é ideia ou tarefa |
| Filtrar | Agrupar por tema |
| Marcar como feita | Achar relação entre as anotações |
| Adiar | |
| **Mandar o resumo às 18h, sozinho** | |

**Por que isso está escrito aqui:** se não estiver, o agente constrói tudo dentro da
aplicação — inclusive o que não devia estar lá. E aí paga-se processamento de IA toda vez
que alguém marca uma tarefa como feita. A régua não é filosofia; é uma linha na conta no
fim do mês.

**A regra fica só de um lado.** Marcar como feita é sempre igual: é a aplicação que faz, e
faz sem IA nenhuma. Entender uma frase torta é sempre diferente: é o agente que faz. As
duas colunas trabalham na mesma tarefa — o agente entende, a aplicação guarda.

**O que muda para a Skill que já existe.** A skill `registrar`, escrita no Bloco 2, não é
jogada fora: ela para de guardar em arquivo de texto e passa a guardar **no sistema**.
Mesmo procedimento, outro destino.

---

## Anexo A · Como o sistema é por dentro

### As quatro caixas

- **GUARDA** — **um arquivo de banco de dados** na pasta do projeto. Todas as tarefas
  moram nele. Fechou o computador, continua lá. Backup é copiar o arquivo.
- **DECIDE** — as regras: uma tarefa adiada muda de data · uma tarefa feita não volta para
  a lista de hoje · não existe tarefa sem título · às 18h, manda o resumo.
- **MOSTRA** — o painel: a lista de hoje, um filtro, um botão de concluir.
- **CONVERSA** — as operações que o sistema oferece: **criar · listar · concluir ·
  adiar**. É por elas que o agente opera tudo isso.

### Os campos de uma tarefa

Uma tarefa não é um texto solto. É um punhado de **campos com nome e tipo** — do mesmo
jeito que uma planilha tem colunas.

| Campo | Tipo | Preenchido por |
|---|---|---|
| `titulo` | texto | quem registra — **obrigatório** |
| `tipo` | ideia **ou** tarefa | quem registra; o agente deduz se não for dito |
| `data` | um dia | padrão: hoje |
| `status` | aberta **ou** feita | padrão: aberta |
| `tema` | texto | o agente, quando agrupa |
| `prioridade` | alta, média **ou** baixa | o agente; padrão: média |

✕ *"ligar pro contador amanhã de manhã, urgente"* → uma frase. Ninguém consegue filtrar isso.

✓ título: *ligar pro contador* · data: *16/08* · status: *aberta* · prioridade: *alta* →
agora dá para filtrar, contar, ordenar — e **um agente consegue mexer**.

É a primeira regra agent-friendly: **dado estruturado.** Sem ela, o resto não acontece.

### As escolhas de hoje, e o porquê de cada uma

- **Roda na sua máquina** — sem nuvem, sem cartão de crédito, sem deploy.
- **Um arquivo de banco** — dá para copiar, mandar por e-mail, fazer backup arrastando.
- **Sem login** — um usuário só: você.
- **Sem app de celular** — o celular entra pelo Telegram.

Nenhuma dessas é limitação da ferramenta. São escolhas.

---

## Anexo B · A ordem do build

Uma história de cada vez, e ver funcionando antes de seguir.

1. *"Leia o PRD e me diga o que você entendeu que vai construir."* — **antes de construir nada**
2. *"Crie o banco com os campos do documento. Só isso, mais nada."*
3. *"Agora faça uma tarefa ser registrada e guardada."*
4. *"Agora o painel: a lista de hoje, com o botão de concluir."*
5. *"Agora o filtro: aberto, feito, e todos."*

— **daqui para baixo é bônus de hoje** —

6. *"Agora as operações: criar, listar, concluir e adiar — para o meu agente conseguir operar."*
7. *"Agora o resumo das 18h no Telegram."*

Chegou no **5**, o sistema está de pé.

---

## Anexo C · Nota técnica — para o agente

> Esta seção é a única do documento que fala de tecnologia. **Ela não vai em slide** — a
> decisão 7 do deck continua valendo. Mas ela vai para a mão do aluno junto com o resto do
> documento, porque é ela que faz quarenta agentes construírem a mesma coisa em vez de
> quarenta stacks diferentes, e é ela que faz o repositório de contingência bater com o que
> nasceu ao vivo.

- **Runtime: Node.js 22.5 ou mais novo.** É o que o roteiro de ambiente já manda instalar
  por causa do Claude Code, então não é uma segunda dependência. Uma linguagem só, do banco
  ao navegador.
- **Banco: SQLite pelo `node:sqlite`**, embutido no Node. Um arquivo `tarefas.db` na raiz do
  projeto, uma tabela `tarefas` com os seis campos do Anexo A mais um `id`. Embutido de
  propósito: módulo nativo de SQLite precisa compilar, e no Windows sem build tools isso
  falha.
- **Painel: React com Vite.** O Vite compila para `dist/` e **o mesmo servidor Express serve
  o `dist/` e a API** — uma porta, um processo, `npm start`. Nada de subir back num terminal
  e front em outro.
- **Operações (Anexo A, caixa CONVERSA): uma API HTTP em `/api`.** É a mesma que o painel
  consome — não existe uma segunda porta feita só para o agente, senão uma das duas fica
  desatualizada. Uma rota `/api/operacoes` devolve a lista **descrita em português**, e é
  ela que o agente lê para escolher. Uma CLI fina por cima (`npm run tarefas -- …`) é
  atalho, não caminho paralelo. **Envelopar a API como MCP é assunto do dia seguinte.**
- **Resumo das 18h:** um script `npm run resumo` que monta o texto e posta via API de bot do
  Telegram, com token e chat id lidos de um `.env` local. O agendamento é do sistema
  operacional (Agendador de Tarefas no Windows, `launchd`/`cron` no Mac) — porque **agente
  não acorda sozinho**.

  > O chat id fixo no `.env` é o caminho **de hoje**, e ele resolve o caso de um usuário só
  > numa máquina só. Ele responde *para quem mandar* — não responde *quem pode falar com o
  > bot*, que é uma pergunta que só aparece quando o sistema sai da sua máquina. A v2
  > resolve isso com allowlist e pareamento.
- **Regra de negócio mora num lugar só**, um módulo `regras.js`. API, CLI e painel chamam de
  lá. Regra reescrita na tela é painel e agente discordando sobre o que o sistema faz.
- **README obrigatório ao final:** o que o sistema faz · como abrir · onde fica o arquivo
  do banco · o que ele **não** faz.

> **Uma armadilha que custou tempo na implementação de referência, e vai custar na de vocês:**
> data e hora precisam ser do **fuso local**, nunca de `toISOString()`. No Brasil, UTC faz
> "hoje" virar amanhã depois das 21h — e um card criado às 22h nasce com a data do dia
> seguinte e some da lista de hoje. Num gestor de tarefas isso não é detalhe.

---

## Para onde ele cresce

Este documento é **o corte de hoje**, e o corte é a decisão mais importante dele. O sistema
completo — cards num quadro, projetos com pipeline próprio, tags, priorização por IA contra
o contexto do projeto, dependências e desbloqueio — está em
[`PRD-v2.md`](./PRD-v2.md).

**A v2 não é projetada em aula.** Ela existe porque é ali que a régua da Parte 5 se paga:
agrupar por tema, priorizar e achar relação nasceram dentro do agente, no Bloco 2, e migram
para a aplicação quando viram recorrentes — liberando o agente para a análise que ninguém
consegue prever.

---

## Procedência

- Promessa de escopo: deck de abertura do Danilo Gato, slide 2.
- Régua agente × aplicação: [`20260815-b2-o-segundo-usuario`, slides 22 e 23.
- Leitura guiada deste documento: [`20260815-b3-do-prd-ao-sistema`, slides 5, 6, 7, 9, 11 e 14.
