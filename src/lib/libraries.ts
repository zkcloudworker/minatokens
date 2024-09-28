export async function loadLibraries(): Promise<{
  o1js: typeof import("o1js");
  zkcloudworker: typeof import("zkcloudworker");
}> {
  const o1js = await import("o1js");
  const zkcloudworker = await import("zkcloudworker");
  return { o1js, zkcloudworker };
}
