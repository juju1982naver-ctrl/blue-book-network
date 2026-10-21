import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

// Run only at build time: approved inputs -> the Android v1 feed.
const root = resolve(process.argv[2] || '.');
const out = resolve(root, 'dist');
const input = resolve(root, 'content/approved');
const allowedTestIds = new Set();
const fields = ['id', 'title', 'category', 'reporter', 'publishedAt', 'summary', 'path'];
const detailFields = [...fields, 'body', 'sources', 'verification', 'media'];
const requireValue = (ok, reason) => { if (!ok) throw new Error(reason); };
const text = v => typeof v === 'string' && v.trim().length > 0;
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const date = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
const https = v => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password && ![...u.searchParams.keys()].some(k => /token|secret|password|api.?key|authorization|signature/i.test(k)); } catch { return false; } };
const select = (v, keys) => Object.fromEntries(keys.map(k => [k, v[k]]));
const articles = [];
const seen = new Set();
for (const entry of existsSync(input) ? readdirSync(input, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)) : []) {
  requireValue(entry.isFile() && entry.name.endsWith('.json'), 'Only regular JSON files are allowed in content/approved');
  const record = JSON.parse(readFileSync(join(input, entry.name), 'utf8'));
  const p = record.publication;
  const a = record.article;
  requireValue(record.schemaVersion === 1 && object(p) && p.state === 'approved' && text(p.approvedBy) && date(p.approvedAt), `Missing publication approval: ${entry.name}`);
  requireValue(['article', 'test'].includes(p.kind) && object(a), `Invalid publication kind/article: ${entry.name}`);
  requireValue(Object.keys(a).every(k => detailFields.includes(k)), `Unknown public article field: ${entry.name}`);
  requireValue(typeof a.id === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(a.id) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(a.id), `Invalid id: ${entry.name}`);
  requireValue(basename(entry.name, '.json') === a.id && a.path === `articles/${a.id}.json` && !seen.has(a.id), `Duplicate or mismatched id/path: ${entry.name}`);
  seen.add(a.id);
  requireValue(text(a.title) && text(a.summary) && date(a.publishedAt), `Missing title/summary/date: ${a.id}`);
  requireValue(['news', 'mystery', 'deep_dive', 'declassified'].includes(a.category) && ['sentinel', 'nightwatch', 'majestic'].includes(a.reporter), `Invalid category/reporter: ${a.id}`);
  requireValue(Array.isArray(a.body) && a.body.length > 0 && a.body.every(b => object(b) && ['paragraph', 'heading', 'quote', 'list_item'].includes(b.type) && text(b.text)), `Invalid body: ${a.id}`);
  requireValue(Array.isArray(a.sources) && a.sources.every(s => object(s) && text(s.name) && https(s.url)), `Invalid sources: ${a.id}`);
  requireValue(object(a.verification) && ['pending', 'verified', 'partial', 'failed'].includes(a.verification.status) && typeof a.verification.note === 'string', `Invalid verification: ${a.id}`);
  requireValue(Array.isArray(a.media) && a.media.every(m => object(m) && ['image', 'video', 'diagram', 'ai_image'].includes(m.type) && text(m.label) && https(m.url) && text(m.usage) && (m.type !== 'ai_image' || /AI|인공지능/i.test(m.label))), `Invalid media: ${a.id}`);
  if (p.kind === 'test') {
    requireValue(allowedTestIds.has(a.id) && a.title.startsWith('[연동 테스트]') && a.verification.status === 'pending' && text(a.verification.note), `Test publication not explicitly allowed: ${a.id}`);
  } else {
    requireValue(!allowedTestIds.has(a.id) && a.sources.length > 0 && ['verified', 'partial'].includes(a.verification.status) && (a.verification.status !== 'partial' || text(a.verification.note)), `Real publication requires reviewed sources: ${a.id}`);
  }
  // Approval metadata stays private to the repository; only the public schema is emitted.
  const clean = select(a, detailFields);
  clean.body = a.body.map(b => select(b, ['type','text']));
  clean.sources = a.sources.map(s => select(s, ['name','url']));
  clean.verification = select(a.verification, ['status','note']);
  clean.media = a.media.map(m => select(m, ['type','label','url','usage']));
  requireValue(!/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._~-]{16,}/i.test(JSON.stringify(clean)), `Secret-like article data: ${a.id}`);
  articles.push(clean);
}
articles.sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id));
// Keep the existing public compatibility files; never index them automatically.
mkdirSync(out, { recursive: true });
if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), out, { recursive: true });
mkdirSync(join(out, 'articles'), { recursive: true });
for (const a of articles) writeFileSync(join(out, a.path), JSON.stringify(a, null, 2) + '\n');
const index = { schemaVersion: 1, generatedAt: new Date().toISOString(), articles: articles.map(a => select(a, fields)) };
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n');
writeFileSync(join(out, '404.html'), '<!doctype html><meta charset="utf-8"><title>404</title><p>Not found</p>\n');
writeFileSync(join(out, '_headers'), '/*\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex, nofollow, noarchive\n  Referrer-Policy: no-referrer\n');
console.log(JSON.stringify({ schemaVersion: 1, articleCount: articles.length, ids: articles.map(a => a.id), output: 'dist' }));
