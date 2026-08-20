import { describe, expect, it } from "vitest";
import { detectInstaller, updateCommandFor } from "./package-manager.ts";

describe("detectInstaller()", () => {
  it("defaults to npm for an ordinary global bin path", () => {
    expect(detectInstaller("/usr/local/lib/node_modules/@cmglezpdev/veta/bin/cli.js")).toBe("npm");
  });

  it("detects npx from an _npx segment in the path", () => {
    expect(detectInstaller("/Users/me/.npm/_npx/abc123/node_modules/@cmglezpdev/veta/bin/cli.js")).toBe(
      "npx",
    );
  });

  it("detects npx from the npm user agent", () => {
    expect(
      detectInstaller("/some/where/bin/cli.js", { npm_config_user_agent: "npm/10.0.0 npx/10.0.0 node/v24" }),
    ).toBe("npx");
  });

  it("prefers npx over pnpm when both hints are present", () => {
    expect(detectInstaller("/Users/me/.pnpm/_npx/abc/bin/cli.js")).toBe("npx");
  });

  it("detects pnpm from /pnpm/, /.pnpm/ and /Library/pnpm/ segments", () => {
    expect(detectInstaller("/Users/me/Library/pnpm/global/5/node_modules/@cmglezpdev/veta/bin/cli.js")).toBe("pnpm");
    expect(detectInstaller("/home/me/.local/share/pnpm/global/5/.pnpm/@cmglezpdev+veta/bin/cli.js")).toBe("pnpm");
    expect(detectInstaller("/opt/pnpm/store/bin/cli.js")).toBe("pnpm");
  });

  it("detects pnpm from the user agent", () => {
    expect(detectInstaller("/x/bin/cli.js", { npm_config_user_agent: "pnpm/11.0.0 npm/? node/v24" })).toBe("pnpm");
  });

  it("detects yarn from path or user agent", () => {
    expect(detectInstaller("/Users/me/.yarn/bin/veta")).toBe("yarn");
    expect(detectInstaller("/usr/local/share/yarn/global/node_modules/x/bin/cli.js")).toBe("yarn");
    expect(detectInstaller("/x/bin/cli.js", { npm_config_user_agent: "yarn/1.22.0 npm/? node/v24" })).toBe("yarn");
  });

  it("detects bun from path or user agent", () => {
    expect(detectInstaller("/Users/me/.bun/install/global/node_modules/x/bin/cli.js")).toBe("bun");
    expect(detectInstaller("/x/bin/cli.js", { npm_config_user_agent: "bun/1.1.0" })).toBe("bun");
  });

  it("detects homebrew from Cellar, homebrew and linuxbrew segments", () => {
    expect(detectInstaller("/opt/homebrew/Cellar/veta/0.10.0/libexec/bin/cli.js")).toBe("brew");
    expect(detectInstaller("/opt/homebrew/lib/node_modules/x/bin/cli.js")).toBe("brew");
    expect(detectInstaller("/home/linuxbrew/.linuxbrew/lib/node_modules/x/bin/cli.js")).toBe("brew");
  });

  it("matches case-insensitively and accepts backslashes", () => {
    expect(detectInstaller("C:\\Users\\me\\AppData\\Local\\PNPM\\global\\5\\bin\\cli.js")).toBe("pnpm");
  });
});

describe("updateCommandFor()", () => {
  it("maps every installer to its update command", () => {
    expect(updateCommandFor("npm")).toBe("npm install -g @cmglezpdev/veta@latest");
    expect(updateCommandFor("pnpm")).toBe("pnpm add -g @cmglezpdev/veta@latest");
    expect(updateCommandFor("yarn")).toBe("yarn global add @cmglezpdev/veta@latest");
    expect(updateCommandFor("bun")).toBe("bun add -g @cmglezpdev/veta@latest");
    expect(updateCommandFor("npx")).toBe("npx @cmglezpdev/veta@latest");
    expect(updateCommandFor("brew")).toBe("brew upgrade veta");
  });
});
