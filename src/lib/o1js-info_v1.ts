"use server";
import packageJson from "../../node_modules/o1js_v1/package.json";
export async function o1jsInfo_v1(): Promise<{
  version: string;
}> {
  const version = packageJson.version;

  console.log("o1js_v1 version", version);
  return { version };
}
