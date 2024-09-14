"use server";

const BLOCKBERRY_API = process.env.BLOCKBERRY_API;

export async function getTxStatus(params: { hash: string }): Promise<any> {
  const { hash } = params;
  if (!BLOCKBERRY_API) {
    console.error("BLOCKBERRY_API is undefined");
    return undefined;
  }
  const options = {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-api-key": BLOCKBERRY_API,
    },
  };
  try {
    const response = await fetch(
      `https://api.blockberry.one/mina-devnet/v1/zkapps/txs/${hash}`,
      options
    );
    if (response.ok) {
      const result = await response.json();
      return result;
    } else {
      console.error("getTxStatus error while getting tx status - not ok", {
        hash,
        text: response.statusText,
        status: response.status,
      });
      return undefined;
    }
  } catch (err) {
    console.error(
      "getTxStatus error while getting tx status - catch",
      hash,
      err
    );
    return undefined;
  }
}
