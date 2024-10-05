"use client";

import { MetaMaskSDK, SDKProvider } from "@metamask/sdk";
const testAccount = "0x171aF8eBc0dB6b3649E89a06e800A99f28466343";
const INFURA_API_KEY = process.env.NEXT_PUBLIC_INFURA_API_KEY;

export async function connectMetamask(): Promise<{
  success: boolean;
  error?: string;
  account?: string;
  ethereum?: SDKProvider;
}> {
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
    ethereum,
  };
}

export async function sendEthereumPayment(params: {
  address: string;
  ethereum: SDKProvider;
}) {
  const { address, ethereum } = params;
  try {
    if (!ethereum) {
      return {
        success: false,
        error: "Metamask not installed",
      };
    }
    const tx = await ethereum.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: address,
          to: testAccount,
          value: "0x38d7ea4c68000", // 0.0001 ETH in hexadecimal
        },
      ],
    });
    console.log("tx", tx);
    return { success: true, tx };
  } catch (error: any) {
    console.error("Error sending Ethereum payment", error);
    return { success: false, error: error?.message ?? "Error sending payment" };
  }
}
