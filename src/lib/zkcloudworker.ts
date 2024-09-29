"use server";

import {
  zkCloudWorkerClient,
  FungibleTokenDeployParams,
  FungibleTokenMintParams,
  FungibleTokenJobResult,
} from "zkcloudworker";

const ZKCW_JWT = process.env.ZKCW_JWT;
const NEXT_PUBLIC_CHAIN = process.env.NEXT_PUBLIC_CHAIN;
const DEBUG = process.env.DEBUG === "true";

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

export async function sendDeployTransaction(
  params: FungibleTokenDeployParams
): Promise<string | undefined> {
  const { symbol } = params;
  console.log(`Deploying contract...`);
  const api = getAPI();

  const transaction = JSON.stringify(params, null, 2);

  const answer = await api.execute({
    developer: "DFST",
    repo: "token-launchpad",
    transactions: [transaction],
    task: "deploy",
    args: JSON.stringify({ sender: params.adminPublicKey }),
    metadata: `deploy token ${symbol}`,
  });
  console.log("answer:", answer);
  // TODO: handle errors and structure FungibleTokenJobResult
  const jobId = answer.jobId;
  if (jobId === undefined) console.error("Job ID is undefined");
  return jobId;
}

export async function sendMintTransaction(
  params: FungibleTokenMintParams
): Promise<string | undefined> {
  const { symbol } = params;
  console.log(`Minting tokens...`);
  const api = getAPI();

  const transaction = JSON.stringify(params, null, 2);

  const answer = await api.execute({
    developer: "DFST",
    repo: "token-launchpad",
    transactions: [transaction],
    task: "mint",
    args: JSON.stringify({ sender: params.adminPublicKey }),
    metadata: `mint token ${symbol}`,
  });
  console.log("answer:", answer);
  const jobId = answer.jobId;
  if (jobId === undefined) console.error("Job ID is undefined");
  return jobId;
}

// TODO add getResult function and use it with REACT setInterval()
export async function waitForJobResult(
  jobId: string
): Promise<string | undefined> {
  const api = getAPI();
  const deployResult = await api.waitForJobResult({
    jobId,
    printLogs: true,
  });
  console.log(
    "waitForJobResult result:",
    deployResult?.result?.result?.slice(0, 50)
  );
  console.timeEnd(`Deployed contract`);
  return deployResult?.result?.result ?? "error";
}

export async function getResult(jobId: string): Promise<string | undefined> {
  const api = getAPI();
  const result = await api.jobResult({ jobId });
  return result?.result?.result;
}
