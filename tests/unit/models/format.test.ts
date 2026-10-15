import youtubeFixture from "tests/fixtures/youtube-video.json";
import tiktokFixture from "tests/fixtures/tiktok-video.json";
// TS: RawYtDlpFormat, RawYtDlpVideo e VideoFormat são tipos num import comum; o TS os apaga na saída.
import format, {
  normalize,
  RawYtDlpFormat,
  RawYtDlpVideo,
  VideoFormat,
} from "models/format";

// TS: "as RawYtDlpVideo" é asserção: o JSON importado é tratado como esse tipo, sem checagem.
const youtube = youtubeFixture as RawYtDlpVideo;
const tiktok = tiktokFixture as RawYtDlpVideo;

// TS: VideoFormat[] é array de VideoFormat; find devolve VideoFormat | undefined, inferido sem anotar.
function findQuality(formats: VideoFormat[], quality: string) {
  return formats.find((f) => f.quality === quality);
}

describe("format.normalize", () => {
  test("With the default export, exposes normalize", () => {
    expect(format.normalize).toBe(normalize);
  });

  describe("With the YouTube fixture", () => {
    const info = normalize(youtube, "youtube");

    test("Lists one format per quality, from highest to lowest", () => {
      expect(info.formats.map((f) => f.quality)).toEqual([
        "2160p",
        "1440p",
        "1080p",
        "720p",
        "480p",
        "360p",
        "240p",
        "144p",
      ]);
    });

    test("With 1080p, chooses format 137", () => {
      expect(findQuality(info.formats, "1080p")?.format_id).toBe("137");
    });

    test("With 2160p, chooses format 313", () => {
      expect(findQuality(info.formats, "2160p")?.format_id).toBe("313");
    });

    test("With 360p, chooses format 18 and reports audio", () => {
      const f = findQuality(info.formats, "360p");
      expect(f?.format_id).toBe("18");
      expect(f?.has_audio).toBe(true);
    });

    test("Excludes storyboards", () => {
      const ids = info.formats.map((f) => f.format_id);
      expect(ids.some((id) => id.startsWith("sb"))).toBe(false);
    });

    test("With 1080p, estimates filesize as video plus best audio", () => {
      const f = findQuality(info.formats, "1080p");
      expect(f?.has_audio).toBe(false);
      expect(f?.filesize_estimate).toBe(80911999 + 3449447);
    });

    test("Reads title, duration, thumbnail, platform and audio flag", () => {
      expect(info.title).toBe(
        "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
      );
      expect(info.duration_seconds).toBe(213);
      expect(info.thumbnail_url).toBe(youtube.thumbnail);
      expect(info.platform).toBe("youtube");
      expect(info.audio_available).toBe(true);
    });
  });

  describe("With the TikTok fixture", () => {
    const info = normalize(tiktok, "tiktok");

    test("Lists vertical qualities as width-based heights", () => {
      expect(info.formats.map((f) => f.quality)).toEqual(["720p", "576p"]);
    });

    test("With 720p, chooses a bytevc1_720p format", () => {
      const f = findQuality(info.formats, "720p");
      expect(f?.format_id).toMatch(/^bytevc1_720p_/);
    });

    test("With 576p, chooses one of the tied H.264 formats", () => {
      const f = findQuality(info.formats, "576p");
      expect(["h264_540p_2240963-0", "h264_540p_2240963-1"]).toContain(
        f?.format_id,
      );
    });

    test("Reports audio available", () => {
      expect(info.audio_available).toBe(true);
      expect(info.formats.every((f) => f.has_audio)).toBe(true);
    });
  });

  describe("With empty input", () => {
    test("With an empty object, returns no formats and no audio", () => {
      const info = normalize({}, "youtube");
      expect(info.formats).toEqual([]);
      expect(info.audio_available).toBe(false);
      expect(info.title).toBe("Vídeo sem título");
      expect(info.thumbnail_url).toBeNull();
      expect(info.duration_seconds).toBeNull();
      expect(info.platform).toBe("youtube");
    });

    test("With an empty formats array, returns no formats", () => {
      const info = normalize({ formats: [] }, "youtube");
      expect(info.formats).toEqual([]);
      expect(info.audio_available).toBe(false);
    });
  });

  describe("With a format without filesize", () => {
    // TS: a anotação RawYtDlpFormat faz o TS checar os campos deste objeto (nome errado vira erro).
    const videoOnly: RawYtDlpFormat = {
      format_id: "v",
      vcodec: "avc1.640028",
      acodec: "none",
      width: 1920,
      height: 1080,
      protocol: "https",
      tbr: 1000,
      filesize: null,
      filesize_approx: null,
    };
    const audioOnly: RawYtDlpFormat = {
      format_id: "a",
      vcodec: "none",
      acodec: "mp4a.40.2",
      protocol: "https",
      tbr: 100,
      filesize: 1000,
    };

    test("Estimates video size from tbr times duration plus audio", () => {
      const info = normalize(
        { duration: 10, formats: [videoOnly, audioOnly] },
        "x",
      );
      expect(info.formats[0]?.filesize_estimate).toBe(1250000 + 1000);
    });

    test("Without an audio format, filesize_estimate is null", () => {
      const info = normalize({ duration: 10, formats: [videoOnly] }, "x");
      expect(info.formats[0]?.filesize_estimate).toBeNull();
      expect(info.audio_available).toBe(false);
    });
  });
});
