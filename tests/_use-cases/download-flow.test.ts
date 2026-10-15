// Usa o yt-dlp real e a internet. Roda só com `npm run test:real`.
import orchestrator from "tests/orchestrator";
// TS: "import type" traz só o tipo VideoInfo; ele some no JavaScript gerado.
import type { VideoInfo } from "models/format";

const YOUTUBE_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const TIKTOK_URL =
  "https://www.tiktok.com/@scout2015/video/6718335390845095173";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  orchestrator.clearTempDir();
});

afterEach(async () => {
  const leftovers = await orchestrator.waitForNoTempJobs();
  if (leftovers.length > 0) {
    throw new Error(`Temporários não apagados: ${leftovers.join(", ")}`);
  }
});

async function inspect(url: string) {
  const response = await orchestrator.postJson("/api/v1/inspect", { url });
  expect(response.status).toBe(200);
  return (await response.json()) as VideoInfo;
}

async function download(url: string, formatId: string) {
  const response = await orchestrator.postJson("/api/v1/download", {
    url,
    format_id: formatId,
  });
  expect(response.status).toBe(200);
  const body = Buffer.from(await response.arrayBuffer());
  expect(body.length).toBe(Number(response.headers.get("content-length")));
  return { response, body };
}

function isMp4(body: Buffer) {
  return body.subarray(4, 8).toString("ascii") === "ftyp";
}

function isMp3(body: Buffer) {
  return (
    body.subarray(0, 3).toString("ascii") === "ID3" ||
    (body[0] === 0xff && ((body[1] ?? 0) & 0xe0) === 0xe0)
  );
}

// TS: cada linha de each é uma tupla [string, string]; por isso platform e url já são string.
describe.each([
  ["YouTube", YOUTUBE_URL],
  ["TikTok", TIKTOK_URL],
])("Download flow on %s", (platform, url) => {
  // TS: "let x: T;" declara o tipo de uma variável sem valor inicial; ela é preenchida no primeiro teste.
  let info: VideoInfo;

  test("Lists the real qualities of the video", async () => {
    info = await inspect(url);

    expect(info.platform).toBe(platform);
    expect(info.formats.length).toBeGreaterThan(0);
    expect(info.audio_available).toBe(true);
  });

  test("Downloads the lowest quality as mp4", async () => {
    // TS: at(-1) pode devolver undefined; o "!" (non-null) afirma que existe, sem checagem em execução.
    const lowest = info.formats.at(-1)!;
    const { response, body } = await download(url, lowest.format_id);

    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename=".+\.mp4"; filename\*=UTF-8''.+\.mp4$/,
    );
    expect(isMp4(body)).toBe(true);
  });

  test("Downloads only the audio as mp3", async () => {
    const { response, body } = await download(url, "audio");

    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(isMp3(body)).toBe(true);
  });
});
