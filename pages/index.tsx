import Head from "next/head";
import { useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { VideoFormat, VideoInfo } from "models/format";

const SERVER_ERROR_MESSAGE = "Não foi possível falar com o servidor.";
const AUDIO_FORMAT_ID = "audio";

type ApiError = { message: string; action: string | null };
type InspectedVideo = { sourceUrl: string; video: VideoInfo };
type ErrorBody = { message: string; action?: unknown };

export default function Home() {
  const [inputUrl, setInputUrl] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [inspected, setInspected] = useState<InspectedVideo | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const downloadRef = useRef<AbortController | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inspecting) return;
    const url = inputUrl.trim();

    downloadRef.current?.abort();
    downloadRef.current = null;
    setDownloading(false);
    setInspected(null);
    setError(null);
    setNotice(null);
    setInspecting(true);

    try {
      const response = await fetch("/api/v1/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const video = (await response.json()) as VideoInfo;
      setInspected({ sourceUrl: url, video });
    } catch {
      setError({ message: SERVER_ERROR_MESSAGE, action: null });
    } finally {
      setInspecting(false);
    }
  }

  async function handleDownload(formatId: string) {
    if (!inspected || downloading) return;
    const { sourceUrl } = inspected;
    const controller = new AbortController();
    downloadRef.current = controller;
    setDownloading(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/v1/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl, format_id: formatId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("Content-Disposition"),
      );
      saveBlob(blob, filename);
      setNotice("Download concluído.");
    } catch {
      // Cancelar (abort) não é erro: só volta ao estado normal.
      if (!controller.signal.aborted) {
        setError({ message: SERVER_ERROR_MESSAGE, action: null });
      }
    } finally {
      if (downloadRef.current === controller) {
        downloadRef.current = null;
        setDownloading(false);
      }
    }
  }

  function cancelDownload() {
    downloadRef.current?.abort();
  }

  const formats = inspected?.video.formats ?? [];
  const audioAvailable = inspected?.video.audio_available ?? false;
  const hasOptions = formats.length > 0 || audioAvailable;

  return (
    <>
      <Head>
        <title>I want to download this fucking video</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="Cole o link de um vídeo do YouTube, X, TikTok ou Instagram, escolha a qualidade e baixe."
        />
      </Head>

      <main style={styles.page}>
        <div style={styles.column}>
          <header>
            <h1 style={styles.title}>
              I want to download this <span style={styles.accent}>fucking</span>{" "}
              video
            </h1>
            <p style={styles.lead}>Cole o link, escolha a qualidade e baixe.</p>
          </header>

          <form style={styles.form} onSubmit={handleSubmit}>
            <label htmlFor="video-url" style={styles.label}>
              Link do vídeo
            </label>
            <div style={styles.formRow}>
              <input
                id="video-url"
                type="url"
                name="url"
                required
                autoComplete="off"
                className="field"
                style={styles.input}
                value={inputUrl}
                onChange={(event) => setInputUrl(event.target.value)}
                placeholder="Cole o link do YouTube, X, TikTok ou Instagram"
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={inspecting}
              >
                Ver qualidades
              </button>
            </div>
          </form>

          {inspecting ? (
            <p role="status" style={styles.muted}>
              Buscando informações do vídeo…
            </p>
          ) : null}

          {error ? (
            <div role="alert" style={styles.alert}>
              <p style={styles.alertMessage}>{error.message}</p>
              {error.action ? (
                <p style={styles.alertAction}>{error.action}</p>
              ) : null}
            </div>
          ) : null}

          {inspected ? (
            <section style={styles.card} aria-labelledby="video-title">
              <div style={styles.cardHeader}>
                {inspected.video.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={inspected.video.thumbnail_url}
                    alt={inspected.video.title}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    style={styles.thumbnail}
                  />
                ) : null}
                <div style={styles.cardText}>
                  <h2 id="video-title" style={styles.videoTitle}>
                    {inspected.video.title}
                  </h2>
                  <p style={styles.muted}>{inspected.video.platform}</p>
                  {inspected.video.duration_seconds !== null ? (
                    <p style={styles.muted}>
                      Duração:{" "}
                      {formatDuration(inspected.video.duration_seconds)}
                    </p>
                  ) : null}
                </div>
              </div>

              {hasOptions ? (
                <div
                  role="group"
                  aria-label="Opções de download"
                  style={styles.options}
                >
                  {formats.map((format) => {
                    const details = formatDetails(format);
                    return (
                      <button
                        key={format.format_id}
                        type="button"
                        className="btn option"
                        style={styles.option}
                        disabled={downloading}
                        onClick={() => handleDownload(format.format_id)}
                      >
                        <span style={styles.optionQuality}>
                          {format.quality}
                        </span>
                        {details.length > 0 ? (
                          <span style={styles.optionDetail}>
                            {details.join(" · ")}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  {audioAvailable ? (
                    <button
                      type="button"
                      className="btn option"
                      style={styles.option}
                      disabled={downloading}
                      onClick={() => handleDownload(AUDIO_FORMAT_ID)}
                    >
                      <span style={styles.optionQuality}>
                        Somente áudio (MP3)
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : (
                <p style={styles.muted}>
                  Nenhuma qualidade disponível para este vídeo.
                </p>
              )}

              <div aria-live="polite" style={styles.status}>
                {downloading ? (
                  <>
                    <p style={styles.muted}>
                      Preparando o arquivo… o servidor baixa e converte antes de
                      enviar, pode levar alguns minutos.
                    </p>
                    <button
                      type="button"
                      className="btn"
                      onClick={cancelDownload}
                    >
                      Cancelar
                    </button>
                  </>
                ) : notice ? (
                  <p style={styles.notice}>{notice}</p>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </main>

      <style>{`
        html,
        body {
          margin: 0;
          background: #050505;
          color: #f5f5f5;
        }

        * {
          box-sizing: border-box;
        }

        .field,
        .btn {
          font: inherit;
          border-radius: 10px;
        }

        .field {
          min-height: 44px;
          width: 100%;
          padding: 10px 14px;
          border: 1px solid #3a3a3a;
          background: #0d0d0d;
          color: #f5f5f5;
        }

        .field::placeholder {
          color: #8a8a8a;
        }

        .field:focus {
          border-color: #f5f5f5;
        }

        .btn {
          min-height: 44px;
          min-width: 44px;
          padding: 10px 18px;
          border: 1px solid #3a3a3a;
          background: #121212;
          color: #f5f5f5;
          font-weight: 700;
          cursor: pointer;
          transition: background-color 150ms ease, border-color 150ms ease;
        }

        .btn:hover:not(:disabled) {
          background: #1f1f1f;
          border-color: #6b6b6b;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-primary {
          border-color: #ff3b30;
          background: #ff3b30;
          color: #050505;
        }

        .btn-primary:hover:not(:disabled) {
          border-color: #ff5a50;
          background: #ff5a50;
        }

        .option {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          text-align: left;
        }

        .field:focus-visible,
        .btn:focus-visible {
          outline: 3px solid #f5f5f5;
          outline-offset: 3px;
        }

        @media (prefers-reduced-motion: reduce) {
          .btn {
            transition: none;
          }
        }

        @media (max-width: 480px) {
          .option {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secondsPart = String(seconds % 60).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secondsPart}`;
  }
  return `${minutes}:${secondsPart}`;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const unit = units[index] ?? "B";
  const maximumFractionDigits = index >= 3 ? 1 : 0;
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits })} ${unit}`;
}

function formatDetails(format: VideoFormat): string[] {
  const details: string[] = [];
  if (format.fps !== null && format.fps > 30) {
    details.push(`${format.fps} fps`);
  }
  if (format.filesize_estimate !== null) {
    details.push(`~${formatBytes(format.filesize_estimate)}`);
  }
  return details;
}

function filenameFromDisposition(header: string | null): string {
  if (!header) return "download";

  const extended = /filename\*=UTF-8''([^;]+)/i.exec(header);
  const extendedValue = extended?.[1] ? decodeSafe(extended[1].trim()) : null;
  if (extendedValue) return extendedValue;

  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];

  return "download";
}

function decodeSafe(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isErrorBody(value: unknown): value is ErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  );
}

async function readError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  if (isErrorBody(body)) {
    return {
      message: body.message,
      action: typeof body.action === "string" ? body.action : null,
    };
  }
  return { message: SERVER_ERROR_MESSAGE, action: null };
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revogar na hora pode cancelar o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "32px 16px",
    background: "#050505",
    color: "#f5f5f5",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  column: {
    width: "min(100%, 720px)",
    minWidth: 0,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  title: {
    margin: 0,
    fontSize: "clamp(2.25rem, 9vw, 4.5rem)",
    fontWeight: 800,
    letterSpacing: "-0.035em",
    lineHeight: 1,
    overflowWrap: "break-word",
  },
  accent: {
    color: "#ff3b30",
  },
  lead: {
    margin: "12px 0 0",
    color: "#a3a3a3",
    fontSize: "1.05rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },
  label: {
    fontSize: "0.95rem",
    fontWeight: 700,
  },
  formRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  input: {
    flex: "1 1 260px",
    minWidth: 0,
  },
  muted: {
    margin: 0,
    color: "#a3a3a3",
    fontSize: "0.95rem",
    lineHeight: 1.5,
  },
  alert: {
    padding: "14px 16px",
    border: "1px solid #ff3b30",
    borderRadius: 10,
    background: "#1a0605",
  },
  alertMessage: {
    margin: 0,
    fontSize: "1.1rem",
    fontWeight: 700,
  },
  alertAction: {
    margin: "6px 0 0",
    color: "#e5e5e5",
    lineHeight: 1.5,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
    padding: 16,
    border: "1px solid #262626",
    borderRadius: 14,
    background: "#0d0d0d",
  },
  cardHeader: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    minWidth: 0,
  },
  thumbnail: {
    width: "min(100%, 240px)",
    height: "auto",
    aspectRatio: "16 / 9",
    objectFit: "cover",
    borderRadius: 10,
    background: "#161616",
  },
  cardText: {
    flex: "1 1 200px",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  videoTitle: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: 700,
    lineHeight: 1.3,
    overflowWrap: "anywhere",
  },
  options: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 170px), 1fr))",
    gap: 8,
  },
  option: {
    width: "100%",
    padding: "10px 14px",
  },
  optionQuality: {
    fontSize: "1rem",
    fontWeight: 800,
  },
  optionDetail: {
    color: "#a3a3a3",
    fontSize: "0.8rem",
    fontWeight: 400,
  },
  status: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
  },
  notice: {
    margin: 0,
    fontWeight: 700,
  },
} satisfies Record<string, CSSProperties>;
