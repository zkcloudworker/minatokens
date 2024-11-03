"use server";
import packageJson from "../../node_modules/o1js/package.json";
export async function o1jsInfo(): Promise<{
  version: string;
}> {
  const version = packageJson.version;

  console.log("o1js version", version);
  return { version };
}
