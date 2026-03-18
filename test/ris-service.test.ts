import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing
vi.mock("../src/lib/soap-client.js", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    fetchServiceabilitySoap: vi.fn(),
  };
});

vi.mock("../src/lib/rate-limiter.js", () => ({
  withRateLimit: vi.fn((_host: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../src/lib/logger.js", () => ({
  log: vi.fn(),
}));

import { selectCmDevice, selectCmDeviceAll, selectCtiItem } from "../src/services/ris/index.js";
import { fetchServiceabilitySoap } from "../src/lib/soap-client.js";

const mockFetch = fetchServiceabilitySoap as ReturnType<typeof vi.fn>;

const baseCreds = { host: "cucm1", username: "admin", password: "pass", port: 8443 };

describe("selectCmDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns structured result from CUCM response", async () => {
    mockFetch.mockResolvedValue({
      selectCmDeviceResponse: {
        selectCmDeviceReturn: {
          SelectCmDeviceResult: {
            TotalDevicesFound: 2,
            CmNodes: {
              item: [
                {
                  Name: "cucm-pub",
                  ReturnCode: "Ok",
                  CmDevices: {
                    item: [
                      {
                        Name: "SEP001122334455",
                        IPAddress: { item: { IP: "10.1.1.100", IPAddrType: "ipv4", Attribute: "0" } },
                        Description: "Test Phone",
                        DirNumber: "1001",
                        Status: "Registered",
                        StatusReason: 0,
                        Protocol: "SIP",
                        ActiveLoadID: "sip88xx.12-7-1-0001-393",
                        InactiveLoadID: "",
                        DownloadStatus: "None",
                        DownloadFailureReason: "",
                        DownloadServer: "",
                        TimeStamp: 1700000000,
                        DeviceClass: "Phone",
                        Model: 684,
                        Product: 684,
                        Httpd: "Yes",
                        RegistrationAttempts: 1,
                        IsCtiControllable: true,
                        LoginUserId: "jsmith",
                        NumOfLines: 2,
                        LinesStatus: {
                          item: [
                            { DirectoryNumber: "1001", Status: "Registered" },
                            { DirectoryNumber: "1002", Status: "Registered" },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          StateInfo: "",
        },
      },
    });

    const result = await selectCmDevice(baseCreds);
    expect(result.totalDevicesFound).toBe(2);
    expect(result.cmNodes).toHaveLength(1);

    const node = result.cmNodes[0]!;
    expect(node.name).toBe("cucm-pub");
    expect(node.returnCode).toBe("Ok");
    expect(node.devices).toHaveLength(1);

    const dev = node.devices[0]!;
    expect(dev.name).toBe("SEP001122334455");
    expect(dev.ipAddress).toBe("10.1.1.100");
    expect(dev.ipAddrType).toBe("ipv4");
    expect(dev.ipAttribute).toBe("0");
    expect(dev.description).toBe("Test Phone");
    expect(dev.dirNumber).toBe("1001");
    expect(dev.status).toBe("Registered");
    expect(dev.statusReason).toBe(0);
    expect(dev.protocol).toBe("SIP");
    expect(dev.activeLoadId).toBe("sip88xx.12-7-1-0001-393");
    expect(dev.inactiveLoadId).toBe("");
    expect(dev.downloadStatus).toBe("None");
    expect(dev.downloadFailureReason).toBe("");
    expect(dev.downloadServer).toBe("");
    expect(dev.timeStamp).toBe(1700000000);
    expect(dev.deviceClass).toBe("Phone");
    expect(dev.model).toBe(684);
    expect(dev.product).toBe(684);
    expect(dev.httpd).toBe("Yes");
    expect(dev.registrationAttempts).toBe(1);
    expect(dev.isCtiControllable).toBe(true);
    expect(dev.loginUserId).toBe("jsmith");
    expect(dev.numOfLines).toBe(2);
    expect(dev.linesStatus).toHaveLength(2);
    expect(dev.linesStatus[0]!.directoryNumber).toBe("1001");
    expect(dev.linesStatus[0]!.status).toBe("Registered");
  });

  it("handles stateInfo for pagination", async () => {
    mockFetch.mockResolvedValue({
      selectCmDeviceResponse: {
        selectCmDeviceReturn: {
          SelectCmDeviceResult: {
            TotalDevicesFound: 500,
            CmNodes: { item: [] },
          },
          StateInfo: "some-pagination-token",
        },
      },
    });

    const result = await selectCmDevice(baseCreds);
    expect(result.stateInfo).toBe("some-pagination-token");
  });

  it("throws on unexpected response shape", async () => {
    mockFetch.mockResolvedValue({ somethingElse: {} });
    await expect(selectCmDevice(baseCreds)).rejects.toThrow(/Unexpected selectCmDevice response/);
  });
});

describe("extractIpInfo (tested via parseDevice)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("handles flat string IP address", async () => {
    mockFetch.mockResolvedValue({
      selectCmDeviceResponse: {
        selectCmDeviceReturn: {
          SelectCmDeviceResult: {
            TotalDevicesFound: 1,
            CmNodes: {
              item: [{
                Name: "node1",
                ReturnCode: "Ok",
                CmDevices: {
                  item: [{ Name: "SEP111", IPAddress: "10.1.1.1", Status: "Registered" }],
                },
              }],
            },
          },
        },
      },
    });

    const result = await selectCmDevice(baseCreds);
    expect(result.cmNodes[0]!.devices[0]!.ipAddress).toBe("10.1.1.1");
    expect(result.cmNodes[0]!.devices[0]!.ipAddrType).toBe("ipv4");
  });

  it("handles nested item with IP object", async () => {
    mockFetch.mockResolvedValue({
      selectCmDeviceResponse: {
        selectCmDeviceReturn: {
          SelectCmDeviceResult: {
            TotalDevicesFound: 1,
            CmNodes: {
              item: [{
                Name: "node1",
                ReturnCode: "Ok",
                CmDevices: {
                  item: [{
                    Name: "SEP222",
                    IPAddress: {
                      item: [
                        { IP: "10.2.2.2", IPAddrType: "ipv4", Attribute: "1" },
                        { IP: "::1", IPAddrType: "ipv6", Attribute: "2" },
                      ],
                    },
                    Status: "Registered",
                  }],
                },
              }],
            },
          },
        },
      },
    });

    const result = await selectCmDevice(baseCreds);
    const dev = result.cmNodes[0]!.devices[0]!;
    // Should take the first item
    expect(dev.ipAddress).toBe("10.2.2.2");
    expect(dev.ipAddrType).toBe("ipv4");
    expect(dev.ipAttribute).toBe("1");
  });

  it("handles object with direct IP field", async () => {
    mockFetch.mockResolvedValue({
      selectCmDeviceResponse: {
        selectCmDeviceReturn: {
          SelectCmDeviceResult: {
            TotalDevicesFound: 1,
            CmNodes: {
              item: [{
                Name: "node1",
                ReturnCode: "Ok",
                CmDevices: {
                  item: [{
                    Name: "SEP333",
                    IPAddress: { IP: "10.3.3.3", IPAddrType: "ipv6" },
                    Status: "Registered",
                  }],
                },
              }],
            },
          },
        },
      },
    });

    const result = await selectCmDevice(baseCreds);
    const dev = result.cmNodes[0]!.devices[0]!;
    expect(dev.ipAddress).toBe("10.3.3.3");
    expect(dev.ipAddrType).toBe("ipv6");
  });
});

describe("parseLinesStatus (tested via parseDevice)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses line array from LinesStatus", async () => {
    mockFetch.mockResolvedValue({
      selectCmDeviceResponse: {
        selectCmDeviceReturn: {
          SelectCmDeviceResult: {
            TotalDevicesFound: 1,
            CmNodes: {
              item: [{
                Name: "node1",
                ReturnCode: "Ok",
                CmDevices: {
                  item: [{
                    Name: "SEP444",
                    Status: "Registered",
                    LinesStatus: {
                      item: [
                        { DirectoryNumber: "2001", Status: "Registered" },
                        { DirectoryNumber: "2002", Status: "UnRegistered" },
                      ],
                    },
                  }],
                },
              }],
            },
          },
        },
      },
    });

    const result = await selectCmDevice(baseCreds);
    const lines = result.cmNodes[0]!.devices[0]!.linesStatus;
    expect(lines).toHaveLength(2);
    expect(lines[0]!.directoryNumber).toBe("2001");
    expect(lines[1]!.status).toBe("UnRegistered");
  });

  it("handles missing LinesStatus", async () => {
    mockFetch.mockResolvedValue({
      selectCmDeviceResponse: {
        selectCmDeviceReturn: {
          SelectCmDeviceResult: {
            TotalDevicesFound: 1,
            CmNodes: {
              item: [{
                Name: "node1",
                ReturnCode: "Ok",
                CmDevices: {
                  item: [{ Name: "SEP555", Status: "Registered" }],
                },
              }],
            },
          },
        },
      },
    });

    const result = await selectCmDevice(baseCreds);
    expect(result.cmNodes[0]!.devices[0]!.linesStatus).toEqual([]);
  });
});

describe("selectCmDeviceAll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("paginates and merges nodes", async () => {
    // First page: returns stateInfo for continuation
    mockFetch.mockResolvedValueOnce({
      selectCmDeviceResponse: {
        selectCmDeviceReturn: {
          SelectCmDeviceResult: {
            TotalDevicesFound: 3,
            CmNodes: {
              item: [{
                Name: "node1",
                ReturnCode: "Ok",
                CmDevices: {
                  item: [
                    { Name: "SEP001", Status: "Registered" },
                    { Name: "SEP002", Status: "Registered" },
                  ],
                },
              }],
            },
          },
          StateInfo: "page2-token",
        },
      },
    });

    // Second page: no stateInfo = last page
    mockFetch.mockResolvedValueOnce({
      selectCmDeviceResponse: {
        selectCmDeviceReturn: {
          SelectCmDeviceResult: {
            TotalDevicesFound: 3,
            CmNodes: {
              item: [{
                Name: "node1",
                ReturnCode: "Ok",
                CmDevices: {
                  item: [{ Name: "SEP003", Status: "UnRegistered" }],
                },
              }],
            },
          },
          StateInfo: "",
        },
      },
    });

    const result = await selectCmDeviceAll(baseCreds);
    expect(result.totalDevicesFound).toBe(3);
    expect(result.cmNodes).toHaveLength(1);
    // Should have merged devices from both pages into same node
    expect(result.cmNodes[0]!.devices).toHaveLength(3);
  });

  it("stops pagination when limit is reached", async () => {
    mockFetch.mockResolvedValueOnce({
      selectCmDeviceResponse: {
        selectCmDeviceReturn: {
          SelectCmDeviceResult: {
            TotalDevicesFound: 1000,
            CmNodes: {
              item: [{
                Name: "node1",
                ReturnCode: "Ok",
                CmDevices: {
                  item: Array.from({ length: 5 }, (_, i) => ({ Name: `SEP${i}`, Status: "Registered" })),
                },
              }],
            },
          },
          StateInfo: "more-pages",
        },
      },
    });

    const result = await selectCmDeviceAll(baseCreds, { limit: 5 });
    expect(result.cmNodes[0]!.devices).toHaveLength(5);
    // Should not have made a second call
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("selectCtiItem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses CTI nodes and items", async () => {
    mockFetch.mockResolvedValue({
      selectCtiItemResponse: {
        selectCtiItemReturn: {
          SelectCtiItemResult: {
            TotalItemsFound: 2,
            CtiNodes: {
              item: [{
                CtiItems: {
                  item: [
                    { Name: "CTIPort1", IPAddress: "10.1.1.1", Status: "Open", AppID: "CiscoJTAPI", UserID: "admin" },
                    { Name: "CTIPort2", IPAddress: "10.1.1.2", Status: "Close", AppID: "CiscoJTAPI", UserID: "user1" },
                  ],
                },
              }],
            },
          },
        },
      },
    });

    const result = await selectCtiItem(baseCreds);
    expect(result.totalItemsFound).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.name).toBe("CTIPort1");
    expect(result.items[0]!.ipAddress).toBe("10.1.1.1");
    expect(result.items[0]!.status).toBe("Open");
    expect(result.items[0]!.appId).toBe("CiscoJTAPI");
    expect(result.items[0]!.userId).toBe("admin");
    expect(result.items[1]!.name).toBe("CTIPort2");
  });

  it("throws on unexpected response shape", async () => {
    mockFetch.mockResolvedValue({ somethingElse: {} });
    await expect(selectCtiItem(baseCreds)).rejects.toThrow(/Unexpected selectCtiItem response/);
  });
});
