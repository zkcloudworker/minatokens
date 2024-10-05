"use client";

import { MetaMaskSDK } from "@metamask/sdk";
const testAccount = "0x171aF8eBc0dB6b3649E89a06e800A99f28466343";
const INFURA_API_KEY = process.env.NEXT_PUBLIC_INFURA_API_KEY;

export async function connectMetamask() {
  if (!INFURA_API_KEY) {
    return {
      success: false,
      error: "No Infura API key found",
    };
  }
  const sdk = new MetaMaskSDK({
    dappMetadata: {
      name: "Mobile FungibleToken test",
      url: window.location.href,
    },
    infuraAPIKey: INFURA_API_KEY,
  });

  // You can also access via window.ethereum.
  const connected = await sdk.connect();
  console.log("connected", connected);
  const ethereum = sdk.getProvider();
  console.log("ethereum", ethereum);
  if (!ethereum) {
    return {
      success: false,
      error: "Metamask not installed",
    };
  }
  const accounts = await ethereum.request({
    method: "eth_requestAccounts",
    params: [],
  });
  console.log("accounts", accounts);
  if (!accounts) {
    return {
      success: false,
      error: "Failed to get accounts",
    };
  }
  const account = (accounts as any)[0];
  console.log("account", account);
  return {
    success: true,
    account,
  };
}
