import crypto from "node:crypto";
// TS: `import type` traz só o tipo, que some no JavaScript gerado.
import type { NextApiRequest, NextApiResponse } from "next";
import config from "infra/config";
import {
  InternalServerError,
  LoginRequiredError,
  MethodNotAllowedError,
  ServicesError,
  TooManyRequestsError,
  UnsupportedPlatformError,
  ValidationError,
  VideoUnavailableError,
  YtDlpFailedError,
} from "infra/errors";
import rateLimitStore from "infra/rateLimit";
import logger from "models/logger";

// TS: `export type` exporta um apelido de tipo. `&` é interseção: junta os campos de NextApiRequest com os de `context`.
export type ApiRequest = NextApiRequest & {
  // TS: `?:` torna a propriedade opcional: ela pode não existir.
  context?: {
    request_id?: string;
  };
};

// TS: tipo de função (sem parâmetros), que devolve uma Promise ou um valor. `Promise<T>` é genérico: o T é o tipo do valor resolvido.
// TS: `unknown` aceita qualquer valor, mas exige checagem antes de usar.
type Next = () => Promise<unknown> | unknown;

const ignoredPaths = ["/api/v1/status"];

const publicErrors = [
  ValidationError,
  UnsupportedPlatformError,
  VideoUnavailableError,
  LoginRequiredError,
  TooManyRequestsError,
  YtDlpFailedError,
  ServicesError,
];

// TS: parâmetros com anotação: ApiRequest é o tipo local e NextApiResponse é o tipo da resposta vindo do pacote next.
function onNoMatchHandler(request: ApiRequest, response: NextApiResponse) {
  const publicErrorObject = new MethodNotAllowedError();
  response.status(publicErrorObject.statusCode).json(publicErrorObject);
}

function onErrorHandler(
  error: unknown,
  request: ApiRequest,
  response: NextApiResponse,
) {
  // TS: `error instanceof type` verifica se o erro é instância da classe. O `some` não estreita o tipo de `error`, por isso usamos `as` abaixo.
  // TS: `as` é asserção: afirma um tipo ao compilador, sem converter nada em tempo de execução.
  // TS: `InstanceType<T>` é tipo utilitário (tipo da instância de uma classe). `(typeof x)[number]` pega o tipo de um item do array.
  const publicErrorObject = publicErrors.some((type) => error instanceof type)
    ? (error as InstanceType<(typeof publicErrors)[number]>)
    : new InternalServerError({ cause: error });

  logRequestError(request, publicErrorObject, error);

  // O cliente desistiu ou o arquivo já começou a ser enviado: só encerra a conexão.
  if (response.headersSent || response.destroyed) {
    response.destroy();
    return;
  }

  return response.status(publicErrorObject.statusCode).json(publicErrorObject);
}

// TS: `event` e `message` são textos. A função devolve outra função, que é o middleware.
function logRequest(event: string, message: string) {
  return function log(
    request: ApiRequest,
    response: NextApiResponse,
    next: Next,
  ) {
    const requestId = crypto.randomUUID();
    response.setHeader("request_id", requestId);

    request.context = {
      // TS: `...` é spread, JavaScript puro: copia as propriedades do objeto existente.
      ...request.context,
      request_id: requestId,
    };

    response.on("finish", () => {
      if (ignoredPaths.includes(request.url || "")) return;
      if (response.statusCode >= 400) return;

      logger.info({
        event,
        message,
        request,
        statusCode: response.statusCode,
      });
    });

    return next();
  };
}

function logRequestError(
  request: ApiRequest,
  // TS: tipo de objeto escrito direto na anotação: exige essas três propriedades.
  publicError: { name: string; message: string; statusCode: number },
  originalError: unknown,
) {
  const params = {
    event: getEventError(publicError.name),
    message: publicError.message,
    request,
    statusCode: publicError.statusCode,
    error: originalError,
  };

  if (publicError.statusCode >= 500) return logger.error(params);
  if (publicError.statusCode === 404) return logger.info(params);
  return logger.warn(params);

  function getEventError(name: string) {
    if (name === "ValidationError") return "validation.failed";
    if (name === "UnsupportedPlatformError") return "platform.unsupported";
    if (name === "VideoUnavailableError") return "video.unavailable";
    if (name === "LoginRequiredError") return "video.login_required";
    if (name === "TooManyRequestsError") return "rate_limit.exceeded";
    if (name === "YtDlpFailedError") return "ytdlp.failed";
    return "request.failed";
  }
}

// TS: aqui basta o tipo NextApiRequest do pacote next, sem o campo `context` de ApiRequest.
function getClientIp(request: NextApiRequest) {
  if (config.get().trustProxy) {
    const forwardedFor = request.headers["x-forwarded-for"];
    // TS: `Array.isArray` estreita o tipo: no ramo verdadeiro, o TS sabe que `forwardedFor` é um array.
    // TS: `?.` é JavaScript: só continua se o valor não for null ou undefined.
    const first = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
      ?.split(",")[0]
      ?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress || "unknown";
}

// TS: `"inspect" | "download"` é tipo literal: só aceita esses dois textos exatos.
function rateLimit(name: "inspect" | "download") {
  return function rateLimitMiddleware(
    request: ApiRequest,
    response: NextApiResponse,
    next: Next,
  ) {
    const settings = config.get();
    const limit =
      name === "inspect"
        ? settings.rateLimitInspectPerMinute
        : settings.rateLimitDownloadPerMinute;

    const result = rateLimitStore.hit(`${name}:${getClientIp(request)}`, limit);
    if (result.allowed) return next();

    response.setHeader("Retry-After", String(result.retryAfterSeconds));
    throw new TooManyRequestsError({
      action: `Aguarde ${result.retryAfterSeconds} segundos e tente novamente.`,
    });
  };
}

function contentDisposition(filename: string) {
  const asciiFallback = filename
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\]/g, "_")
    .trim();
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  const fallback =
    !asciiFallback || asciiFallback.startsWith(".")
      ? `download${asciiFallback}`
      : asciiFallback;

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

const controller = {
  errorHandlers: {
    onNoMatch: onNoMatchHandler,
    onError: onErrorHandler,
  },
  logRequest,
  rateLimit,
  getClientIp,
  contentDisposition,
};

export default controller;
