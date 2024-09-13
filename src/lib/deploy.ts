"use client";

import { PrivateKey } from "o1js";
import { deploy } from "./zkcloudworker";

export async function deployToken(params: {
  symbol: string;
  uri: string;
}): Promise<{ token: string; adminContract: string; hash: string }> {
  const { symbol, uri } = params;
  console.log(`Deploying contract...`);
  console.time(`Deployed contract`);
  const token = PrivateKey.randomKeypair();
  const adminContract = PrivateKey.randomKeypair();
  console.log("token:", token.publicKey.toBase58());
  console.log("adminContract:", adminContract.publicKey.toBase58());
  console.log("symbol:", symbol);
  console.log("uri:", uri);
  const hash = await deploy({
    contractPrivateKey: token.privateKey.toBase58(),
    adminContractPrivateKey: adminContract.privateKey.toBase58(),
    symbol,
    uri,
  });
  console.timeEnd(`Deployed contract`);
  return {
    token: token.publicKey.toBase58(),
    adminContract: adminContract.publicKey.toBase58(),
    hash,
  };
}
