import { createRouter } from "next-connect";
// TS: "import type" importa só o tipo NextApiResponse; some no JavaScript gerado.
import type { NextApiResponse } from "next";
// TS: "{ type ApiRequest }" importa só o tipo, misturado com o import normal da função controller.
import controller, { type ApiRequest } from "infra/controller";
import ytdlp from "infra/ytdlp";

export const config = {
  runtime: "nodejs",
};

// TS: <ApiRequest, NextApiResponse> são genéricos: informam os tipos de request e response usados pelo router.
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
