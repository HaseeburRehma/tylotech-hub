/** What the upload callers read from a response (a subset of fetch's Response). */
export interface FormResponse {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}

/**
 * POST a form and report upload progress (0–99 while sending; fetch can't do
 * this). Resolves null on a network failure, like `fetch(...).catch(() => null)`.
 */
export function postForm(url: string, body: FormData, onProgress?: (percent: number) => void): Promise<FormResponse | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      };
    }
    xhr.onload = () =>
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: async () => JSON.parse(xhr.responseText) });
    xhr.onerror = xhr.onabort = xhr.ontimeout = () => resolve(null);
    xhr.send(body);
  });
}
