"use client";

import { TimelineItem } from "../components/ui/timeline";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";
const chain = process.env.NEXT_PUBLIC_CHAIN;
const WALLET = process.env.NEXT_PUBLIC_WALLET;
const MINT_FEE = 1e8;
const ISSUE_FEE = 1e9;

export async function mintToken(params: {
  tokenPublicKey: string;
  adminContractPublicKey: string;
  adminPublicKey: string;
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
  useHardcodedWallet: boolean;
  sequence: number;
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
  if (DEBUG) console.log("mint token", params);
  const {
    tokenPublicKey,
    adminPublicKey,
    symbol,
    lib,
    updateLogItem,
    nonce,
    id,
    useHardcodedWallet,
    sequence,
  } = params;
  try {
    const mina = (window as any).mina;
    if ((mina === undefined || mina?.isAuro !== true) && !useHardcodedWallet) {
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

    if (sequence === 0) {
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
    }
    const isNewAccount = Mina.hasAccount(to, tokenId) === false;
    const requiredBalance = isNewAccount ? 1 : 0 + fee / 1_000_000_000;
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
        await zkToken.mint(to, amount);
      }
    );
    if (useHardcodedWallet) tx.sign([adminPrivateKey]);

    console.timeEnd("prepared tx");
    console.timeEnd("ready to sign");
    updateLogItem(id, {
      status: "waiting",
      description: "Proving transaction...",
      date: new Date(),
    });
    const proveTime = Date.now();
    console.time("proved");
    await tx.prove();
    console.timeEnd("proved");
    updateLogItem(id, {
      status: "waiting",
      description: `Transaction proven in ${Math.floor(
        (Date.now() - proveTime) / 1000
      )} sec ${(Date.now() - proveTime) % 1000} ms.\n${
        useHardcodedWallet
          ? "Sending transaction..."
          : `Please sign transaction setting nonce ${nonce}\n in Auro Wallet advanced settings`
      }`,
      date: new Date(),
    });
    const transaction = tx.toJSON();
    const payload = {
      transaction,
      feePayer: {
        fee: fee,
        memo: memo,
        nonce,
      },
    };

    let hash: string | undefined = undefined;

    if (!useHardcodedWallet) {
      const txResult = await mina?.sendTransaction(payload);
      if (DEBUG) console.log("Transaction result", txResult);
      hash = txResult?.hash;
      updateLogItem(id, {
        status: hash ? "waiting" : "error",
        description: `Mint transaction sent with status ${txResult?.status}`,
        date: new Date(),
      });
    } else {
      const txSent = await tx.send();
      hash = txSent.hash;
      const status = txSent.status;
      updateLogItem(id, {
        status: status === "pending" ? "waiting" : "error",
        description: `Mint transaction sent with status ${status}`,
        date: new Date(),
      });
    }

    return {
      success: true,
      hash,
    };
  } catch (error) {
    console.error("Error in mintToken", error);
    updateLogItem(id, {
      status: "error",
      description: String(error) ?? "Error while minting token",
      date: new Date(),
    });
    return {
      success: false,
      error: String(error) ?? "Error while minting token",
    };
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
