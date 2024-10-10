"use server";
import { searchClient } from "@algolia/client-search";
import { DeployedTokenInfo } from "./token";

const { ALGOLIA_KEY, ALGOLIA_PROJECT } = process.env;
const chain = process.env.NEXT_PUBLIC_CHAIN;
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";

export interface TokenList {
  hits: DeployedTokenInfo[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
  exhaustiveNbHits: boolean;
  exhaustiveTypo: boolean;
  exhaustive: { nbHits: boolean; typo: boolean };
  processingTimeMS: number;
}

export async function algoliaGetTokenList(params: {
  query: string;
  hitsPerPage: number;
  page: number;
}): Promise<TokenList | undefined> {
  if (chain === undefined) throw new Error("NEXT_PUBLIC_CHAIN is undefined");
  if (chain !== "devnet" && chain !== "mainnet")
    throw new Error("NEXT_PUBLIC_CHAIN must be devnet or mainnet");
  if (ALGOLIA_KEY === undefined) throw new Error("ALGOLIA_KEY is undefined");
  if (ALGOLIA_PROJECT === undefined)
    throw new Error("ALGOLIA_PROJECT is undefined");
  const { query, hitsPerPage, page } = params;
  if (DEBUG) console.log("algoliaGetTokenList", params);
  try {
    const client = searchClient(ALGOLIA_PROJECT, ALGOLIA_KEY);
    const indexName = `tokens-${chain}`;
    if (DEBUG) console.log("algoliaGetTokenList", params, indexName);
    const result = await client.searchSingleIndex({
      indexName,
      searchParams: {
        query,
        hitsPerPage,
        page,
      },
    });
    /*
{
    "hits": DeployedTokenInfo[],
    "nbHits": 2,
    "page": 0,
    "nbPages": 1,
    "hitsPerPage": 100,
    "exhaustiveNbHits": true,
    "exhaustiveTypo": true,
    "exhaustive": {
        "nbHits": true,
        "typo": true
    },
    "query": "",
    "params": "hitsPerPage=100&page=0",
    "renderingContent": {},
    "processingTimeMS": 1,
    "processingTimingsMS": {
        "_request": {
            "roundTrip": 80
        },
        "getIdx": {
            "load": {
                "total": 1
            },
            "total": 1
        },
        "total": 1
    },
    "serverTimeMS": 2
}
    */

    if (DEBUG) console.log("algoliaGetTokenList result:", result);
    if (result.hits === undefined) {
      console.error("algoliaGetTokenList search error", { params, result });
      return undefined;
    }
    return result as unknown as TokenList;
  } catch (error: any) {
    console.error("algoliaGetToken error:", {
      error: error?.message ?? String(error),
      params,
    });
    return undefined;
  }
}
