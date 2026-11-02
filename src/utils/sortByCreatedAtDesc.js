// Newest first. A pending serverTimestamp() (createdAt is still null) counts as newest.
export function sortByCreatedAtDesc(list) {
  const time = (item) => item.createdAt?.toMillis?.() ?? Infinity
  return [...list].sort((a, b) => time(b) - time(a))
}
