"use client";

export async function getSystemInfo(): Promise<{
  memoryAvailable: number;
  cpuType: string;
  numberOfCores: number;
  browser: string;
  sharedArrayBufferAvailable: boolean;
  corsStatus: string;
}> {
  const memoryAvailable = (navigator as any).deviceMemory || 0;
  const cpuType = (navigator as any).hardwareConcurrency
    ? "Multi-core"
    : "Single-core";
  const numberOfCores = navigator.hardwareConcurrency || 1;
  const browser = navigator.userAgent;
  const sharedArrayBufferAvailable = typeof SharedArrayBuffer !== "undefined";

  let corsStatus = "unknown";
  try {
    const response = await fetch(window.location.origin, { method: "HEAD" });
    corsStatus = response.ok ? "enabled" : "disabled";
  } catch (error) {
    corsStatus = "disabled";
  }

  return {
    memoryAvailable,
    cpuType,
    numberOfCores,
    browser,
    sharedArrayBufferAvailable,
    corsStatus,
  };
}
