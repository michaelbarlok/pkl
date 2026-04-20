import { fetchWithRetry } from "@/lib/fetch-with-retry";

/**
 * fetchWithRetry tests
 *
 * These lock in the behaviors that matter for courtside score entry on
 * flaky mobile networks:
 *  - 4xx passes through immediately (duplicate-score case must NOT retry)
 *  - 5xx retries up to maxAttempts
 *  - On success after a 5xx we eventually return the ok response
 *  - External abort short-circuits the loop
 */

describe("fetchWithRetry", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  test("returns 4xx immediately without retry", async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ error: "duplicate" }), { status: 409 });
    }) as unknown as typeof fetch;

    const res = await fetchWithRetry("/x", { method: "POST" }, { maxAttempts: 4 });
    expect(res.status).toBe(409);
    expect(calls).toBe(1);
  });

  test("retries 5xx up to maxAttempts then throws", async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls++;
      return new Response("oops", { status: 500 });
    }) as unknown as typeof fetch;

    await expect(
      fetchWithRetry(
        "/x",
        { method: "POST" },
        { maxAttempts: 3, attemptTimeoutMs: 1000, slowThresholdMs: 9999 }
      )
    ).rejects.toThrow(/server_500/);
    expect(calls).toBe(3);
  });

  test("returns success after a transient 5xx", async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls++;
      if (calls === 1) return new Response("bad", { status: 503 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const res = await fetchWithRetry(
      "/x",
      { method: "POST" },
      { maxAttempts: 4, attemptTimeoutMs: 1000, slowThresholdMs: 9999 }
    );
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  test("external abort stops the retry loop", async () => {
    const controller = new AbortController();
    let calls = 0;
    global.fetch = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      if (init?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return new Response("oops", { status: 500 });
    }) as unknown as typeof fetch;

    const promise = fetchWithRetry(
      "/x",
      { method: "POST" },
      { maxAttempts: 4, attemptTimeoutMs: 1000, slowThresholdMs: 9999, signal: controller.signal }
    );

    // Abort before the first retry has a chance to fire.
    controller.abort();
    await expect(promise).rejects.toBeDefined();
    expect(calls).toBeLessThanOrEqual(2);
  });

  test("onSlow is called when attempt exceeds slow threshold", async () => {
    const slowEvents: boolean[] = [];

    global.fetch = jest.fn(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(new Response("{}", { status: 200 })), 60)
        )
    ) as unknown as typeof fetch;

    await fetchWithRetry(
      "/x",
      { method: "POST" },
      {
        attemptTimeoutMs: 5_000,
        slowThresholdMs: 20,
        onSlow: (v) => slowEvents.push(v),
      }
    );
    // Expect at least one `true` (slow threshold tripped before fetch resolved).
    expect(slowEvents.some((v) => v === true)).toBe(true);
  });
});
