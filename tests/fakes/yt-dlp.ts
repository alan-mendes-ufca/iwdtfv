#!/usr/bin/env node
// yt-dlp falso usado nos testes. O cenário é escolhido por palavras-chave na URL:
// sleep, private, unavailable, login, bot, unsupported, fail, toolarge, live, long, escape.
// Com FAKE_YTDLP_ARGS_FILE definido, grava os argumentos recebidos (uma linha JSON por chamada).
import fs from "node:fs";
import path from "node:path";

const fixturesDir = new URL("../fixtures/", import.meta.url);
const args = process.argv.slice(2);
const url = args[args.indexOf("--") + 1] || "";

if (process.env.FAKE_YTDLP_ARGS_FILE) {
  fs.appendFileSync(
    process.env.FAKE_YTDLP_ARGS_FILE,
    JSON.stringify(args) + "\n",
  );
}

const stderrFixtures: Record<string, string> = {
  private: "stderr-youtube-private.txt",
  unavailable: "stderr-youtube-unavailable.txt",
  login: "stderr-instagram-login.txt",
  bot: "stderr-youtube-bot.txt",
  unsupported: "stderr-unsupported-url.txt",
  fail: "stderr-generic.txt",
};

main();

function main() {
  if (args.includes("--version")) {
    process.stdout.write("2026.08.19-fake\n");
    return;
  }

  if (url.includes("sleep")) {
    setTimeout(() => process.exit(0), 60_000);
    return;
  }

  for (const [keyword, fixture] of Object.entries(stderrFixtures)) {
    if (url.includes(keyword)) {
      process.stderr.write(readFixture(fixture));
      process.exit(1);
    }
  }

  const video = JSON.parse(
    readFixture(
      url.includes("tiktok.com") ? "tiktok-video.json" : "youtube-video.json",
    ),
  );
  if (url.includes("live")) video.is_live = true;
  if (url.includes("long")) video.duration = 999_999;

  if (args.includes("-J")) {
    process.stdout.write(JSON.stringify(video));
    return;
  }

  if (url.includes("toolarge")) return;

  const directory = args[args.indexOf("-P") + 1] || ".";
  const ext = args.includes("-x") ? "mp3" : "mp4";
  const filepath = url.includes("escape")
    ? path.join(directory, "..", `escaped.${ext}`)
    : path.join(directory, `video.${ext}`);

  fs.writeFileSync(filepath, Buffer.alloc(256 * 1024, ext));
  process.stdout.write(
    JSON.stringify({ title: video.title, filepath, ext }) + "\n",
  );
}

function readFixture(name: string) {
  return fs.readFileSync(new URL(name, fixturesDir), "utf8");
}
