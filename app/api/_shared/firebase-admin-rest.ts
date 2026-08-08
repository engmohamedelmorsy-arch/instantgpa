type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type FirestoreValue = Record<string, unknown>;

function serviceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (parsed.project_id && parsed.client_email && parsed.private_key) return parsed as ServiceAccount;
  }
  const fallback = {
    project_id: process.env.FIREBASE_PROJECT_ID || "",
    client_email: process.env.FIREBASE_CLIENT_EMAIL || "",
    private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  };
  if (!fallback.project_id || !fallback.client_email || !fallback.private_key) {
    throw new Error("FIREBASE_ADMIN_NOT_CONFIGURED");
  }
  return fallback;
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodeText(value: string) {
  return base64Url(new TextEncoder().encode(value));
}

function pemBytes(pem: string) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return Uint8Array.from(atob(body), (character) => character.charCodeAt(0));
}

async function accessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = encodeText(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3_000,
  }));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "FIREBASE_ADMIN_TOKEN_FAILED");
  return data.access_token;
}

function firestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, firestoreValue(nested)])) } };
  }
  return { stringValue: String(value) };
}

function documentFields(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]));
}

function decodedValue(value: Record<string, unknown>): unknown {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  const array = value.arrayValue as { values?: Array<Record<string, unknown>> } | undefined;
  if (array) return (array.values || []).map(decodedValue);
  const map = value.mapValue as { fields?: Record<string, Record<string, unknown>> } | undefined;
  if (map) return Object.fromEntries(Object.entries(map.fields || {}).map(([key, nested]) => [key, decodedValue(nested)]));
  return null;
}

function documentUrl(account: ServiceAccount, path: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/databases/(default)/documents/${encodedPath}`;
}

function collectionUrl(account: ServiceAccount, path: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/databases/(default)/documents/${encodedPath}`;
}

export function firebaseAdminConfigured() {
  try {
    serviceAccount();
    return true;
  } catch {
    return false;
  }
}

export async function setFirestoreDocument(path: string, data: Record<string, unknown>) {
  const account = serviceAccount();
  const token = await accessToken(account);
  const response = await fetch(documentUrl(account, path), {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ fields: documentFields(data) }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(result.error?.message || "FIRESTORE_WRITE_FAILED");
  }
}

export async function createFirestoreDocument(path: string, data: Record<string, unknown>) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2 || parts.length % 2 !== 0) throw new Error("FIRESTORE_DOCUMENT_PATH_INVALID");
  const documentId = parts.pop()!;
  const account = serviceAccount();
  const token = await accessToken(account);
  const url = new URL(collectionUrl(account, parts.join("/")));
  url.searchParams.set("documentId", documentId);
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ fields: documentFields(data) }),
  });
  if (response.status === 409) return false;
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(result.error?.message || "FIRESTORE_CREATE_FAILED");
  }
  return true;
}

export async function getFirestoreDocument<T extends Record<string, unknown>>(path: string): Promise<T | null> {
  const account = serviceAccount();
  const token = await accessToken(account);
  const response = await fetch(documentUrl(account, path), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return null;
  const result = await response.json().catch(() => ({})) as { fields?: Record<string, Record<string, unknown>>; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || "FIRESTORE_READ_FAILED");
  return Object.fromEntries(Object.entries(result.fields || {}).map(([key, value]) => [key, decodedValue(value)])) as T;
}

export async function listFirestoreDocuments<T extends Record<string, unknown>>(path: string, pageSize = 100): Promise<Array<T & { id: string }>> {
  const account = serviceAccount();
  const token = await accessToken(account);
  const url = new URL(collectionUrl(account, path));
  url.searchParams.set("pageSize", String(Math.max(1, Math.min(300, pageSize))));
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (response.status === 404) return [];
  const result = await response.json().catch(() => ({})) as {
    documents?: Array<{ name?: string; fields?: Record<string, Record<string, unknown>> }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(result.error?.message || "FIRESTORE_LIST_FAILED");
  return (result.documents || []).map((document) => ({
    id: String(document.name || "").split("/").pop() || "",
    ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decodedValue(value)])),
  })) as Array<T & { id: string }>;
}

export async function listAllFirestoreDocuments<T extends Record<string, unknown>>(
  path: string,
  maximumDocuments = 10_000,
): Promise<Array<T & { id: string }>> {
  const account = serviceAccount();
  const token = await accessToken(account);
  const documents: Array<T & { id: string }> = [];
  let pageToken = "";
  do {
    const url = new URL(collectionUrl(account, path));
    url.searchParams.set("pageSize", String(Math.min(300, Math.max(1, maximumDocuments - documents.length))));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (response.status === 404) return documents;
    const result = await response.json().catch(() => ({})) as {
      documents?: Array<{ name?: string; fields?: Record<string, Record<string, unknown>> }>;
      nextPageToken?: string;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(result.error?.message || "FIRESTORE_LIST_FAILED");
    documents.push(...(result.documents || []).map((document) => ({
      id: String(document.name || "").split("/").pop() || "",
      ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decodedValue(value)])),
    })) as Array<T & { id: string }>);
    pageToken = String(result.nextPageToken || "");
  } while (pageToken && documents.length < maximumDocuments);
  if (pageToken) throw new Error("FIRESTORE_EXPORT_LIMIT_EXCEEDED");
  return documents;
}

export async function deleteFirestoreDocument(path: string) {
  const account = serviceAccount();
  const token = await accessToken(account);
  const response = await fetch(documentUrl(account, path), {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) throw new Error("FIRESTORE_DELETE_FAILED");
}
