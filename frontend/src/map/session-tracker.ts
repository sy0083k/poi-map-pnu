import type { WebVisitEventPayload, WebVisitEventType } from "./types";

const WEB_SESSION_ID_COOKIE_NAME = "web_session_id";
const WEB_LAST_SEEN_COOKIE_NAME = "web_last_seen_ts";
const WEB_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
const WEB_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const WEB_HEARTBEAT_INTERVAL_MS = 15000;

type UTMContext = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
};

type SessionTrackerDeps = {
  getOrCreateAnonId: () => string;
  postWebEvent: (payload: WebVisitEventPayload) => Promise<void>;
};
function getCookie(name: string): string | null {
  const encodedName = `${encodeURIComponent(name)}=`;
  const found = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(encodedName));
  if (!found) {
    return null;
  }
  return decodeURIComponent(found.slice(encodedName.length));
}

function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`;
}

function createClientSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getClientTz(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return tz || "UTC";
}

function normalizeOptional(value: string | null, maxLength: number): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, maxLength);
}

function getPagePath(): string {
  const pathname = window.location.pathname || "/";
  return pathname.startsWith("/") ? pathname.slice(0, 256) : `/${pathname.slice(0, 255)}`;
}

function getPageQuery(): string | undefined {
  return normalizeOptional(window.location.search || "", 512);
}

function getReferrerContext(): { referrerUrl?: string } {
  const referrerUrl = normalizeOptional(document.referrer || "", 512);
  if (!referrerUrl) {
    return {};
  }
  return { referrerUrl };
}

function getUTMContext(): UTMContext {
  const search = window.location.search || "";
  if (!search) {
    return {};
  }
  const params = new URLSearchParams(search);
  return {
    utmSource: normalizeOptional(params.get("utm_source"), 128),
    utmMedium: normalizeOptional(params.get("utm_medium"), 128),
    utmCampaign: normalizeOptional(params.get("utm_campaign"), 128),
    utmTerm: normalizeOptional(params.get("utm_term"), 128),
    utmContent: normalizeOptional(params.get("utm_content"), 128)
  };
}

function getClientContext(): {
  clientLang?: string;
  platform?: string;
  screenWidth?: number;
  screenHeight?: number;
  viewportWidth?: number;
  viewportHeight?: number;
} {
  const nav = window.navigator;
  return {
    clientLang: normalizeOptional(nav.language || null, 32),
    platform: normalizeOptional(nav.platform || null, 64),
    screenWidth: Number.isFinite(window.screen.width) ? window.screen.width : undefined,
    screenHeight: Number.isFinite(window.screen.height) ? window.screen.height : undefined,
    viewportWidth: Number.isFinite(window.innerWidth) ? window.innerWidth : undefined,
    viewportHeight: Number.isFinite(window.innerHeight) ? window.innerHeight : undefined
  };
}

function getOrCreateWebSessionId(nowMs: number): { sessionId: string; isNew: boolean } {
  const existingSessionId = getCookie(WEB_SESSION_ID_COOKIE_NAME);
  const existingLastSeenRaw = getCookie(WEB_LAST_SEEN_COOKIE_NAME);
  const existingLastSeenMs = existingLastSeenRaw ? Number.parseInt(existingLastSeenRaw, 10) : Number.NaN;
  const isExpired = Number.isNaN(existingLastSeenMs) || nowMs - existingLastSeenMs > WEB_SESSION_TIMEOUT_MS;

  if (!existingSessionId || isExpired) {
    const sessionId = createClientSessionId();
    setCookie(WEB_SESSION_ID_COOKIE_NAME, sessionId, WEB_SESSION_MAX_AGE_SECONDS);
    setCookie(WEB_LAST_SEEN_COOKIE_NAME, String(nowMs), WEB_SESSION_MAX_AGE_SECONDS);
    return { sessionId, isNew: true };
  }

  setCookie(WEB_LAST_SEEN_COOKIE_NAME, String(nowMs), WEB_SESSION_MAX_AGE_SECONDS);
  return { sessionId: existingSessionId, isNew: false };
}

export function createSessionTracker(deps: SessionTrackerDeps) {
  let webHeartbeatTimer: number | null = null;

  const sendSingle = async (
    eventType: WebVisitEventType,
    anonId: string,
    sessionId: string,
    nowSeconds: number,
    clientTz: string
  ): Promise<void> => {
    const pagePath = getPagePath();
    const pageQuery = getPageQuery();
    const referrer = getReferrerContext();
    const utm = getUTMContext();
    const client = getClientContext();
    await deps.postWebEvent({
      eventType,
      anonId,
      sessionId,
      pagePath,
      pageQuery,
      clientTs: nowSeconds,
      clientTz,
      ...referrer,
      ...utm,
      ...client
    });
  };

  const sendWebEvent = (eventType: WebVisitEventType): void => {
    const nowMs = Date.now();
    const anonId = deps.getOrCreateAnonId();
    const { sessionId, isNew } = getOrCreateWebSessionId(nowMs);
    const clientTz = getClientTz();
    const nowSeconds = Math.floor(nowMs / 1000);

    if (isNew && eventType !== "visit_start") {
      void sendSingle("visit_start", anonId, sessionId, nowSeconds, clientTz)
        .then(() => sendSingle(eventType, anonId, sessionId, nowSeconds, clientTz))
        .catch(() => {
          // Ignore telemetry failures.
        });
      return;
    }

    void sendSingle(eventType, anonId, sessionId, nowSeconds, clientTz).catch(() => {
      // Ignore telemetry failures.
    });
  };

  const startWebHeartbeat = (): void => {
    if (webHeartbeatTimer !== null) {
      window.clearInterval(webHeartbeatTimer);
    }
    webHeartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        sendWebEvent("heartbeat");
      }
    }, WEB_HEARTBEAT_INTERVAL_MS);
  };

  const stopWebHeartbeat = (): void => {
    if (webHeartbeatTimer === null) {
      return;
    }
    window.clearInterval(webHeartbeatTimer);
    webHeartbeatTimer = null;
  };

  const mount = (): void => {
    sendWebEvent("visit_start");
    startWebHeartbeat();

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        sendWebEvent("visit_end");
        stopWebHeartbeat();
        return;
      }
      sendWebEvent("visit_start");
      startWebHeartbeat();
    });

    window.addEventListener("pagehide", () => {
      sendWebEvent("visit_end");
      stopWebHeartbeat();
    });
  };

  return {
    mount
  };
}
