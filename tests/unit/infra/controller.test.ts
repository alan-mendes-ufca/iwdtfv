// TS: "import type" traz só o tipo NextApiRequest; ele some no JavaScript gerado.
import type { NextApiRequest } from "next";
import controller from "infra/controller";

describe("controller.contentDisposition", () => {
  test("With ASCII title", () => {
    expect(controller.contentDisposition("My Video.mp4")).toBe(
      `attachment; filename="My Video.mp4"; filename*=UTF-8''My%20Video.mp4`,
    );
  });

  test("With accents and emoji", () => {
    expect(controller.contentDisposition("Coração 😍.mp4")).toBe(
      `attachment; filename="Coracao .mp4"; filename*=UTF-8''Cora%C3%A7%C3%A3o%20%F0%9F%98%8D.mp4`,
    );
  });

  test("With quotes and backslash", () => {
    const header = controller.contentDisposition('a"b\\c.mp4');

    expect(header).toBe(
      `attachment; filename="a_b_c.mp4"; filename*=UTF-8''a%22b%5Cc.mp4`,
    );
  });

  test("With reserved characters in filename*", () => {
    expect(controller.contentDisposition("it's (a) *.mp4")).toBe(
      `attachment; filename="it's (a) *.mp4"; filename*=UTF-8''it%27s%20%28a%29%20%2A.mp4`,
    );
  });

  test("With only non-ASCII title", () => {
    expect(controller.contentDisposition("日本.mp4")).toBe(
      `attachment; filename="download.mp4"; filename*=UTF-8''%E6%97%A5%E6%9C%AC.mp4`,
    );
  });
});

describe("controller.getClientIp", () => {
  const originalTrustProxy = process.env.TRUST_PROXY;

  afterEach(() => {
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = originalTrustProxy;
  });

  // TS: Record<K, V> é um objeto com chaves K e valores V; "string | string[]" aceita um valor ou uma lista.
  function buildRequest(headers: Record<string, string | string[]>) {
    return {
      headers,
      socket: { remoteAddress: "10.0.0.1" },
      // TS: "as unknown as X" é asserção dupla: força o tipo de um objeto parcial; nada é checado na execução.
    } as unknown as NextApiRequest;
  }

  test("Ignores X-Forwarded-For when TRUST_PROXY is not 1", () => {
    delete process.env.TRUST_PROXY;
    const request = buildRequest({ "x-forwarded-for": "203.0.113.5" });
    expect(controller.getClientIp(request)).toBe("10.0.0.1");

    process.env.TRUST_PROXY = "0";
    expect(controller.getClientIp(request)).toBe("10.0.0.1");
  });

  test("Uses the first X-Forwarded-For address when TRUST_PROXY is 1", () => {
    process.env.TRUST_PROXY = "1";
    const request = buildRequest({
      "x-forwarded-for": "203.0.113.5, 198.51.100.7",
    });
    expect(controller.getClientIp(request)).toBe("203.0.113.5");
  });

  test("Falls back to the socket address without the header", () => {
    process.env.TRUST_PROXY = "1";
    expect(controller.getClientIp(buildRequest({}))).toBe("10.0.0.1");
  });

  test("Returns unknown without any address", () => {
    delete process.env.TRUST_PROXY;
    const request = {
      headers: {},
      socket: {},
    } as unknown as NextApiRequest;
    expect(controller.getClientIp(request)).toBe("unknown");
  });
});
