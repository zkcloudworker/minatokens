"use server";
import { fetchMinaAccount, initBlockchain, FungibleToken } from "zkcloudworker";
import { Mina, PublicKey, Bool } from "o1js";
const chain = process.env.NEXT_PUBLIC_CHAIN;

export async function getTokenState(tokenContractAddress: string): Promise<
  | {
      success: true;
      adminContractAddress: string;
      adminAddress: string;
      totalSupply: number;
      isPaused: boolean;
      decimals: number;
    }
  | {
      success: false;
      error: string;
    }
> {
  try {
    if (chain === undefined) throw new Error("NEXT_PUBLIC_CHAIN is undefined");
    if (chain !== "devnet" && chain !== "mainnet")
      throw new Error("NEXT_PUBLIC_CHAIN must be devnet or mainnet");
    await initBlockchain(chain);
    const tokenContractPublicKey = PublicKey.fromBase58(tokenContractAddress);
    const tokenContract = new FungibleToken(tokenContractPublicKey);
    await fetchMinaAccount({ publicKey: tokenContractPublicKey, force: false });
    if (!Mina.hasAccount(tokenContractPublicKey)) {
      console.error("Token contract account not found");
      return { success: false, error: "Token contract account not found" };
    }
    const tokenId = tokenContract.deriveTokenId();
    await fetchMinaAccount({
      publicKey: tokenContractPublicKey,
      tokenId,
      force: false,
    });
    if (!Mina.hasAccount(tokenContractPublicKey, tokenId)) {
      console.error("Token contract totalSupply account not found");
      return {
        success: false,
        error: "Token contract totalSupply account not found",
      };
    }

    const adminContractPublicKey = tokenContract.admin.get();
    const decimals = tokenContract.decimals.get().toNumber();
    const isPaused = (tokenContract.paused.get() as Bool).toBoolean();
    const totalSupply = Number(
      Mina.getBalance(tokenContractPublicKey, tokenId).toBigInt()
    );

    await fetchMinaAccount({ publicKey: adminContractPublicKey, force: false });
    if (!Mina.hasAccount(adminContractPublicKey)) {
      console.error("Admin contract account not found");
      return {
        success: false,
        error: "Admin contract account not found",
      };
    }

    await fetchMinaAccount({ publicKey: adminContractPublicKey, force: false });
    if (!Mina.hasAccount(adminContractPublicKey)) {
      console.error("Admin contract account not found");
      return {
        success: false,
        error: "Admin contract account not found",
      };
    }

    const adminContract = Mina.getAccount(adminContractPublicKey);
    const adminAddress0 = adminContract.zkapp?.appState[0];
    const adminAddress1 = adminContract.zkapp?.appState[1];
    if (adminAddress0 === undefined || adminAddress1 === undefined) {
      console.error("Cannot fetch admin address from admin contract");
      return {
        success: false,
        error: "Cannot fetch admin address from admin contract",
      };
    }
    const adminAddress = PublicKey.fromFields([adminAddress0, adminAddress1]);
    return {
      success: true,
      adminContractAddress: adminContractPublicKey.toBase58(),
      adminAddress: adminAddress.toBase58(),
      totalSupply,
      isPaused,
      decimals,
    };
  } catch (error: any) {
    console.error("getTokenState catch", error);
    return {
      success: false,
      error: "getTokenState catch:" + (error?.message ?? String(error)),
    };
  }
}
