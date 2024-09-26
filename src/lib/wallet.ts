const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";
const chain = process.env.NEXT_PUBLIC_CHAIN_ID;

export async function connectWallet(
  params: {
    openLink?: boolean;
  } = { openLink: true }
): Promise<{
  address: string | undefined;
  network: string | undefined;
  error: string | undefined;
  success: boolean;
}> {
  const { openLink } = params;
  if (!chain) {
    return {
      address: undefined,
      network: undefined,
      error: "Chain not set",
      success: false,
    };
  }
  let address = undefined;
  let network = undefined;
  const logOptions = {
    networkID: (window as any).mina?.chainInfo?.networkID,
    isAuro: (window as any).mina?.isAuro,
  };

  if (DEBUG)
    console.log("mina login start", { mina: (window as any).mina, logOptions });

  try {
    if (
      (window as any).mina !== undefined &&
      (window as any).mina?.requestNetwork !== undefined &&
      (window as any).mina?.requestAccounts !== undefined &&
      (window as any).mina?.switchChain !== undefined
    ) {
      let account;
      try {
        account = await (window as any).mina.requestAccounts();
      } catch (error: any) {
        console.error("mina login requestAccounts catch", error);
        return {
          address: undefined,
          network: undefined,
          error: `Auro Wallet error: ${
            error?.message ?? error ?? ""
          }, key: "requestAccounts"`,
          success: false,
        };
      }

      try {
        network = await (window as any).mina?.requestNetwork();
      } catch (error: any) {
        console.error("mina login requestNetwork catch", error);
        return {
          address: undefined,
          network: undefined,
          error: `Auro Wallet error: ${
            error?.message ?? error ?? ""
          }, key: "requestNetwork"`,
          success: false,
        };
      }
      if (DEBUG) console.log("mina login network", network);
      if (network?.networkID !== chain) {
        let switchNetwork;
        try {
          switchNetwork = await (window as any).mina.switchChain({
            networkID: process.env.REACT_APP_CHAIN_ID,
          });
        } catch (error: any) {
          console.error("mina login switchChain catch", error);
          return {
            address: undefined,
            network: undefined,
            error: `Auro Wallet error: ${
              error?.message ?? error ?? ""
            }, key: "switchChain"`,
            success: false,
          };
        }

        if (DEBUG) console.log("mina login switch network", switchNetwork);
        try {
          network = await (window as any).mina.requestNetwork();
        } catch (error: any) {
          console.error("mina login requestNetwork 2 catch", error);
          return {
            address: undefined,
            network: undefined,
            error: `Auro Wallet error: ${
              error?.message ?? error ?? ""
            }, key: "requestNetwork 2"`,
            success: false,
          };
        }
      }
      if (DEBUG) console.log("mina login network", network);

      if (account.length > 0 && network?.networkID === chain)
        address = account[0];
      else {
        console.error("mina login account error", { account, network });
        return {
          address: undefined,
          network: undefined,
          error: `Please use the last Auro Wallet version, connect your wallet and switch to the correct network, key: "minaLogin error"`,
          success: false,
        };
      }
    } else {
      if (openLink) {
        const linkURL =
          "https://chrome.google.com/webstore/detail/auro-wallet/cnmamaachppnkjgnildpdmkaakejnhae";
        window.open(linkURL);
      }
    }
  } catch (error: any) {
    console.error("mina login catch", error);
    return {
      address: undefined,
      network: undefined,
      error: `Auro Wallet error: ${
        error?.message ?? error ?? ""
      }, key: "minaLogin"`,
      success: false,
    };
  }
  if (DEBUG) console.log("mina login address", address);
  if (!address) {
    return {
      address: undefined,
      network: undefined,
      error: "No address found",
      success: false,
    };
  }
  return {
    address,
    network: network?.networkID,
    error: undefined,
    success: true,
  };
}
