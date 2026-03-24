export interface RisDevice {
  name: string;
  ipAddress: string;
  description: string;
  dirNumber: string;
  status: string;
  statusReason: number;
  protocol: string;
  activeLoadId: string;
  timeStamp: number;
}

export interface RisNode {
  name: string;
  returnCode: string;
  devices: RisDevice[];
}

export interface RisDeviceResult {
  totalDevicesFound: number;
  cmNodes: RisNode[];
  stateInfo?: string;
}

export interface CtiItem {
  name: string;
  ipAddress: string;
  status: string;
  appId: string;
  userId: string;
  [k: string]: unknown;
}

export interface CtiResult {
  totalItemsFound: number;
  items: CtiItem[];
}

export interface PhoneStatusSummary {
  totalDevices: number;
  registered: number;
  unregistered: number;
  registrationRate: number;
  byModel: Record<string, { registered: number; unregistered: number }>;
  byProtocol: Record<string, { registered: number; unregistered: number }>;
  byNode: Array<{ name: string; registered: number; unregistered: number; total: number }>;
}

export interface RegistrationHealthResult {
  overall: { registrationRate: number; totalDevices: number; registered: number; unregistered: number };
  nodes: Array<{ name: string; registrationRate: number; registered: number; unregistered: number }>;
  counters: Record<string, number> | null;
  alerts: string[];
}
