"use server";
import { initBlockchain } from "zkcloudworker";
import { Mina } from "o1js";
const chain = process.env.NEXT_PUBLIC_CHAIN;

export async function sendTransaction(transaction: string): Promise<{
  hash?: string;
  status: string;
  success: boolean;
  error?: any;
}> {
  try {
    if (chain === undefined) throw new Error("NEXT_PUBLIC_CHAIN is undefined");
    if (chain !== "devnet" && chain !== "mainnet")
      throw new Error("NEXT_PUBLIC_CHAIN must be devnet or mainnet");
    await initBlockchain(chain);
    const tx = Mina.Transaction.fromJSON(JSON.parse(transaction));
    const txSent = await tx.safeSend();
    if (txSent.status == "pending") {
      console.log(`tx sent: hash: ${txSent.hash} status: ${txSent.status}`);
      return { hash: txSent.hash, status: txSent.status, success: true };
    } else {
      console.log(
        `tx NOT sent: hash: ${txSent?.hash} status: ${txSent?.status}`,
        txSent.errors
      );
      return { success: false, status: txSent.status, error: txSent.errors };
    }
  } catch (error) {
    console.error("sendTransaction catch", error);
    return { success: false, status: "error", error: error };
  }
}
