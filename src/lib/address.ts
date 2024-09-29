"use server";
import { PublicKey } from "o1js";

export interface Mint {
  amount: string;
  to: string;
}

export interface MintVerified {
  amount: number;
  to: string;
}

export async function checkMintData(
  params: Mint
): Promise<MintVerified | undefined> {
  const { to, amount } = params;
  if (
    !to ||
    !amount ||
    typeof to !== "string" ||
    typeof amount !== "string" ||
    to === "" ||
    amount === ""
  ) {
    console.error("checkMintData params are invalid:", params);
    return undefined;
  }
  try {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      console.error(
        "checkMintData parsed amount is invalid:",
        parsedAmount,
        params
      );
      return undefined;
    }
    const publicKey = PublicKey.fromBase58(to);
    if (to !== publicKey.toBase58()) {
      console.log(
        "checkAddress: address is not valid",
        to,
        publicKey.toBase58()
      );
      return undefined;
    }
    return { to, amount: parsedAmount };
  } catch (error) {
    console.error("checkMintData catch", error);
    return undefined;
  }
}
