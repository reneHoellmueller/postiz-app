// Heartbeats were a Temporal activity keepalive. The in-process publisher
// does not use Temporal, so these helpers are no-ops that keep existing
// provider call sites compiling without importing @temporalio.
export const setHeartbeatDetails = (_details: string) => {
  return;
};

export const withHeartbeat = async <T>(fn: () => Promise<T>): Promise<T> => {
  return fn();
};
