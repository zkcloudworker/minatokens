"use client";

import {
  useState,
  useRef,
  Dispatch,
  SetStateAction,
  createElement,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Code, Zap, DollarSign } from "lucide-react";
import { deployTokenParams } from "@/lib/keys";
import { deployToken } from "@/lib/deploy";
import { mintToken } from "@/lib/mint";
import {
  Timeline,
  TimelineItem,
  updateTimelineItem,
} from "@/components/ui/timeline";
import { getTxStatusFast } from "@/lib/txstatus-fast";
import { connectWallet, getWalletInfo } from "@/lib/wallet";
import { getSystemInfo } from "@/lib/system-info";
import { loadLibraries } from "@/lib/libraries";
import { verifyFungibleTokenState } from "@/lib/verify";
import { sendTransaction } from "@/lib/send";
import { getAccountNonce } from "@/lib/nonce";
import { checkMintData, Mint, MintVerified } from "@/lib/address";
import { shortenString } from "@/lib/short";
import { connectMetamask, sendEthereumPayment } from "@/lib/metamask";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";
const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_PK;
let minted = 0;

export default function LaunchToken() {
  const [tokenSymbol, setTokenSymbol] = useState<string>("TEST");
  const [useHardcodedWallet, setUseHardcodedWallet] = useState<boolean>(false);
  const [useTinyContract, setUseTinyContract] = useState<boolean>(false);
  const [useCloudProving, setUseCloudProving] = useState<boolean>(false);
  const [calculateRoot, setCalculateRoot] = useState<boolean>(false);
  const [metamask, setMetamask] = useState<boolean>(false);
  const [mint, setMint] = useState<Mint[]>([
    {
      amount: "1000",
      to: "B62qobAYQBkpC8wVnRzydrtCgWdkYTqsfXTcaLdGq1imtqtKgAHN29K",
    },
    {
      amount: "2000",
      to: "B62qiq7iTTP7Z2KEpQ9eF9UVGLiEKAjBpz1yxyd2MwMrxVwpAMLta2h",
    },
  ]);
  const [issuing, setIssuing] = useState<boolean>(false);
  const [issued, setIssued] = useState<boolean>(false);
  const [timelineItems, setTimeLineItems] = useState<TimelineItem[]>([]);
  const [waitingItem, setWaitingItem] = useState<TimelineItem | undefined>(
    undefined
  );
  const [isError, setIsError] = useState<boolean>(false);
  const [libraries, setLibraries] = useState<
    | Promise<{
        o1js: typeof import("o1js");
        zkcloudworker: typeof import("zkcloudworker");
      }>
    | undefined
  >(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  function logItem(item: TimelineItem) {
    setTimeLineItems((items) => [...items, item]);
  }

  function updateLogItem(id: string, update: Partial<TimelineItem>) {
    setTimeLineItems((items) => updateTimelineItem({ items, id, update }));
  }

  async function waitForMinaTx(params: {
    hash: string;
    id: string;
    waitingTitle?: string;
    successTitle?: string;
    failedTitle?: string;
    type: "deploy" | "mint";
  }): Promise<void> {
    const { hash, id, waitingTitle, successTitle, failedTitle, type } = params;
    if (
      type === "deploy" &&
      (waitingTitle === undefined ||
        successTitle === undefined ||
        failedTitle === undefined)
    ) {
      throw new Error(
        "waitingTitle, successTitle and failedTitle must be provided for deploy type"
      );
    }
    if (type === "deploy" && waitingTitle !== undefined) {
      logItem({
        id,
        title: waitingTitle,
        description: (
          <>
            It can take a few minutes for the transaction with hash{" "}
            <a
              href={`https://minascan.io/devnet/tx/${hash}?type=zk-tx`}
              className="text-blue-500 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {shortenString(hash)}
            </a>
            <br />
            to be included into the block.
          </>
        ),
        date: new Date(),
        status: "waiting",
      });
    } else {
      updateLogItem(id, {
        status: "waiting",
        description: (
          <>
            It can take a few minutes for the transaction with hash{" "}
            <a
              href={`https://minascan.io/devnet/tx/${hash}?type=zk-tx`}
              className="text-blue-500 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {shortenString(hash)}
            </a>
            <br />
            to be included into the block.
          </>
        ),
        date: new Date(),
      });
    }

    let ok = await getTxStatusFast({ hash });
    let count = 0;
    if (DEBUG)
      console.log("Waiting for Mina transaction to be mined...", status, ok);
    while (!ok && !isError && count < 100) {
      if (DEBUG)
        console.log("Waiting for Mina transaction to be mined...", ok, hash);
      await sleep(20000);
      ok = await getTxStatusFast({ hash });
      count++;
    }
    if (DEBUG) console.log("Final tx status", { ok, count });
    if (!ok || isError) {
      updateLogItem(id, {
        status: "error",
        title: type === "deploy" ? failedTitle : undefined,
        description: isError ? "Cancelled" : "Failed to deploy token contract",
        date: new Date(),
      });
      setWaitingItem(undefined);
      setIsError(true);
      return;
    }
    if (type === "deploy") {
      updateLogItem(id, {
        status: "success",
        title: successTitle,
        description: (
          <>
            Successfully deployed the token contract with transaction hash{" "}
            <a
              href={`https://minascan.io/devnet/tx/${hash}?type=zk-tx`}
              className="text-blue-500 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {shortenString(hash)}
            </a>
            .
          </>
        ),
        date: new Date(),
      });
    } else {
      updateLogItem(id, {
        status: "success",
        description: (
          <>
            Successfully minted the token with transaction hash{" "}
            <a
              href={`https://minascan.io/devnet/tx/${hash}?type=zk-tx`}
              className="text-blue-500 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {shortenString(hash)}
            </a>
            .
          </>
        ),
        date: new Date(),
      });
    }
  }

  async function waitForContractVerification(params: {
    tokenContractAddress: string;
    adminContractAddress: string;
    adminAddress: string;
    id: string;
    waitingTitle: string;
    successTitle: string;
    failedTitle: string;
  }): Promise<void> {
    const {
      id,
      waitingTitle,
      successTitle,
      failedTitle,
      tokenContractAddress,
      adminContractAddress,
      adminAddress,
    } = params;
    logItem({
      id,
      title: waitingTitle,
      description: "Verifying the token contract state...",
      date: new Date(),
      status: "waiting",
    });
    let count = 0;
    let verified = await verifyFungibleTokenState({
      tokenContractAddress,
      adminContractAddress,
      adminAddress,
    });
    if (DEBUG)
      console.log("Waiting for contract state to be verified...", verified);
    while (!verified && !isError && count++ < 100) {
      if (DEBUG)
        console.log("Waiting for contract state to be verified...", verified);
      await sleep(10000);
      verified = await verifyFungibleTokenState({
        tokenContractAddress,
        adminContractAddress,
        adminAddress,
      });
    }
    if (DEBUG) console.log("Final status", { verified, count });
    if (!verified || isError) {
      updateLogItem(id, {
        status: "error",
        title: failedTitle,
        description: "Failed to verify token contract state",
        date: new Date(),
      });
      setWaitingItem(undefined);
      setIsError(true);
      return;
    }
    updateLogItem(id, {
      status: "success",
      title: successTitle,
      description: (
        <>
          Contract state is verified for the token {tokenSymbol} with address{" "}
          <a
            href={`https://minascan.io/devnet/account/${tokenContractAddress}/txs?type=zk-acc`}
            className="text-blue-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {shortenString(tokenContractAddress)}
          </a>
          .
        </>
      ),
      date: new Date(),
    });
  }

  function logWaitingItem(params: {
    title: string;
    description: React.ReactNode;
  }) {
    setWaitingItem({
      id: "waiting",
      status: "waiting",
      title: params.title,
      description: params.description,
      date: new Date(),
    });
  }

  async function handleIssueToken() {
    const systemInfo = await getSystemInfo();
    if (DEBUG) console.log("System Info:", systemInfo);
    if (DEBUG) console.log("Navigator:", navigator);
    if (useHardcodedWallet) {
      if (ADMIN_ADDRESS === undefined) {
        console.error("ADMIN_ADDRESS is not set");
        return;
      }
    }

    setIssuing(true);
    setTimeLineItems([]);
    if (!metamask)
      logWaitingItem({
        title: "Issuing token",
        description: "Checking data...",
      });

    logItem({
      id: "system-info",
      status: "success",
      title: "System info",
      description: `System info: ${JSON.stringify(systemInfo, null, 2)}`,
      date: new Date(),
    });
    const walletInfo = await getWalletInfo();
    if (DEBUG) console.log("Wallet Info:", walletInfo);
    logItem({
      id: "wallet-info",
      status: "success",
      title: "Wallet info",
      description: `Wallet info: ${JSON.stringify(walletInfo, null, 2)}`,
      date: new Date(),
    });
    const mintItems: MintVerified[] = [];
    if (DEBUG) console.log("Mint items:", mint);
    for (const item of mint) {
      if (
        item.amount !== "" &&
        item.to !== "" &&
        item.amount !== undefined &&
        item.to !== undefined
      ) {
        const verified = await checkMintData(item);
        if (verified !== undefined) {
          if (DEBUG) console.log("Mint item verified:", verified, item);
          mintItems.push(verified);
        } else {
          if (DEBUG) console.log("Mint item skipped:", item);
          setIsError(true);
          logItem({
            id: "mint",
            status: "error",
            title: "Wrong mint data",
            description: `Cannot mint ${item.amount} ${tokenSymbol} tokens to ${item.to} because of wrong amount or address`,
            date: new Date(),
          });
          setWaitingItem(undefined);
          return;
        }
      }
    }
    if (DEBUG) console.log("Mint items filtered:", mintItems);

    setIssued(false);
    setIsError(false);

    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    console.log("Token Symbol:", tokenSymbol);
    if (metamask) {
      logItem({
        id: "metamask",
        status: "waiting",
        title: "Connecting to MetaMask",
        description: "Connecting to MetaMask...",
        date: new Date(),
      });
      const { success, error, account, ethereum } = await connectMetamask();
      console.log("Connected to MetaMask", {
        success,
        error,
        account,
        ethereum,
      });
      if (!success || !account || !ethereum) {
        updateLogItem("metamask", {
          status: "error",
          title: "Failed to connect to Metamask wallet",
          description: error ?? "Install the wallet to continue",
          date: new Date(),
        });
        setWaitingItem(undefined);
        return;
      }
      if (account) {
        updateLogItem("metamask", {
          status: "success",
          title: "Connected to Metamask wallet",
          description: `Account: ${account}`,
          date: new Date(),
        });
        await sleep(1000);
        logItem({
          id: "metamask-payment",
          status: "waiting",
          title: "Sending Ethereum payment",
          description: "Sending payment to Ethereum network...",
          date: new Date(),
        });

        const payment = await sendEthereumPayment({
          address: account,
          ethereum,
        });
        console.log("Ethereum payment", payment);
        if (!payment.success) {
          updateLogItem("metamask-payment", {
            status: "error",
            title: "Failed to send Ethereum payment",
            description: payment.error,
            date: new Date(),
          });
          setWaitingItem(undefined);
          return;
        }
        updateLogItem("metamask-payment", {
          status: "success",
          title: "Ethereum payment sent",
          description: `Payment sent to Ethereum network`,
          date: new Date(),
        });
        setWaitingItem(undefined);
        return;
      }
      setWaitingItem(undefined);
      return;
    }

    if (!libraries) setLibraries(loadLibraries());
    let adminPublicKey = ADMIN_ADDRESS;

    if (!useHardcodedWallet) {
      const { address, network, error, success } = await connectWallet({});
      console.log("Connected wallet", { address, network, error, success });
      if (!success || !address) {
        logItem({
          id: "metadata",
          status: "error",
          title: "Failed to connect to wallet",
          description: "Connect to wallet to continue",
          date: new Date(),
        });
        setWaitingItem(undefined);
        return;
      }
      adminPublicKey = address;
    }

    if (!adminPublicKey) {
      console.error("adminPublicKey is not set");
      return;
    }

    setWaitingItem(undefined);
    const deployParamsPromise = deployTokenParams();

    if (isError) {
      return;
    }
    const {
      tokenPrivateKey,
      adminContractPrivateKey,
      tokenPublicKey,
      adminContractPublicKey,
    } = await deployParamsPromise;
    if (DEBUG) console.log("Deploy Params received");
    const lib = await (libraries ?? loadLibraries());
    const deployResult = await deployToken({
      tokenPrivateKey,
      adminContractPrivateKey,
      adminPublicKey,
      symbol: tokenSymbol,
      lib,
      logItem,
      updateLogItem,
      useHardcodedWallet,
      useTinyContract,
      useCloudProving,
      calculateRoot,
    });
    if (DEBUG) console.log("Deploy result:", deployResult);
    if (useTinyContract) return;
    if (
      deployResult.success === false ||
      deployResult.hash === undefined ||
      isError
    ) {
      updateLogItem("cloud-proving-job", {
        status: "error",
        title: "Deploying token contract failed",
        description: "Failed to deploy token contract",
        date: new Date(),
      });
      setWaitingItem(undefined);
      return;
    }

    const waitForMinaTxPromise = waitForMinaTx({
      hash: deployResult.hash,
      id: "deploySend",
      waitingTitle: "Waiting for token contract to be deployed",
      successTitle: "Token contract is deployed",
      failedTitle: "Failed to deploy token contract",
      type: "deploy",
    });

    await waitForMinaTxPromise;

    if (isError) {
      return;
    }

    await waitForContractVerification({
      tokenContractAddress: tokenPublicKey,
      adminContractAddress: adminContractPublicKey,
      adminAddress: adminPublicKey,
      id: "contractVerification",
      waitingTitle: "Verifying token contract state",
      successTitle: "Token contract state is verified",
      failedTitle: "Failed to verify token contract state",
    });
    if (isError) {
      return;
    }

    if (DEBUG) {
      console.log("Minting tokens", mintItems);
    }

    minted = 0;
    if (mintItems.length > 0) {
      logWaitingItem({
        title: "Minting tokens",
        description: createElement(
          "span",
          null,
          "Loading ",
          createElement(
            "a",
            {
              href: "https://docs.minaprotocol.com/zkapps/o1js",
              target: "_blank",
              rel: "noopener noreferrer",
            },
            "o1js"
          ),
          " library..."
        ),
      });

      logWaitingItem({
        title: "Minting tokens",
        description: `Preparing data to mint ${tokenSymbol} tokens to ${mintItems.length} addresses`,
      });
      let nonce = await getAccountNonce(adminPublicKey);
      let mintPromises: Promise<any>[] = [];
      for (let i = 0; i < mintItems.length; i++) {
        const item = mintItems[i];
        const id = `mint-${i}`;
        logItem({
          id,
          status: "waiting",
          title: `Minting ${item.amount} ${tokenSymbol} to ${shortenString(
            item.to
          )}`,
          description: `Building transaction...`,
          date: new Date(),
        });
        if (i === mintItems.length - 1)
          logWaitingItem({
            title: "Minting tokens",
            description: `Waiting for mint transactions to be created and proved`,
          });
        else
          logWaitingItem({
            title: "Minting tokens",
            description: `Preparing data to mint\n ${tokenSymbol} tokens to ${
              mintItems.length - (i + 1)
            } addresses`,
          });
        const mintResult = await mintToken({
          tokenPublicKey,
          adminContractPublicKey,
          adminPublicKey,
          to: item.to,
          amount: item.amount,
          nonce: nonce++,
          id,
          updateLogItem,
          symbol: tokenSymbol,
          lib,
          useHardcodedWallet,
          sequence: i,
        });
        if (
          mintResult.success === false ||
          mintResult.hash === undefined ||
          isError
        ) {
          logItem({
            id,
            status: "error",
            title: "Failed to mint tokens",
            description: mintResult.error ?? "Mint error",
            date: new Date(),
          });
          setWaitingItem(undefined);
          setIsError(true);
          return;
        }

        const waitForMintTxPromise = waitForMinaTx({
          hash: mintResult.hash,
          id,
          type: "mint",
        });
        mintPromises.push(waitForMintTxPromise);
        await sleep(1000);
      }
      if (isError) {
        logItem({
          id: "mint",
          status: "error",
          title: "Failed to mint tokens",
          description: "Failed to mint tokens",
          date: new Date(),
        });
        setWaitingItem(undefined);
        setIsError(true);
        return;
      }
      logWaitingItem({
        title: "Minting tokens",
        description: `Waiting for mint transactions to be included into a block`,
      });
      await Promise.all(mintPromises);
      if (isError) {
        logItem({
          id: "mint",
          status: "error",
          title: "Failed to mint tokens",
          description: "Failed to mint tokens",
          date: new Date(),
        });
        setWaitingItem(undefined);
        setIsError(true);
        return;
      }
      logItem({
        id: "mint",
        status: "success",
        title: `Tokens are minted to ${mintItems.length} addresses`,
        description: `All mint transactions are included into a block`,
        date: new Date(),
      });
    }
    setWaitingItem(undefined);
    setIssuing(false);
    setIssued(true);
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <h1 className="text-xl font-bold text-center mb-8 bg-gradient-to-r from-[#F15B22] to-[#F9ECDE] text-transparent bg-clip-text">
        Mobile FungibleToken Test
      </h1>

      <div className="flex justify-center items-start">
        <div className="flex flex-col space-y-4">
          {!issuing && !issued && (
            <div className="space-y-6">
              {!useTinyContract && (
                <div>
                  <Label htmlFor="token-symbol">
                    Token Symbol (max 6 characters)
                  </Label>
                  <Input
                    id="token-symbol"
                    placeholder="Enter token symbol"
                    className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
                    defaultValue={tokenSymbol}
                    onChange={(e) => {
                      setTokenSymbol(e.target.value);
                    }}
                  />
                </div>
              )}
              <div className="flex items-center">
                <input
                  id="use-hardcoded-wallet"
                  type="checkbox"
                  className="mr-2"
                  checked={useHardcodedWallet}
                  onChange={(e) => setUseHardcodedWallet(e.target.checked)}
                />
                <Label htmlFor="use-hardcoded-wallet">
                  Use hardcoded wallet instead of Auro Wallet
                </Label>
              </div>
              <div className="flex items-center">
                <input
                  id="use-tiny-contract"
                  type="checkbox"
                  className="mr-2"
                  checked={useTinyContract}
                  onChange={(e) => setUseTinyContract(e.target.checked)}
                />
                <Label htmlFor="use-tiny-contract">
                  Use TinyContract to send zkApp tx
                </Label>
              </div>
              {useTinyContract && (
                <div className="flex items-center">
                  <input
                    id="use-cloud-proving"
                    type="checkbox"
                    className="mr-2"
                    checked={useCloudProving}
                    onChange={(e) => setUseCloudProving(e.target.checked)}
                  />
                  <Label htmlFor="use-cloud-proving">
                    Use Cloud Proving to send TinyContract zkApp tx
                  </Label>
                </div>
              )}
              <div className="flex items-center">
                <input
                  id="calculate-root"
                  type="checkbox"
                  className="mr-2"
                  checked={calculateRoot}
                  onChange={(e) => setCalculateRoot(e.target.checked)}
                />
                <Label htmlFor="use-cloud-proving">
                  Calculate Merkle Tree root
                </Label>
              </div>
              <div className="flex items-center">
                <input
                  id="metamask"
                  type="checkbox"
                  className="mr-2"
                  checked={metamask}
                  onChange={(e) => setMetamask(e.target.checked)}
                />
                <Label htmlFor="use-cloud-proving">
                  Sent Sepolia tx with MetaMask
                </Label>
              </div>

              {!useTinyContract && (
                <div>
                  <div className="flex items-center">
                    <Label htmlFor="initial-mint">Mint Addresses</Label>
                    <button
                      className="bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg text-sm px-2 py-1 flex items-center ml-3"
                      onClick={() =>
                        setMint((prev) => {
                          return [...prev, { amount: "", to: "" }];
                        })
                      }
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                    </button>
                  </div>

                  {mint.map((key, index) => (
                    <div
                      key={`Mint-${index}`}
                      className="relative flex space-x-4"
                    >
                      <div className="w-1/3">
                        {index === 0 && (
                          <label
                            htmlFor={`amount-${index}`}
                            className="block text-sm font-medium"
                          >
                            Amount
                          </label>
                        )}
                        <Input
                          id={`amount-${index}`}
                          type="text"
                          placeholder="Amount"
                          className="pr-16 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
                          defaultValue={mint[index].amount}
                          onChange={(e) =>
                            setMint((prev) => {
                              const newKeys = [...prev];
                              newKeys[index].amount = e.target.value;
                              return newKeys;
                            })
                          }
                        />
                      </div>
                      <div className="w-2/3">
                        {index === 0 && (
                          <label
                            htmlFor={`address-${index}`}
                            className="block text-sm font-medium"
                          >
                            Address (B62...)
                          </label>
                        )}
                        <Input
                          id={`address-${index}`}
                          type="text"
                          placeholder="Address"
                          className="bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
                          defaultValue={mint[index].to}
                          onChange={(e) =>
                            setMint((prev) => {
                              const newKeys = [...prev];
                              newKeys[index].to = e.target.value;
                              return newKeys;
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button
                className="w-full bg-[#F15B22] hover:bg-[#d14d1d] text-white"
                onClick={handleIssueToken}
                disabled={issuing}
              >
                {metamask
                  ? "Send Sepolia tx with MetaMask"
                  : useTinyContract
                  ? "Send tiny zkApp tx"
                  : "Issue Token"}
              </Button>
            </div>
          )}
          <div ref={bottomRef}>
            {(timelineItems.length > 0 || waitingItem) && (
              <Timeline
                title="Token Issue Progress"
                items={timelineItems}
                lastItem={waitingItem}
              ></Timeline>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CameraIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function CloudLightningIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973" />
      <path d="m13 12-3 5h4l-3 5" />
    </svg>
  );
}

function PlusIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
