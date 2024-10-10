"use server";
import { fetchMinaAccount, initBlockchain, FungibleToken } from "zkcloudworker";
import { Mina, PublicKey, Bool } from "o1js";
import { TokenState, DeployedTokenInfo } from "./token";
import { algoliaGetToken, algoliaWriteToken } from "./algolia";
const chain = process.env.NEXT_PUBLIC_CHAIN;

export async function getTokenState(params: {
  tokenAddress: string;
  info?: DeployedTokenInfo;
}): Promise<
  | {
      success: true;
      tokenState: TokenState;
      isStateUpdated: boolean;
    }
  | {
      success: false;
      error: string;
    }
> {
  const { tokenAddress, info } = params;
  try {
    if (chain === undefined) throw new Error("NEXT_PUBLIC_CHAIN is undefined");
    if (chain !== "devnet" && chain !== "mainnet")
      throw new Error("NEXT_PUBLIC_CHAIN must be devnet or mainnet");
    await initBlockchain(chain);
    const tokenContractPublicKey = PublicKey.fromBase58(tokenAddress);
    const tokenContract = new FungibleToken(tokenContractPublicKey);

    await fetchMinaAccount({ publicKey: tokenContractPublicKey, force: false });
    if (!Mina.hasAccount(tokenContractPublicKey)) {
      console.error("getTokenState: Token contract account not found", {
        tokenAddress,
      });
      return { success: false, error: "Token contract account not found" };
    }
    const tokenId = tokenContract.deriveTokenId();
    await fetchMinaAccount({
      publicKey: tokenContractPublicKey,
      tokenId,
      force: false,
    });
    if (!Mina.hasAccount(tokenContractPublicKey, tokenId)) {
      console.error(
        "getTokenState: Token contract totalSupply account not found",
        {
          tokenAddress,
        }
      );
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
      console.error("getTokenState: Admin contract account not found", {
        tokenAddress,
      });
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
    const tokenState: TokenState = {
      tokenContractAddress: tokenContractPublicKey.toBase58(),
      adminContractAddress: adminContractPublicKey.toBase58(),
      adminAddress: adminAddress.toBase58(),
      totalSupply,
      isPaused,
      decimals,
    };
    let tokenInfo = info;
    let isStateUpdated = false;
    if (tokenInfo === undefined) {
      tokenInfo = await algoliaGetToken({
        tokenAddress: tokenContractPublicKey.toBase58(),
      });
    }
    if (tokenInfo === undefined) {
      console.error("getTokenState: Token info not found", {
        tokenAddress,
      });
    } else {
      if (
        tokenInfo.adminContractAddress !== tokenState.adminContractAddress ||
        tokenInfo.adminAddress !== tokenState.adminAddress ||
        tokenInfo.totalSupply !== tokenState.totalSupply ||
        tokenInfo.isPaused !== tokenState.isPaused ||
        tokenInfo.decimals !== tokenState.decimals
      ) {
        console.error("getTokenState: Token info mismatch, updating the info", {
          tokenAddress,
          tokenInfo,
          tokenState,
        });
        tokenInfo.adminContractAddress = tokenState.adminContractAddress;
        tokenInfo.adminAddress = tokenState.adminAddress;
        tokenInfo.totalSupply = tokenState.totalSupply;
        tokenInfo.isPaused = tokenState.isPaused;
        tokenInfo.decimals = tokenState.decimals;
        console.log("Updating token info", { tokenInfo });
        await algoliaWriteToken({
          tokenAddress: tokenContractPublicKey.toBase58(),
          info: tokenInfo,
        });
        isStateUpdated = true;
      }
    }
    return {
      success: true,
      tokenState,
      isStateUpdated,
    };
  } catch (error: any) {
    console.error("getTokenState catch", error);
    return {
      success: false,
      error: "getTokenState catch:" + (error?.message ?? String(error)),
    };
  }
}
