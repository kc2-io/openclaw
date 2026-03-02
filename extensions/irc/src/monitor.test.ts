import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveIrcInboundTarget } from "./monitor.js";

vi.mock("./runtime.js", () => ({
  getIrcRuntime: () => ({
    config: { loadConfig: () => ({ channels: { irc: { enabled: true } } }) },
    logging: {
      getChildLogger: () => ({ debug: undefined, info: vi.fn(), error: vi.fn() }),
      shouldLogVerbose: () => false,
    },
    channel: { activity: { record: vi.fn() } },
  }),
}));

vi.mock("./accounts.js", () => ({
  resolveIrcAccount: ({ accountId }: { accountId?: string }) => ({
    accountId: accountId ?? "default",
    configured: true,
    enabled: true,
    host: "irc.test",
    port: 6667,
    tls: false,
    config: { channels: [] },
  }),
}));

vi.mock("./connect-options.js", () => ({
  buildIrcConnectOptions: (_account: unknown, overrides: Record<string, unknown>) => overrides,
}));

function makeFakeClient(ready = true) {
  return {
    nick: "testbot",
    isReady: () => ready,
    sendRaw: vi.fn(),
    join: vi.fn(),
    sendPrivmsg: vi.fn(),
    quit: vi.fn(),
  };
}

vi.mock("./client.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./client.js")>();
  return {
    ...orig,
    connectIrcClient: vi.fn(),
  };
});

describe("getActiveIrcClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined when no monitor has started", async () => {
    const { getActiveIrcClient } = await import("./monitor.js");
    expect(getActiveIrcClient("nonexistent")).toBeUndefined();
  });

  it("returns the client after monitor connects", async () => {
    const client = makeFakeClient(true);
    const { connectIrcClient } = await import("./client.js");
    vi.mocked(connectIrcClient).mockResolvedValueOnce(client as never);

    const { getActiveIrcClient, monitorIrcProvider } = await import("./monitor.js");
    const handle = await monitorIrcProvider({ accountId: "acct-a" });

    expect(getActiveIrcClient("acct-a")).toBe(client);
    handle.stop();
  });

  it("returns undefined when client is not ready", async () => {
    const client = makeFakeClient(false);
    const { connectIrcClient } = await import("./client.js");
    vi.mocked(connectIrcClient).mockResolvedValueOnce(client as never);

    const { getActiveIrcClient, monitorIrcProvider } = await import("./monitor.js");
    const handle = await monitorIrcProvider({ accountId: "acct-b" });

    expect(getActiveIrcClient("acct-b")).toBeUndefined();
    handle.stop();
  });

  it("returns undefined after monitor is stopped", async () => {
    const client = makeFakeClient(true);
    const { connectIrcClient } = await import("./client.js");
    vi.mocked(connectIrcClient).mockResolvedValueOnce(client as never);

    const { getActiveIrcClient, monitorIrcProvider } = await import("./monitor.js");
    const handle = await monitorIrcProvider({ accountId: "acct-c" });
    handle.stop();

    expect(getActiveIrcClient("acct-c")).toBeUndefined();
  });
});

describe("irc monitor inbound target", () => {
  it("keeps channel target for group messages", () => {
    expect(
      resolveIrcInboundTarget({
        target: "#openclaw",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: true,
      target: "#openclaw",
      rawTarget: "#openclaw",
    });
  });

  it("maps DM target to sender nick and preserves raw target", () => {
    expect(
      resolveIrcInboundTarget({
        target: "openclaw-bot",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: false,
      target: "alice",
      rawTarget: "openclaw-bot",
    });
  });

  it("falls back to raw target when sender nick is empty", () => {
    expect(
      resolveIrcInboundTarget({
        target: "openclaw-bot",
        senderNick: " ",
      }),
    ).toEqual({
      isGroup: false,
      target: "openclaw-bot",
      rawTarget: "openclaw-bot",
    });
  });
});
