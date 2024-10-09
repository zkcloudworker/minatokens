"use server";
import { algoliasearch } from "algoliasearch";
const { ALGOLIA_KEY, ALGOLIA_PROJECT } = process.env;
import { DeployedTokenInfo } from "./token";

const chain = process.env.NEXT_PUBLIC_CHAIN;
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";

export async function algoliaWriteToken(
  params: DeployedTokenInfo
): Promise<boolean> {
  if (chain === undefined) throw new Error("NEXT_PUBLIC_CHAIN is undefined");
  if (chain !== "devnet" && chain !== "mainnet")
    throw new Error("NEXT_PUBLIC_CHAIN must be devnet or mainnet");
  if (ALGOLIA_KEY === undefined) throw new Error("ALGOLIA_KEY is undefined");
  if (ALGOLIA_PROJECT === undefined)
    throw new Error("ALGOLIA_PROJECT is undefined");
  try {
    const { symbol, tokenAddress } = params;
    const client = algoliasearch(ALGOLIA_PROJECT, ALGOLIA_KEY);
    const indexName = `tokens-${chain}`;
    if (DEBUG) console.log("algoliaWriteToken", params, indexName);

    const data = {
      objectID: tokenAddress,
      ...params,
    };

    const result = await client.saveObject({
      indexName,
      body: data,
    });
    if (result.taskID === undefined) {
      console.error("algoliaWriteToken: Algolia write result is", result);
      return false;
    }

    return true;
  } catch (error) {
    console.error("alWriteToken error:", { error, params });
    return false;
  }
}
