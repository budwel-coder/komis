import { timingSafeEqual } from "node:crypto";

const API = "https://api.github.com";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_CARS = 1000;
const MAX_FILES = 5000;
const ALLOWED_CATEGORIES = new Set(["cars", "motorcycles", "other"]);

function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
    body: JSON.stringify(body),
  };
}

function requestOrigin(event) {
  return event.headers?.origin || event.headers?.Origin || "";
}

function corsHeaders(origin) {
  const allowed = process.env.IMPORT_ORIGIN;
  if (!allowed || origin !== allowed) return {};
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": "content-type,x-import-password",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

function authorized(event) {
  const supplied = event.headers?.["x-import-password"] || event.headers?.["X-Import-Password"] || "";
  const expected = process.env.IMPORT_PASSWORD || "";
  if (!supplied || !expected) return false;
  const a = Buffer.from(String(supplied));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function github(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Brak zmiennej GITHUB_TOKEN w Netlify.");
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) throw new Error(data.message || `GitHub API: ${response.status}`);
  return data;
}

function repoConfig() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH;
  if (!owner || !repo) throw new Error("Ustaw GITHUB_OWNER i GITHUB_REPO w Netlify.");
  if (!branch) throw new Error("Import jest zablokowany: ustaw GITHUB_BRANCH na gałąź testową.");
  if (branch === "main" && process.env.ALLOW_PRODUCTION_IMPORT !== "true") throw new Error("Import do gałęzi main jest zablokowany do czasu jawnego włączenia publikacji produkcyjnej.");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) || !/^[A-Za-z0-9._/-]+$/.test(branch)) {
    throw new Error("Nieprawidłowa konfiguracja repozytorium GitHub.");
  }
  return { owner, repo, branch, base: `/repos/${owner}/${repo}` };
}

function safeId(value) {
  return String(value || "pojazd").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "pojazd";
}

function parseImage(dataUrl) {
  const match = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl || "");
  if (!match) throw new Error("Zdjęcie musi być w formacie WebP, JPG lub PNG.");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error("Pojedyncze zdjęcie po kompresji musi mieć maksymalnie 4 MB.");
  const ext = match[1] === "image/webp" ? "webp" : match[1] === "image/png" ? "png" : "jpg";
  return { buffer, ext };
}

function validatePublishedPayload(payload) {
  if (!Array.isArray(payload.cars) || !Array.isArray(payload.files) || !payload.siteSettings || typeof payload.siteSettings !== "object" || Array.isArray(payload.siteSettings)) {
    throw new Error("Brak wymaganych danych komisu.");
  }
  if (payload.cars.length > MAX_CARS || payload.files.length > MAX_FILES) throw new Error("Przekroczono limit liczby ogłoszeń lub zdjęć.");

  const paths = new Set();
  const files = payload.files.map(file => {
    const path = String(file?.path || "");
    const sha = String(file?.sha || "");
    if (!/^galeria\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.(?:webp|jpg|png)$/.test(path) || !/^[a-f0-9]{40}$/.test(sha)) {
      throw new Error("Nieprawidłowa lista zdjęć.");
    }
    if (paths.has(path)) throw new Error("Lista zdjęć zawiera powtórzoną ścieżkę.");
    paths.add(path);
    return { path, mode: "100644", type: "blob", sha };
  });

  for (const car of payload.cars) {
    if (!car || typeof car !== "object" || !String(car.id || "").trim()) throw new Error("Jedno z ogłoszeń nie ma prawidłowego identyfikatora.");
    const category = car.category || "cars";
    if (!ALLOWED_CATEGORIES.has(category)) throw new Error("Ogłoszenie ma nieznaną kategorię.");
    for (const photo of [...(Array.isArray(car.photos) ? car.photos : []), ...(Array.isArray(car.thumbnails) ? car.thumbnails : [])]) {
      if (typeof photo !== "string" || !photo.startsWith("galeria/") || !paths.has(photo)) {
        throw new Error("Każde zdjęcie ogłoszenia musi być przesłane przed publikacją.");
      }
    }
  }
  return files;
}

export async function handler(event) {
  const origin = requestOrigin(event);
  const headers = corsHeaders(origin);

  if (event.httpMethod === "OPTIONS") {
    if (!headers["access-control-allow-origin"]) return { statusCode: 403, body: "Origin not allowed" };
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") return json(405, { error: "Użyj POST." }, headers);
  if (String(event.body || "").length > 5_500_000) return json(413, { error: "Żądanie jest za duże. Zmniejsz zdjęcie i spróbuj ponownie." }, headers);
  if (!process.env.IMPORT_ORIGIN || origin !== process.env.IMPORT_ORIGIN) return json(403, { error: "Niedozwolony adres aplikacji." });
  if (!authorized(event)) return json(401, { error: "Nieprawidłowe hasło importu." }, headers);

  try {
    const payload = JSON.parse(event.body || "{}");
    const { owner, repo, branch, base } = repoConfig();

    if (payload.action === "upload-photo") {
      const { buffer, ext } = parseImage(payload.dataUrl);
      const id = safeId(payload.vehicleId);
      const index = Math.max(0, Math.min(999, Number(payload.index) || 0));
      const path = `galeria/${id}/${String(index + 1).padStart(3, "0")}-${Date.now()}.${ext}`;
      const blob = await github(`${base}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: buffer.toString("base64"), encoding: "base64" }),
      });
      return json(200, { ok: true, path, sha: blob.sha }, headers);
    }

    if (payload.action === "publish") {
      const fileEntries = validatePublishedPayload(payload);
      const publicData = {
        format: "autokomis-published-v1",
        created: new Date().toISOString(),
        cars: payload.cars,
        siteSettings: payload.siteSettings,
      };
      const dataBlob = await github(`${base}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: JSON.stringify(publicData), encoding: "utf-8" }),
      });
      const ref = await github(`${base}/git/ref/heads/${encodeURIComponent(branch)}`);
      const parent = await github(`${base}/git/commits/${ref.object.sha}`);
      const tree = await github(`${base}/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          base_tree: parent.tree.sha,
          tree: [
            ...fileEntries,
            { path: "data/komis.json", mode: "100644", type: "blob", sha: dataBlob.sha },
          ],
        }),
      });
      const commit = await github(`${base}/git/commits`, {
        method: "POST",
        body: JSON.stringify({
          message: `Publikacja komisu: ${payload.cars.length} ogłoszeń`,
          tree: tree.sha,
          parents: [ref.object.sha],
        }),
      });
      await github(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      return json(200, {
        ok: true,
        commit: commit.sha,
        count: payload.cars.length,
        photos: fileEntries.length,
        message: "Oferta została zapisana w GitHub. Netlify rozpocznie publikację.",
      }, headers);
    }

    return json(400, { error: "Nieznana operacja." }, headers);
  } catch (error) {
    console.error("receive-commission:", error);
    return json(400, { error: error.message || "Nie udało się zapisać komisu." }, headers);
  }
}
