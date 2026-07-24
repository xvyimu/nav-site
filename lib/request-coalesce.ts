/**
 * In-flight request coalescing (singleflight).
 *
 * Concurrent callers with the same key share one `factory()` invocation.
 * Completed results are **not** cached — only concurrent identical work merges.
 * Callers may pass an AbortSignal to abandon their wait without cancelling the
 * shared work (other waiters keep the in-flight promise).
 */

export type CoalesceFactory<T> = () => Promise<T>;

const inflight = new Map<string, Promise<unknown>>();

function abortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason;
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}

/**
 * Run `factory` once per key while a promise is in flight; join waiters share it.
 */
export function coalesceInFlight<T>(
  key: string,
  factory: CoalesceFactory<T>,
  signal?: AbortSignal
): Promise<T> {
  if (signal?.aborted) {
    return Promise.reject(abortError(signal));
  }

  let shared = inflight.get(key) as Promise<T> | undefined;
  if (!shared) {
    // Invoke factory immediately so concurrent joiners see the same entry
    // before the next microtask (standard singleflight).
    let created: Promise<T>;
    try {
      created = Promise.resolve(factory()).finally(() => {
        if (inflight.get(key) === created) {
          inflight.delete(key);
        }
      });
    } catch (error) {
      return Promise.reject(error);
    }
    inflight.set(key, created);
    shared = created;
  }

  if (!signal) return shared;

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError(signal));
    };
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
    shared!.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}

/** Test helper: number of keys currently in flight. */
export function __coalesceInFlightSizeForTests(): number {
  return inflight.size;
}

/** Test helper: drop all in-flight entries (does not cancel running factories). */
export function __clearCoalesceInFlightForTests(): void {
  inflight.clear();
}
