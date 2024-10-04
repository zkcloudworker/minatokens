"use client";

export function shortenString(str: string): string {
  if (!str) return "";
  if (str.length < 10) {
    return str;
  }
  return `${str.slice(0, 4)}...${str.slice(-4)}`;
}
