"use client";

import { deploy } from "./zkcloudworker";
import type { PrivateKey, PublicKey } from "o1js";

export async function deployToken(params: {
  symbol: string;
  uri: string;
}): Promise<{ token: string; adminContract: string; hash: string }> {
  const { symbol, uri } = params;
  console.log(`Deploying contract...`);
  console.time("loaded o1js");
  const { PrivateKey } = await import("o1js");
  console.timeEnd("loaded o1js");
  console.time(`Deployed contract`);
  const token: {
    privateKey: PrivateKey;
    publicKey: PublicKey;
  } = PrivateKey.randomKeypair();
  const adminContract: {
    privateKey: PrivateKey;
    publicKey: PublicKey;
  } = PrivateKey.randomKeypair();
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
