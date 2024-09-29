"use client";

import { useState, useRef, Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Code, Zap, DollarSign } from "lucide-react";
import {
  arweaveTxStatus,
  pinImageToArweave,
  pinStringToArweave,
  arweaveHashToUrl,
} from "@/lib/arweave";
import { deployTokenParams } from "@/lib/keys";
import { deployToken } from "@/lib/deploy";
import { mintToken } from "@/lib/mint";
import { waitForJobResult } from "@/lib/zkcloudworker";
import {
  Timeline,
  TimelineItem,
  updateTimelineItem,
} from "@/components/ui/timeline";
import { useDropzone } from "react-dropzone";
import { getTxStatus } from "@/lib/txstatus";
import { connectWallet, getWalletInfo } from "@/lib/wallet";
import { getSystemInfo } from "@/lib/system-info";
import { loadLibraries } from "@/lib/libraries";
import { verifyFungibleTokenState } from "@/lib/verify";
import { sendTransaction } from "@/lib/send";
import { getAccountNonce } from "@/lib/nonce";
import { checkMintData } from "@/lib/address";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";
const AURO_TEST = process.env.NEXT_PUBLIC_AURO_TEST === "true";
const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_PK;

interface Mint {
  amount: string;
  to: string;
}

export default function LaunchToken() {
  const [image, setImage] = useState<File | undefined>(undefined);
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [tokenName, setTokenName] = useState<string>("");
  const [tokenSymbol, setTokenSymbol] = useState<string>("");
  const [tokenDescription, setTokenDescription] = useState<string>("");
  const [website, setWebsite] = useState<string>("");
  const [telegram, setTelegram] = useState<string>("");
  const [twitter, setTwitter] = useState<string>("");
  const [discord, setDiscord] = useState<string>("");
  const [mint, setMint] = useState<Mint[]>([{ amount: "", to: "" }]);
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
  const [minted, setMinted] = useState<number>(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const onDrop = (acceptedFiles: File[]) => {
    if (DEBUG) console.log("acceptedFiles", acceptedFiles);
    if (acceptedFiles.length > 0) {
      setImage(acceptedFiles[0]);
      setUrl(URL.createObjectURL(acceptedFiles[0]));
    }
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "image/*": [".svg", ".jpg", ".jpeg", ".png", ".gif", ".webp"] },
  });

  function logItem(item: TimelineItem) {
    setTimeLineItems((items) => [...items, item]);
  }

  function updateLogItem(id: string, update: Partial<TimelineItem>) {
    setTimeLineItems((items) => updateTimelineItem({ items, id, update }));
  }

  async function waitForArweaveTx(params: {
    hash: string;
    id: string;
    type: "image" | "metadata";
    waitingTitle: string;
    successTitle: string;
    failedTitle: string;
  }): Promise<string | undefined> {
    const { hash, id, waitingTitle, successTitle, failedTitle, type } = params;
    logItem({
      id,
      title: waitingTitle,
      description: (
        <>
          It can take a few minutes for the transaction with hash{" "}
          <a
            href={`https://arscan.io/tx/${hash}`}
            className="text-blue-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {hash}
          </a>{" "}
          to be mined.
        </>
      ),
      date: new Date(),
      status: "waiting",
    });
    let status = await arweaveTxStatus(hash);
    while (status.success && !status.data?.confirmed && !isError) {
      if (DEBUG)
        console.log(
          "Waiting for Arweave transaction to be mined...",
          status?.data?.confirmed,
          status
        );
      await sleep(5000);
      status = await arweaveTxStatus(hash);
    }
    if (DEBUG) console.log("Arweave transaction mined", status);
    if (
      !status.success ||
      !status.data?.confirmed ||
      !status.data?.confirmed?.number_of_confirmations ||
      Number(status.data?.confirmed?.number_of_confirmations) < 1 ||
      isError
    ) {
      updateLogItem(id, {
        status: "error",
        title: failedTitle,
        description: isError ? "Cancelled" : "Failed to pin data to Arweave",
        date: new Date(),
      });
      setWaitingItem(undefined);
      setIsError(true);
      setIssuing(false);
      return;
    }
    updateLogItem(id, {
      status: "success",
      title: successTitle,
      // TODO: continue to monitor the number of confirmations
      description: (
        <>
          Successfully mined the arweave transaction with{" "}
          {status.data?.confirmed?.number_of_confirmations} confirmations. View
          the permanently stored {type} at{" "}
          <a
            href={status.url}
            className="text-blue-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {status.url}
          </a>
          .
        </>
      ),
      date: new Date(),
    });
    if (DEBUG) console.log("Arweave URL for", type, status.url);
    return status.url;
  }

  async function waitForMinaTx(params: {
    hash: string;
    id: string;
    waitingTitle: string;
    successTitle: string;
    failedTitle: string;
    type: "deploy" | "mint";
  }): Promise<void> {
    const { hash, id, waitingTitle, successTitle, failedTitle, type } = params;
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
            {hash}
          </a>{" "}
          to be included into the block.
        </>
      ),
      date: new Date(),
      status: "waiting",
    });
    let status = "pending";
    let errorCount = 0;
    let tx = await getTxStatus({ hash });
    if (DEBUG)
      console.log("Waiting for Mina transaction to be mined...", status, tx);
    if (tx?.txStatus) status = tx.txStatus;
    else errorCount++;
    while (status === "pending" && !isError && errorCount < 100) {
      if (DEBUG)
        console.log("Waiting for Mina transaction to be mined...", status, tx);
      await sleep(10000);
      tx = await getTxStatus({ hash });
      if (tx?.txStatus) status = tx.txStatus;
      else errorCount++;
    }
    if (DEBUG) console.log("Final tx status", { status, errorCount, tx });
    if (status !== "applied" || isError) {
      updateLogItem(id, {
        status: "error",
        title: failedTitle,
        description: isError ? "Cancelled" : "Failed to deploy token contract",
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
          Successfully deployed the token contract with transaction hash{" "}
          <a
            href={`https://minascan.io/devnet/tx/${hash}?type=zk-tx`}
            className="text-blue-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {hash}
          </a>
          .
        </>
      ),
      date: new Date(),
    });
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
      await sleep(5000);
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
      description: "Token contract state is verified",
      date: new Date(),
    });
  }

  async function waitForProveJob(params: {
    jobId: string;
    id: string;
    waitingTitle: string;
    successTitle: string;
    failedTitle: string;
  }): Promise<string | undefined> {
    const { jobId, id, waitingTitle, successTitle, failedTitle } = params;
    updateLogItem(id, {
      status: "waiting",
      title: waitingTitle,
      description: (
        <>
          It can take about a minute to prove the transaction with jobId{" "}
          <a
            href={`https://zkcloudworker.com/job/${jobId}`}
            className="text-blue-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {jobId}
          </a>
          .
        </>
      ),
      date: new Date(),
    });
    let result = await waitForJobResult(jobId);

    if (!result || result.toLowerCase().startsWith("error")) {
      updateLogItem(id, {
        status: "error",
        title: failedTitle,
        description: isError
          ? "Cancelled"
          : "Failed to prove and send transaction",
        date: new Date(),
      });
      setWaitingItem(undefined);
      setIsError(true);
      return undefined;
    }
    let transaction: string | undefined = undefined;
    try {
      const { success, tx } = JSON.parse(result);
      transaction = success === true ? tx : undefined;
    } catch (error) {
      console.error("waitForProveJob catch while parsing result", error);
    }
    if (transaction === undefined) {
      updateLogItem(id, {
        status: "error",
        title: failedTitle,
        description: "Failed to prove and send transaction",
        date: new Date(),
      });
      setWaitingItem(undefined);
      setIsError(true);
      return undefined;
    }
    updateLogItem(id, {
      status: "success",
      title: successTitle,
      description: (
        <>
          Successfully proved the transaction with jobId{" "}
          <a
            href={`https://zkcloudworker.com/job/${jobId}`}
            className="text-blue-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {jobId}
          </a>
          .
        </>
      ),
      date: new Date(),
    });
    return transaction;
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
    const walletInfo = await getWalletInfo();
    if (DEBUG) console.log("Wallet Info:", walletInfo);
    const systemInfo = await getSystemInfo();
    if (DEBUG) console.log("System Info:", systemInfo);
    if (DEBUG) console.log("Navigator:", navigator);
    if (AURO_TEST) {
      if (ADMIN_ADDRESS === undefined) {
        console.error("ADMIN_ADDRESS is not set");
        return;
      }
    }

    setIssuing(true);
    setTimeLineItems([]);
    logWaitingItem({
      title: "Issuing token",
      description: "Checking data...",
    });
    const mintItems: Mint[] = [];
    for (const item of mint) {
      if (
        item.amount !== "" &&
        item.to !== "" &&
        item.amount !== undefined &&
        item.to !== undefined
      ) {
        if (await checkMintData({ to: item.to, amount: item.amount })) {
          mintItems.push(item);
        } else {
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

    setIssued(false);
    setIsError(false);

    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    console.log("Token Name:", tokenName);
    console.log("Token Symbol:", tokenSymbol);
    console.log("Token Description:", tokenDescription);
    console.log("Website:", website);
    console.log("Telegram:", telegram);
    console.log("Twitter:", twitter);
    console.log("Discord:", discord);

    //TODO: Pin token image to Arweave
    // TODO: add issuer
    if (!libraries) setLibraries(loadLibraries());

    const json = {
      symbol: tokenSymbol,
      name: tokenName,
      description: tokenDescription,
      image: "", // TODO: imageUrl
      website,
      telegram,
      twitter,
      discord,
      tokenContractCode:
        "https://github.com/MinaFoundation/mina-fungible-token/blob/main/FungibleToken.ts",
      adminContractsCode: [
        "https://github.com/MinaFoundation/mina-fungible-token/blob/main/FungibleTokenAdmin.ts",
      ],
    };

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
    const adminPublicKey = AURO_TEST ? ADMIN_ADDRESS : address;
    if (!adminPublicKey) {
      console.error("adminPublicKey is not set");
      return;
    }

    const metadataHash = await pinStringToArweave(
      JSON.stringify(json, null, 2)
    );

    if (!metadataHash) {
      logItem({
        id: "metadata",
        status: "error",
        title: "Token metadata pinning failed",
        description: "Failed to pin data to Arweave permanent storage",
        date: new Date(),
      });
      setWaitingItem(undefined);
      return;
    }

    const waitForArweaveTxPromise = waitForArweaveTx({
      hash: metadataHash,
      id: "metadata",
      type: "metadata",
      waitingTitle: "Pinning token metadata to Arweave permanent storage",
      successTitle: "Token metadata is included into Arweave permanent storage",
      failedTitle: "Failed to pin token metadata to Arweave permanent storage",
    });
    setWaitingItem(undefined);

    const deployParamsPromise = deployTokenParams();
    const uri = await arweaveHashToUrl(metadataHash);

    if (isError || !uri) {
      return;
    }
    const {
      tokenPrivateKey,
      adminContractPrivateKey,
      tokenPublicKey,
      adminContractPublicKey,
    } = await deployParamsPromise;
    if (DEBUG) console.log("Deploy Params received");

    // Save the result to a JSON file
    const deployParams = {
      symbol: tokenSymbol,
      name: tokenName,
      description: tokenDescription,
      image: "", // TODO: imageUrl
      website,
      telegram,
      twitter,
      discord,
      tokenPrivateKey,
      adminContractPrivateKey,
      tokenPublicKey,
      adminContractPublicKey,
      adminPublicKey,
      metadata: uri,
    };
    // TODO: save with password encryption
    const deployParamsJson = JSON.stringify(deployParams, null, 2);
    const blob = new Blob([deployParamsJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const name = `${tokenSymbol}-${tokenPublicKey}.json`;
    a.download = name;
    a.click();
    logItem({
      id: "saveDeployParams",
      status: "success",
      title: "Token deploy parameters saved to a JSON file",
      description: (
        <>
          <a
            href={url}
            className="text-blue-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {name}
          </a>{" "}
          has been saved to your device.
        </>
      ),
      date: new Date(),
    });
    const deployResult = await deployToken({
      tokenPrivateKey,
      adminContractPrivateKey,
      adminPublicKey,
      symbol: tokenSymbol,
      uri,
      libraries: libraries ?? loadLibraries(),
      logItem,
      updateLogItem,
    });
    if (DEBUG) console.log("Deploy result:", deployResult);
    if (
      deployResult.success === false ||
      deployResult.jobId === undefined ||
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
    const deployJobId = deployResult.jobId;

    const waitForProveJobPromise = waitForProveJob({
      jobId: deployJobId,
      id: "cloud-proving-job",
      waitingTitle: "Proving deploy transaction",
      successTitle: "Deploy transaction is proved",
      failedTitle: "Failed to prove deploy transaction",
    });

    const transaction = await waitForProveJobPromise;
    if (DEBUG) console.log("Transaction proved:", transaction);
    if (isError || !transaction) {
      return;
    }

    await waitForArweaveTxPromise;

    const sendResult = await sendTransaction(transaction);
    if (DEBUG) console.log("Transaction sent:", sendResult);
    if (
      isError ||
      sendResult.success === false ||
      sendResult.hash === undefined
    ) {
      logItem({
        id: "deploySend",
        status: "error",
        title: "Failed to send transaction to Mina blockchain",
        description: `Failed to send transaction to Mina blockchain: ${
          sendResult.status ? "status: " + sendResult.status + ", " : ""
        } ${String(sendResult.error ?? "error D437")}`,
        date: new Date(),
      });
      return;
    }

    const waitForMinaTxPromise = waitForMinaTx({
      hash: sendResult.hash,
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

    if (mintItems.length > 0) {
      logItem({
        id: "mint",
        status: "waiting",
        title: "Minting tokens",
        description: `Minted tokens to ${minted} of ${mintItems.length} addresses`,
        date: new Date(),
      });
      let nonce = await getAccountNonce(adminPublicKey);
      for (let i = 0; i < mintItems.length; i++) {
        const item = mintItems[i];
        const id = `mint-${i}`;
        logItem({
          id,
          status: "waiting",
          title: `Minting ${item.amount} ${tokenSymbol} to ${item.to}`,
          description: `Checking data...`,
          date: new Date(),
        });
        const mintResult = await mintToken({
          tokenPublicKey,
          adminContractPublicKey,
          adminPublicKey,
          to: item.to,
          amount: item.amount,
          nonce: nonce++,
          id,
          logItem,
          updateLogItem,
          symbol: tokenSymbol,
          libraries: libraries ?? loadLibraries(),
        });
      }
    }
    setWaitingItem(undefined);
    setIssuing(false);
    setIssued(true);
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <h1 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-[#F15B22] to-[#F9ECDE] text-transparent bg-clip-text">
        zkCloudWorker Custom Token Launchpad
      </h1>

      <div className="flex justify-center space-x-8 mb-8">
        <div className="flex flex-col items-center">
          <Code className="h-12 w-12 text-[#F15B22] mb-2" />
          <span>No Coding</span>
        </div>
        <div className="flex flex-col items-center">
          <Zap className="h-12 w-12 text-[#F15B22] mb-2" />
          <span>Mint Immediately</span>
        </div>
        <div className="flex flex-col items-center">
          <DollarSign className="h-12 w-12 text-[#F15B22] mb-2" />
          <span>Fixed Issue Fee</span>
        </div>
      </div>
      <div className="flex justify-center items-start">
        <div className="flex flex-col w-1/3">
          {url && (
            <img
              src={url}
              alt="Preview"
              className="w-64 h-64 bg-[#30363D] rounded-lg"
            />
          )}
          {!url && (issuing || issued) && (
            <div className="p-4 rounded-lg flex flex-col items-center space-y-2">
              <img
                src="/token.svg"
                alt="zkCloudWorker Logo"
                className="w-64 h-64 bg-[#30363D] rounded-lg"
              />
            </div>
          )}
          <div {...getRootProps()}>
            {url && !issuing && !issued && (
              <div className="bg-[#161B22] p-4 rounded-lg flex flex-col items-center space-y-2">
                <label
                  htmlFor="photo-upload"
                  className="cursor-pointer flex items-center space-x-2"
                >
                  <CameraIcon className="text-[#8B949E] h-2 w-5" />
                  <span className="text-sm">
                    {isDragActive ? "Drop image here" : "Change image"}
                  </span>
                </label>
                <input
                  id="image-upload"
                  className="hidden"
                  {...getInputProps()}
                />
              </div>
            )}
            {!url && !issuing && !issued && (
              <div className="bg-[#161B22] p-4 rounded-lg flex flex-col items-center space-y-2">
                <label
                  htmlFor="photo-upload"
                  className="cursor-pointer flex items-center space-x-2"
                >
                  <CameraIcon className="text-[#8B949E] h-5 w-5" />
                  <span className="text-sm">
                    {isDragActive ? "Drop image here" : "Add image"}
                  </span>
                </label>
                <input
                  id="image-upload"
                  className="hidden"
                  {...getInputProps()}
                />
                <div className="w-[341.33px] h-64 bg-[#30363D] rounded-lg flex items-center justify-center" />
              </div>
            )}
          </div>
          {!issuing && !issued && (
            <div className="p-4 rounded-lg flex flex-col items-center space-y-2">
              <p className="text-sm text-[#F9ECDE]">
                SVG is recommended with size less than 100kb
              </p>
            </div>
          )}
          {tokenSymbol && (
            <div className="p-4 rounded-lg flex flex-col items-center space-y-2">
              <p className="text-sm text-[#F9ECDE]">
                Token Symbol: {tokenSymbol}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col w-2/3 space-y-4">
          {!issuing && !issued && (
            <div className="space-y-6">
              <div>
                <Label htmlFor="token-name">Token Name</Label>
                <Input
                  id="token-name"
                  placeholder="Enter token name"
                  className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
                  value={tokenName}
                  onChange={(e) => {
                    setTokenName(e.target.value);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="token-symbol">
                  Token Symbol (max 6 characters)
                </Label>
                <Input
                  id="token-symbol"
                  placeholder="Enter token symbol"
                  className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
                  value={tokenSymbol}
                  onChange={(e) => {
                    setTokenSymbol(e.target.value);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="token-description">Token Description</Label>
                <Textarea
                  id="token-description"
                  placeholder="Enter token description"
                  className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
                  value={tokenDescription}
                  onChange={(e) => setTokenDescription(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  placeholder="Optional"
                  className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="telegram">Telegram</Label>
                <Input
                  id="telegram"
                  placeholder="Optional"
                  className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="twitter">Twitter</Label>
                <Input
                  id="twitter"
                  placeholder="Optional"
                  className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="discord">Discord</Label>
                <Input
                  id="discord"
                  placeholder="Optional"
                  className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
                  value={discord}
                  onChange={(e) => setDiscord(e.target.value)}
                />
              </div>
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
                <div key={`Mint-${index}`} className="relative flex space-x-4">
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
                      className="pr-16 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
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
              <Button
                className="w-full bg-[#F15B22] hover:bg-[#d14d1d] text-white"
                onClick={handleIssueToken}
                disabled={issuing}
              >
                Issue Token
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
