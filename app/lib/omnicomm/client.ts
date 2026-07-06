/**
 * Клиент Omnicomm Online REST API (спека: developers.omnicomm.ru, docs/omnicomm-api.md).
 * Инварианты: заголовок строго `JWT <token>`; троттлинг между запросами;
 * коды «нет данных» (5,7,9,10,11) — не ошибка; учётки деградируют под нагрузкой →
 * health-проба перед sync-операциями, без параллельных тяжёлых запросов.
 */

const SLEEP_MS = 350;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const NO_DATA_CODES = new Set([5, 7, 9, 10, 11]);
const SKEW_SECONDS = 60;

export class OmnicommError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}
export class OmnicommAuthError extends OmnicommError {}

export type OmniVehicle = {
  /** UUID объекта в Omnicomm — внешний ключ для telematics_object_links.external_uuid */
  uuid: string;
  name: string;
  /** ID терминала — используется как vehicleId в отчётах/треках */
  terminalId?: number;
  terminalType?: string;
  /** receive_data: 1 = приём данных включён (консервация = 0) */
  receiveData: boolean;
  groupId?: number;
  groupName?: string;
};

type Json = Record<string, unknown>;

function decodeJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString()
    );
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class OmnicommClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private accessExp: number | null = null;
  private lastRequestAt = 0;

  constructor(
    private baseUrl: string,
    private login_: string,
    private password: string
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async throttle() {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < SLEEP_MS) await sleep(SLEEP_MS - elapsed);
    this.lastRequestAt = Date.now();
  }

  private extractErrorCode(data: unknown): number | null {
    if (data && typeof data === "object") {
      const d = data as Json;
      for (const k of ["code", "errorCode", "error"]) {
        const v = d[k];
        if (typeof v === "number") return v;
      }
    }
    return null;
  }

  private storeTokens(data: Json) {
    const access = ["jwt", "access", "accessToken", "access_token", "token"]
      .map((k) => data[k])
      .find((v): v is string => typeof v === "string");
    const refresh = ["refresh", "refreshToken", "refresh_token"]
      .map((k) => data[k])
      .find((v): v is string => typeof v === "string");
    if (!access) throw new OmnicommAuthError("В ответе авторизации нет access-JWT");
    this.accessToken = access;
    if (refresh) this.refreshToken = refresh;
    this.accessExp = decodeJwtExp(access);
  }

  async loginNow(): Promise<void> {
    const url = `${this.baseUrl}/auth/login?jwt=1`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.throttle();
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login: this.login_, password: this.password }),
          signal: AbortSignal.timeout(30000),
        });
      } catch {
        await sleep(SLEEP_MS * 2 ** attempt);
        continue;
      }
      if (RETRY_STATUSES.has(res.status)) {
        await sleep(SLEEP_MS * 2 ** attempt);
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new OmnicommAuthError(`Авторизация отклонена (HTTP ${res.status})`);
      }
      const data = (await res.json()) as Json;
      const code = this.extractErrorCode(data);
      if (code === 1) throw new OmnicommAuthError("Неверный логин/пароль (код 1)");
      this.storeTokens(data);
      return;
    }
    throw new OmnicommAuthError("Не удалось авторизоваться за 3 попытки");
  }

  private async refreshNow(): Promise<void> {
    if (!this.refreshToken) return this.loginNow();
    await this.throttle();
    const res = await fetch(`${this.baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `JWT ${this.refreshToken}` },
      signal: AbortSignal.timeout(30000),
    }).catch(() => null);
    if (!res || res.status === 401 || res.status === 403 || !res.ok) {
      return this.loginNow();
    }
    this.storeTokens((await res.json()) as Json);
  }

  private async ensureToken(): Promise<void> {
    if (!this.accessToken) return this.loginNow();
    if (this.accessExp && this.accessExp - Date.now() / 1000 < SKEW_SECONDS) {
      return this.refreshNow();
    }
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; retries?: number } = {}
  ): Promise<T> {
    await this.ensureToken();
    const retries = opts.retries ?? 3;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= retries; attempt++) {
      await this.throttle();
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `JWT ${this.accessToken}`,
            ...(opts.body ? { "Content-Type": "application/json" } : {}),
          },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
          signal: AbortSignal.timeout(60000),
        });
      } catch (e) {
        lastErr = e;
        await sleep(SLEEP_MS * 2 ** attempt);
        continue;
      }
      if (res.status === 401) {
        await this.refreshNow();
        continue;
      }
      if (RETRY_STATUSES.has(res.status)) {
        lastErr = new OmnicommError(`HTTP ${res.status}`);
        await sleep(SLEEP_MS * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        throw new OmnicommError(`${method} ${path}: HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 500));
      }
      const text = await res.text();
      const data = text ? (JSON.parse(text) as T) : (null as T);
      const code = this.extractErrorCode(data);
      if (code !== null && code !== 0 && !NO_DATA_CODES.has(code)) {
        throw new OmnicommError(`${method} ${path}: код ошибки ${code}`, code);
      }
      return data;
    }
    throw lastErr instanceof Error ? lastErr : new OmnicommError(String(lastErr));
  }

  /** Health-проба: логин + лёгкое чтение. Вызывать перед каждой sync-сессией. */
  async healthProbe(): Promise<{ ok: boolean; ms: number; error?: string }> {
    const start = Date.now();
    try {
      await this.ensureToken();
      await this.request("GET", "/ls/api/v1/profile/terminals/list", { retries: 1 });
      return { ok: true, ms: Date.now() - start };
    } catch (e) {
      return { ok: false, ms: Date.now() - start, error: (e as Error).message };
    }
  }

  /** Дерево ТС → плоский список (ТС вложены в children[].objects[]). */
  async listVehicles(): Promise<OmniVehicle[]> {
    const tree = await this.request<Json>("GET", "/ls/api/v2/tree/vehicle");
    const out: OmniVehicle[] = [];
    const walk = (node: Json | null, groupName?: string, groupId?: number) => {
      if (!node) return;
      for (const obj of (node.objects as Json[] | undefined) ?? []) {
        out.push({
          uuid: String(obj.uuid ?? ""),
          name: String(obj.name ?? ""),
          terminalId: obj.terminal_id as number | undefined,
          terminalType: obj.terminal_type as string | undefined,
          receiveData: obj.receive_data === 1 || obj.receive_data === true,
          groupId,
          groupName,
        });
      }
      for (const child of (node.children as Json[] | undefined) ?? []) {
        walk(child, String(child.name ?? groupName ?? ""), Number(child.id ?? 0) || groupId);
      }
    };
    walk(tree, undefined, undefined);
    return out;
  }

  /** Создание профиля ТС. manufactureId: [A-Za-z0-9] ≤50; vehicleName ≤64. */
  async createVehicle(v: {
    vehicleName: string;
    terminalType: string;
    manufactureId: string;
    groupId: number[];
    password?: string;
  }): Promise<Json> {
    return this.request("POST", "/ls/api/v1/profile/vehicle/create", { body: v });
  }

  /** Профиль ТС — резерв настроек перед удалением (jsonb в profile_backup). */
  async getVehicleProfile(id: number | string): Promise<Json> {
    return this.request("GET", `/ls/api/v1/profile/vehicle/${id}`);
  }

  /** Удаление ТС (на нашей стороне двухэтапно: pending_delete → delete). */
  async deleteVehicles(ids: (number | string)[], reason = 1): Promise<Json> {
    return this.request(
      "DELETE",
      `/ls/api/v1/vehicles?vehicles=${ids.join(",")}&reason=${reason}`
    );
  }

  /** Консервация: state:"false" = «приём данных выключен». NB: строка, не boolean. */
  async setDataCapture(vehicleId: number | string, enabled: boolean): Promise<Json> {
    return this.request("POST", "/ls/api/v1/vehicles/dataCapture/change", {
      body: { vehicleId: String(vehicleId), state: enabled ? "true" : "false" },
    });
  }

  /** Блокировка/разблокировка учётки клиента (автоблокировка должников). */
  async setUserBlocking(p: {
    login: string;
    blocked: boolean;
    reportsBlocked?: boolean;
    comment?: string;
  }): Promise<Json> {
    return this.request("POST", "/ls/api/v1/users/blocking", {
      body: {
        login: p.login,
        blocked: p.blocked,
        reports_blocked: p.reportsBlocked ?? p.blocked,
        blocking_comment: p.comment ?? "",
        blocking_intervals: [],
      },
    });
  }

  async getUserBlocking(login: string): Promise<Json> {
    return this.request(
      "GET",
      `/ls/api/v1/users/blocking?login=${encodeURIComponent(login)}`
    );
  }

  /** Активность ТС за период — источник посуточного факта для биллинга. */
  async vehicleActivity(params?: string): Promise<Json> {
    return this.request(
      "GET",
      `/ls/api/v1/activity/vehicles${params ? `?${params}` : ""}`
    );
  }
}
