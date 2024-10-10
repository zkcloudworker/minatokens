"use server";
import { fetchMinaAccount, initBlockchain, FungibleToken } from "zkcloudworker";
import { Mina, PublicKey } from "o1js";
import { TokenInfo, DeployedTokenInfo } from "./token";
import { getTokenState } from "./state";
import { algoliaWriteToken } from "./algolia";

const chain = process.env.NEXT_PUBLIC_CHAIN;
const chainId = process.env.NEXT_PUBLIC_CHAIN_ID;

export async function verifyFungibleTokenState(params: {
  tokenContractAddress: string;
  adminContractAddress: string;
  adminAddress: string;
  info: TokenInfo;
  created: number;
  updated: number;
}): Promise<boolean> {
  const {
    tokenContractAddress,
    adminContractAddress,
    adminAddress,
    info,
    created,
    updated,
  } = params;
  try {
    if (chain === undefined) throw new Error("NEXT_PUBLIC_CHAIN is undefined");
    if (chain !== "devnet" && chain !== "mainnet")
      throw new Error("NEXT_PUBLIC_CHAIN must be devnet or mainnet");
    if (chainId === undefined)
      throw new Error("NEXT_PUBLIC_CHAIN_ID is undefined");

    await initBlockchain(chain);
    const tokenContractPublicKey = PublicKey.fromBase58(tokenContractAddress);
    const adminContractPublicKey = PublicKey.fromBase58(adminContractAddress);
    const adminPublicKey = PublicKey.fromBase58(adminAddress);
    const tokenContract = new FungibleToken(tokenContractPublicKey);
    await fetchMinaAccount({ publicKey: tokenContractPublicKey, force: false });
    await fetchMinaAccount({ publicKey: adminContractPublicKey, force: false });
    await fetchMinaAccount({ publicKey: adminPublicKey, force: false });
    if (!Mina.hasAccount(adminPublicKey)) {
      console.error("verifyFungibleTokenState: Admin account not found");
      return false;
    }
    if (!Mina.hasAccount(adminContractPublicKey)) {
      console.error(
        "verifyFungibleTokenState: Admin contract account not found",
        {
          adminContractAddress,
        }
      );
      return false;
    }
    if (!Mina.hasAccount(tokenContractPublicKey)) {
      console.error(
        "verifyFungibleTokenState: Token contract account not found",
        {
          tokenContractAddress,
        }
      );
      return false;
    }
    const adminContractAccount = tokenContract.admin.get();
    if (adminContractAccount.toBase58() !== adminContractAddress) {
      console.error(
        "verifyFungibleTokenState: Admin contract address does not match",
        {
          adminContractAddress,
          adminContractAccount: adminContractAccount.toBase58(),
        }
      );
      return false;
    }
    const adminContract = Mina.getAccount(adminContractPublicKey);
    const adminAddressCheck0 = adminContract.zkapp?.appState[0];
    const adminAddressCheck1 = adminContract.zkapp?.appState[1];
    if (adminAddressCheck0 === undefined || adminAddressCheck1 === undefined) {
      console.error(
        "verifyFungibleTokenState: Cannot fetch admin address from admin contract",
        {
          adminContractAddress,
          adminContractPublicKey: adminContractPublicKey.toBase58(),
        }
      );
      return false;
    }
    const adminAddressCheck = PublicKey.fromFields([
      adminAddressCheck0,
      adminAddressCheck1,
    ]);
    if (adminAddressCheck.toBase58() !== adminAddress) {
      console.error("verifyFungibleTokenState: Admin address does not match", {
        adminAddressCheck: adminAddressCheck.toBase58(),
        adminAddress: adminAddress,
      });
      return false;
    }
    const tokenState = await getTokenState({
      tokenAddress: tokenContractPublicKey.toBase58(),
    });
    if (!tokenState.success) {
      console.error("verifyFungibleTokenState: getTokenState failed", {
        tokenState,
      });
      return false;
    }

    const deployedTokenInfo: DeployedTokenInfo = {
      ...info,
      ...tokenState.tokenState,
      created,
      updated,
      chain: chainId,
    };

    const writeResult = await algoliaWriteToken({
      tokenAddress: tokenContractPublicKey.toBase58(),
      info: deployedTokenInfo,
    });
    if (!writeResult) {
      console.error("verifyFungibleTokenState: algoliaWriteToken failed", {
        tokenAddress: tokenContractPublicKey.toBase58(),
        info,
      });
    }
    return true;
  } catch (error) {
    console.error("verifyFungibleTokenState: catch", error);
    return false;
  }
}
