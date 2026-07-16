#!/usr/bin/env node
// Cross-platform bundle analyze runner.
// `ANALYZE=true next build` 的 inline env 前缀在 Windows/PowerShell 下不生效，
// 因此用 node spawn 显式注入 ANALYZE，再复用 package.json 的 build 脚本
// （build 会先写 build-info 再 next build --webpack）。
import { spawn } from "node:child_process";
import process from "node:process";

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const child = spawn(pnpmCmd, ["run", "build"], {
  stdio: "inherit",
  env: { ...process.env, ANALYZE: "true" },
  // shell:true 让 Windows 能解析 .cmd shim；参数为固定字面量，无注入面。
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(`Failed to launch analyze build: ${error.message}`);
  process.exit(1);
});
