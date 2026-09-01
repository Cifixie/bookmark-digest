import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveUrl } from "./resolve-url";

describe("resolveUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a plain URL unchanged when there is no redirect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, url: "https://example.com/article" })
    );

    await expect(resolveUrl("https://example.com/article")).resolves.toBe("https://example.com/article");
  });

  it("follows an HTTP redirect chain to the final URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, url: "https://real-site.example/final-article" })
    );

    await expect(resolveUrl("https://tinyurl.com/abc123")).resolves.toBe(
      "https://real-site.example/final-article"
    );
  });

  it("unwraps a google.com/url?q=... link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, url: "https://real-site.example/final-article" })
    );

    const wrapped = "https://www.google.com/url?q=https://real-site.example/final-article&sa=D";
    await expect(resolveUrl(wrapped)).resolves.toBe("https://real-site.example/final-article");
  });

  it("falls back to the original URL when HEAD fails but GET succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, url: "https://tinyurl.com/abc123" })
      .mockResolvedValueOnce({ ok: true, url: "https://real-site.example/final-article" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveUrl("https://tinyurl.com/abc123")).resolves.toBe(
      "https://real-site.example/final-article"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails open to the original URL on fetch failure/timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    await expect(resolveUrl("https://tinyurl.com/abc123")).resolves.toBe("https://tinyurl.com/abc123");
  });
});
