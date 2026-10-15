import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tempfiles from "infra/tempfiles";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "iwdtfv-temp-test-"));
  process.env.TEMP_DIR = tempDir;
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("tempfiles.create", () => {
  test("Creates a private job directory and removes it on cleanup", async () => {
    const job = await tempfiles.create();
    fs.writeFileSync(path.join(job.path, "video.mp4"), "x");

    expect(path.dirname(job.path)).toBe(tempDir);
    expect(fs.statSync(job.path).mode & 0o777).toBe(0o700);

    await job.cleanup();
    expect(fs.existsSync(job.path)).toBe(false);
  });

  test("Copies cookies with restricted permissions", async () => {
    const source = path.join(tempDir, "cookies-original.txt");
    fs.writeFileSync(source, "cookie");
    const job = await tempfiles.create();

    const copy = await job.copyCookies(source);

    expect(copy).toBe(path.join(job.path, "cookies.txt"));
    expect(fs.readFileSync(copy!, "utf8")).toBe("cookie");
    expect(fs.statSync(copy!).mode & 0o777).toBe(0o600);
    await job.cleanup();
  });

  test("Without cookies configured returns null", async () => {
    const job = await tempfiles.create();
    expect(await job.copyCookies(null)).toBeNull();
    await job.cleanup();
  });
});

describe("tempfiles.sweepStale", () => {
  test("Removes only old job directories", async () => {
    const oldJob = path.join(tempDir, "job-old");
    const newJob = path.join(tempDir, "job-new");
    const other = path.join(tempDir, "other");
    for (const dir of [oldJob, newJob, other]) fs.mkdirSync(dir);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldJob, twoDaysAgo, twoDaysAgo);
    fs.utimesSync(other, twoDaysAgo, twoDaysAgo);

    await tempfiles.sweepStale(tempDir);

    expect(fs.existsSync(oldJob)).toBe(false);
    expect(fs.existsSync(newJob)).toBe(true);
    expect(fs.existsSync(other)).toBe(true);
  });
});
