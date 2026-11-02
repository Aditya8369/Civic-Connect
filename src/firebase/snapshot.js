// When offline with nothing cached, Firestore delivers an empty snapshot instead of
// calling the error handler, so an empty result only means "no data" once the server confirms it.
export function isUnconfirmedEmpty(snapshot) {
  return snapshot.empty && snapshot.metadata.fromCache
}
