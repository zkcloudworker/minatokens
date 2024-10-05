"use client";

import { getAccountNonce } from "./nonce";
import { TimelineItem } from "../components/ui/timeline";
import {
  sendTinyTransaction,
  TinyTransactionParams,
  getResult,
  waitForJobResult,
} from "./zkcloudworker";
import React from "react";
import { verificationKeys } from "./vk";
import { shortenString } from "./short";
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";
const chain = process.env.NEXT_PUBLIC_CHAIN;
const WALLET = process.env.NEXT_PUBLIC_WALLET;
const MINT_FEE = 1e8;
const ISSUE_FEE = 1e9;
const tinyAddress = "B62qiq8oVXcNAibgXQPXUTaPivKaSMoUxzZDZLBAfhg69JwjzNmcLTU";

export async function deployToken(params: {
  tokenPrivateKey: string;
  adminContractPrivateKey: string;
  adminPublicKey: string;
  symbol: string;
  lib: {
    o1js: typeof import("o1js");
    zkcloudworker: typeof import("zkcloudworker");
  };
  logItem: (item: TimelineItem) => void;
  updateLogItem: (id: string, update: Partial<TimelineItem>) => void;
  useHardcodedWallet: boolean;
  useTinyContract: boolean;
  useCloudProving: boolean;
}): Promise<{
  success: boolean;
  error?: string;
  hash?: string;
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
    lib,
    logItem,
    updateLogItem,
    useHardcodedWallet,
    useTinyContract,
    useCloudProving,
  } = params;
  const uri = "mobile test";

  try {
    const mina = (window as any).mina;
    if ((mina === undefined || mina?.isAuro !== true) && !useHardcodedWallet) {
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
        TinyContract,
      },
    } = lib;

    if (useTinyContract && !useCloudProving) {
      logItem({
        id: "compile tiny",
        status: "waiting",
        title: "Compiling TinyContract",
        description: "Compiling TinyContract...",
        date: new Date(),
      });
      console.time("compile tiny");
      const compileTimeTiny = Date.now();
      await TinyContract.compile();
      console.timeEnd("compile tiny");
      updateLogItem("compile tiny", {
        status: "success",
        title: "TinyContract compiled",
        description: `TinyContract compiled in ${Math.floor(
          (Date.now() - compileTimeTiny) / 1000
        )} sec ${(Date.now() - compileTimeTiny) % 1000} ms`,
        date: new Date(),
      });
      await sleep(1000);
    }
    if (useTinyContract) {
      if (process.env.NEXT_PUBLIC_ADMIN_SK === undefined) {
        throw new Error("NEXT_PUBLIC_ADMIN_SK is undefined");
      }

      logItem({
        id: "send tiny",
        status: "waiting",
        title: "Sending transaction to TinyContract",
        description: "Sending transaction to TinyContract...",
        date: new Date(),
      });
    }

    let adminPrivateKey = PrivateKey.empty();
    if (useHardcodedWallet) {
      if (process.env.NEXT_PUBLIC_ADMIN_SK === undefined) {
        throw new Error("NEXT_PUBLIC_ADMIN_SK is undefined");
      }
      adminPrivateKey = PrivateKey.fromBase58(process.env.NEXT_PUBLIC_ADMIN_SK);
      const adminPublicKeyTmp = adminPrivateKey.toPublicKey();
      if (adminPublicKeyTmp.toBase58() !== process.env.NEXT_PUBLIC_ADMIN_PK) {
        throw new Error("NEXT_PUBLIC_ADMIN_PK is invalid");
      }
    }
    const sender = useHardcodedWallet
      ? adminPrivateKey.toPublicKey()
      : PublicKey.fromBase58(adminPublicKey);

    const txTimeStart = Date.now();

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
    const requiredBalance = 3 + (fee * 2) / 1_000_000_000;
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
    let nonce = await getAccountNonce(sender.toBase58());

    if (useTinyContract) {
      if (process.env.NEXT_PUBLIC_ADMIN_SK === undefined) {
        throw new Error("NEXT_PUBLIC_ADMIN_SK is undefined");
      }

      await fetchMinaAccount({
        publicKey: sender,
        force: true,
      });
      const tiny = new TinyContract(PublicKey.fromBase58(tinyAddress));
      const value = Date.now();
      const tinyMemo = `tiny tx,  ${
        useCloudProving ? "cloud proving" : "web proving"
      }`;
      const txTiny = await Mina.transaction(
        { sender, fee, memo: tinyMemo, nonce: nonce++ },
        async () => {
          await tiny.setValue(Field(value));
        }
      );
      if (useHardcodedWallet) txTiny.sign([adminPrivateKey]);
      updateLogItem("send tiny", {
        status: "waiting",
        title: "Proving TinyContract transaction",
        description: "Proving TinyContract transaction...",
        date: new Date(),
      });
      if (useCloudProving) {
        const serializedTransaction = serializeTransaction(txTiny);
        const jobId = await sendTinyTransaction({
          chain,
          contractAddress: tinyAddress,
          serializedTransaction,
          sender: sender.toBase58(),
          value,
          sendTransaction: false,
        });
        if (jobId === undefined) {
          updateLogItem("send tiny", {
            status: "error",
            title: "Failed to prove TinyContract transaction",
            description: "Failed to prove TinyContract transaction",
            date: new Date(),
          });
          return {
            success: false,
            error: "Failed to prove TinyContract transaction",
          };
        }
        updateLogItem("send tiny", {
          status: "waiting",
          title: "Proving TinyContract transaction",
          description: React.createElement(
            React.Fragment,
            null,
            "Proving TinyContract transaction in cloud with jobId  ",
            React.createElement(
              "a",
              {
                href: `https://zkcloudworker.com/job/${jobId}`,
                className: "text-blue-500 hover:underline",
                target: "_blank",
                rel: "noopener noreferrer",
              },
              shortenString(jobId)
            ),
            "."
          ),
          date: new Date(),
        });
        let proof = await getResult(jobId);
        while (proof === undefined) {
          await sleep(5000);
          proof = await getResult(jobId);
        }
        if (proof === undefined || proof === "error") {
          updateLogItem("send tiny", {
            status: "error",
            title: "Failed to prove TinyContract transaction",
            description: "Failed to prove TinyContract transaction",
            date: new Date(),
          });
          return {
            success: false,
            error: "Failed to prove TinyContract transaction",
          };
        }

        let txProved = undefined;
        try {
          const { success, tx } = JSON.parse(proof);
          if (!success || tx === undefined) {
            updateLogItem("send tiny", {
              status: "error",
              title: "Failed to prove TinyContract transaction",
              description: "Failed to prove TinyContract transaction",
              date: new Date(),
            });
            return {
              success: false,
              error: "Failed to prove TinyContract transaction",
            };
          }
          txProved = tx;
        } catch (error) {
          console.error("Error in deployToken", error);
          updateLogItem("send tiny", {
            status: "error",
            title: "Failed to prove TinyContract transaction",
            description: "Failed to prove TinyContract transaction",
            date: new Date(),
          });
          return {
            success: false,
            error: "Failed to prove TinyContract transaction",
          };
        }
        updateLogItem("send tiny", {
          status: "waiting",
          title: "Sending TinyContract transaction",
          description: "Sending TinyContract transaction, please sign it...",
          date: new Date(),
        });
        const payload = {
          transaction: txProved,
          feePayer: {
            fee: fee,
            memo: tinyMemo,
          },
        };

        let hash = undefined;
        const txTinyResult = await mina?.sendTransaction(payload);
        if (DEBUG) console.log("Transaction result", txTinyResult);
        hash = txTinyResult?.hash;
        updateLogItem("send tiny", {
          status: hash ? "success" : "error",
          title: "TinyContract transaction sent",
          // description: hash
          //   ? `TinyContract transaction proved and sent\n with hash ${hash}`
          //   : "Failed to send TinyContract transaction",
          description: hash
            ? React.createElement(
                React.Fragment,
                null,
                "TinyContract transaction proved in cloud and sent with transaction hash ",
                React.createElement(
                  "a",
                  {
                    href: `https://minascan.io/devnet/tx/${hash}?type=zk-tx`,
                    className: "text-blue-500 hover:underline",
                    target: "_blank",
                    rel: "noopener noreferrer",
                  },
                  shortenString(hash)
                ),
                "."
              )
            : "Failed to send TinyContract transaction",
          date: new Date(),
        });
        await sleep(5000);
      } else {
        console.time("proved tiny");
        const proveTimeTiny = Date.now();
        await txTiny.prove();
        console.timeEnd("proved tiny");
        updateLogItem("send tiny", {
          status: "waiting",
          title: "TinyContract transaction proved",
          description: `TinyContract transaction proved in ${Math.floor(
            (Date.now() - proveTimeTiny) / 1000
          )} sec ${(Date.now() - proveTimeTiny) % 1000} ms`,
          date: new Date(),
        });
        await sleep(5000);
        console.time("send tiny");
        if (useHardcodedWallet) {
          const txTinyResult = await txTiny.send();
          console.timeEnd("sent tiny");
          updateLogItem("send tiny", {
            status: txTinyResult?.status === "pending" ? "success" : "error",
            title: "TinyContract transaction sent",
            description: `TinyContract transaction sent\n with status ${
              txTinyResult?.status ?? ""
            }\n and hash ${txTinyResult?.hash ?? ""}`,
            date: new Date(),
          });
        } else {
          const transaction = txTiny.toJSON();
          const payload = {
            transaction,
            feePayer: {
              fee: fee,
              memo: tinyMemo,
            },
          };

          let hash = undefined;
          const txTinyResult = await mina?.sendTransaction(payload);
          if (DEBUG) console.log("Transaction result", txTinyResult);
          hash = txTinyResult?.hash;
          updateLogItem("send tiny", {
            status: hash ? "success" : "error",
            title: "TinyContract transaction sent",
            description: hash
              ? React.createElement(
                  React.Fragment,
                  null,
                  "TinyContract transaction proved in browser and sent with transaction hash ",
                  React.createElement(
                    "a",
                    {
                      href: `https://minascan.io/devnet/tx/${hash}?type=zk-tx`,
                      className: "text-blue-500 hover:underline",
                      target: "_blank",
                      rel: "noopener noreferrer",
                    },
                    shortenString(hash)
                  ),
                  "."
                )
              : "Failed to send TinyContract transaction",
            date: new Date(),
          });
        }
      }
      return {
        success: true,
      };
    }

    logItem({
      id: "transaction",
      status: "waiting",
      title: "Preparing deploy transaction",
      description: "Preparing the transaction for deployment...",
      date: new Date(),
    });

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
      useHardcodedWallet
        ? [contractPrivateKey, adminContractPrivateKey, adminPrivateKey]
        : [contractPrivateKey, adminContractPrivateKey]
    );

    console.timeEnd("prepared tx");
    console.timeEnd("ready to sign");
    updateLogItem("transaction", {
      status: "success",
      title: "Deploy transaction is prepared",
      description: `Deploy transaction is prepared in ${Math.floor(
        (Date.now() - txTimeStart) / 1000
      )} sec ${(Date.now() - txTimeStart) % 1000} ms`,
      date: new Date(),
    });

    logItem({
      id: "compile admin",
      status: "waiting",
      title: "Compiling FungibleTokenAdmin contract",
      description: "Compiling FungibleTokenAdmin contract...",
      date: new Date(),
    });
    console.time("compile admin");
    const compileTimeAdmin = Date.now();
    await FungibleTokenAdmin.compile();
    console.timeEnd("compile admin");
    updateLogItem("compile admin", {
      status: "success",
      title: "FungibleTokenAdmin contract compiled",
      description: `FungibleTokenAdmin contract compiled in ${Math.floor(
        (Date.now() - compileTimeAdmin) / 1000
      )} sec ${(Date.now() - compileTimeAdmin) % 1000} ms`,
      date: new Date(),
    });
    logItem({
      id: "compile contract",
      status: "waiting",
      title: "Compiling FungibleToken contract",
      description: "Compiling FungibleToken contract...",
      date: new Date(),
    });
    console.time("compile contract");
    const compileTimeToken = Date.now();
    await FungibleToken.compile();
    console.timeEnd("compile contract");
    updateLogItem("compile contract", {
      status: "success",
      title: "FungibleToken contract compiled",
      description: `FungibleToken contract compiled in ${Math.floor(
        (Date.now() - compileTimeToken) / 1000
      )} sec ${(Date.now() - compileTimeToken) % 1000} ms`,
      date: new Date(),
    });
    await sleep(1000);

    logItem({
      id: "prove",
      status: "waiting",
      title: "Proving transaction",
      description: "Proving transaction...",
      date: new Date(),
    });
    await sleep(1000);
    const proveTime = Date.now();
    console.time("proved");
    await tx.prove();
    console.timeEnd("proved");
    updateLogItem("prove", {
      status: "success",
      title: "Transaction proven",
      description: `Transaction proven in ${Math.floor(
        (Date.now() - proveTime) / 1000
      )} sec ${(Date.now() - proveTime) % 1000} ms`,
      date: new Date(),
    });
    await sleep(1000);
    console.time("sent transaction");
    logItem({
      id: "send transaction",
      status: "waiting",
      title: useHardcodedWallet
        ? "Sending transaction"
        : "Please sign transaction",
      description: useHardcodedWallet
        ? "Sending transaction..."
        : "Please sign transaction",
      date: new Date(),
    });
    const transaction = tx.toJSON();
    const payload = {
      transaction,
      feePayer: {
        fee: fee,
        memo: memo,
      },
    };

    let hash = undefined;
    if (!useHardcodedWallet) {
      const txResult = await mina?.sendTransaction(payload);
      if (DEBUG) console.log("Transaction result", txResult);
      hash = txResult?.hash;
      updateLogItem("send transaction", {
        status: hash ? "success" : "error",
        title: hash ? "Deploy transaction sent" : "Failed to send transaction",
        description: hash ? "Transaction sent" : "Failed to send transaction",
        date: new Date(),
      });
    } else {
      const txSent = await tx.send();
      hash = txSent.hash;
      const status = txSent.status;
      updateLogItem("send transaction", {
        status: status === "pending" ? "success" : "error",
        title: "Deploy transaction sent",
        description: `Transaction sent with status ${status}`,
        date: new Date(),
      });
    }

    return {
      success: true,
      hash,
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
