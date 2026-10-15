import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  orchestrator.clearTempDir();
});

describe("GET to /api/v1/inspect", () => {
  describe("Anonymous user", () => {
    test("With method not allowed", async () => {
      const response = await fetch(`${webserver.origin}/api/v1/inspect`);
      expect(response.status).toBe(405);

      // TS: response.json() devolve any; o TS não checa os campos de responseBody.
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
