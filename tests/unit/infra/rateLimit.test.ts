import rateLimit from "infra/rateLimit";

beforeEach(() => {
  rateLimit.reset();
});

describe("rateLimit.hit", () => {
  const now = 1_000_000;

  test("Allows requests up to the limit", () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit.hit("a", 3, now).allowed).toBe(true);
    }
  });

  test("Blocks the request after the limit with correct retryAfterSeconds", () => {
    for (let i = 0; i < 3; i++) rateLimit.hit("a", 3, now);

    expect(rateLimit.hit("a", 3, now + 10_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 50,
    });
  });

  test("Rounds retryAfterSeconds up", () => {
    for (let i = 0; i < 3; i++) rateLimit.hit("a", 3, now);

    expect(rateLimit.hit("a", 3, now + 10_500).retryAfterSeconds).toBe(50);
  });

  test("Releases after the window", () => {
    for (let i = 0; i < 4; i++) rateLimit.hit("a", 3, now);

    expect(rateLimit.hit("a", 3, now + 59_999).allowed).toBe(false);
    expect(rateLimit.hit("a", 3, now + 60_000)).toEqual({
      allowed: true,
      retryAfterSeconds: 60,
    });
  });

  test("Keeps keys independent", () => {
    for (let i = 0; i < 3; i++) rateLimit.hit("a", 3, now);

    expect(rateLimit.hit("a", 3, now).allowed).toBe(false);
    expect(rateLimit.hit("b", 3, now).allowed).toBe(true);
  });

  test("Clears all buckets on reset", () => {
    rateLimit.hit("a", 1, now);
    expect(rateLimit.hit("a", 1, now).allowed).toBe(false);

    rateLimit.reset();

    expect(rateLimit.hit("a", 1, now).allowed).toBe(true);
  });
});
