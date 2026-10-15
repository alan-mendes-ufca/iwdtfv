import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  orchestrator.clearTempDir();
});

describe("POST to /api/v1/status", () => {
  describe("Anonymous user", () => {
    test("Retrieving current system status", async () => {
      const response = await fetch(`${webserver.origin}/api/v1/status`, {
        method: "POST",
      });
      expect(response.status).toBe(405);

      const responseBody = await response.json();

      expect(responseBody).toEqual({
        name: "MethodNotAllowedError",
        message: "Método não permitido para este endpoint.",
        action: "Verifique o método HTTP enviado para esse endpoint.",
        status_code: 405,
      });
    });
  });
});
