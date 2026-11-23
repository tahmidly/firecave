/**
 * Blocky "firecave" wordmark in the style of opencode's new-session screen (our own letters, not their logo).
 * Each glyph is a bitmap on a 6-row grid; lowercase letters use the bottom 4 rows.
 */
const GLYPHS: Record<string, string[]> = {
  l: ["##", "##", "##", "##", "##", "##"],
  f: [".###", "##..", "####", "##..", "##..", "##.."],
  i: ["##", "", "##", "##", "##", "##"],
  r: ["", "", "####", "##..", "##..", "##.."],
  v: ["", "", "#...#", "#...#", ".#.#.", "..#.."],
  h: ["#...", "#...", "####", "#..#", "#..#", "#..#"],
  m: ["", "", "#####", "#.#.#", "#.#.#", "#.#.#"],
  e: ["", "", "####", "####", "#...", "####"],
  b: ["#...", "#...", "####", "#..#", "#..#", "####"],
  s: ["", "", "####", "###.", ".###", "####"],
  o: ["", "", "####", "#..#", "#..#", "####"],
  c: ["", "", "####", "#...", "#...", "####"],
  a: ["", "", "####", "...#", "####", "####"],
  w: ["", "", "#...#", "#...#", "#.#.#", "#####"],
};

const UNIT = 12;
const GAP = 1; // blank columns between letters

export function Wordmark({ text = "firecave", className }: { text?: string; className?: string }) {
  const rects: { x: number; y: number; inner: boolean }[] = [];
  let col = 0;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) continue;
    const width = Math.max(...g.map((r) => r.length));
    g.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === "#") rects.push({ x: col + x, y, inner: false });
        // Holes inside a glyph get a slightly lighter fill, like opencode's two-tone mark.
        else if (cell === "." ) rects.push({ x: col + x, y, inner: true });
      });
    });
    col += width + GAP;
  }
  const w = (col - GAP) * UNIT;
  const h = 6 * UNIT;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-label="Firecave" role="img">
      {rects.map((r, i) => (
        <rect key={i} x={r.x * UNIT} y={r.y * UNIT} width={UNIT} height={UNIT} fill="currentColor" opacity={r.inner ? 0.18 : 1} />
      ))}
    </svg>
  );
}
