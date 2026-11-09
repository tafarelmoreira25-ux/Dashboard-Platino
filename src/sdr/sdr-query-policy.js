export const SDR_SEARCH_SCAN_LIMIT = 200;

// A page is returned only when its results are complete. This prevents a
// bounded scan from presenting an incomplete search as "no results".
export async function scanLeadPage({ fetchBatch, matches, pageSize, cursor = null, maxDocuments = SDR_SEARCH_SCAN_LIMIT, isCurrent = () => true }) {
  const found = [];
  let scanned = 0;
  let exhausted = false;
  let position = cursor;
  while (found.length <= pageSize && !exhausted && scanned < maxDocuments) {
    const batchSize = Math.min(51, pageSize + 1, maxDocuments - scanned);
    const docs = await fetchBatch(position, batchSize);
    if (!isCurrent()) return { cancelled: true, scanned };
    scanned += docs.length;
    for (const doc of docs) {
      if (matches(doc)) found.push(doc);
      if (found.length > pageSize) break;
    }
    position = docs.at(-1) || position;
    exhausted = docs.length < batchSize;
  }
  if (!isCurrent()) return { cancelled: true, scanned };
  const hasNext = found.length > pageSize;
  if (!hasNext && !exhausted) return { complete: false, scanned };
  const visible = found.slice(0, pageSize);
  return { complete: true, scanned, items: visible, hasNext, nextCursor: visible.at(-1) || position };
}
