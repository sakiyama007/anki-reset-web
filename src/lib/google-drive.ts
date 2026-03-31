const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const SYNC_FILE_NAME = 'anki-reset-sync.json';

async function fetchWithAuth(url: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Drive API error (${res.status}): ${text}`);
  }
  return res;
}

export async function findSyncFile(token: string): Promise<string | null> {
  const res = await fetchWithAuth(
    `${DRIVE_API}/files?spaces=appDataFolder&q=name='${SYNC_FILE_NAME}'&fields=files(id,name)`,
    token,
  );
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

export async function downloadSyncFile(token: string, fileId: string): Promise<string> {
  const res = await fetchWithAuth(
    `${DRIVE_API}/files/${fileId}?alt=media`,
    token,
  );
  return res.text();
}

export async function uploadSyncFile(token: string, content: string, existingFileId?: string): Promise<string> {
  const metadata = {
    name: SYNC_FILE_NAME,
    ...(existingFileId ? {} : { parents: ['appDataFolder'] }),
  };

  const boundary = '-------ankireset';
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');

  if (existingFileId) {
    const res = await fetchWithAuth(
      `${UPLOAD_API}/files/${existingFileId}?uploadType=multipart`,
      token,
      {
        method: 'PATCH',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    const data = await res.json();
    return data.id;
  }

  const res = await fetchWithAuth(
    `${UPLOAD_API}/files?uploadType=multipart`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const data = await res.json();
  return data.id;
}
