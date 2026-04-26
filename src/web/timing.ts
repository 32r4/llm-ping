type TimingLike = {
  ttfbMs?: number | null;
  totalMs?: number | null;
} | null;

type PayloadWithTiming = {
  ok?: boolean;
  timing?: TimingLike;
} | null;

export const getNowMs = (): number =>
  typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();

export const hasTimingValues = (timing: TimingLike): boolean => timing?.ttfbMs != null || timing?.totalMs != null;

export const formatDurationMs = (value: number | null | undefined): string =>
  value == null ? "--" : value.toFixed(2) + " ms";

export const ensureCompletedTiming = <T extends PayloadWithTiming>(
  payload: T,
  startedAt: number | null | undefined,
  getNowMsImpl: () => number = getNowMs
): T => {
  if (!payload || payload.ok || startedAt == null) {
    return payload;
  }

  if (hasTimingValues(payload.timing ?? null)) {
    return payload;
  }

  return {
    ...payload,
    timing: {
      ...(payload.timing ?? {}),
      ttfbMs: null,
      totalMs: getNowMsImpl() - startedAt
    }
  };
};
