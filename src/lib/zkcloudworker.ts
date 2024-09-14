"use server";

import { zkCloudWorkerClient } from "zkcloudworker";
const DEPLOYER = process.env.DEPLOYER;
const DEPLOYER_SK = process.env.DEPLOYER_SK;
const ZKCW_JWT = process.env.ZKCW_JWT;
const NEXT_PUBLIC_CHAIN = process.env.NEXT_PUBLIC_CHAIN;

function getAPI(): zkCloudWorkerClient {
  if (ZKCW_JWT === undefined) throw new Error("ZKCW_JWT is undefined");
  if (NEXT_PUBLIC_CHAIN === undefined)
    throw new Error("NEXT_PUBLIC_CHAIN is undefined");
  if (NEXT_PUBLIC_CHAIN !== "devnet" && NEXT_PUBLIC_CHAIN !== "mainnet")
    throw new Error("NEXT_PUBLIC_CHAIN must be devnet or mainnet");
  const api = new zkCloudWorkerClient({
    jwt: ZKCW_JWT,
    chain: NEXT_PUBLIC_CHAIN,
  });
  return api;
}

export async function deploy(params: {
  tokenPrivateKey: string;
  adminContractPrivateKey: string;
  symbol: string;
  uri: string;
}): Promise<string | undefined> {
  const { tokenPrivateKey, adminContractPrivateKey, symbol, uri } = params;
  console.log(`Deploying contract...`);
  console.time(`Deployed contract`);
  if (DEPLOYER_SK === undefined) throw new Error("DEPLOYER_SK is undefined");
  const adminPrivateString = DEPLOYER_SK;
  const api = getAPI();

  /*
          private async deployTx(args: {
              contractPrivateKey: string;
              adminPrivateString: string;
              adminContractPrivateKey: string;
              symbol: string;
              uri: string;
            }): Promise<string> {
      */
  const answer = await api.execute({
    developer: "DFST",
    repo: "token-launchpad",
    transactions: [],
    task: "deploy",
    args: JSON.stringify({
      contractPrivateKey: tokenPrivateKey,
      adminPrivateString,
      adminContractPrivateKey,
      symbol,
      uri,
    }),
    metadata: `deploy token`,
  });
  console.log("answer:", answer);
  const jobId = answer.jobId;
  if (jobId === undefined) console.error("Job ID is undefined");
  return jobId;
}

export async function waitForJobResult(
  jobId: string
): Promise<string | undefined> {
  const api = getAPI();
  const deployResult = await api.waitForJobResult({
    jobId,
    printLogs: true,
  });
  console.log("Token deployment result:", deployResult?.result?.result);
  console.timeEnd(`Deployed contract`);
  return deployResult?.result?.result ?? "error";
}
