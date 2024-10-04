"use client";

import { TimelineItem } from "../components/ui/timeline";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";
const chain = process.env.NEXT_PUBLIC_CHAIN;
const WALLET = process.env.NEXT_PUBLIC_WALLET;
const AURO_TEST = process.env.NEXT_PUBLIC_AURO_TEST === "true";
const TRANSFER_FEE = 1e8;

export async function transferToken(params: {
  tokenPublicKey: string;
  from: string;
  to: string;
  amount: number;
  symbol: string;
  lib: {
    o1js: typeof import("o1js");
    zkcloudworker: typeof import("zkcloudworker");
  };
  updateLogItem: (id: string, update: Partial<TimelineItem>) => void;
  nonce: number;
  id: string;
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
  if (DEBUG) console.log("transfer token", params);
  const { tokenPublicKey, symbol, lib, updateLogItem, nonce, id } = params;
  try {
    const mina = (window as any).mina;
    if (mina === undefined || mina?.isAuro !== true) {
      console.error("No Auro Wallet found", mina);
      updateLogItem(id, {
        status: "error",
        description: "Please install Auro Wallet",
        date: new Date(),
      });
      return {
        success: false,
        error: "No Auro Wallet found",
      };
    }

    const {
      o1js: { PrivateKey, PublicKey, UInt64, Mina, AccountUpdate },
      zkcloudworker: {
        FungibleToken,
        serializeTransaction,
        initBlockchain,
        accountBalanceMina,
        fee: getFee,
        fetchMinaAccount,
      },
    } = lib;

    const to = PublicKey.fromBase58(params.to);
    const amount = UInt64.from(
      Number(parseInt((params.amount * 1_000_000_000).toFixed(0)))
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
      : PublicKey.fromBase58(params.from);

    if (DEBUG) console.log("initializing blockchain", chain);
    const net = await initBlockchain(chain);
    if (DEBUG) console.log("blockchain initialized", net);

    if (DEBUG) console.log("network id", Mina.getNetworkId());

    const balance = await accountBalanceMina(sender);
    const fee = Number((await getFee()).toBigInt());
    const contractAddress = PublicKey.fromBase58(tokenPublicKey);
    if (DEBUG) console.log("Contract", contractAddress.toBase58());
    const wallet = PublicKey.fromBase58(WALLET);
    const zkToken = new FungibleToken(contractAddress);
    const tokenId = zkToken.deriveTokenId();

    if (DEBUG) console.log(`Sending tx...`);
    console.time("prepared tx");
    const memo =
      `transfer ${Number(amount.toBigInt()) / 1_000_000_000} ${symbol}`.length >
      30
        ? `transfer ${symbol}`.substring(0, 30)
        : `transfer ${Number(amount.toBigInt()) / 1_000_000_000} ${symbol}`;

    await fetchMinaAccount({
      publicKey: sender,
      force: true,
    });
    await fetchMinaAccount({
      publicKey: sender,
      tokenId,
      force: true,
    });
    await fetchMinaAccount({
      publicKey: contractAddress,
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

      updateLogItem(id, {
        status: "error",
        description: `Account ${sender.toBase58()} not found. Please fund your account or try again later, after all the previous transactions are included in the block.`,
        date: new Date(),
      });

      return {
        success: false,
        error: "Sender does not have account",
      };
    }
    const isNewAccount = Mina.hasAccount(to, tokenId) === false;
    const requiredBalance = isNewAccount
      ? 1
      : 0 + (TRANSFER_FEE + fee) / 1_000_000_000;
    if (requiredBalance > balance) {
      updateLogItem(id, {
        status: "error",
        description: `Insufficient balance of the sender: ${balance} MINA. Required: ${requiredBalance} MINA`,
        date: new Date(),
      });
      return {
        success: false,
        error: `Insufficient balance of the sender: ${balance} MINA. Required: ${requiredBalance} MINA`,
      };
    }

    console.log("Sender balance:", await accountBalanceMina(sender));
    await sleep(1000);

    const tx = await Mina.transaction(
      { sender, fee, memo, nonce },
      async () => {
        if (isNewAccount) AccountUpdate.fundNewAccount(sender, 1);
        const provingFee = AccountUpdate.createSigned(sender);
        provingFee.send({
          to: PublicKey.fromBase58(WALLET),
          amount: UInt64.from(TRANSFER_FEE),
        });
        await zkToken.transfer(sender, to, amount);
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
        nonce,
      },
    };
    console.timeEnd("prepared tx");
    console.timeEnd("ready to sign");
    await sleep(1000);
    updateLogItem(id, {
      description: `Transfer transaction is prepared, please sign it setting nonce ${nonce} in Auro Wallet advanced settings`,
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
        updateLogItem(id, {
          status: "error",
          description:
            "No user signature received, transfer transaction cancelled",
          date: new Date(),
        });
        return {
          success: false,
          error: "No user signature",
        };
      }
    }

    updateLogItem(id, {
      description: "User signature received, starting cloud proving job",
      date: new Date(),
    });
    const jobId = undefined;
    console.timeEnd("sent transaction");
    if (DEBUG) console.log("Sent transaction, jobId", jobId);
    if (jobId === undefined) {
      console.error("JobId is undefined");
      updateLogItem(id, {
        status: "error",
        description:
          "Cloud proving job was failed to start, transfer transaction is cancelled",
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
    console.error("Error in transferToken", error);
    updateLogItem(id, {
      status: "error",
      description: String(error) ?? "Error while transferring token",
      date: new Date(),
    });
    return {
      success: false,
      error: String(error) ?? "Error while transferring token",
    };
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
