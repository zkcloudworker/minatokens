"use server";
import { PublicKey } from "o1js";

export async function checkMintData(params: {
  to: string;
  amount: string;
}): Promise<boolean> {
  const { to, amount } = params;
  if (
    to === undefined ||
    amount === undefined ||
    to === "" ||
    amount === "" ||
    to === null ||
    amount === null
  ) {
    return false;
  }
  try {
    let parsedAmount = 0;
    try {
      parsedAmount = parseFloat(amount);
    } catch (e) {
      console.error("checkMintData parse amount catch", e);
      return false;
    }
    if (parsedAmount <= 0) {
      console.error("checkMintData parsed amount is less than 0", parsedAmount);
      return false;
    }
    const publicKey = PublicKey.fromBase58(to);
    if (to === publicKey.toBase58()) {
      return true;
    } else {
      console.log(
        "checkAddress:",
        "address is not valid",
        to,
        publicKey.toBase58()
      );
      return false;
    }
  } catch (error) {
    console.error("checkAddress catch", error);
    return false;
  }
}
