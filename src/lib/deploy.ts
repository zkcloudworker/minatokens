"use client";

import type { PrivateKey, PublicKey } from "o1js";

export async function deployTokenParams(): Promise<{
  tokenPrivateKey: string;
  adminContractPrivateKey: string;
}> {
  console.time("loaded o1js");
  const { PrivateKey } = await import("o1js");
  console.timeEnd("loaded o1js");
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
  return {
    tokenPrivateKey: token.privateKey.toBase58(),
    adminContractPrivateKey: adminContract.privateKey.toBase58(),
  };
}
