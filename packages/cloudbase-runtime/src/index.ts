import fs from 'node:fs/promises';

export type FilterValue =
  | string
  | number
  | boolean
  | null
  | { eq?: unknown; neq?: unknown; gt?: unknown; gte?: unknown; lt?: unknown; lte?: unknown; is?: null | boolean; in?: unknown[] };

export interface SelectOptions {
  select?: string;
  filters?: Record<string, FilterValue>;
  order?: Array<{ column: string; ascending?: boolean }>;
  limit?: number;
  offset?: number;
  single?: boolean;
}

export interface MutationOptions {
  filters?: Record<string, FilterValue>;
  onConflict?: string[];
  mergeDuplicates?: boolean;
  single?: boolean;
}

function snake(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function camel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function mapKeys(value: unknown, keyMapper: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => mapKeys(item, keyMapper));
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [keyMapper(key), mapKeys(item, keyMapper)]));
}

function encodeFilter(value: unknown): string {
  if (value === null) return 'is.null';
  if (typeof value === 'boolean') return `eq.${value}`;
  if (typeof value === 'number') return `eq.${value}`;
  // URLSearchParams performs the query-string escaping. Pre-encoding here
  // double-encodes values such as ISO timestamps, so PostgreSQL receives
  // literal "%3A" fragments instead of colons.
  return `eq.${String(value)}`;
}

function appendFilters(params: URLSearchParams, filters: Record<string, FilterValue> = {}): void {
  for (const [column, raw] of Object.entries(filters)) {
    const name = snake(column);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      params.set(name, encodeFilter(raw));
      continue;
    }
    const operators = raw as Exclude<FilterValue, string | number | boolean | null>;
    for (const [operator, value] of Object.entries(operators)) {
      if (value === undefined) continue;
      if (operator === 'in') {
        params.set(name, `in.(${(value as unknown[]).map((item) => String(item)).join(',')})`);
      } else if (operator === 'is') {
        params.set(name, `is.${value === null ? 'null' : value}`);
      } else {
        params.set(name, `${operator}.${String(value)}`);
      }
    }
  }
}

export class CloudBaseHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly requestId?: string,
  ) {
    super(`CloudBase HTTP ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
}

export class CloudBaseRuntimeClient {
  readonly #apiKey: string;
  readonly gatewayBase: string;
  readonly databaseBase: string;
  readonly storageBase: string;

  constructor(readonly envId: string, apiKey: string) {
    if (!envId || !apiKey) throw new Error('CLOUDBASE_ENV_ID and CLOUDBASE_API_KEY are required');
    this.#apiKey = apiKey;
    this.gatewayBase = `https://${envId}.api.tcloudbasegateway.com`;
    this.databaseBase = `${this.gatewayBase}/v1/rdb/rest`;
    this.storageBase = `${this.gatewayBase}/v1/storages`;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        ...(init.body && !(init.body instanceof ReadableStream) ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      signal: init.signal || AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    if (!response.ok) {
      throw new CloudBaseHttpError(
        response.status,
        body,
        response.headers.get('x-request-id') || response.headers.get('x-cloudbase-request-id') || undefined,
      );
    }
    return mapKeys(body, camel) as T;
  }

  async select<T>(table: string, options: SelectOptions = {}): Promise<T[]> {
    const params = new URLSearchParams({ select: options.select || '*' });
    appendFilters(params, options.filters);
    for (const order of options.order || []) {
      params.append('order', `${snake(order.column)}.${order.ascending === false ? 'desc' : 'asc'}`);
    }
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const rows = await this.request<T[]>(`${this.databaseBase}/${encodeURIComponent(table)}?${params}`);
    return rows || [];
  }

  async selectOne<T>(table: string, options: SelectOptions = {}): Promise<T | null> {
    const rows = await this.select<T>(table, { ...options, limit: 1 });
    return rows[0] || null;
  }

  async insert<T>(table: string, values: Record<string, unknown> | Array<Record<string, unknown>>, options: MutationOptions = {}): Promise<T[]> {
    const params = new URLSearchParams({ select: '*' });
    if (options.onConflict?.length) params.set('on_conflict', options.onConflict.map(snake).join(','));
    const prefer = ['return=representation'];
    if (options.mergeDuplicates) prefer.push('resolution=merge-duplicates');
    return this.request<T[]>(`${this.databaseBase}/${encodeURIComponent(table)}?${params}`, {
      method: 'POST',
      headers: { Prefer: prefer.join(',') },
      body: JSON.stringify(mapKeys(values, snake)),
    });
  }

  async update<T>(table: string, values: Record<string, unknown>, options: MutationOptions = {}): Promise<T[]> {
    const params = new URLSearchParams({ select: '*' });
    appendFilters(params, options.filters);
    return this.request<T[]>(`${this.databaseBase}/${encodeURIComponent(table)}?${params}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(mapKeys(values, snake)),
    });
  }

  async delete<T>(table: string, options: MutationOptions = {}): Promise<T[]> {
    const params = new URLSearchParams({ select: '*' });
    appendFilters(params, options.filters);
    return this.request<T[]>(`${this.databaseBase}/${encodeURIComponent(table)}?${params}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
  }

  async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.request<T>(`${this.databaseBase}/rpc/${encodeURIComponent(name)}`, {
      method: 'POST',
      body: JSON.stringify(mapKeys(args, snake)),
    });
  }

  private objectPath(bucket: string, objectKey: string): string {
    const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
    return `${encodeURIComponent(bucket)}/${encodedKey}`;
  }

  async signUpload(bucket: string, objectKey: string, upsert = false): Promise<{ uploadUrl: string; token: string }> {
    const payload = await this.request<{ url: string; token: string }>(
      `${this.storageBase}/object/upload/sign/${this.objectPath(bucket, objectKey)}`,
      { method: 'POST', headers: upsert ? { 'x-upsert': 'true' } : {} },
    );
    return {
      uploadUrl: payload.url.startsWith('http') ? payload.url : `${this.gatewayBase}${payload.url}`,
      token: payload.token,
    };
  }

  async signDownload(bucket: string, objectKey: string, expiresIn = 600): Promise<string> {
    const payload = await this.request<{ signedURL?: string; signedUrl?: string }>(
      `${this.storageBase}/object/sign/${this.objectPath(bucket, objectKey)}`,
      { method: 'POST', body: JSON.stringify({ expiresIn }) },
    );
    const value = payload.signedURL || payload.signedUrl || '';
    if (!value) throw new Error('CloudBase signed download URL is missing');
    return value.startsWith('http') ? value : `${this.gatewayBase}${value}`;
  }

  async uploadFile(bucket: string, objectKey: string, filePath: string, contentType: string): Promise<void> {
    const body = await fs.readFile(filePath);
    await this.uploadBuffer(bucket, objectKey, body, contentType);
  }

  async uploadBuffer(bucket: string, objectKey: string, body: Buffer, contentType: string): Promise<void> {
    const response = await fetch(`${this.storageBase}/object/${this.objectPath(bucket, objectKey)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        'Content-Type': contentType,
        'Content-Length': String(body.length),
        'x-upsert': 'true',
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new CloudBaseHttpError(response.status, await response.text());
  }

  uploadJson(bucket: string, objectKey: string, value: unknown): Promise<void> {
    return this.uploadBuffer(bucket, objectKey, Buffer.from(JSON.stringify(value)), 'application/json');
  }

  async objectInfo(bucket: string, objectKey: string): Promise<{
    id: string;
    name: string;
    size: number;
    contentType: string;
    etag?: string;
    metadata?: Record<string, unknown>;
  }> {
    return this.request(`${this.storageBase}/object/info/authenticated/${this.objectPath(bucket, objectKey)}`);
  }

  async downloadFile(bucket: string, objectKey: string, targetPath: string): Promise<void> {
    const response = await fetch(`${this.storageBase}/object/authenticated/${this.objectPath(bucket, objectKey)}`, {
      headers: { Authorization: `Bearer ${this.#apiKey}` },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new CloudBaseHttpError(response.status, await response.text());
    await fs.writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
  }

  async deleteObject(bucket: string, objectKey: string): Promise<void> {
    await this.request(`${this.storageBase}/object/${this.objectPath(bucket, objectKey)}`, { method: 'DELETE' });
  }
}

export function cloudBaseRuntimeFromEnv(): CloudBaseRuntimeClient {
  return new CloudBaseRuntimeClient(
    process.env.CLOUDBASE_ENV_ID || process.env.CLOUDBASE_TARGET_ENV_ID || '',
    process.env.CLOUDBASE_API_KEY || '',
  );
}
