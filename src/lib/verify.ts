"use server";
import { fetchMinaAccount, initBlockchain, FungibleToken } from "zkcloudworker";
import { Mina, PublicKey } from "o1js";
const chain = process.env.NEXT_PUBLIC_CHAIN;

export async function verifyFungibleTokenState(params: {
  tokenContractAddress: string;
  adminContractAddress: string;
  adminAddress: string;
}): Promise<boolean> {
  const { tokenContractAddress, adminContractAddress, adminAddress } = params;
  try {
    if (chain === undefined) throw new Error("NEXT_PUBLIC_CHAIN is undefined");
    if (chain !== "devnet" && chain !== "mainnet")
      throw new Error("NEXT_PUBLIC_CHAIN must be devnet or mainnet");
    await initBlockchain(chain);
    const tokenContractPublicKey = PublicKey.fromBase58(tokenContractAddress);
    const adminContractPublicKey = PublicKey.fromBase58(adminContractAddress);
    const adminPublicKey = PublicKey.fromBase58(adminAddress);
    const tokenContract = new FungibleToken(tokenContractPublicKey);
    await fetchMinaAccount({ publicKey: tokenContractPublicKey, force: false });
    await fetchMinaAccount({ publicKey: adminContractPublicKey, force: false });
    await fetchMinaAccount({ publicKey: adminPublicKey, force: false });
    if (!Mina.hasAccount(adminPublicKey)) {
      console.error("Admin account not found");
      return false;
    }
    if (!Mina.hasAccount(adminContractPublicKey)) {
      console.error("Admin contract account not found");
      return false;
    }
    if (!Mina.hasAccount(tokenContractPublicKey)) {
      console.error("Token contract account not found");
      return false;
    }
    const adminContractAccount = tokenContract.admin.get();
    if (adminContractAccount.toBase58() !== adminContractAddress) {
      console.error("Admin contract address does not match");
      return false;
    }
    const adminContract = Mina.getAccount(adminContractPublicKey);
    const adminAddressCheck0 = adminContract.zkapp?.appState[0];
    const adminAddressCheck1 = adminContract.zkapp?.appState[1];
    if (adminAddressCheck0 === undefined || adminAddressCheck1 === undefined) {
      console.error("Cannot fetch admin address from admin contract");
      return false;
    }
    const adminAddressCheck = PublicKey.fromFields([
      adminAddressCheck0,
      adminAddressCheck1,
    ]);
    if (adminAddressCheck.toBase58() !== adminAddress) {
      console.error("Admin address does not match", {
        adminAddressCheck: adminAddressCheck.toBase58(),
        adminAddress: adminAddress,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("verifyFungibleTokenState catch", error);
    return false;
  }
}
