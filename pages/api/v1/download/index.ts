import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { createRouter } from "next-connect";
// TS: "import type" importa só o tipo NextApiResponse; some no JavaScript gerado.
import type { NextApiResponse } from "next";
// TS: "{ type ApiRequest }" importa só o tipo, misturado com o import normal da função controller.
import controller, { type ApiRequest } from "infra/controller";
import validateRequest from "models/validateRequest";
import video from "models/video";

// O arquivo é enviado em stream; sem limite de tamanho da resposta do Next.
export const config = {
  runtime: "nodejs",
  api: {
    responseLimit: false,
  },
};

// TS: <ApiRequest, NextApiResponse> são genéricos: informam os tipos de request e response usados pelo router.
export default createRouter<ApiRequest, NextApiResponse>()
  .post(
    controller.logRequest("video.downloaded", "Vídeo baixado com sucesso."),
    controller.rateLimit("download"),
    postValidationHandler,
    postHandler,
  )
  .handler(controller.errorHandlers);

function postValidationHandler(
  request: ApiRequest,
  response: NextApiResponse,
  // TS: "() => unknown" é tipo de função: não recebe argumentos e devolve algo de tipo unknown.
  next: () => unknown,
) {
  // TS: <{ url: string; format_id: string }> passa um tipo de objeto como argumento do genérico de validateRequest.
  const cleanValues = validateRequest<{ url: string; format_id: string }>(
    request.body,
    {
      url: "required",
      format_id: "required",
    },
  );

  request.body = cleanValues;

  return next();
}

async function postHandler(request: ApiRequest, response: NextApiResponse) {
  // TS: "as" é asserção: diz ao TS o formato de request.body, que o Next tipa como any. Não há checagem em tempo de execução.
  const { url, format_id } = request.body as {
    url: string;
    format_id: string;
  };

  // Se o cliente fechar a conexão, o yt-dlp é encerrado e o temporário apagado.
  const abortController = new AbortController();
  response.on("close", () => {
    if (!response.writableFinished) abortController.abort();
  });

  const result = await video.download(url, format_id, {
    signal: abortController.signal,
  });

  try {
    response.status(200);
    response.setHeader("Content-Type", result.contentType);
    response.setHeader("Content-Length", String(result.size));
    response.setHeader(
      "Content-Disposition",
      controller.contentDisposition(result.filename),
    );
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");

    await pipeline(fs.createReadStream(result.filePath), response);
  } finally {
    await result.cleanup();
  }
}
