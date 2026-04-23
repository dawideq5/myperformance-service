import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/request-context";

describe("logger", () => {
  beforeEach(() => {
    process.env.LOG_LEVEL = "debug";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits NDJSON with level + message", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("hello world", { foo: 1 });
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("hello world");
    expect(parsed.foo).toBe(1);
    expect(typeof parsed.ts).toBe("string");
  });

  it("propagates requestId from AsyncLocalStorage", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runWithRequestContext({ requestId: "req-abc-123" }, () => {
      log.info("scoped event");
    });
    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.requestId).toBe("req-abc-123");
  });

  it("serialises Error objects with message + stack", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("boom", { err: new Error("kaboom") });
    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.err.message).toBe("kaboom");
    expect(typeof parsed.err.stack).toBe("string");
  });

  it("child logger merges bindings", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const child = log.child({ module: "unit-test" });
    child.info("from child");
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.module).toBe("unit-test");
  });
});
