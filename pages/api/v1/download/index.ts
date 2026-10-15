import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { createRouter } from "next-connect";
import type { NextApiResponse } from "next";
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
  next: () => unknown,
) {
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
