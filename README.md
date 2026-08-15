# Gestor de tarefas

Um gerenciador de tarefas pessoal que o **seu agente de IA sabe operar**.

Cards num quadro, projetos com pipeline próprio, tags, e uma camada de IA que
prioriza contra o contexto que **você** escreveu, acha dependências entre as
tarefas e avisa o que cada conclusão destravou.

Roda na sua máquina. Sem nuvem, sem conta, sem mensalidade.

---

## O que ele faz

- **Registrar custa uma frase.** Escreve e dá Enter. Projeto, prioridade e tags
  vêm depois — pela IA ou por ninguém.
- **Cards num quadro**, arrastáveis entre as colunas do projeto.
- **Projetos com pipeline próprio.** `Dia a dia` é `A fazer → Fazendo → Feito`;
  um projeto de curso pode ser `Ideia → Roteiro → Gravado → Editado → Publicado`.
- **Tags livres**, várias por card, atravessando projetos.
- **Contexto por projeto** — um texto onde você diz o que faz uma tarefa ser
  urgente ali dentro. É ele que faz a priorização ser sua e não genérica.
- **Priorização automática** contra esse contexto, com a justificativa escrita.
- **Dependências**: a IA propõe, você confirma. Ao concluir um card, o sistema
  diz **o que aquilo destravou**.
- **Modo "e agora?"** — uma tarefa na tela, com o porquê e três botões.
- **Resumo do dia no Telegram**, na hora marcada, sem você pedir.
- **Tudo acessível ao seu agente**, pela mesma API que o painel usa.

## O que ele **não** faz

Não é esquecimento — é escopo.

- Não tem cadastro de usuário, "esqueci minha senha" nem segundo usuário. A
  senha do `.env` é uma fechadura, não uma portaria — ver [Quem pode
  entrar](#quem-pode-entrar).
- Não tem colaboração, comentário nem tarefa atribuída a outra pessoa.
- Não tem anexo nem arquivo dentro do card.
- Não tem relatório de produtividade. Um sistema que mede o quanto você produziu
  produz culpa, e culpa é o que trava as pessoas que ele quer ajudar.
- Não tem aplicativo de celular. O celular entra pelo Telegram.
- Não integra com calendário nem com e-mail.

---

## Como abrir

Precisa de **Node.js 22.5 ou mais novo** (`node --version` para conferir).

```bash
npm install
npm start
```

Abra **http://localhost:3000**. O `npm start` compila o painel e sobe o
servidor — um comando, uma porta, um processo.

Na primeira execução o banco é criado sozinho, com o projeto `Dia a dia` dentro.
Não precisa rodar mais nada.

### Ligando a tranca, a IA e o Telegram (opcional)

```bash
cp .env.example .env
```

Preencha o que quiser usar. As instruções de cada chave estão dentro do arquivo.
**Sem `.env` o sistema funciona igual** — só não tranca, não prioriza, não
sugere dependência e não manda o resumo.

---

## Quem pode entrar

**Sem `.env`, não há tranca — e não precisa haver:** o servidor escuta só em
`127.0.0.1`, ou seja, o sistema não existe para o resto da rede. É o sistema de
um usuário só, você, na sua máquina.

Quando você preenche o `.env`, acendem **duas portas separadas**:

| Porta | Para quem | Como |
|---|---|---|
| `AUTH_USUARIO` + `AUTH_SENHA` | **Gente** | O navegador pede usuário e senha ao abrir o painel |
| `API_KEY` | **Agente** | `Authorization: Bearer <chave>` ou `X-API-Key: <chave>` |

O padrão do `.env.example` é usuário **`admin`**, senha **`cpdf2026`**.
**Troque a senha se este sistema for sair da sua máquina.**

São duas portas de propósito: a senha é sua e você digita; a chave é do agente,
vive em arquivo de configuração e pode ser trocada sozinha sem você mudar nada
do seu lado. Uma não vale pela outra — a chave não é aceita como senha nem a
senha como chave.

```bash
npm run chave     # gera uma chave forte para colar no .env
```

A senha protege **o painel também**, não só a API — sem isso a página e o
código dela seriam servidos para qualquer um.

> **Expor na rede.** O padrão `HOST=127.0.0.1` é a tranca que vem antes da
> senha. Só mude para `0.0.0.0` se você realmente quiser que outras máquinas
> alcancem o sistema — e preencha senha e chave antes. Se subir exposto e sem
> senha, o servidor avisa em letras grandes no terminal.

### Deixando o resumo chegar às 18h

O sistema não acorda sozinho: quem acorda é o seu computador.

- **Windows** — Agendador de Tarefas → nova tarefa diária às 18h → programa
  `npm`, argumentos `run resumo`, iniciar em: a pasta deste projeto.
- **Mac** — `crontab -e` e acrescente:
  ```
  0 18 * * * cd /caminho/do/projeto && /usr/local/bin/npm run resumo
  ```

Para a IA priorizar de madrugada, agende `npm run analisar` às 5h do mesmo jeito.

---

## Onde ficam os seus dados

Num arquivo só: **`tarefas.db`**, na raiz desta pasta.

Backup é copiar esse arquivo. Levar para outro computador é copiar esse arquivo.
Ele não vai para o git (está no `.gitignore`) — as suas tarefas são suas.

---

## Como o seu agente opera o sistema

O sistema oferece as operações **descritas em português**, e o agente lê a
descrição e escolhe qual usar:

```bash
curl http://localhost:3000/api/operacoes
```

Duas formas de chamar, e as duas passam pela mesma API:

**Pela linha de comando** — mais curto:

```bash
npm run tarefas -- hoje --texto
npm run tarefas -- criar "ligar pro contador" --tags ligacao,5min
npm run tarefas -- adiar 12 sexta
npm run tarefas -- concluir 7
npm run tarefas -- ajuda
```

A CLI lê a credencial do `.env` sozinha — você nunca digita chave.

**Por HTTP** — é o que vira MCP depois:

```bash
curl -X POST http://localhost:3000/api/cards \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"gravar a aula 3","projeto":"Curso"}'
```

> **Dica para o `CLAUDE.md` do seu agente:** diga que este sistema existe, em
> que porta ele responde, e que a lista de operações está em `/api/operacoes`.
> Três linhas resolvem — o resto ele descobre lendo.

---

## As regras que o sistema garante

Escritas em português, e testadas em código (`npm test`):

- Não existe card sem título.
- Adiar muda a data. Não conclui e não apaga nada.
- Card feito não volta para a lista de hoje.
- A última etapa do pipeline é a de conclusão; o status vem dela, nunca é digitado.
- **Prioridade que você pôs na mão nunca é sobrescrita pela IA.**
- No máximo **três** cards podem ser "hoje de verdade".
- Dependência **sugerida** não trava nada; só a **confirmada** trava.
- Dependência circular é recusada na hora, mostrando as duas pontas.
- Ideia é guardada, mas não aparece na lista de tarefas de hoje.
- Sem chave de IA, tudo acima continua valendo.

---

## Como o projeto é organizado

```
gestor-tarefas/
├── server/
│   ├── db.js        ← o banco e a migração v1 → v2
│   ├── regras.js    ← TODAS as regras de negócio moram aqui
│   ├── rotas.js     ← a API HTTP (painel e agente usam a mesma)
│   ├── ia.js        ← as rotinas de IA, em lote
│   ├── resumo.js    ← o resumo no Telegram
│   └── analisar.js  ← a rotina de madrugada
├── src/             ← o painel (React)
├── cli/tarefas.js   ← a linha de comando do agente
├── testes/          ← as regras, escritas como teste
└── tarefas.db       ← os seus dados (criado na primeira execução)
```

A regra de ouro: **regra de negócio só existe em `server/regras.js`.** A API, a
CLI e o painel chamam de lá. Se uma regra fosse reescrita na tela, painel e
agente passariam a discordar sobre o que o sistema faz.

## Para desenvolver

```bash
npm run dev     # painel com recarga automática na 5173, API na 3000
npm test        # as regras
npm run build   # compila o painel para dist/
```

---

## De onde ele veio

Este sistema nasceu de um documento, e o documento está aqui:

- [`PRD.md`](./PRD.md) — a versão 1, construída ao vivo na Turma Básica
- [`PRD-v2.md`](./PRD-v2.md) — o sistema completo, que é o que este repositório é

O banco começa no esquema da v1 e **migra** para o da v2 — quem construiu só a
v1 no build ao vivo pode apontar este projeto para o `tarefas.db` que já tem, e
os dados continuam lá, com as colunas novas ao lado.
