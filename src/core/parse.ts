/**
 * Shared output-parsing helpers for skill nodes.
 *
 * Skill nodes ask Claude to end its reply with tagged lines (SUMMARY, VERDICT, …). These
 * helpers scan for the last such line, matching the Python original's reversed search.
 */

/** Return the text after the first colon of the last line starting with `tag`, else null. */
export function lastTagged(text: string, tag: string): string | null {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i].trim();
    if (ln.toUpperCase().startsWith(tag.toUpperCase())) {
      return ln.slice(ln.indexOf(":") + 1).trim();
    }
  }
  return null;
}

/**
 * Find `tag` on any line (top-down), tolerating leading markdown markers (`**`, `-`, `#`,
 * `>`, backticks) and trailing emphasis. More lenient than `lastTagged` — use for control
 * tags like NEEDS_INPUT that a model may not place on the final line.
 */
export function findTagged(text: string, tag: string): string | null {
  const upper = tag.toUpperCase();
  for (const raw of text.split("\n")) {
    const ln = raw.trim().replace(/^[>*_`#\-\s]+/, "");
    if (ln.toUpperCase().startsWith(upper)) {
      return ln.slice(ln.indexOf(":") + 1).trim().replace(/[*_`]+$/, "");
    }
  }
  return null;
}

/** Extract a SUMMARY line, falling back to the last non-empty line (truncated). */
export function extractSummary(text: string): string {
  const summary = lastTagged(text, "SUMMARY:");
  if (summary !== null) return summary;
  const lines = text.trim().split("\n");
  return lines.length ? lines[lines.length - 1].slice(0, 200) : "(no output)";
}
