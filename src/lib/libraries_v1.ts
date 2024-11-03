"use client";

export async function loadLibraries_v1(): Promise<{
  o1js_v1: typeof import("o1js_v1");
}> {
  const o1js_v1 = await import("o1js_v1");
  return { o1js_v1 };
}
