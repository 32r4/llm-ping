export const getNowMs = (): number =>
  typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();
