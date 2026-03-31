declare namespace google.accounts.oauth2 {
  interface TokenClient {
    requestAccessToken: () => void;
  }

  interface TokenResponse {
    access_token: string;
    error?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  }

  function initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
  }): TokenClient;

  function revoke(token: string, callback: () => void): void;
}
