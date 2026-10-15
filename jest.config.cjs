// informa de forma manual o arquivo .env que será carregado
const dotenv = require("dotenv");
dotenv.config({
  path: ".env.development",
  quiet: true,
});

const nextJest = require("next/jest");

// Function factory
const createJestConfig = nextJest({
  dir: ".",
});

// Os testes em tests/_use-cases usam o yt-dlp real e a rede;
// só rodam com `npm run test:real` (TEST_REAL=1).
const testPathIgnorePatterns = ["/node_modules/", "/.next/"];
if (!process.env.TEST_REAL) testPathIgnorePatterns.push("/tests/_use-cases/");

const jestConfig = createJestConfig({
  moduleDirectories: ["node_modules", "<rootDir>"],
  testTimeout: 60000,
  testPathIgnorePatterns,
});

module.exports = jestConfig;
