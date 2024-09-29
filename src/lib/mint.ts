"use client";

import { sendMintTransaction } from "./zkcloudworker";
import { TimelineItem } from "../components/ui/timeline";
import React from "react";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";
const chain = process.env.NEXT_PUBLIC_CHAIN;
const WALLET = process.env.NEXT_PUBLIC_WALLET;
const AURO_TEST = process.env.NEXT_PUBLIC_AURO_TEST === "true";
const MINT_FEE = 1e8;
const ISSUE_FEE = 1e9;

export async function mintToken(params: {
  tokenPublicKey: string;
  adminContractPublicKey: string;
  adminPublicKey: string;
  to: string;
  amount: string;
  symbol: string;
  libraries: Promise<{
    o1js: typeof import("o1js");
    zkcloudworker: typeof import("zkcloudworker");
  }>;
  logItem: (item: TimelineItem) => void;
  updateLogItem: (id: string, update: Partial<TimelineItem>) => void;
  nonce: number;
  id: string;
}): Promise<{
  success: boolean;
  error?: string;
  jobId?: string;
  json?: string;
}> {
  if (chain === undefined) throw new Error("NEXT_PUBLIC_CHAIN is undefined");
  if (chain !== "devnet" && chain !== "mainnet")
    throw new Error("NEXT_PUBLIC_CHAIN must be devnet or mainnet");
  if (WALLET === undefined) throw new Error("NEXT_PUBLIC_WALLET is undefined");
  console.time("ready to sign");
  if (DEBUG) console.log("deploy token", params);
  try {
    const {
      tokenPublicKey,
      adminPublicKey,
      symbol,
      libraries,
      logItem,
      updateLogItem,
      nonce,
      id,
    } = params;

    const mina = (window as any).mina;
    if (mina === undefined || mina?.isAuro !== true) {
      console.error("No Auro Wallet found", mina);
      logItem({
        id: "no-mina",
        status: "error",
        title: "No Auro Wallet found",
        description: "Please install Auro Wallet",
        date: new Date(),
      });
      return {
        success: false,
        error: "No Auro Wallet found",
      };
    }

    logItem({
      id: "o1js-loading",
      status: "waiting",
      title: "Loading o1js library",
      description: React.createElement(
        "span",
        null,
        "Loading ",
        React.createElement(
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
      date: new Date(),
    });

    const {
      o1js: {
        PrivateKey,
        PublicKey,
        UInt64,
        Mina,
        AccountUpdate,
        UInt8,
        Bool,
        Field,
      },
      zkcloudworker: {
        FungibleToken,
        FungibleTokenAdmin,
        serializeTransaction,
        initBlockchain,
        accountBalanceMina,
        fee: getFee,
        fetchMinaAccount,
      },
    } = await libraries;

    updateLogItem("o1js-loading", {
      status: "success",
      title: "Loaded o1js library",
      description: React.createElement(
        "span",
        null,
        "Loaded ",
        React.createElement(
          "a",
          {
            href: "https://docs.minaprotocol.com/zkapps/o1js",
            target: "_blank",
            rel: "noopener noreferrer",
          },
          "o1js"
        ),
        " library"
      ),
      date: new Date(),
    });

    logItem({
      id: "mint-transaction",
      status: "waiting",
      title: "Preparing transaction",
      description: "Preparing the transaction for minting tokens...",
      date: new Date(),
    });

    const to = PublicKey.fromBase58(params.to);
    const amount = UInt64.from(
      Number(parseInt((parseFloat(params.amount) * 1_000_000_000).toFixed(0)))
    );

    let adminPrivateKey = PrivateKey.empty();
    if (AURO_TEST) {
      if (process.env.NEXT_PUBLIC_ADMIN_SK === undefined) {
        throw new Error("NEXT_PUBLIC_ADMIN_SK is undefined");
      }
      adminPrivateKey = PrivateKey.fromBase58(process.env.NEXT_PUBLIC_ADMIN_SK);
      const adminPublicKeyTmp = adminPrivateKey.toPublicKey();
      if (adminPublicKeyTmp.toBase58() !== process.env.NEXT_PUBLIC_ADMIN_PK) {
        throw new Error("NEXT_PUBLIC_ADMIN_PK is invalid");
      }
    }
    const sender = AURO_TEST
      ? adminPrivateKey.toPublicKey()
      : PublicKey.fromBase58(adminPublicKey);

    if (DEBUG) console.log("initializing blockchain", chain);
    const net = await initBlockchain(chain);
    if (DEBUG) console.log("blockchain initialized", net);

    if (DEBUG) console.log("network id", Mina.getNetworkId());

    const balance = await accountBalanceMina(sender);

    const fee = Number((await getFee()).toBigInt());

    const contractAddress = PublicKey.fromBase58(tokenPublicKey);
    if (DEBUG) console.log("Contract", contractAddress.toBase58());
    const adminContractPublicKey = PublicKey.fromBase58(
      params.adminContractPublicKey
    );
    if (DEBUG) console.log("Admin Contract", adminContractPublicKey.toBase58());
    const wallet = PublicKey.fromBase58(WALLET);
    const zkToken = new FungibleToken(contractAddress);
    const tokenId = zkToken.deriveTokenId();

    if (DEBUG) console.log(`Sending tx...`);
    console.time("prepared tx");
    const memo =
      `mint ${Number(amount.toBigInt()) / 1_000_000_000} ${symbol}`.length > 30
        ? `mint ${symbol}`.substring(0, 30)
        : `mint ${Number(amount.toBigInt()) / 1_000_000_000} ${symbol}`;

    await fetchMinaAccount({
      publicKey: sender,
      force: true,
    });
    await fetchMinaAccount({
      publicKey: contractAddress,
      force: true,
    });
    await fetchMinaAccount({
      publicKey: adminContractPublicKey,
      force: true,
    });
    await fetchMinaAccount({
      publicKey: contractAddress,
      tokenId,
      force: true,
    });
    await fetchMinaAccount({
      publicKey: to,
      tokenId,
      force: true,
    });
    await fetchMinaAccount({
      publicKey: wallet,
      force: true,
    });

    if (!Mina.hasAccount(sender)) {
      console.error("Sender does not have account");

      logItem({
        id: "account-not-found",
        status: "error",
        title: "Account Not Found",
        description: `Account ${sender.toBase58()} not found. Please fund your account or try again later, after all the previous transactions are included in the block.`,
        date: new Date(),
      });

      return {
        success: false,
        error: "Sender does not have account",
      };
    }
    const isNewAccount = Mina.hasAccount(to, tokenId);
    const requiredBalance = isNewAccount
      ? 1
      : 0 + (MINT_FEE + fee) / 1_000_000_000;
    if (requiredBalance > balance) {
      logItem({
        id: "insufficient-balance",
        status: "error",
        title: "Insufficient Balance",
        description: `Insufficient balance of the sender: ${balance} MINA. Required: ${requiredBalance} MINA`,
        date: new Date(),
      });
      return {
        success: false,
        error: `Insufficient balance of the sender: ${balance} MINA. Required: ${requiredBalance} MINA`,
      };
    }

    console.log("Sender balance:", await accountBalanceMina(sender));

    const tx = await Mina.transaction(
      { sender, fee, memo, nonce },
      async () => {
        if (isNewAccount) AccountUpdate.fundNewAccount(sender, 1);
        const provingFee = AccountUpdate.createSigned(sender);
        provingFee.send({
          to: PublicKey.fromBase58(WALLET),
          amount: UInt64.from(MINT_FEE),
        });
        await zkToken.mint(to, amount);
      }
    );
    if (AURO_TEST) tx.sign([adminPrivateKey]);

    const serializedTransaction = serializeTransaction(tx);
    const transaction = tx.toJSON();
    const txJSON = JSON.parse(transaction);
    if (DEBUG) console.log("Transaction", tx.toPretty());
    const payload = {
      transaction,
      onlySign: true,
      feePayer: {
        fee: fee,
        memo: memo,
      },
    };
    console.timeEnd("prepared tx");
    console.timeEnd("ready to sign");
    updateLogItem("transaction", {
      status: "waiting",
      title: "Deploy transaction is prepared",
      description: "Deploy transaction is prepared, please sign it",
      date: new Date(),
    });
    console.time("sent transaction");
    if (DEBUG) console.log("txJSON", txJSON);
    let signedData = JSON.stringify({ zkappCommand: txJSON });

    if (!AURO_TEST) {
      const txResult = await mina?.sendTransaction(payload);
      if (DEBUG) console.log("Transaction result", txResult);
      signedData = txResult?.signedData;
      if (signedData === undefined) {
        if (DEBUG) console.log("No signed data");
        updateLogItem("transaction", {
          status: "error",
          title: "No user signature received",
          description:
            "No user signature received, deploy transaction cancelled",
          date: new Date(),
        });
        return {
          success: false,
          error: "No user signature",
        };
      }
    }

    updateLogItem("transaction", {
      status: "success",
      title: "User signature received",
      description: "User signature received, proceeding with deployment",
      date: new Date(),
    });
    logItem({
      id: "cloud-proving-job",
      status: "waiting",
      title: "Starting cloud proving job",
      description: "Starting cloud proving job...",
      date: new Date(),
    });
    const jobId = await sendMintTransaction({
      serializedTransaction,
      signedData,
      adminContractPublicKey: adminContractPublicKey.toBase58(),
      tokenPublicKey: contractAddress.toBase58(),
      adminPublicKey: sender.toBase58(),
      chain,
      symbol,
    });
    console.timeEnd("sent transaction");
    if (DEBUG) console.log("Sent transaction, jobId", jobId);
    if (jobId === undefined) {
      console.error("JobId is undefined");
      updateLogItem("cloud-proving-job", {
        status: "error",
        title: "Cloud proving job was failed to start",
        description:
          "Cloud proving job was failed to start, transaction is cancelled",
        date: new Date(),
      });
      return {
        success: false,
        error: "JobId is undefined",
      };
    }

    return {
      success: true,
      jobId,
    };
  } catch (error) {
    console.error("Error in deployToken", error);
    return {
      success: false,
      error: String(error) ?? "Error while deploying token",
    };
  }
}
