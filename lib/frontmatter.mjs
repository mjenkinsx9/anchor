import yaml from 'js-yaml';

export function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  let data;
  try {
    data = yaml.load(m[1]) ?? {};
  } catch {
    return { data: {}, body: text };
  }
  if (typeof data !== 'object' || Array.isArray(data)) return { data: {}, body: text };
  return { data, body: text.slice(m[0].length) };
}

export function stringifyFrontmatter(data, body) {
  return `---\n${yaml.dump(data).trimEnd()}\n---\n\n${body}`;
}
