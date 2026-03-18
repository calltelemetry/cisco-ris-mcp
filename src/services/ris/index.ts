import { escapeXml, fetchServiceabilitySoap, toArray } from "../../lib/soap-client.js";
import { withRateLimit } from "../../lib/rate-limiter.js";
import { log } from "../../lib/logger.js";
import type { CucmCredentials } from "../../types/credentials.js";
import { CUCM_PORT } from "../../lib/credential-resolver.js";
import type { RisDevice, RisNode, RisDeviceResult, CtiItem, CtiResult, LineStatus } from "../../types/ris-types.js";

const RIS_PATH = "/realtimeservice2/services/RISService70";

export interface SelectCmDeviceArgs {
  maxReturnedDevices?: number;
  deviceClass?: string;
  model?: number;
  status?: string;
  selectBy?: string;
  selectItems?: string[];
  protocol?: string;
  timeoutMs?: number;
  stateInfo?: string;
}

export interface SelectCtiItemArgs {
  ctiMgrClass?: string;
  maxItems?: number;
  appId?: string;
  nodeName?: string;
  status?: string;
  timeoutMs?: number;
}

function buildSelectCmDeviceEnvelope(args: SelectCmDeviceArgs): string {
  const maxDevices = args.maxReturnedDevices ?? 200;
  const deviceClass = args.deviceClass ?? "Phone";
  const model = args.model ?? 255;
  const status = args.status ?? "Any";
  const selectBy = args.selectBy ?? "Name";
  const protocol = args.protocol ?? "Any";
  const items = args.selectItems?.length ? args.selectItems : ["*"];

  const selectItemsXml = items
    .map((i) => `<soap:item><soap:Item>${escapeXml(i)}</soap:Item></soap:item>`)
    .join("");

  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soap="http://schemas.cisco.com/ast/soap">' +
    "<soapenv:Header/><soapenv:Body>" +
    "<soap:selectCmDevice>" +
    `<soap:StateInfo>${escapeXml(args.stateInfo ?? "")}</soap:StateInfo>` +
    "<soap:CmSelectionCriteria>" +
    `<soap:MaxReturnedDevices>${maxDevices}</soap:MaxReturnedDevices>` +
    `<soap:DeviceClass>${escapeXml(deviceClass)}</soap:DeviceClass>` +
    `<soap:Model>${model}</soap:Model>` +
    `<soap:Status>${escapeXml(status)}</soap:Status>` +
    "<soap:NodeName></soap:NodeName>" +
    `<soap:SelectBy>${escapeXml(selectBy)}</soap:SelectBy>` +
    `<soap:SelectItems>${selectItemsXml}</soap:SelectItems>` +
    `<soap:Protocol>${escapeXml(protocol)}</soap:Protocol>` +
    "<soap:DownloadStatus>Any</soap:DownloadStatus>" +
    "</soap:CmSelectionCriteria>" +
    "</soap:selectCmDevice>" +
    "</soapenv:Body></soapenv:Envelope>"
  );
}

interface IpAddressInfo {
  ip: string;
  type: string;
  attribute: string;
}

function extractIpInfo(raw: unknown): IpAddressInfo {
  if (typeof raw === "string") return { ip: raw, type: "ipv4", attribute: "" };
  if (!raw || typeof raw !== "object") return { ip: "", type: "", attribute: "" };
  const obj = raw as Record<string, unknown>;
  const item = obj.item ?? obj.Item;
  if (item) {
    const first = Array.isArray(item) ? item[0] : item;
    if (first && typeof first === "object") {
      const f = first as Record<string, unknown>;
      return {
        ip: String(f.IP ?? ""),
        type: String(f.IPAddrType ?? "ipv4"),
        attribute: String(f.Attribute ?? ""),
      };
    }
    if (typeof first === "string") return { ip: first, type: "ipv4", attribute: "" };
  }
  if (obj.IP) return { ip: String(obj.IP), type: String(obj.IPAddrType ?? "ipv4"), attribute: String(obj.Attribute ?? "") };
  return { ip: "", type: "", attribute: "" };
}

function parseLinesStatus(raw: unknown): LineStatus[] {
  if (!raw || typeof raw !== "object") return [];
  const wrapper = raw as Record<string, unknown>;
  const items = toArray(wrapper.item ?? wrapper) as Record<string, unknown>[];
  return items
    .filter(item => item.DirectoryNumber || item.Status)
    .map(item => ({
      directoryNumber: String(item.DirectoryNumber ?? ""),
      status: String(item.Status ?? ""),
    }));
}

function parseDevice(d: Record<string, unknown>): RisDevice {
  const ipInfo = extractIpInfo(d.IPAddress ?? d.IpAddress ?? "");
  return {
    name: String(d.Name ?? ""),
    ipAddress: ipInfo.ip,
    ipAddrType: ipInfo.type,
    ipAttribute: ipInfo.attribute,
    description: String(d.Description ?? ""),
    dirNumber: String(d.DirNumber ?? ""),
    status: String(d.Status ?? ""),
    statusReason: Number(d.StatusReason ?? 0),
    protocol: String(d.Protocol ?? ""),
    activeLoadId: String(d.ActiveLoadID ?? d.ActiveLoadId ?? ""),
    inactiveLoadId: String(d.InactiveLoadID ?? d.InactiveLoadId ?? ""),
    downloadStatus: String(d.DownloadStatus ?? ""),
    downloadFailureReason: String(d.DownloadFailureReason ?? ""),
    downloadServer: String(d.DownloadServer ?? ""),
    timeStamp: Number(d.TimeStamp ?? 0),
    deviceClass: String(d.DeviceClass ?? ""),
    model: Number(d.Model ?? 0),
    product: Number(d.Product ?? 0),
    httpd: String(d.Httpd ?? ""),
    registrationAttempts: Number(d.RegistrationAttempts ?? 0),
    isCtiControllable: d.IsCtiControllable === true || d.IsCtiControllable === "true",
    loginUserId: String(d.LoginUserId ?? ""),
    numOfLines: Number(d.NumOfLines ?? 0),
    linesStatus: parseLinesStatus(d.LinesStatus),
  };
}

export async function selectCmDevice(
  creds: CucmCredentials,
  args: SelectCmDeviceArgs = {},
): Promise<RisDeviceResult> {
  const envelope = buildSelectCmDeviceEnvelope(args);
  const timeout = args.timeoutMs ?? 60_000;

  const body = await withRateLimit(creds.host, () =>
    fetchServiceabilitySoap(creds.host, CUCM_PORT, creds, RIS_PATH, "selectCmDevice", envelope, timeout)
  );

  const resp = body.selectCmDeviceResponse as Record<string, unknown> | undefined;
  const ret = resp?.selectCmDeviceReturn as Record<string, unknown> | undefined;
  const result = (ret?.SelectCmDeviceResult ?? resp?.SelectCmDeviceResult) as Record<string, unknown> | undefined;
  if (!result) throw new Error("Unexpected selectCmDevice response shape");

  const totalDevicesFound = Number(result.TotalDevicesFound ?? 0);
  const nodesRaw = toArray((result.CmNodes as Record<string, unknown>)?.item) as Record<string, unknown>[];
  const rawStateInfo = String(ret?.StateInfo ?? resp?.StateInfo ?? "").trim();
  const stateInfo = rawStateInfo || undefined;

  const cmNodes: RisNode[] = nodesRaw.map((node) => {
    const devicesRaw = toArray((node.CmDevices as Record<string, unknown>)?.item) as Record<string, unknown>[];
    return {
      name: String(node.Name ?? ""),
      returnCode: String(node.ReturnCode ?? ""),
      devices: devicesRaw.map(parseDevice),
    };
  });

  log("debug", "selectCmDevice completed", { host: creds.host, totalDevicesFound, nodes: cmNodes.length });
  return { totalDevicesFound, cmNodes, stateInfo };
}

export async function selectCmDeviceAll(
  creds: CucmCredentials,
  args: Omit<SelectCmDeviceArgs, "stateInfo"> & { limit?: number } = {},
): Promise<RisDeviceResult> {
  const allNodes = new Map<string, RisNode>();
  let stateInfo: string | undefined;
  let totalDevicesFound = 0;
  let totalDevicesCollected = 0;
  const maxPages = 50;
  const limit = args.limit;

  for (let page = 0; page < maxPages; page++) {
    log("debug", "selectCmDeviceAll page", { page, host: creds.host });
    const result = await selectCmDevice(creds, { ...args, maxReturnedDevices: 1000, stateInfo });

    totalDevicesFound = result.totalDevicesFound;
    stateInfo = result.stateInfo;

    for (const node of result.cmNodes) {
      const existing = allNodes.get(node.name);
      if (existing) {
        existing.devices.push(...node.devices);
      } else {
        allNodes.set(node.name, { ...node, devices: [...node.devices] });
      }
      totalDevicesCollected += node.devices.length;
    }

    if (limit && totalDevicesCollected >= limit) break;
    if (!stateInfo) break;
  }

  return { totalDevicesFound, cmNodes: Array.from(allNodes.values()) };
}

function buildSelectCtiItemEnvelope(args: SelectCtiItemArgs): string {
  const ctiMgrClass = args.ctiMgrClass ?? "Provider";
  const maxItems = args.maxItems ?? 200;
  const status = args.status ?? "Any";
  const hasAppFilter = !!args.appId;
  const selectAppBy = hasAppFilter ? "AppId" : "";
  const appItemsXml = hasAppFilter
    ? `<soap:AppItems><soap:item><soap:AppItem>${escapeXml(args.appId!)}</soap:AppItem></soap:item></soap:AppItems>`
    : '<soap:AppItems xsi:nil="true"/>';

  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soap="http://schemas.cisco.com/ast/soap" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    "<soapenv:Header/><soapenv:Body>" +
    "<soap:selectCtiItem>" +
    "<soap:StateInfo></soap:StateInfo>" +
    "<soap:CtiSelectionCriteria>" +
    `<soap:MaxReturnedItems>${maxItems}</soap:MaxReturnedItems>` +
    `<soap:CtiMgrClass>${escapeXml(ctiMgrClass)}</soap:CtiMgrClass>` +
    `<soap:Status>${escapeXml(status)}</soap:Status>` +
    `<soap:NodeName>${escapeXml(args.nodeName ?? "")}</soap:NodeName>` +
    `<soap:SelectAppBy>${escapeXml(selectAppBy)}</soap:SelectAppBy>` +
    appItemsXml +
    '<soap:DevNames xsi:nil="true"/><soap:DirNumbers xsi:nil="true"/>' +
    "</soap:CtiSelectionCriteria>" +
    "</soap:selectCtiItem>" +
    "</soapenv:Body></soapenv:Envelope>"
  );
}

export async function selectCtiItem(
  creds: CucmCredentials,
  args: SelectCtiItemArgs = {},
): Promise<CtiResult> {
  const envelope = buildSelectCtiItemEnvelope(args);
  const timeout = args.timeoutMs ?? 30_000;

  const body = await withRateLimit(creds.host, () =>
    fetchServiceabilitySoap(creds.host, CUCM_PORT, creds, RIS_PATH, "selectCtiItem", envelope, timeout)
  );

  const resp = body.selectCtiItemResponse as Record<string, unknown> | undefined;
  const ret = resp?.selectCtiItemReturn as Record<string, unknown> | undefined;
  const result = (ret?.SelectCtiItemResult ?? resp?.SelectCtiItemResult) as Record<string, unknown> | undefined;
  if (!result) throw new Error("Unexpected selectCtiItem response shape");

  const totalItemsFound = Number(result.TotalItemsFound ?? 0);
  const ctiNodesWrapper = result.CtiNodes as Record<string, unknown> | undefined;
  const ctiNodes = toArray(ctiNodesWrapper?.item ?? ctiNodesWrapper) as Record<string, unknown>[];

  const items: CtiItem[] = [];
  for (const node of ctiNodes) {
    const nodeItems = node.CtiItems as Record<string, unknown> | undefined;
    const rawItems = toArray(nodeItems?.item ?? nodeItems) as Record<string, unknown>[];
    for (const item of rawItems) {
      items.push({
        name: String(item.Name ?? item.DeviceName ?? ""),
        ipAddress: String(item.IPAddress ?? item.IpAddress ?? ""),
        status: String(item.Status ?? ""),
        appId: String(item.AppID ?? item.AppId ?? ""),
        userId: String(item.UserID ?? item.UserId ?? ""),
        ...item,
      });
    }
  }

  return { totalItemsFound, items };
}
