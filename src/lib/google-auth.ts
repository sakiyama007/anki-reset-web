'use client';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let currentToken: string | null = null;

declare global {
  interface Window {
    google?: typeof google;
  }
}

export function isGoogleLoaded(): boolean {
  return typeof window !== 'undefined' && !!window.google?.accounts?.oauth2;
}

export function getToken(): string | null {
  return currentToken;
}

export function setToken(token: string | null): void {
  currentToken = token;
}

export function initGoogleAuth(): Promise<void> {
  return new Promise((resolve) => {
    if (isGoogleLoaded()) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

export function requestAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isGoogleLoaded()) {
      reject(new Error('Google Identity Services が読み込まれていません'));
      return;
    }

    if (!CLIENT_ID) {
      reject(new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID が設定されていません'));
      return;
    }

    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          currentToken = response.access_token;
          resolve(response.access_token);
        },
      });
    }

    tokenClient.requestAccessToken();
  });
}

export function revokeToken(): void {
  if (currentToken && isGoogleLoaded()) {
    google.accounts.oauth2.revoke(currentToken, () => {});
  }
  currentToken = null;
  tokenClient = null;
}
