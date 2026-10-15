import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  orchestrator.clearTempDir();
});

afterEach(async () => {
  const jobs = await orchestrator.waitForNoTempJobs();
  if (jobs.length > 0) {
    throw new Error(`Temp jobs left behind: ${jobs.join(", ")}`);
  }
});

const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("POST to /api/v1/download", () => {
  describe("Anonymous user", () => {
    test("With YouTube video format", async () => {
      const response = await orchestrator.postJson("/api/v1/download", {
        url: youtubeUrl,
        format_id: "137",
      });
      expect(response.status).toBe(200);

      expect(response.headers.get("content-type")).toBe("video/mp4");
      expect(response.headers.get("content-length")).toBe("262144");
      expect(response.headers.get("cache-control")).toBe("no-store");

      const disposition = response.headers.get("content-disposition") || "";
      expect(disposition).toMatch(/^attachment; filename="[^"]+\.mp4"; /);
      expect(disposition).toContain("filename*=UTF-8''");
      expect(disposition).toContain("Rick%20Astley");

      const body = Buffer.from(await response.arrayBuffer());
      expect(body.length).toBe(262144);
    });

    test("With audio format", async () => {
      const response = await orchestrator.postJson("/api/v1/download", {
        url: youtubeUrl,
        format_id: "audio",
      });
      expect(response.status).toBe(200);

      expect(response.headers.get("content-type")).toBe("audio/mpeg");
      expect(response.headers.get("content-length")).toBe("262144");

      const disposition = response.headers.get("content-disposition") || "";
      expect(disposition).toMatch(/filename="[^"]+\.mp3"/);
      expect(disposition).toMatch(/\.mp3$/);

      const body = Buffer.from(await response.arrayBuffer());
      expect(body.length).toBe(262144);
    });

    test("With TikTok video", async () => {
      const response = await orchestrator.postJson("/api/v1/download", {
        url: "https://www.tiktok.com/@someone/video/7000000000000000000",
        format_id: "bytevc1_720p_1504834-0",
      });
      expect(response.status).toBe(200);

      expect(response.headers.get("content-type")).toBe("video/mp4");
      expect(response.headers.get("content-disposition")).toContain(
        "filename*=UTF-8''Scramble%20up%20ur%20name",
      );

      const body = Buffer.from(await response.arrayBuffer());
      expect(body.length).toBe(262144);
    });

    test.each([
      ["with yt-dlp selector syntax", { format_id: "137+bestaudio" }],
      ["with option-like value", { format_id: "--exec" }],
      ["with missing format_id", {}],
      ["with empty format_id", { format_id: "" }],
    ])("With invalid format_id (%s)", async (_label, extra) => {
      const response = await orchestrator.postJson("/api/v1/download", {
        url: youtubeUrl,
        ...extra,
      });
      expect(response.status).toBe(400);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.action).toBe("Verifique os dados enviados.");
      expect(responseBody.status_code).toBe(400);
    });

    test("With missing format_id message", async () => {
      const response = await orchestrator.postJson("/api/v1/download", {
        url: youtubeUrl,
      });
      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        name: "ValidationError",
        message: '"format_id" é um campo obrigatório.',
        action: "Verifique os dados enviados.",
        status_code: 400,
      });
    });

    test("With missing url", async () => {
      const response = await orchestrator.postJson("/api/v1/download", {
        format_id: "137",
      });
      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        name: "ValidationError",
        message: '"url" é um campo obrigatório.',
        action: "Verifique os dados enviados.",
        status_code: 400,
      });
    });

    test("With IP address url", async () => {
      const response = await orchestrator.postJson("/api/v1/download", {
        url: "http://127.0.0.1/video",
        format_id: "137",
      });
      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        name: "ValidationError",
        message: "Endereços IP não são aceitos.",
        action: "Cole o link completo do vídeo, como aparece no navegador.",
        status_code: 400,
      });
    });

    test("With private video", async () => {
      const response = await orchestrator.postJson("/api/v1/download", {
        url: "https://www.youtube.com/watch?v=private",
        format_id: "137",
      });
      expect(response.status).toBe(404);

      expect(await response.json()).toEqual({
        name: "VideoUnavailableError",
        message: "O vídeo é privado, foi removido ou não está disponível.",
        action: "Confira se o vídeo abre no navegador sem login.",
        status_code: 404,
      });
    });

    test("With video over the size or duration limit", async () => {
      const response = await orchestrator.postJson("/api/v1/download", {
        url: "https://www.youtube.com/watch?v=toolarge",
        format_id: "137",
      });
      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        name: "ValidationError",
        message:
          "O vídeo passa do limite de duração ou de tamanho do servidor.",
        action: "Escolha uma qualidade menor ou um vídeo mais curto.",
        status_code: 400,
      });
    });

    test("With generic yt-dlp failure", async () => {
      const response = await orchestrator.postJson("/api/v1/download", {
        url: "https://www.youtube.com/watch?v=fail",
        format_id: "137",
      });
      expect(response.status).toBe(502);

      expect(await response.json()).toEqual({
        name: "YtDlpFailedError",
        message: "O yt-dlp não conseguiu processar este vídeo.",
        action: "Tente novamente. Se persistir, atualize o yt-dlp.",
        status_code: 502,
      });
    });

    test("With file written outside the job directory", async () => {
      const response = await orchestrator.postJson("/api/v1/download", {
        url: "https://www.youtube.com/watch?v=escape",
        format_id: "137",
      });
      expect(response.status).toBe(502);

      const responseBody = await response.json();
      expect(responseBody.name).toBe("YtDlpFailedError");
      expect(responseBody.message).toBe(
        "O yt-dlp gravou o arquivo fora do diretório esperado.",
      );
    });

    test("With client aborting during download", async () => {
      const abortController = new AbortController();
      setTimeout(() => abortController.abort(), 500);

      await expect(
        orchestrator.postJson(
          "/api/v1/download",
          { url: "https://youtu.be/sleep", format_id: "137" },
          { signal: abortController.signal },
        ),
      ).rejects.toThrow();

      expect(await orchestrator.waitForNoTempJobs()).toEqual([]);
    });
  });
});
