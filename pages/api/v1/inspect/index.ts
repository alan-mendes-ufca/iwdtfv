import { createRouter } from "next-connect";
// TS: "import type" importa só o tipo NextApiResponse; some no JavaScript gerado.
import type { NextApiResponse } from "next";
// TS: "{ type ApiRequest }" importa só o tipo, misturado com o import normal da função controller.
import controller, { type ApiRequest } from "infra/controller";
import validateRequest from "models/validateRequest";
import video from "models/video";

export const config = {
  runtime: "nodejs",
};

// TS: <ApiRequest, NextApiResponse> são genéricos: informam os tipos de request e response usados pelo router.
export default createRouter<ApiRequest, NextApiResponse>()
  .post(
    controller.logRequest("video.inspected", "Vídeo inspecionado com sucesso."),
    controller.rateLimit("inspect"),
    postValidationHandler,
    postHandler,
  )
  .handler(controller.errorHandlers);

// TS: "() => unknown" é tipo de função: não recebe argumentos e devolve algo de tipo unknown.
function postValidationHandler(
  request: ApiRequest,
  response: NextApiResponse,
  next: () => unknown,
) {
  // TS: <{ url: string }> passa um tipo de objeto como argumento do genérico de validateRequest.
  const cleanValues = validateRequest<{ url: string }>(request.body, {
    url: "required",
  });

  request.body = cleanValues;

  return next();
}

async function postHandler(request: ApiRequest, response: NextApiResponse) {
  // TS: "as" é asserção: diz ao TS o formato de request.body, que o Next tipa como any.
  const { url } = request.body as { url: string };

  const abortController = new AbortController();
  response.on("close", () => {
    if (!response.writableFinished) abortController.abort();
  });

  const videoInfo = await video.inspect(url, {
    signal: abortController.signal,
  });

  return response.status(200).json(videoInfo);
}
