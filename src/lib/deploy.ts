"use client";

import { sendDeployTransaction } from "./zkcloudworker";
import { getAccountNonce } from "./nonce";
import { TimelineItem } from "../components/ui/timeline";
import React from "react";
import { verificationKeys } from "./vk";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";
const chain = process.env.NEXT_PUBLIC_CHAIN;
const WALLET = process.env.NEXT_PUBLIC_WALLET;
const AURO_TEST = process.env.NEXT_PUBLIC_AURO_TEST === "true";
const MINT_FEE = 1e8;
const ISSUE_FEE = 1e9;

export async function deployToken(params: {
  tokenPrivateKey: string;
  adminContractPrivateKey: string;
  adminPublicKey: string;
  symbol: string;
  uri: string;
  libraries: Promise<{
    o1js: typeof import("o1js");
    zkcloudworker: typeof import("zkcloudworker");
  }>;
  logItem: (item: TimelineItem) => void;
  updateLogItem: (id: string, update: Partial<TimelineItem>) => void;
}): Promise<{
  success: boolean;
  error?: string;
  jobId?: string;
}> {
  if (chain === undefined) throw new Error("NEXT_PUBLIC_CHAIN is undefined");
  if (chain !== "devnet" && chain !== "mainnet")
    throw new Error("NEXT_PUBLIC_CHAIN must be devnet or mainnet");
  if (WALLET === undefined) throw new Error("NEXT_PUBLIC_WALLET is undefined");
  console.time("ready to sign");
  if (DEBUG) console.log("deploy token", params);
  const {
    tokenPrivateKey,
    adminPublicKey,
    symbol,
    uri,
    libraries,
    logItem,
    updateLogItem,
  } = params;

  try {
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
      id: "transaction",
      status: "waiting",
      title: "Preparing transaction",
      description: "Preparing the transaction for deployment...",
      date: new Date(),
    });

    if (DEBUG) console.log("initializing blockchain", chain);
    const net = await initBlockchain(chain);
    if (DEBUG) console.log("blockchain initialized", net);

    if (DEBUG) console.log("network id", Mina.getNetworkId());

    const balance = await accountBalanceMina(sender);

    const fee = Number((await getFee()).toBigInt());

    const contractPrivateKey = PrivateKey.fromBase58(tokenPrivateKey);
    const contractAddress = contractPrivateKey.toPublicKey();
    if (DEBUG) console.log("Contract", contractAddress.toBase58());
    const adminContractPrivateKey = PrivateKey.fromBase58(
      params.adminContractPrivateKey
    );
    const adminContractPublicKey = adminContractPrivateKey.toPublicKey();
    if (DEBUG) console.log("Admin Contract", adminContractPublicKey.toBase58());
    const wallet = PublicKey.fromBase58(WALLET);
    const zkToken = new FungibleToken(contractAddress);
    const zkAdmin = new FungibleTokenAdmin(adminContractPublicKey);

    if (DEBUG) console.log(`Sending tx...`);
    console.time("prepared tx");
    const memo = `deploy token ${symbol}`.substring(0, 30);

    await fetchMinaAccount({
      publicKey: sender,
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
    const requiredBalance = 3 + (ISSUE_FEE + fee) / 1_000_000_000;
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
    const nonce = await getAccountNonce(sender.toBase58());

    const adminContractVerificationKey = verificationKeys[chain]?.admin;
    const tokenContractVerificationKey = verificationKeys[chain]?.token;
    if (
      adminContractVerificationKey === undefined ||
      tokenContractVerificationKey === undefined
    ) {
      throw new Error("Verification keys are undefined");
    }

    FungibleTokenAdmin._verificationKey = {
      hash: Field(adminContractVerificationKey.hash),
      data: adminContractVerificationKey.data,
    };
    FungibleToken._verificationKey = {
      hash: Field(tokenContractVerificationKey.hash),
      data: tokenContractVerificationKey.data,
    };

    const tx = await Mina.transaction(
      { sender, fee, memo, nonce },
      async () => {
        AccountUpdate.fundNewAccount(sender, 3);
        const provingFee = AccountUpdate.createSigned(sender);
        provingFee.send({
          to: PublicKey.fromBase58(WALLET),
          amount: UInt64.from(ISSUE_FEE),
        });
        await zkAdmin.deploy({ adminPublicKey: sender });
        zkAdmin.account.zkappUri.set(uri);
        await zkToken.deploy({
          symbol: symbol,
          src: uri,
        });
        await zkToken.initialize(
          adminContractPublicKey,
          UInt8.from(9), // TODO: set decimals
          // We can set `startPaused` to `Bool(false)` here, because we are doing an atomic deployment
          // If you are not deploying the admin and token contracts in the same transaction,
          // it is safer to start the tokens paused, and resume them only after verifying that
          // the admin contract has been deployed
          Bool(false)
        );
      }
    );
    tx.sign(
      AURO_TEST
        ? [contractPrivateKey, adminContractPrivateKey, adminPrivateKey]
        : [contractPrivateKey, adminContractPrivateKey]
    );

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
    const jobId = await sendDeployTransaction({
      serializedTransaction,
      signedData,
      adminContractPublicKey: adminContractPublicKey.toBase58(),
      tokenPublicKey: contractAddress.toBase58(),
      adminPublicKey: sender.toBase58(),
      chain,
      symbol,
      uri,
      sendTransaction: false,
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
    logItem({
      id: "error",
      status: "error",
      title: "Error while deploying token",
      description: String(error) ?? "Error while deploying token",
      date: new Date(),
    });
    return {
      success: false,
      error: String(error) ?? "Error while deploying token",
    };
  }
}
