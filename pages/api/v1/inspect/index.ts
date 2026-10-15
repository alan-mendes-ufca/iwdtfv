import { createRouter } from "next-connect";
import type { NextApiResponse } from "next";
import controller, { type ApiRequest } from "infra/controller";
import validateRequest from "models/validateRequest";
import video from "models/video";

export const config = {
  runtime: "nodejs",
};

export default createRouter<ApiRequest, NextApiResponse>()
  .post(
    controller.logRequest("video.inspected", "Vídeo inspecionado com sucesso."),
    controller.rateLimit("inspect"),
    postValidationHandler,
    postHandler,
  )
  .handler(controller.errorHandlers);

function postValidationHandler(
  request: ApiRequest,
  response: NextApiResponse,
  next: () => unknown,
) {
  const cleanValues = validateRequest<{ url: string }>(request.body, {
    url: "required",
  });

  request.body = cleanValues;

  return next();
}

async function postHandler(request: ApiRequest, response: NextApiResponse) {
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
