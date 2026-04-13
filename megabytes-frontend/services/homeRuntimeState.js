let homeClutterClearedAt = 0;

export function markHomeClutterCleared() {
  homeClutterClearedAt = Date.now();
}

export function getHomeClutterClearedAt() {
  return homeClutterClearedAt;
}
