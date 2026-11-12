// Minimal, safe inline markdown: **bold**, *em*, `code`, [text](url). Paragraphs split on blank lines.
// Renders React nodes (never innerHTML), so content can't inject markup.
const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

export function inline(text) {
  if (!text) return null;
  return String(text)
    .split(TOKEN)
    .filter(Boolean)
    .map((part, i) => {
      if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
      if (part.startsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
      const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (link) {
        const safe = /^(https?:|mailto:|\/|#)/.test(link[2]) ? link[2] : '#';
        return (
          <a key={i} className="inline-link" href={safe} target={safe.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
            {link[1]}
          </a>
        );
      }
      return part;
    });
}

export function Md({ text, className }) {
  if (!text) return null;
  const paras = String(text).trim().split(/\n\s*\n/);
  return (
    <div className={className}>
      {paras.map((p, i) => (
        <p key={i}>{inline(p.replace(/\s*\n\s*/g, ' '))}</p>
      ))}
    </div>
  );
}
