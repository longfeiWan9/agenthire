import { describe, expect, it } from "vitest";
import {
  MODE,
  PROJECT_NAME,
  formatHello,
  getHelloInfo,
} from "../src/scripts/hello.ts";

describe("getHelloInfo", () => {
  it("returns project name, node version, and READ_ONLY mode", () => {
    const info = getHelloInfo("v26.13.1");
    expect(info).toEqual({
      project: PROJECT_NAME,
      nodeVersion: "v26.13.1",
      mode: MODE,
    });
    expect(info.project).toBe("AgentHire");
    expect(info.mode).toBe("READ_ONLY");
  });

  it("defaults nodeVersion to process.version", () => {
    const info = getHelloInfo();
    expect(info.nodeVersion).toBe(process.version);
  });
});

describe("formatHello", () => {
  it("includes project, node version, and READ_ONLY mode", () => {
    const text = formatHello(getHelloInfo("v26.0.0"));
    expect(text).toContain("AgentHire");
    expect(text).toContain("Node v26.0.0");
    expect(text).toContain("mode=READ_ONLY");
    expect(text).toContain("NO_SIGNING");
  });
});
