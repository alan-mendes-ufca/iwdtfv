import crypto from "node:crypto";
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

export type ApiRequest = NextApiRequest & {
  context?: {
    request_id?: string;
  };
};

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

function onNoMatchHandler(request: ApiRequest, response: NextApiResponse) {
  const publicErrorObject = new MethodNotAllowedError();
  response.status(publicErrorObject.statusCode).json(publicErrorObject);
}

function onErrorHandler(
  error: unknown,
  request: ApiRequest,
  response: NextApiResponse,
) {
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

function logRequest(event: string, message: string) {
  return function log(
    request: ApiRequest,
    response: NextApiResponse,
    next: Next,
  ) {
    const requestId = crypto.randomUUID();
    response.setHeader("request_id", requestId);

    request.context = {
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

function getClientIp(request: NextApiRequest) {
  if (config.get().trustProxy) {
    const forwardedFor = request.headers["x-forwarded-for"];
    const first = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
      ?.split(",")[0]
      ?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress || "unknown";
}

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
