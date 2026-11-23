const GH_API = 'https://api.github.com';
const reply = (status, body, headers) => new Response(JSON.stringify(body), { status, headers });

export default async (req) => {
  const origin = req.headers.get('origin') || '';
  const allowed = process.env.IMPORT_ORIGIN || '';
  const headers = {
    'Access-Control-Allow-Origin': allowed && origin === allowed ? allowed : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Import-Password',
    'Vary': 'Origin', 'Content-Type': 'application/json; charset=utf-8'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply(405, { error: 'Dozwolony jest tylko POST.' }, headers);
  if (!allowed || origin !== allowed) return reply(403, { error: 'Niedozwolony adres panelu.' }, headers);
  if (!process.env.IMPORT_PASSWORD || req.headers.get('x-import-password') !== process.env.IMPORT_PASSWORD)
    return reply(401, { error: 'Nieprawidłowe hasło publikacji.' }, headers);

  const { GITHUB_OWNER: owner, GITHUB_REPO: repo, GITHUB_TOKEN: token } = process.env;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!owner || !repo || !token) return reply(500, { error: 'Brak konfiguracji GitHuba w Netlify.' }, headers);
  const ghHeaders = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const api = (path) => `${GH_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`;
  const gh = async (path, options = {}) => {
    const r = await fetch(api(path), { ...options, headers: { ...ghHeaders, ...(options.headers || {}) } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.message || `GitHub API: ${r.status}`);
    return body;
  };
  try {
    const input = await req.json();
    if (!input || typeof input.action !== 'string') return reply(400, { error: 'Brak akcji.' }, headers);

    if (input.action === 'base') {
      const ref = await gh(`/git/ref/heads/${encodeURIComponent(branch)}`);
      const commit = await gh(`/git/commits/${ref.object.sha}`);
      return reply(200, { ok: true, branch, commit: ref.object.sha, tree: commit.tree.sha }, headers);
    }

    if (input.action === 'blobs') {
      if (!Array.isArray(input.files) || input.files.length < 1 || input.files.length > 8)
        return reply(400, { error: 'Jedna partia musi zawierać od 1 do 8 zdjęć.' }, headers);
      const result = [];
      for (const file of input.files) {
        if (!file || typeof file.path !== 'string' || !/^galeria\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(file.path) || typeof file.content !== 'string' || file.content.length > 5_000_000)
          return reply(400, { error: 'Nieprawidłowy plik zdjęcia.' }, headers);
        const blob = await gh('/git/blobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: file.content, encoding: 'base64' }) });
        result.push({ path: file.path, sha: blob.sha });
      }
      return reply(200, { ok: true, blobs: result }, headers);
    }

    if (input.action === 'publish') {
      if (typeof input.baseCommit !== 'string' || typeof input.baseTree !== 'string' || !Array.isArray(input.files) || !input.data || !Array.isArray(input.data.cars))
        return reply(400, { error: 'Niekompletne dane publikacji.' }, headers);
      const ref = await gh(`/git/ref/heads/${encodeURIComponent(branch)}`);
      if (ref.object.sha !== input.baseCommit) return reply(409, { error: 'Repozytorium zmieniło się od rozpoczęcia publikacji. Odśwież panel i spróbuj ponownie.' }, headers);
      const tree = await gh(`/git/trees/${input.baseTree}?recursive=1`);
      if (tree.truncated) return reply(413, { error: 'Repozytorium jest zbyt duże do bezpiecznej aktualizacji.' }, headers);
      const entries = tree.tree.filter(x => !x.path.startsWith('galeria/')).map(x => ({ path: x.path, mode: x.mode, type: x.type, sha: x.sha }));
      // Explicit null-SHA entries remove stale images from the previous publication.
      for (const oldFile of tree.tree.filter(x => x.path.startsWith('galeria/'))) {
        entries.push({ path: oldFile.path, mode: oldFile.mode || '100644', type: 'blob', sha: null });
      }
      for (const file of input.files) {
        if (!file || typeof file.path !== 'string' || !/^galeria\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(file.path) || typeof file.sha !== 'string')
          return reply(400, { error: 'Nieprawidłowy wykaz zdjęć.' }, headers);
        entries.push({ path: file.path, mode: '100644', type: 'blob', sha: file.sha });
      }
      const manifest = JSON.stringify(input.data, null, 2);
      const manifestBlob = await gh('/git/blobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: manifest, encoding: 'utf-8' }) });
      entries.push({ path: 'data/commission.json', mode: '100644', type: 'blob', sha: manifestBlob.sha });
      const newTree = await gh('/git/trees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base_tree: input.baseTree, tree: entries }) });
      const commit = await gh('/git/commits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Aktualizacja komisu (${input.data.cars.length} ogłoszeń)`, tree: newTree.sha, parents: [input.baseCommit] }) });
      await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sha: commit.sha, force: false }) });
      return reply(200, { ok: true, commit: commit.sha, count: input.data.cars.length, photos: input.files.length, branch }, headers);
    }
    return reply(400, { error: 'Nieznana akcja.' }, headers);
  } catch (error) {
    return reply(502, { error: error?.message || 'Błąd publikacji do GitHuba.' }, headers);
  }
};
