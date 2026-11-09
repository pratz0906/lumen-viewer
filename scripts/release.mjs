// Builds the installer without embedding local folder paths (which include the
// Windows username) in the executable. Usage: npm run release
import { spawnSync } from "node:child_process";
import os from "node:os";

const remap = `--remap-path-prefix=${os.homedir()}=~`;
const rustflags = [process.env.RUSTFLAGS, remap].filter(Boolean).join(" ");

const result = spawnSync("npx", ["tauri", "build", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, RUSTFLAGS: rustflags },
});

process.exit(result.status ?? 1);
