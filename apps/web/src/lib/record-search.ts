export function matchesRecordSearch(record: object, query: string): boolean {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack = Object.values(record).filter(value => typeof value === 'string' || typeof value === 'number').join(' ').toLocaleLowerCase();
  return words.every(word => haystack.includes(word));
}
