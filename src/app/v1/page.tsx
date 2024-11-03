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
import { deployTokenParams } from "@/lib/keys_v1";
import { deployToken_v1 } from "@/lib/deploy_v1";
import { mintToken } from "@/lib/mint";
import {
  Timeline,
  TimelineItem,
  updateTimelineItem,
} from "@/components/ui/timeline";
import { getTxStatusFast } from "@/lib/txstatus-fast";
import { connectWallet, getWalletInfo } from "@/lib/wallet";
import { getSystemInfo } from "@/lib/system-info";
import { o1jsInfo_v1 } from "@/lib/o1js-info_v1";
// import { loadLibraries_v1 } from "@/lib/libraries_v1";
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
  const [useHardcodedWallet, setUseHardcodedWallet] = useState<boolean>(true);
  const [useTinyContract, setUseTinyContract] = useState<boolean>(true);
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
  // const [libraries, setLibraries] = useState<
  //   | Promise<{
  //       o1js_v1: typeof import("o1js_v1");
  //     }>
  //   | undefined
  // >(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  function logItem(item: TimelineItem) {
    setTimeLineItems((items) => [...items, item]);
  }

  function updateLogItem(id: string, update: Partial<TimelineItem>) {
    setTimeLineItems((items) => updateTimelineItem({ items, id, update }));
  }

  async function use_o1js_v1() {
    console.log("Using o1js v1.9.1");
    const iframe = document.createElement("iframe");
    iframe.src = "http://localhost:3000/";
    iframe.style.width = "100%";
    iframe.style.height = "600px";
    iframe.style.border = "none";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");

    const container = document.createElement("div");
    container.style.marginTop = "20px";
    container.appendChild(iframe);

    document.body.appendChild(container);
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
    const o1jsVersion = await o1jsInfo_v1();
    if (DEBUG) console.log("System Info:", systemInfo);
    if (DEBUG) console.log("Navigator:", navigator);
    if (DEBUG) console.log("o1js Info:", o1jsVersion);
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
    logItem({
      id: "o1js-info",
      status: "success",
      title: "o1js info",
      description: `o1js info: ${JSON.stringify(o1jsVersion, null, 2)}`,
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
        if (!payment.success || !payment.tx) {
          updateLogItem("metamask-payment", {
            status: "error",
            title: "Failed to send Ethereum payment",
            description: payment.error,
            date: new Date(),
          });
          setWaitingItem(undefined);
          return;
        }
        // https://sepolia.etherscan.io/tx/0x18de184a0ec4bd4c6a640cc89f581ab0f3f531573e9d2b318720a79c580c98a5
        updateLogItem("metamask-payment", {
          status: "success",
          title: "Ethereum payment sent",
          description: (
            <>
              Payment sent to Ethereum network with hash:{" "}
              <a
                href={`https://sepolia.etherscan.io/tx/${payment.tx}`}
                className="text-blue-500 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortenString(payment.tx)}
              </a>
            </>
          ),
          date: new Date(),
        });
        setWaitingItem(undefined);
        return;
      }
      setWaitingItem(undefined);
      return;
    }

    // if (!libraries) setLibraries(loadLibraries_v1());

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
    // const lib = await (libraries ?? loadLibraries_v1());
    const deployResult = await deployToken_v1({
      tokenPrivateKey,
      adminContractPrivateKey,
      adminPublicKey,
      symbol: tokenSymbol,
      // lib,
      logItem,
      updateLogItem,
      useHardcodedWallet,
      useTinyContract,
      useCloudProving,
      calculateRoot,
    });
    if (DEBUG) console.log("Deploy result:", deployResult);
    if (useTinyContract) return;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <h1 className="text-xl font-bold text-center mb-8 bg-gradient-to-r from-[#F15B22] to-[#F9ECDE] text-transparent bg-clip-text">
        o1js 1.9.1 Test
      </h1>

      <div className="flex justify-center items-start">
        <div className="flex flex-col space-y-4">
          {!issuing && !issued && (
            <div className="space-y-6">
              <Button
                className="w-full bg-[#F15B22] hover:bg-[#d14d1d] text-white"
                onClick={handleIssueToken}
                disabled={issuing}
              >
                Prove with o1js 1.9.1
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

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
