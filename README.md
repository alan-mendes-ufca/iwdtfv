# I want to download this fucking video

Site pessoal para baixar vídeos do YouTube, X, TikTok e Instagram. Você cola o link, vê as qualidades que aquele vídeo realmente tem, escolhe uma (ou "Somente áudio (MP3)") e baixa o arquivo.

Por baixo, o servidor chama o [yt-dlp](https://github.com/yt-dlp/yt-dlp) e o [ffmpeg](https://ffmpeg.org/). Por isso o projeto roda em Node self-hosted ou em Docker; não funciona em Vercel nem em outro ambiente serverless.

## Funcionalidades

- Lista as qualidades disponíveis do vídeo (uma opção por resolução, com tamanho estimado).
- Baixa vídeo + áudio mesclados em mp4, ou só o áudio em mp3.
- Mensagens claras para link inválido, plataforma não suportada, vídeo privado ou que exige login.
- Arquivos temporários apagados ao fim de cada download, inclusive em erro ou cancelamento.

## Stack principal

- Node.js 24
- Next.js (Pages Router) + next-connect
- React
- TypeScript (strict)
- Joi
- yt-dlp + ffmpeg
- Jest
- ESLint, Prettier, Commitlint, Commitizen e Secretlint

## Arquitetura

```text
pages/api/v1/        Rotas HTTP da API
pages/index.tsx      Interface
models/              Regras de domínio: plataformas, formatos, vídeo, validação, logs
infra/               Erros, controller, yt-dlp, temporários, rate limit, Docker
tests/               Testes unitários, de integração e use cases
```

O `infra/ytdlp.ts` é o único ponto que executa o yt-dlp, sempre com `spawn(bin, args[])`, sem shell.

## API

| Método | Rota               | Descrição                                                         |
| ------ | ------------------ | ----------------------------------------------------------------- |
| `GET`  | `/api/v1/status`   | Versões do yt-dlp e do ffmpeg.                                    |
| `POST` | `/api/v1/inspect`  | `{ url }` → título, thumbnail, duração, plataforma e formatos.    |
| `POST` | `/api/v1/download` | `{ url, format_id }` → o arquivo. `format_id` pode ser `"audio"`. |

Erros seguem o formato `{ name, message, action, status_code }`.

## Segurança

- A URL passa por uma allowlist de hosts por plataforma. IPs, `localhost` e nomes de rede local são recusados.
- `format_id` só aceita letras, números, `_` e `-`; a URL vai depois de `--` nos argumentos do yt-dlp.
- Timeouts, limite de duração e de tamanho, limite de downloads simultâneos e rate limit por IP.
- Cookies (necessários em alguns vídeos do Instagram e do X) vêm de um arquivo indicado em `YTDLP_COOKIES_FILE`. Cada chamada usa uma cópia, então o arquivo original nunca é alterado. **Nunca versione esse arquivo.**

## Configuração

As variáveis e seus valores padrão estão em `.env.development`:

| Variável                         | Padrão         | Uso                                          |
| -------------------------------- | -------------- | -------------------------------------------- |
| `YTDLP_BINARY`                   | `yt-dlp`       | Caminho do yt-dlp                            |
| `YTDLP_COOKIES_FILE`             | vazio          | Arquivo de cookies (formato Netscape)        |
| `YTDLP_JS_RUNTIMES`              | vazio          | Runtime JS para o YouTube (`node` no Docker) |
| `TEMP_DIR`                       | `<tmp>/iwdtfv` | Onde ficam os arquivos durante o download    |
| `MAX_DURATION_SECONDS`           | `7200`         | Duração máxima do vídeo                      |
| `MAX_FILESIZE_BYTES`             | `2147483648`   | Tamanho máximo do arquivo                    |
| `INSPECT_TIMEOUT_MS`             | `30000`        | Timeout da inspeção                          |
| `DOWNLOAD_TIMEOUT_MS`            | `900000`       | Timeout do download                          |
| `MAX_CONCURRENT_DOWNLOADS`       | `2`            | Downloads ao mesmo tempo                     |
| `RATE_LIMIT_INSPECT_PER_MINUTE`  | `20`           | Inspeções por minuto por IP                  |
| `RATE_LIMIT_DOWNLOAD_PER_MINUTE` | `5`            | Downloads por minuto por IP                  |
| `TRUST_PROXY`                    | `0`            | `1` para ler o IP de `X-Forwarded-For`       |

## Como rodar localmente

### Requisitos

- Node.js 24 e npm
- yt-dlp (com um runtime JS para o YouTube, como deno) e ffmpeg no `PATH`

### Passos

```bash
npm install
npm run dev
```

Abra http://localhost:3000.

## Docker

```bash
docker compose -f infra/compose.yaml up -d --build
```

A imagem traz o ffmpeg e o binário oficial do yt-dlp com versão e checksum fixos. Para usar cookies, coloque o arquivo em `cookies/cookies.txt` na raiz do projeto e suba com:

```bash
YTDLP_COOKIES_FILE=/cookies/cookies.txt docker compose -f infra/compose.yaml up -d
```

Para atualizar o yt-dlp, mude `YTDLP_VERSION` e os checksums em `infra/Dockerfile` (eles estão no arquivo `SHA2-256SUMS` de cada release).

## Expor para outros usuários

As opções (rede local, Tailscale, Cloudflare Tunnel, VPS, PaaS, Vercel) e os cuidados antes de abrir o serviço estão em [docs/exposicao-do-servico.md](docs/exposicao-do-servico.md).

## Testes

```bash
npm test          # unitários + integração, com um yt-dlp falso (sem internet)
npm run test:real # baixa vídeos reais do YouTube e do TikTok
```

`npm test` sobe o `next dev` com `YTDLP_BINARY=tests/fakes/yt-dlp.ts`, que responde com saídas reais gravadas em `tests/fixtures/`.

## Qualidade de código

```bash
npm run lint:prettier:check
npm run lint:eslint:check-dir
npm run typecheck
```

Commits seguem o Conventional Commits (`npm run commit`). O pre-commit roda Prettier, ESLint e Secretlint nos arquivos alterados.

## Licença

MIT
