"use server";
import Arweave from "arweave";
const ARWEAVE_KEY_STRING = process.env.ARWEAVE_KEY_STRING;
const ARWEAVE_TEST = process.env.ARWEAVE_TEST;

export async function arweaveTxStatus(hash: string): Promise<{
  success: boolean;
  data?: any;
  error?: any;
  url: string;
}> {
  if (ARWEAVE_KEY_STRING === undefined) {
    console.error("ARWEAVE_KEY_STRING is undefined");
    return {
      success: false,
      error: "ARWEAVE_KEY_STRING is undefined",
      url: ArweaveService.hashToUrl(hash),
    };
  }
  if (ARWEAVE_TEST === "true") {
    return {
      success: true,
      data: {
        status: 200,
        confirmed: {
          block_height: 1505770,
          block_indep_hash:
            "kJv_3rXKAwia0AEffu6HwkFii2u5-hyiFgJF1Bu6hq2ehYWMlF3bTabMCrjqL3yE",
          number_of_confirmations: 1,
        },
      },
      url: "https://arweave.net/WYqJVOIBqnVmOzAdlHJ5NE7K6WJnzDWARlxA4iSt11I",
    };
  }
  const arweave = new ArweaveService(ARWEAVE_KEY_STRING);
  return {
    ...(await arweave.status(hash)),
    url: ArweaveService.hashToUrl(hash),
  };
}

export async function pinStringToArweave(
  data: string
): Promise<string | undefined> {
  if (ARWEAVE_KEY_STRING === undefined) {
    console.error("ARWEAVE_KEY_STRING is undefined");
    return undefined;
  }

  const arweave = new ArweaveService(
    ARWEAVE_TEST === "true" ? "" : ARWEAVE_KEY_STRING
  );

  const hash = await arweave.pinString({
    data,
    waitForConfirmation: false,
  });
  if (hash === undefined) {
    console.error(`Arweave pin failed`);
    return undefined;
  }
  console.log("url:", ArweaveService.hashToUrl(hash));
  return hash;
}

export async function pinImageToArweave(
  file: any // TODO: type
): Promise<string | undefined> {
  if (ARWEAVE_KEY_STRING === undefined) {
    console.error("ARWEAVE_KEY_STRING is undefined");
    return undefined;
  }

  const arweave = new ArweaveService(ARWEAVE_KEY_STRING);
  // TODO: upload image to arweave
  /*
    const size = (await fs.stat(image)).size;
    const data = await fs.readFile(image);
    const hash = await arweave.pinFile({
      data,
      filename: path.basename(image),
      size,
      mimeType: "image/jpeg",
      waitForConfirmation: false,
    });
    if (hash === undefined) throw new Error(`Arweave pin failed`);
    console.log("url:", arweave.hashToUrl(hash));
    return hash;
    */
  return undefined;
}

class ArweaveService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private key: any;
  arweave: Arweave;

  constructor(key: string | object) {
    if (typeof key === "string") {
      if (key === "") this.key = { test: true };
      else this.key = JSON.parse(key);
    } else {
      this.key = key;
    }
    this.arweave = Arweave.init({
      host: "arweave.net",
      port: 443,
      protocol: "https",
    });
  }

  public static hashToUrl(hash: string): string {
    return `https://arweave.net/${hash}`;
  }

  public async pinString(params: {
    data: string;
    waitForConfirmation?: boolean;
  }): Promise<string | undefined> {
    const { data, waitForConfirmation } = params;
    try {
      if (this.key === undefined) {
        console.log("no key");
        return undefined;
      }
      if (this.key?.test === true)
        return "DE6IatWeT6V6uhmKIVAcGU4mrGVInNkhPM9-A1X_wA4";
      const address = await this.arweave.wallets.jwkToAddress(this.key);
      console.log("address", address);
      const balance = await this.arweave.wallets.getBalance(address);
      if (parseInt(balance) === 0) {
        console.log("no balance");
        return undefined;
      }

      const transaction = await this.arweave.createTransaction(
        {
          data: Buffer.from(data, "utf8"),
        },
        this.key
      );
      transaction.addTag("Content-Type", "application/json");
      await this.arweave.transactions.sign(transaction, this.key);

      const uploader = await this.arweave.transactions.getUploader(transaction);

      while (!uploader.isComplete) {
        await uploader.uploadChunk();
        console.log(
          `${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`
        );
      }
      //console.log("transaction", transaction);
      const hash = transaction.id;
      console.log("arweave hash", hash);
      if (waitForConfirmation === true) await this.wait({ hash }); // wait for confirmation, can take a while

      return hash;
    } catch (err) {
      console.error(err);
      return undefined;
    }
  }

  public async pinFile(params: {
    data: Buffer;
    filename: string;
    size: number;
    mimeType: string;
    // eslint-disable-next-line @typescript-eslint/no-inferrable-types
    waitForConfirmation?: boolean;
  }): Promise<string | undefined> {
    const { data, filename, size, mimeType, waitForConfirmation } = params;
    try {
      if (this.key === undefined) return undefined;
      if (this.key?.test === true)
        return "DE6IatWeT6V6uhmKIVAcGU4mrGVInNkhPM9-A1X_wA4";
      const address = await this.arweave.wallets.jwkToAddress(this.key);
      const balance = await this.arweave.wallets.getBalance(address);
      if (parseInt(balance) === 0) return undefined;

      const transaction = await this.arweave.createTransaction(
        { data: data },
        this.key
      );
      transaction.addTag("Content-Type", mimeType);
      transaction.addTag("knownLength", size.toString());
      transaction.addTag("filename", filename);
      await this.arweave.transactions.sign(transaction, this.key);
      const uploader = await this.arweave.transactions.getUploader(transaction);

      while (!uploader.isComplete) {
        await uploader.uploadChunk();
        console.log(
          `${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`
        );
      }
      //console.log("transaction", transaction);
      const hash = transaction.id;
      console.log("arweave hash", hash);
      if (waitForConfirmation === true) await this.wait({ hash }); // wait for confirmation, can take a while
      return hash;
    } catch (err) {
      console.error(err);
      return undefined;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async status(hash: string) {
    try {
      const status = await this.arweave.transactions.getStatus(hash);
      return { success: true, data: status };
    } catch (err) {
      console.error(err);
      return { success: false, error: err };
    }
  }

  public async wait(data: {
    hash: string;
    maxAttempts?: number;
    interval?: number;
    maxErrors?: number;
  }): Promise<{
    success: boolean;
    error?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result?: any;
  }> {
    const maxAttempts = data?.maxAttempts ?? 360;
    const interval = data?.interval ?? 5000;
    const maxErrors = data?.maxErrors ?? 10;
    const errorDelay = 30000; // 30 seconds
    let attempts = 0;
    let errors = 0;
    while (attempts < maxAttempts) {
      const result = await this.status(data.hash);
      if (result.success === false) {
        errors++;
        if (errors > maxErrors) {
          return {
            success: false,
            error: "Too many network errors",
            result: undefined,
          };
        }
        await sleep(errorDelay * errors);
      } else {
        if (result.data?.confirmed?.block_height !== undefined) {
          return {
            success: result.success,
            result: result.data,
          };
        }
        await sleep(interval);
      }
      attempts++;
    }
    return {
      success: false,
      error: "Timeout",
      result: undefined,
    };
  }

  public async balance(): Promise<string | undefined> {
    const address = await this.arweave.wallets.jwkToAddress(this.key);
    const balance = await this.arweave.wallets.getBalance(address);
    const ar = this.arweave.ar.winstonToAr(balance);
    return ar;
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
