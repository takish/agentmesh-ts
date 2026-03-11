import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectConfig } from "./templates.js";
import {
  generatePackageJson,
  generateTsconfig,
  generateEnv,
  generateGitignore,
  generateAgentCode,
} from "./templates.js";

export async function scaffold(dir: string, config: ProjectConfig): Promise<string[]> {
  const srcDir = join(dir, "src");
  await mkdir(srcDir, { recursive: true });

  const files: Array<{ path: string; content: string }> = [
    { path: "package.json", content: generatePackageJson(config) },
    { path: "tsconfig.json", content: generateTsconfig() },
    { path: ".env", content: generateEnv(config) },
    { path: ".gitignore", content: generateGitignore() },
    { path: "src/agent.ts", content: generateAgentCode(config) },
  ];

  const written: string[] = [];
  for (const file of files) {
    const fullPath = join(dir, file.path);
    await writeFile(fullPath, file.content, "utf-8");
    written.push(file.path);
  }

  return written;
}
