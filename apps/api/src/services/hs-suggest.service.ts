import { sql } from 'kysely';
import { db } from '../db/client.js';

/**
 * Suggests HS codes for free-text goods descriptions.
 *
 * This only ever *suggests*. Nothing here writes a code onto a line — a wrong
 * HS code is a misclassification, which this platform's own penalty calculator
 * treats as an offence, so a human confirms every one. The score returned is a
 * plain count of how many of the description's words the tariff entry actually
 * contains; it is deliberately not dressed up as a confidence percentage,
 * because a word overlap is not a probability of being correct.
 */

/** Words that appear in nearly every invoice line and identify nothing. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'per', 'set', 'sets', 'pcs', 'pc', 'piece', 'pieces',
  'unit', 'units', 'sum', 'each', 'assorted', 'various', 'item', 'items', 'type', 'size',
  'new', 'used', 'other', 'inc', 'incl', 'including', 'x', 'mm', 'cm', 'kg', 'ltr', 'no',
]);

/**
 * Words worth searching on. Model numbers ("M6x70", "A13RJH") are dropped —
 * they identify a supplier's part, never a tariff heading, and they drag in
 * unrelated rows.
 */
export function describeTokens(text: string): string[] {
  return Array.from(new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3)
      .filter(w => !STOPWORDS.has(w))
      .filter(w => !/\d/.test(w)),        // drops model/part numbers
  )).slice(0, 8);
}

export interface HsSuggestion {
  code: string;
  description: string;
  duty_rate: number | null;
  vat_rate: number | null;
  /** How many of the description's words this entry's text contains. */
  matched: number;
  /** Which words matched — shown so the user can judge the suggestion. */
  matchedWords: string[];
  /** Total words searched on, so "2 of 4" is readable. */
  totalWords: number;
}

export interface SuggestInput { id: string; text: string }
export interface SuggestResult { id: string; tokens: string[]; suggestions: HsSuggestion[] }

/**
 * Bulk suggestion. Every distinct word across every line is fetched in one
 * query, then scored per line in memory — a 200-line invoice would otherwise
 * be 200 round trips.
 */
export async function suggestHsCodes(items: SuggestInput[], perItem = 3): Promise<SuggestResult[]> {
  const tokensById = new Map(items.map(i => [i.id, describeTokens(i.text)]));
  const allTokens = Array.from(new Set([...tokensById.values()].flat()));
  if (allTokens.length === 0) return items.map(i => ({ id: i.id, tokens: [], suggestions: [] }));

  // Whole words only. A plain ILIKE '%hex%' matched "Cyclohexane" and '%head%'
  // matched "Safety headgear", so "Hex head bolts" suggested a hydrocarbon and
  // a hard hat. \y is Postgres' word boundary.
  const variantsOf = (t: string) => Array.from(new Set([t, t.endsWith('s') ? t.slice(0, -1) : `${t}s`]));
  const rows = await db.selectFrom('hs_codes')
    .select(['code', 'description', 'import_duty_rate', 'vat_rate', 'level'])
    .where(eb => eb.or(allTokens.flatMap(t =>
      variantsOf(t).map(v => sql<boolean>`description ~* ${'\\y' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\y'}`),
    )))
    // Subheadings only. Levels 2 and 4 are chapters and headings — "72.08" is
    // a real tariff row but not a declarable classification, and because it
    // carries no rates of its own it was suggested and accepted onto a line
    // that then assessed at 0% duty.
    .where('level', '=', 8)
    .orderBy('level', 'desc')
    .limit(4000)
    .execute();

  // Same boundary rule client-side, so scoring agrees with the query.
  const wordRe = new Map<string, RegExp>();
  for (const t of allTokens) {
    wordRe.set(t, new RegExp(`\\b(${variantsOf(t).map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i'));
  }

  const prepared = rows.map(r => ({ ...r, haystack: (r.description ?? '').toLowerCase() }));

  // How informative each word is, measured against the tariff text itself.
  //
  // Counting matched words alone treats every word as equally telling, and it
  // is not: "head" occurs in hundreds of headings (fish heads, head lettuce,
  // mink with or without head) while "bolts" occurs in a handful. With a plain
  // count and a code-order tiebreak, "hex head bolts" led with Fish heads
  // because chapter 03 sorts before chapter 73. Weighting by inverse document
  // frequency lets the rare, identifying word carry the suggestion. This is
  // measured from the data, not assigned by hand.
  const docFreq = new Map<string, number>();
  for (const t of allTokens) {
    const re = wordRe.get(t)!;
    docFreq.set(t, prepared.reduce((n, r) => n + (re.test(r.haystack) ? 1 : 0), 0));
  }
  const N = prepared.length || 1;
  const weightOf = (t: string) => Math.log(1 + N / (1 + (docFreq.get(t) ?? 0)));

  return items.map(item => {
    const tokens = tokensById.get(item.id) ?? [];
    if (tokens.length === 0) return { id: item.id, tokens, suggestions: [] };

    const scored = prepared
      .map(r => {
        const matchedWords = tokens.filter(t => wordRe.get(t)!.test(r.haystack));
        const score = matchedWords.reduce((s, t) => s + weightOf(t), 0);
        // What share of the tariff entry's own wording the match accounts for.
        // "Ball bearings" is two words and one of them matched; "Printed or
        // illustrated postcards; printed cards bearing" is seven and the match
        // is an incidental trailing word. Both score identically on a
        // single-word query, and postcards won on code order — so an entry
        // that is mostly about the matched word is preferred.
        // Floored at four words, so a very terse entry gets no bonus simply
        // for being short: without the floor "Bolt action" (a firearm
        // mechanism, two words) outranked "Screws; bolts and nuts" on a query
        // of "hex head bolts". The floor keeps the signal that matters — an
        // entry mostly about the matched word beats one where it trails at the
        // end of a long list — while removing the one that doesn't.
        const entryWords = r.haystack.split(/\W+/).filter(Boolean).length;
        const coverage = matchedWords.length / Math.max(4, entryWords);
        return { r, matchedWords, score, coverage };
      })
      .filter(x => x.matchedWords.length > 0)
      .sort((a, b) =>
        b.score - a.score ||
        b.coverage - a.coverage ||
        // Deterministic, and nothing more — a residual tie means the two
        // entries matched equally informative words, which no further
        // heuristic here can separate. That is exactly why every suggestion
        // is reviewed by a person before it is used.
        a.r.code.localeCompare(b.r.code),
      )
      .slice(0, perItem);

    return {
      id: item.id,
      tokens,
      suggestions: scored.map(({ r, matchedWords }) => ({
        code: r.code,
        description: r.description ?? '',
        duty_rate: r.import_duty_rate != null ? Number(r.import_duty_rate) : null,
        vat_rate: r.vat_rate != null ? Number(r.vat_rate) : null,
        matched: matchedWords.length,
        matchedWords,
        totalWords: tokens.length,
      })),
    };
  });
}
