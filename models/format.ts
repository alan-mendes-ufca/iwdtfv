// Contrato do normalizador. A implementação de normalize() fica neste arquivo.

export type RawYtDlpFormat = {
  format_id: string;
  ext?: string | null;
  vcodec?: string | null;
  acodec?: string | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  tbr?: number | null;
  protocol?: string | null;
  format_note?: string | null;
  resolution?: string | null;
};

export type RawYtDlpVideo = {
  id?: string;
  title?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  extractor_key?: string | null;
  webpage_url?: string | null;
  is_live?: boolean | null;
  live_status?: string | null;
  _type?: string | null;
  formats?: RawYtDlpFormat[] | null;
};

export type VideoFormat = {
  format_id: string;
  quality: string;
  height: number;
  fps: number | null;
  ext: string;
  filesize_estimate: number | null;
  has_audio: boolean;
  has_video: boolean;
};

export type VideoInfo = {
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  platform: string;
  formats: VideoFormat[];
  audio_available: boolean;
};

function hasCodec(codec: string | null | undefined): boolean {
  return codec !== null && codec !== undefined && codec !== "none";
}

function tbrOf(format: RawYtDlpFormat): number {
  return format.tbr ?? 0;
}

function isStoryboard(format: RawYtDlpFormat): boolean {
  return format.ext === "mhtml" || format.protocol === "mhtml";
}

function isVideoCandidate(format: RawYtDlpFormat): boolean {
  return (
    hasCodec(format.vcodec) &&
    typeof format.height === "number" &&
    format.height > 0 &&
    !isStoryboard(format)
  );
}

function qualityOf(format: RawYtDlpFormat): number {
  const height = format.height ?? 0;
  return typeof format.width === "number"
    ? Math.min(format.width, height)
    : height;
}

function isH264(format: RawYtDlpFormat): boolean {
  const vcodec = format.vcodec ?? "";
  return vcodec.startsWith("avc1") || vcodec.startsWith("h264");
}

// Verdadeiro se `a` deve ser preferido a `b` (https, depois H.264, depois maior tbr).
function isPreferred(a: RawYtDlpFormat, b: RawYtDlpFormat): boolean {
  const aHttps = a.protocol === "https";
  const bHttps = b.protocol === "https";
  if (aHttps !== bHttps) return aHttps;

  const aH264 = isH264(a);
  const bH264 = isH264(b);
  if (aH264 !== bH264) return aH264;

  return tbrOf(a) > tbrOf(b);
}

// Em empate, mantém o primeiro da lista (comparação estrita).
function pickBestPerQuality(
  candidates: RawYtDlpFormat[],
): Map<number, RawYtDlpFormat> {
  const best = new Map<number, RawYtDlpFormat>();
  for (const format of candidates) {
    const quality = qualityOf(format);
    const current = best.get(quality);
    if (!current || isPreferred(format, current)) {
      best.set(quality, format);
    }
  }
  return best;
}

// Formato só-áudio (acodec presente, vcodec ausente) com maior tbr.
function pickBestAudio(formats: RawYtDlpFormat[]): RawYtDlpFormat | null {
  let best: RawYtDlpFormat | null = null;
  for (const format of formats) {
    if (!hasCodec(format.acodec) || hasCodec(format.vcodec)) continue;
    if (!best || tbrOf(format) > tbrOf(best)) best = format;
  }
  return best;
}

function sizeOf(
  format: RawYtDlpFormat,
  duration: number | null,
): number | null {
  const direct = format.filesize ?? format.filesize_approx ?? null;
  if (direct !== null) return direct;
  if (format.tbr && duration) {
    return Math.round(((format.tbr * 1000) / 8) * duration);
  }
  return null;
}

function estimateSize(
  format: RawYtDlpFormat,
  audio: RawYtDlpFormat | null,
  duration: number | null,
): number | null {
  const video = sizeOf(format, duration);
  if (hasCodec(format.acodec)) return video;

  const audioSize = audio ? sizeOf(audio, duration) : null;
  if (video === null || audioSize === null) return null;
  return video + audioSize;
}

function toVideoFormat(
  format: RawYtDlpFormat,
  quality: number,
  duration: number | null,
  audio: RawYtDlpFormat | null,
): VideoFormat {
  return {
    format_id: format.format_id,
    quality: `${quality}p`,
    height: quality,
    fps: typeof format.fps === "number" ? Math.round(format.fps) : null,
    ext: format.ext ?? "mp4",
    filesize_estimate: estimateSize(format, audio, duration),
    has_audio: hasCodec(format.acodec),
    has_video: true,
  };
}

export function normalize(raw: RawYtDlpVideo, platform: string): VideoInfo {
  const rawFormats = raw.formats ?? [];
  const duration = typeof raw.duration === "number" ? raw.duration : null;
  const audio = pickBestAudio(rawFormats);
  const best = pickBestPerQuality(rawFormats.filter(isVideoCandidate));

  const formats = [...best.entries()]
    .sort(([a], [b]) => b - a)
    .map(([quality, format]) =>
      toVideoFormat(format, quality, duration, audio),
    );

  return {
    title: raw.title || "Vídeo sem título",
    thumbnail_url: raw.thumbnail ?? null,
    duration_seconds: duration === null ? null : Math.round(duration),
    platform,
    formats,
    audio_available: rawFormats.some((format) => hasCodec(format.acodec)),
  };
}

const format = {
  normalize,
};

export default format;
