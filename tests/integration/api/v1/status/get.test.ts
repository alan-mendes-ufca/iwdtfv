import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  orchestrator.clearTempDir();
});

describe("GET to /api/v1/status", () => {
  describe("Anonymous user", () => {
    test("Retrieving current system status", async () => {
      const response = await fetch(`${webserver.origin}/api/v1/status`);
      expect(response.status).toBe(200);

      const responseBody = await response.json();

      const parsedUpdatedAt = new Date(responseBody.updated_at).toISOString();
      expect(responseBody.updated_at).toEqual(parsedUpdatedAt);

      expect(responseBody.dependencies.ytdlp.version).toBe("2026.08.19-fake");

      const ffmpegVersion = responseBody.dependencies.ffmpeg.version;
      expect(ffmpegVersion === null || typeof ffmpegVersion === "string").toBe(
        true,
      );
    });
  });
});
