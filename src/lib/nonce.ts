"use server";
import { getNonce, fetchMinaAccount, initBlockchain } from "zkcloudworker";
import { Mina, PublicKey } from "o1js";
const chain = process.env.NEXT_PUBLIC_CHAIN;
const BLOCKBERRY_API = process.env.BLOCKBERRY_API;

export async function getAccountNonce(account: string): Promise<number> {
  if (chain === undefined) throw new Error("NEXT_PUBLIC_CHAIN is undefined");
  if (chain !== "devnet" && chain !== "mainnet")
    throw new Error("NEXT_PUBLIC_CHAIN must be devnet or mainnet");
  if (BLOCKBERRY_API === undefined)
    throw new Error("BLOCKBERRY_API is undefined");
  const blockberryNoncePromise = getNonce({
    account,
    blockBerryApiKey: BLOCKBERRY_API,
    chain,
  });
  await initBlockchain(chain);
  const publicKey = PublicKey.fromBase58(account);
  await fetchMinaAccount({ publicKey });
  const senderNonce = Number(Mina.getAccount(publicKey).nonce.toBigint());
  const blockberryNonce = (await blockberryNoncePromise).nonce ?? -1;
  const nonce = Math.max(senderNonce, blockberryNonce + 1);
  if (nonce > senderNonce)
    console.log(`Nonce changed from ${senderNonce} to ${nonce} for ${account}`);
  return nonce;
}
