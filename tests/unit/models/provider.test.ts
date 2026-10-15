import provider from "models/provider";

describe("provider.findByUrl", () => {
  describe("With supported platforms", () => {
    test.each([
      ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
      ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
      ["https://m.youtube.com/shorts/abc", "youtube"],
      ["https://x.com/user/status/123", "x"],
      ["https://twitter.com/user/status/123", "x"],
      ["https://www.tiktok.com/@user/video/123", "tiktok"],
      ["https://vm.tiktok.com/ZMabc/", "tiktok"],
      ["https://www.instagram.com/reel/abc/", "instagram"],
      ["HTTPS://WWW.YOUTUBE.COM./watch?v=abc", "youtube"],
    ])("%s → %s", (url, name) => {
      expect(provider.findByUrl(url).name).toBe(name);
    });
  });

  describe("With unsupported hosts", () => {
    test.each([
      "https://vimeo.com/123",
      "https://youtube.com.evil.com/watch?v=abc",
      "https://evilyoutube.com/watch?v=abc",
      "https://music.youtube.com/watch?v=abc",
    ])("%s", (url) => {
      expect(() => provider.findByUrl(url)).toThrow(
        expect.objectContaining({
          name: "UnsupportedPlatformError",
          statusCode: 422,
        }),
      );
    });
  });

  describe("With invalid or dangerous URLs", () => {
    test.each([
      ["not a url", "O link informado não é uma URL válida."],
      [
        "ftp://youtube.com/video",
        "O link precisa começar com http:// ou https://.",
      ],
      ["file:///etc/passwd", "O link precisa começar com http:// ou https://."],
      [
        "https://user:pass@youtube.com/watch",
        "O link não pode conter usuário ou senha.",
      ],
      [
        "https://www.youtube.com:8443/watch",
        "O link não pode indicar uma porta.",
      ],
      ["http://127.0.0.1/video", "Endereços IP não são aceitos."],
      [
        "http://169.254.169.254/latest/meta-data",
        "Endereços IP não são aceitos.",
      ],
      ["http://10.0.0.1/", "Endereços IP não são aceitos."],
      ["http://[::1]/", "Endereços IP não são aceitos."],
      ["http://2130706433/", "Endereços IP não são aceitos."],
      ["http://localhost:3000/api", "O link não pode indicar uma porta."],
      [
        "http://localhost/api",
        "Endereços locais ou de rede privada não são aceitos.",
      ],
      [
        "http://printer.local/",
        "Endereços locais ou de rede privada não são aceitos.",
      ],
      [
        "http://intranet/",
        "Endereços locais ou de rede privada não são aceitos.",
      ],
    ])("%s", (url, message) => {
      expect(() => provider.findByUrl(url)).toThrow(
        expect.objectContaining({ name: "ValidationError", message }),
      );
    });
  });
});

describe("provider.matches", () => {
  test("With matching and non-matching URLs", () => {
    const youtube = provider.all.find((item) => item.name === "youtube")!;

    expect(provider.matches(youtube, "https://youtu.be/abc")).toBe(true);
    expect(provider.matches(youtube, "https://www.tiktok.com/@a/video/1")).toBe(
      false,
    );
    expect(provider.matches(youtube, "http://127.0.0.1/")).toBe(false);
  });
});
