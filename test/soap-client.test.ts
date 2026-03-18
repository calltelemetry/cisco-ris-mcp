import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { escapeXml, basicAuthHeader, toArray, fetchServiceabilitySoap } from "../src/lib/soap-client.js";

describe("escapeXml", () => {
  it("escapes ampersand", () => {
    expect(escapeXml("a&b")).toBe("a&amp;b");
  });

  it("escapes less-than", () => {
    expect(escapeXml("a<b")).toBe("a&lt;b");
  });

  it("escapes greater-than", () => {
    expect(escapeXml("a>b")).toBe("a&gt;b");
  });

  it("escapes double quote", () => {
    expect(escapeXml('a"b')).toBe("a&quot;b");
  });

  it("escapes single quote", () => {
    expect(escapeXml("a'b")).toBe("a&apos;b");
  });

  it("escapes all special characters together", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("returns unchanged string with no special characters", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });
});

describe("basicAuthHeader", () => {
  it("produces valid base64 Basic auth header", () => {
    const header = basicAuthHeader("admin", "password");
    expect(header).toMatch(/^Basic /);
    const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf8");
    expect(decoded).toBe("admin:password");
  });

  it("handles special characters in credentials", () => {
    const header = basicAuthHeader("user@domain", "p@ss:word!");
    const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf8");
    expect(decoded).toBe("user@domain:p@ss:word!");
  });
});

describe("toArray", () => {
  it("returns empty array for null", () => {
    expect(toArray(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(toArray(undefined)).toEqual([]);
  });

  it("wraps single item in array", () => {
    expect(toArray("hello")).toEqual(["hello"]);
  });

  it("wraps single object in array", () => {
    const obj = { name: "test" };
    expect(toArray(obj)).toEqual([obj]);
  });

  it("returns array unchanged", () => {
    const arr = [1, 2, 3];
    expect(toArray(arr)).toBe(arr);
  });
});

describe("fetchServiceabilitySoap", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses successful SOAP response body", async () => {
    const soapXml = `<?xml version="1.0"?>
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
        <soapenv:Body>
          <perfmonCollectCounterDataResponse>
            <ArrayOfCounterInfo>
              <item><Name>CallsActive</Name><Value>5</Value><CStatus>1</CStatus></item>
            </ArrayOfCounterInfo>
          </perfmonCollectCounterDataResponse>
        </soapenv:Body>
      </soapenv:Envelope>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(soapXml),
    });

    const result = await fetchServiceabilitySoap(
      "cucm1", 8443, { username: "admin", password: "pass" },
      "/perfmonservice2/services/PerfmonService",
      "perfmonCollectCounterData",
      "<xml/>",
    );

    expect(result.perfmonCollectCounterDataResponse).toBeDefined();
    const resp = result.perfmonCollectCounterDataResponse as Record<string, unknown>;
    const aoci = resp.ArrayOfCounterInfo as Record<string, unknown>;
    expect(aoci.item).toBeDefined();
  });

  it("throws on HTTP error with status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: () => Promise.resolve("error body"),
    });

    await expect(
      fetchServiceabilitySoap(
        "cucm1", 8443, { username: "admin", password: "pass" },
        "/path", "action", "<xml/>",
      )
    ).rejects.toThrow(/HTTP 500/);
  });

  it("throws SOAP fault string from response body", async () => {
    const faultXml = `<?xml version="1.0"?>
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
        <soapenv:Body>
          <soapenv:Fault>
            <faultcode>Server</faultcode>
            <faultstring>Authentication failed</faultstring>
          </soapenv:Fault>
        </soapenv:Body>
      </soapenv:Envelope>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(faultXml),
    });

    await expect(
      fetchServiceabilitySoap(
        "cucm1", 8443, { username: "admin", password: "pass" },
        "/path", "action", "<xml/>",
      )
    ).rejects.toThrow(/CUCM SOAP fault.*Authentication failed/);
  });

  it("retries on 503 rate limit then throws if all retries exhausted", async () => {
    // Mock setTimeout to execute immediately for retry delays
    const origSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: TimerHandler, _ms?: number) => {
      if (typeof fn === "function") fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: () => Promise.resolve("rate limited"),
    });

    await expect(
      fetchServiceabilitySoap(
        "cucm1", 8443, { username: "admin", password: "pass" },
        "/path", "action", "<xml/>", 30_000,
      )
    ).rejects.toThrow(/HTTP 503/);

    // 1 initial + 3 retries = 4 calls
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);

    vi.mocked(globalThis.setTimeout).mockRestore();
  });

  it("throws SOAP fault from OK response body", async () => {
    const faultXml = `<?xml version="1.0"?>
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
        <soapenv:Body>
          <soapenv:Fault>
            <faultstring>Some server fault</faultstring>
          </soapenv:Fault>
        </soapenv:Body>
      </soapenv:Envelope>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(faultXml),
    });

    await expect(
      fetchServiceabilitySoap(
        "cucm1", 8443, { username: "admin", password: "pass" },
        "/path", "action", "<xml/>",
      )
    ).rejects.toThrow(/CUCM SOAP fault.*Some server fault/);
  });

  it("retries on rate limit SOAP fault in OK response", async () => {
    const origSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: TimerHandler, _ms?: number) => {
      if (typeof fn === "function") fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    const rateLimitFault = `<?xml version="1.0"?>
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
        <soapenv:Body>
          <soapenv:Fault>
            <faultstring>exceeded allowed rate of requests</faultstring>
          </soapenv:Fault>
        </soapenv:Body>
      </soapenv:Envelope>`;

    const successXml = `<?xml version="1.0"?>
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
        <soapenv:Body><result>ok</result></soapenv:Body>
      </soapenv:Envelope>`;

    const mockFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(rateLimitFault) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(successXml) });

    globalThis.fetch = mockFn;

    const result = await fetchServiceabilitySoap(
      "cucm1", 8443, { username: "admin", password: "pass" },
      "/path", "action", "<xml/>",
    );

    expect(result.result).toBe("ok");
    expect(mockFn).toHaveBeenCalledTimes(2);

    vi.mocked(globalThis.setTimeout).mockRestore();
  });

  it("sends correct headers", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<Envelope><Body><result>ok</result></Body></Envelope>"),
    });

    await fetchServiceabilitySoap(
      "cucm1", 8443, { username: "admin", password: "pass" },
      "/perfmonservice2/services/PerfmonService",
      "perfmonCollectCounterData",
      "<xml/>",
    );

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe("https://cucm1:8443/perfmonservice2/services/PerfmonService");
    const opts = call[1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(headers.SOAPAction).toBe("perfmonCollectCounterData");
    expect(headers["Content-Type"]).toBe("text/xml;charset=UTF-8");
  });
});
