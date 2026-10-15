// TS: "import type" importa só o tipo NextApiRequest; some no JavaScript gerado.
import type { NextApiRequest } from "next";

// TS: "type" cria um apelido para um formato de objeto. Só existe na checagem; some no JavaScript gerado.
type RequestContext = {
  // TS: "campo?: tipo" marca a propriedade como opcional: ela pode nem existir no objeto.
  request_id?: string;
};

type LogParams = {
  event: string;
  message: string;
  // TS: "A & B" é interseção: o objeto precisa ter tudo de A e tudo de B.
  request?: NextApiRequest & { context?: RequestContext };
  statusCode?: number;
  // TS: "unknown" aceita qualquer valor, mas exige checagem antes de usar.
  error?: unknown;
  // TS: Record<K, V> é tipo utilitário: objeto com chaves string e valores do tipo unknown.
  metadata?: Record<string, unknown>;
};

// TS: "info" | "warn" | "error" são tipos literais: só esses três textos são aceitos.
type Level = "info" | "warn" | "error";

// Sem banco de dados: os logs saem em JSON, uma linha por evento, no stdout/stderr.
// TS: sem tipo de retorno escrito: o TS infere o retorno a partir do objeto devolvido.
function create(level: Level, logObject: LogParams) {
  const formattedObject = formatLogObject(level, logObject);
  const line = JSON.stringify(formattedObject);

  if (level === "error") console.error(line);
  else console.log(line);

  return formattedObject;
}

function formatLogObject(level: Level, logObject: LogParams) {
  const { event, message, metadata, request, error, statusCode } = logObject;
  // TS: "instanceof" estreita o tipo: dentro do ternário, error é Error; se não for, o valor vira null.
  const errorObject = error instanceof Error ? error : null;

  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    message,
    metadata: {
      ...metadata,
      // TS: "?." é JavaScript. Como errorObject pode ser null, o TS exige esse "?." antes de ler a propriedade.
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
