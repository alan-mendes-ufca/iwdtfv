import type { NextApiRequest } from "next";

type RequestContext = {
  request_id?: string;
};

type LogParams = {
  event: string;
  message: string;
  request?: NextApiRequest & { context?: RequestContext };
  statusCode?: number;
  error?: unknown;
  metadata?: Record<string, unknown>;
};

type Level = "info" | "warn" | "error";

// Sem banco de dados: os logs saem em JSON, uma linha por evento, no stdout/stderr.
function create(level: Level, logObject: LogParams) {
  const formattedObject = formatLogObject(level, logObject);
  const line = JSON.stringify(formattedObject);

  if (level === "error") console.error(line);
  else console.log(line);

  return formattedObject;
}

function formatLogObject(level: Level, logObject: LogParams) {
  const { event, message, metadata, request, error, statusCode } = logObject;
  const errorObject = error instanceof Error ? error : null;

  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    message,
    metadata: {
      ...metadata,
      error_name: errorObject?.name,
      error_message: errorObject?.message,
      error_cause:
        errorObject?.cause === undefined
          ? undefined
          : String(errorObject.cause),
      error_stack: level === "error" ? errorObject?.stack : undefined,
    },
    request_id: request?.context?.request_id,
    method: request?.method,
    path: request?.url,
    status_code: statusCode,
  };
}

function info(params: LogParams) {
  return create("info", params);
}

function warn(params: LogParams) {
  return create("warn", params);
}

function error(params: LogParams) {
  return create("error", params);
}

const logger = {
  info,
  warn,
  error,
};

export default logger;
