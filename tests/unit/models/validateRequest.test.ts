import validateRequest from "models/validateRequest";

describe("validateRequest url schema", () => {
  test("With missing body", () => {
    expect(() => validateRequest(undefined, { url: "required" })).toThrow(
      "Corpo da requisição é obrigatório.",
    );
  });

  test("With missing url", () => {
    expect(() =>
      validateRequest({ format_id: "137" }, { url: "required" }),
    ).toThrow(`"url" é um campo obrigatório.`);
  });

  test("With non-string url", () => {
    expect(() => validateRequest({ url: 123 }, { url: "required" })).toThrow(
      `"url" deve ser do tipo String.`,
    );
  });

  test("With empty url", () => {
    expect(() => validateRequest({ url: "" }, { url: "required" })).toThrow(
      `"url" não pode estar em branco.`,
    );
  });

  test("With text that is not a link", () => {
    expect(() =>
      validateRequest({ url: "isso não é um link" }, { url: "required" }),
    ).toThrow(`"url" deve começar com http:// ou https://.`);
  });

  test("With javascript scheme", () => {
    expect(() =>
      validateRequest({ url: "javascript:alert(1)" }, { url: "required" }),
    ).toThrow(`"url" deve começar com http:// ou https://.`);
  });

  test("With url longer than 2048 characters", () => {
    const url = `https://youtube.com/${"a".repeat(2048)}`;
    expect(() => validateRequest({ url }, { url: "required" })).toThrow(
      `"url" deve conter no máximo 2048 caracteres.`,
    );
  });

  test("Trims url and strips unknown keys", () => {
    const cleanValues = validateRequest(
      { url: "  https://youtu.be/abc  ", extra: "x" },
      { url: "required" },
    );

    expect(cleanValues).toEqual({ url: "https://youtu.be/abc" });
  });
});

describe("validateRequest format_id schema", () => {
  test("With missing format_id", () => {
    expect(() =>
      validateRequest(
        { url: "https://youtu.be/abc" },
        { url: "required", format_id: "required" },
      ),
    ).toThrow(`"format_id" é um campo obrigatório.`);
  });

  test.each(["137", "audio", "h264_540p_2240963-0", "hls-1080p"])(
    "Accepts %s",
    (formatId) => {
      expect(
        validateRequest({ format_id: formatId }, { format_id: "required" }),
      ).toEqual({ format_id: formatId });
    },
  );

  test.each([
    "137+bestaudio",
    "best/worst",
    "--exec",
    "137 140",
    "a".repeat(65),
  ])("Rejects %s", (formatId) => {
    expect(() =>
      validateRequest({ format_id: formatId }, { format_id: "required" }),
    ).toThrow(`"format_id" deve ser "audio" ou o id de um formato válido.`);
  });
});
