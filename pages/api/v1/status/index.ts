import { createRouter } from "next-connect";
import type { NextApiResponse } from "next";
import controller, { type ApiRequest } from "infra/controller";
import ytdlp from "infra/ytdlp";

export const config = {
  runtime: "nodejs",
};

export default createRouter<ApiRequest, NextApiResponse>()
  .get(
    controller.logRequest("status.fetched", "Status consultado com sucesso."),
    getHandler,
  )
  .handler(controller.errorHandlers);

async function getHandler(request: ApiRequest, response: NextApiResponse) {
  const versions = await ytdlp.versions();

  const statusObject = {
    updated_at: new Date().toISOString(),
    dependencies: {
      ytdlp: {
        version: versions.ytdlp,
      },
      ffmpeg: {
        version: versions.ffmpeg,
      },
    },
  };

  return response.status(200).json(statusObject);
}
