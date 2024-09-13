"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Code, Zap, DollarSign } from "lucide-react";
import {
  arweaveTxStatus,
  pinImageToArweave,
  pinStringToArweave,
} from "@/lib/arweave";
import { stat } from "fs";

export default function LaunchTokenPageComponent() {
  const [tokenImage, setTokenImage] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState<string>("");
  const [tokenSymbol, setTokenSymbol] = useState<string>("");
  const [tokenDescription, setTokenDescription] = useState<string>("");
  const [website, setWebsite] = useState<string>("");
  const [telegram, setTelegram] = useState<string>("");
  const [twitter, setTwitter] = useState<string>("");
  const [discord, setDiscord] = useState<string>("");
  const [initialMintAmount, setInitialMintAmount] = useState<string>("");
  const [initialMintAddress, setInitialMintAddress] = useState<string>("");
  const [arweaveStatus, setArweaveStatus] = useState<string>("");
  const [arweaveLink, setArweaveLink] = useState<string>("");
  const [deployStatus, setDeployStatus] = useState<string>("");
  const [mintStatus, setMintStatus] = useState<string>("");
  const [issuing, setIssuing] = useState<boolean>(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setTokenImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  async function handleIssueToken() {
    setIssuing(true);
    console.log("Token Image:", tokenImage);
    console.log("Token Name:", tokenName);
    console.log("Token Symbol:", tokenSymbol);
    console.log("Token Description:", tokenDescription);
    console.log("Website:", website);
    console.log("Telegram:", telegram);
    console.log("Twitter:", twitter);
    console.log("Discord:", discord);
    console.log("Initial Mint Amount:", initialMintAmount);
    console.log("Initial Mint Address:", initialMintAddress);

    //TODO: Pin token image to Arweave
    /*
    const json = {
      symbol: "M-COIN",
      image: imageUrl,
      issuer: "https://zkok.io",
      tokenContractCode:
        "https://github.com/MinaFoundation/mina-fungible-token/blob/main/FungibleToken.ts",
      adminContractsCode: [
        "https://github.com/MinaFoundation/mina-fungible-token/blob/main/FungibleTokenAdmin.ts",
      ],
    };
    */
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
    const hash = await pinStringToArweave(JSON.stringify(json, null, 2));
    if (!hash) {
      setArweaveStatus("Failed to pin data to Arweave");
      setIssuing(false);
      return;
    }
    setArweaveStatus(hash);
    setArweaveLink(
      "Waiting for Arweave transaction to be mined (can take few minutes)..."
    );
    let status = await arweaveTxStatus(hash);
    /*
{
    "success": true,
    "data": {
        "status": 200,
        "confirmed": {
            "block_height": 1505770,
            "block_indep_hash": "kJv_3rXKAwia0AEffu6HwkFii2u5-hyiFgJF1Bu6hq2ehYWMlF3bTabMCrjqL3yE",
            "number_of_confirmations": 1
        }
    },
    "url": "https://arweave.net/WYqJVOIBqnVmOzAdlHJ5NE7K6WJnzDWARlxA4iSt11I"
}
    */
    if (!status.success) {
      setArweaveStatus("Failed to pin data to Arweave");
      setArweaveLink("");
      setIssuing(false);
      return;
    }

    while (status.success && !status.data?.confirmed) {
      console.log(
        "Waiting for Arweave transaction to be mined...",
        status?.data?.confirmed,
        status
      );
      await sleep(5000);
      status = await arweaveTxStatus(hash);
    }
    console.log("Arweave transaction mined", status);
    if (
      !status.success ||
      !status.data?.confirmed ||
      !status.data?.confirmed?.number_of_confirmations ||
      Number(status.data?.confirmed?.number_of_confirmations) < 1
    ) {
      setArweaveStatus("Failed to pin data to Arweave");
      setArweaveLink("");
      setIssuing(false);
      return;
    }

    setArweaveLink(status.url);
    setIssuing(false);
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8">
      <h1 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-[#F15B22] to-[#F9ECDE] text-transparent bg-clip-text">
        Launch your token on zkCloudWorker
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

      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <Label htmlFor="token-image">Token Image</Label>
          <div className="mt-1 flex items-center space-x-4">
            <div className="w-24 h-24 border-2 border-dashed border-[#F15B22] flex items-center justify-center rounded-lg overflow-hidden">
              {tokenImage ? (
                <img
                  src={tokenImage}
                  alt="Token"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[#F15B22]">Upload</span>
              )}
            </div>
            <Input
              id="token-image"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <Button
              onClick={() => document.getElementById("token-image")?.click()}
              className="bg-[#F15B22] hover:bg-[#d14d1d] text-white"
            >
              Choose File
            </Button>
          </div>
          <p className="text-sm text-[#F9ECDE] mt-1">
            JPEG/PNG/WEBP/GIF (Less than 4MB)
          </p>
        </div>

        <div>
          <Label htmlFor="token-name">Token Name</Label>
          <Input
            id="token-name"
            placeholder="Enter token name"
            className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="token-symbol">Token Symbol (max 6 characters)</Label>
          <Input
            id="token-symbol"
            placeholder="Enter token symbol"
            className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
            value={tokenSymbol}
            onChange={(e) => setTokenSymbol(e.target.value)}
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

        <div>
          <Label htmlFor="initial-mint">Initial Mint</Label>
          <div className="relative mt-1">
            <Input
              id="initial-mint-amount"
              placeholder="Optional. Enter the amount"
              className="pr-16 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
              value={initialMintAmount}
              onChange={(e) => setInitialMintAmount(e.target.value)}
            />
          </div>
          <div className="relative mt-1">
            <Input
              id="initial-mint-address"
              placeholder="Optional. Enter the address (B62...)"
              className="pr-16 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
              value={initialMintAddress}
              onChange={(e) => setInitialMintAddress(e.target.value)}
            />
          </div>
          <p className="text-sm text-[#F9ECDE] mt-1">
            Mint your token to this address immediately after issue
          </p>
        </div>

        <Button
          className="w-full bg-[#F15B22] hover:bg-[#d14d1d] text-white"
          onClick={handleIssueToken}
          disabled={issuing}
        >
          Issue Token
        </Button>
        <div>
          <p className="text-sm text-[#F9ECDE] mt-1">
            Arweave hash: {arweaveStatus}
          </p>
        </div>
        <div>
          <p className="text-sm text-[#F9ECDE] mt-1">
            Arweave link: {arweaveLink}
          </p>
        </div>
        <div>
          <p className="text-sm text-[#F9ECDE] mt-1">
            Deploy hash: {deployStatus}
          </p>
        </div>
        <div>
          <p className="text-sm text-[#F9ECDE] mt-1">Mint hash: {mintStatus}</p>
        </div>
      </div>
    </div>
  );
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
