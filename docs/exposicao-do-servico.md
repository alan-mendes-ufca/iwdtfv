# Como expor o serviço para outros usuários

Hoje o app roda só na máquina local: `npm run dev` ou o `infra/compose.yaml`, que publica a porta em `127.0.0.1:3000`. Este documento reúne as opções para disponibilizá-lo a outras pessoas, com o que cada uma exige e o que pode dar errado.

Registrado em 15/10/2026. Limites de terceiros (Vercel, Cloudflare etc.) mudam com o tempo; confira a documentação de cada serviço antes de decidir.

## O fator que mais pesa: o IP de saída

O YouTube costuma bloquear IPs de datacenter. Nesses casos o yt-dlp recebe "Sign in to confirm you're not a bot", e o app responde com `LoginRequiredError` (403). Por isso a primeira pergunta é **de onde o yt-dlp vai sair para a internet**:

- **IP residencial** (seu PC, um servidor em casa): o YouTube funciona como nos testes locais.
- **IP de datacenter** (VPS, PaaS, Vercel): TikTok tende a funcionar, mas o YouTube pode falhar com frequência. As saídas seriam cookies de uma conta (com risco de bloqueio dessa conta) ou um proxy residencial pago.

## Opções

### 1. Rede local

Troque `127.0.0.1:3000:3000` por `3000:3000` no `infra/compose.yaml` e acesse pelo IP da máquina na rede (ex.: `http://192.168.0.10:3000`).

- **Para quem:** pessoas da mesma casa ou do mesmo Wi-Fi.
- **Custo:** nenhum.
- **Cuidados:** qualquer dispositivo da rede passa a usar o serviço.

### 2. Tailscale (acesso privado)

Instale o Tailscale na máquina do servidor e nos aparelhos dos usuários; eles acessam pelo IP ou nome da tailnet.

- **Para quem:** um grupo pequeno de pessoas conhecidas.
- **Vantagens:** IP residencial, nenhuma porta aberta, só quem está na tailnet enxerga o serviço. Não exige mudança no código.
- **Cuidados:** cada usuário precisa instalar o Tailscale e ser convidado. O Tailscale Funnel também permite publicar na internet aberta, mas aí valem os cuidados da seção "Antes de expor publicamente".

### 3. Cloudflare Tunnel (URL pública a partir de casa) — recomendada

O `cloudflared` roda ao lado do container e publica o serviço num domínio seu (ex.: `video.seudominio.com`), sem abrir portas no roteador.

- **Para quem:** acesso pela internet com URL fixa e IP residencial.
- **Vantagens:** gratuito no plano básico, HTTPS automático, o YouTube continua funcionando. Dá para pôr o Cloudflare Access na frente para exigir login por e-mail, sem mexer no app.
- **Mudanças necessárias:**
  - adicionar o serviço `cloudflared` ao compose;
  - `TRUST_PROXY=1`, para o rate limit enxergar o IP real do usuário.
- **Cuidado importante (timeout):** a Cloudflare encerra a requisição com erro 524 quando a origem demora cerca de 100 s para começar a responder. Hoje o `/api/v1/download` só envia os headers depois que o yt-dlp termina de baixar e converter, então downloads longos vão estourar esse tempo. Há três saídas:
  1. limitar duração e tamanho (`MAX_DURATION_SECONDS`, `MAX_FILESIZE_BYTES`) para os downloads caberem nesse tempo;
  2. mudar a rota para enviar os headers logo no início. A desvantagem é que um erro no meio do download não poderia mais virar uma resposta de erro com status próprio;
  3. dividir o download em duas chamadas: uma que prepara o arquivo e devolve um id, e outra que baixa esse id. É a solução mais robusta, mas é a que mais muda o código.

### 4. VPS com Docker e proxy reverso

Suba o mesmo `infra/compose.yaml` numa VPS, com Caddy ou Nginx na frente cuidando do HTTPS.

- **Para quem:** quem quer o serviço sempre no ar, sem depender do PC de casa.
- **Vantagens:** controle total, sem limite de tempo nem de tamanho além dos do próprio app. A imagem atual serve sem alterações.
- **Desvantagens:** custo mensal e IP de datacenter (veja o aviso sobre o YouTube).
- **Mudanças necessárias:**
  - `TRUST_PROXY=1`;
  - aumentar o timeout de leitura do proxy. O padrão do Nginx (`proxy_read_timeout`) é 60 s, curto para downloads grandes.

### 5. PaaS com Docker (Fly.io, Railway, Render e similares)

A situação é parecida com a da VPS: a imagem roda quase como está, com IP de datacenter. Antes de escolher um serviço, confira três coisas: o timeout de requisição, o espaço em disco temporário disponível (o arquivo inteiro passa pelo disco antes de ser enviado) e a cobrança de tráfego de saída, porque vídeos consomem muita banda.

### 6. Vercel

A Vercel roda imagens Docker a partir de um `Dockerfile.vercel` na raiz do projeto, como Functions. Elas escalam até zero e são cobradas por tempo de CPU ativa. Quando este documento foi escrito, os limites eram:

| Limite                 | Valor                                                          |
| ---------------------- | -------------------------------------------------------------- |
| Duração por requisição | 300 s no Hobby; até 800 s no Pro (contando o envio do arquivo) |
| Tamanho da função      | 250 MB; até 5 GB com "large functions", em beta                |
| Corpo de resposta      | 4,5 MB, mas respostas em stream ficam fora desse limite        |
| Estado                 | sem disco persistente; cada instância tem a própria memória    |

Mudanças necessárias:

- criar o `Dockerfile.vercel` a partir de `infra/Dockerfile`;
- reduzir a imagem (hoje com 1,11 GB, quase tudo do ffmpeg do Debian) com um ffmpeg estático, ou ativar `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`;
- baixar `DOWNLOAD_TIMEOUT_MS` (para ~240 s no Hobby) e `MAX_FILESIZE_BYTES`;
- tirar o rate limit e o limite de downloads simultâneos da memória (Redis/Upstash ou regras de rate limit da Vercel), porque cada instância teria o próprio contador;
- passar os cookies como variável secreta e gravá-los em `/tmp` a cada chamada;
- `TRUST_PROXY=1`;
- testar um download maior que 4,5 MB para confirmar que a rota sai mesmo em stream.

Ainda vale o aviso sobre o IP de datacenter e o YouTube. E a spec original do projeto descartava serverless justamente por esses limites.

### 7. Híbrido: UI na Vercel, API em casa

A página fica na Vercel e chama a API publicada por um Cloudflare Tunnel (opção 3). Você ganha um endereço `.vercel.app` e mantém o IP residencial para o yt-dlp. Em troca, precisa configurar CORS na API e continua sujeito ao timeout da Cloudflare.

## Comparação

| Opção                | Custo              | YouTube            | Limite de tempo               | Mudanças no código                       |
| -------------------- | ------------------ | ------------------ | ----------------------------- | ---------------------------------------- |
| 1. Rede local        | nenhum             | funciona           | nenhum                        | nenhuma                                  |
| 2. Tailscale         | nenhum             | funciona           | nenhum                        | nenhuma                                  |
| 3. Cloudflare Tunnel | nenhum (+ domínio) | funciona           | ~100 s até começar a resposta | `TRUST_PROXY`; talvez a rota de download |
| 4. VPS               | mensal             | pode ser bloqueado | o do proxy (configurável)     | `TRUST_PROXY`                            |
| 5. PaaS com Docker   | variável           | pode ser bloqueado | depende do serviço            | `TRUST_PROXY`                            |
| 6. Vercel            | por uso            | pode ser bloqueado | 300 s (Hobby) / 800 s (Pro)   | várias (ver acima)                       |
| 7. Híbrido           | nenhum (+ domínio) | funciona           | ~100 s (Cloudflare)           | CORS, `TRUST_PROXY`                      |

## Antes de expor publicamente

O app não tem login, por decisão de escopo. Publicado na internet aberta, qualquer pessoa pode usar sua banda, sua CPU e, se configurados, **os cookies da sua conta**. Antes de abrir:

- **Restrinja o acesso de fora do app:** Cloudflare Access, Tailscale, ou autenticação básica no proxy reverso. Isso não exige mudar o código.
- **Não use cookies da sua conta pessoal** num serviço aberto: os downloads de todos os usuários sairiam em nome dela.
- **Ligue `TRUST_PROXY=1` sempre que houver proxy ou túnel na frente.** Sem isso, todo mundo aparece com o IP do proxy e divide o mesmo limite de requisições.
- **Revise os limites** (`MAX_DURATION_SECONDS`, `MAX_FILESIZE_BYTES`, `MAX_CONCURRENT_DOWNLOADS`, `RATE_LIMIT_*`) de acordo com a banda e o disco disponíveis.
- **Mantenha o yt-dlp atualizado** (`YTDLP_VERSION` no `infra/Dockerfile`); as plataformas mudam com frequência e versões antigas param de funcionar.
- **Acompanhe os logs** (`docker logs iwdtfv`): eles saem em JSON, um evento por linha, com `request_id`.
