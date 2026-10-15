import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  orchestrator.clearTempDir();
});

afterEach(() => {
  const jobs = orchestrator.listTempJobs();
  if (jobs.length > 0) {
    throw new Error(`Temp jobs left behind: ${jobs.join(", ")}`);
  }
});

const validationAction =
  "Cole o link completo do vídeo, como aparece no navegador.";

describe("POST to /api/v1/inspect", () => {
  describe("Anonymous user", () => {
    test("With valid YouTube url", async () => {
      const response = await orchestrator.postJson("/api/v1/inspect", {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      });
      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody.title).toBe(
        "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
      );
      expect(responseBody.platform).toBe("YouTube");
      expect(responseBody.duration_seconds).toBe(213);
      expect(responseBody.audio_available).toBe(true);
      expect(typeof responseBody.thumbnail_url).toBe("string");

      expect(
        responseBody.formats.map((f: { quality: string }) => f.quality),
      ).toEqual([
        "2160p",
        "1440p",
        "1080p",
        "720p",
        "480p",
        "360p",
        "240p",
        "144p",
      ]);

      const fullHd = responseBody.formats.find(
        (f: { quality: string }) => f.quality === "1080p",
      );
      expect(fullHd).toMatchObject({
        format_id: "137",
        quality: "1080p",
        height: 1080,
        has_video: true,
      });
      expect(Object.keys(fullHd).sort()).toEqual(
        [
          "ext",
          "filesize_estimate",
          "format_id",
          "fps",
          "has_audio",
          "has_video",
          "height",
          "quality",
        ].sort(),
      );
    });

    test("With valid TikTok url", async () => {
      const response = await orchestrator.postJson("/api/v1/inspect", {
        url: "https://www.tiktok.com/@someone/video/7000000000000000000",
      });
      expect(response.status).toBe(200);

      const responseBody = await response.json();

      expect(responseBody.platform).toBe("TikTok");
      expect(
        responseBody.formats.map((f: { quality: string }) => f.quality),
      ).toEqual(["720p", "576p"]);
    });

    test.each([
      ["without body", undefined],
      ["with empty object", {}],
      ["with empty url", { url: "" }],
      ["with null url", { url: null }],
      ["with numeric url", { url: 123 }],
    ])("With invalid body (%s)", async (_label, body) => {
      const response = await fetch(`${webserver.origin}/api/v1/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.action).toBe("Verifique os dados enviados.");
      expect(responseBody.status_code).toBe(400);
    });

    test("With missing url field", async () => {
      const response = await orchestrator.postJson("/api/v1/inspect", {
        other: "value",
      });
      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        name: "ValidationError",
        message: '"url" é um campo obrigatório.',
        action: "Verifique os dados enviados.",
        status_code: 400,
      });
    });

    test("With text that is not a link", async () => {
      const response = await orchestrator.postJson("/api/v1/inspect", {
        url: "não é link",
      });
      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        name: "ValidationError",
        message: '"url" deve começar com http:// ou https://.',
        action: "Verifique os dados enviados.",
        status_code: 400,
      });
    });

    test("With javascript: scheme", async () => {
      const response = await orchestrator.postJson("/api/v1/inspect", {
        url: "javascript:alert(1)",
      });
      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.status_code).toBe(400);
    });

    test.each([
      ["http://127.0.0.1/", "Endereços IP não são aceitos."],
      [
        "http://localhost/",
        "Endereços locais ou de rede privada não são aceitos.",
      ],
    ])("With local address %s", async (url, message) => {
      const response = await orchestrator.postJson("/api/v1/inspect", { url });
      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        name: "ValidationError",
        message,
        action: validationAction,
        status_code: 400,
      });
    });

    test("With unsupported platform host", async () => {
      const response = await orchestrator.postJson("/api/v1/inspect", {
        url: "https://vimeo.com/123456",
      });
      expect(response.status).toBe(422);

      expect(await response.json()).toEqual({
        name: "UnsupportedPlatformError",
        message: 'A plataforma "vimeo.com" não é suportada.',
        action: "Use um link do YouTube, X, TikTok ou Instagram.",
        status_code: 422,
      });
    });

    test("With private video", async () => {
      const response = await orchestrator.postJson("/api/v1/inspect", {
        url: "https://www.youtube.com/watch?v=private",
      });
      expect(response.status).toBe(404);

      expect(await response.json()).toEqual({
        name: "VideoUnavailableError",
        message: "O vídeo é privado, foi removido ou não está disponível.",
        action: "Confira se o vídeo abre no navegador sem login.",
        status_code: 404,
      });
    });

    test("With unavailable video", async () => {
      const response = await orchestrator.postJson("/api/v1/inspect", {
        url: "https://www.youtube.com/watch?v=unavailable",
      });
      expect(response.status).toBe(404);

      expect((await response.json()).name).toBe("VideoUnavailableError");
    });

    test.each([
      ["Instagram login", "https://www.instagram.com/p/login/"],
      ["YouTube bot check", "https://www.youtube.com/watch?v=bot"],
    ])("With %s required", async (_label, url) => {
      const response = await orchestrator.postJson("/api/v1/inspect", { url });
      expect(response.status).toBe(403);

      expect(await response.json()).toEqual({
        name: "LoginRequiredError",
        message: "A plataforma exige login para liberar este vídeo.",
        action:
          "Configure YTDLP_COOKIES_FILE com um arquivo de cookies da sua conta.",
        status_code: 403,
      });
    });

    test("With URL that yt-dlp does not support", async () => {
      const response = await orchestrator.postJson("/api/v1/inspect", {
        url: "https://www.youtube.com/unsupported",
      });
      expect(response.status).toBe(422);

      expect(await response.json()).toEqual({
        name: "UnsupportedPlatformError",
        message: "Plataforma não suportada.",
        action: "Use um link do YouTube, X, TikTok ou Instagram.",
        status_code: 422,
      });
    });

    test("With generic yt-dlp failure", async () => {
      const response = await orchestrator.postJson("/api/v1/inspect", {
        url: "https://www.youtube.com/watch?v=fail",
      });
      expect(response.status).toBe(502);

      expect(await response.json()).toEqual({
        name: "YtDlpFailedError",
        message: "O yt-dlp não conseguiu processar este vídeo.",
        action: "Tente novamente. Se persistir, atualize o yt-dlp.",
        status_code: 502,
      });
    });

    test("With live stream", async () => {
      const response = await orchestrator.postJson("/api/v1/inspect", {
        url: "https://www.youtube.com/watch?v=live",
      });
      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        name: "ValidationError",
        message: "Transmissões ao vivo não são suportadas.",
        action: "Espere a transmissão terminar e tente de novo.",
        status_code: 400,
      });
    });

    test("With video longer than the limit", async () => {
      const response = await orchestrator.postJson("/api/v1/inspect", {
        url: "https://www.youtube.com/watch?v=long",
      });
      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        name: "ValidationError",
        message: "O vídeo passa do limite de 120 minutos.",
        action: "Escolha um vídeo mais curto.",
        status_code: 400,
      });
    });
  });
});
