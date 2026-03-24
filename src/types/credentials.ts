export interface CucmCredentials {
  host: string;
  username: string;
  password: string;
  port: number;
}

export interface ToolCredentialOverrides {
  cucm_host?: string;
  cucm_username?: string;
  cucm_password?: string;
  cucm_port?: number;
}
