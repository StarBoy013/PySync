import fs from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const OUTPUT_LIMIT = 64 * 1024;

function cap(value) {
  return value.length <= OUTPUT_LIMIT ? value : `${value.slice(0, OUTPUT_LIMIT)}\n[Output capped at 64KB]`;
}

export async function runCode(code, stdin = "") {
  if (typeof code !== "string" || code.length > 100 * 1024) {
    return { stdout: "", stderr: "Code exceeds the 100KB limit", exitCode: 1, timedOut: false };
  }
  if (typeof stdin !== "string" || stdin.length > 10 * 1024) {
    return { stdout: "", stderr: "Standard input exceeds the 10KB limit", exitCode: 1, timedOut: false };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pysync-"));
  const filePath = path.join(tempDir, "main.py");
  const executable = os.platform() === "win32" ? "python" : "python3";

  try {
    await fs.writeFile(filePath, code, "utf8");
    return await new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;

      const child = spawn(executable, [filePath], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 5000);

      child.stdout.on("data", (chunk) => {
        stdout = cap(stdout + chunk.toString());
      });
      child.stderr.on("data", (chunk) => {
        stderr = cap(stderr + chunk.toString());
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ stdout: "", stderr: `Execution error: ${error.message}`, exitCode: 1, timedOut: false });
      });
      child.on("close", (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ stdout: cap(stdout), stderr: cap(stderr), exitCode: timedOut ? 124 : (exitCode ?? 1), timedOut });
      });

      child.stdin.on("error", () => {});
      child.stdin.end(stdin);
    });
  } catch (error) {
    return { stdout: "", stderr: `Execution error: ${error.message}`, exitCode: 1, timedOut: false };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
