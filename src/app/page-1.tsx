"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Code, Zap, DollarSign } from "lucide-react";

export default function LaunchTokenPageComponent() {
  const [tokenImage, setTokenImage] = useState<string | null>(null);

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
              onClick={() => document.getElementById("'token-image'")?.click()}
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
          />
        </div>

        <div>
          <Label htmlFor="token-symbol">Token Symbol (max 6 characters)</Label>
          <Input
            id="token-symbol"
            placeholder="Enter token symbol"
            className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
          />
        </div>

        <div>
          <Label htmlFor="token-description">Token Description</Label>
          <Textarea
            id="token-description"
            placeholder="Enter token description"
            className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
          />
        </div>

        <div>
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            placeholder="Optional"
            className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
          />
        </div>

        <div>
          <Label htmlFor="telegram">Telegram</Label>
          <Input
            id="telegram"
            placeholder="Optional"
            className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
          />
        </div>

        <div>
          <Label htmlFor="twitter">Twitter</Label>
          <Input
            id="twitter"
            placeholder="Optional"
            className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
          />
        </div>

        <div>
          <Label htmlFor="discord">Discord</Label>
          <Input
            id="discord"
            placeholder="Optional"
            className="mt-1 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
          />
        </div>

        <div>
          <Label htmlFor="initial-mint">Initial Mint Address</Label>
          <div className="relative mt-1">
            <Input
              id="initial-mint"
              placeholder="Optional. Enter the amount"
              className="pr-16 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
            />
          </div>
          <div className="relative mt-1">
            <Input
              id="initial-mint"
              placeholder="Optional. Enter the address (B62...)"
              className="pr-16 bg-gray-800 border-[#F15B22] focus:ring-[#F15B22]"
            />
          </div>
          <p className="text-sm text-[#F9ECDE] mt-1">
            Mint your token to this address immediately after issue
          </p>
        </div>

        <Button className="w-full bg-[#F15B22] hover:bg-[#d14d1d] text-white">
          Issue Token
        </Button>
      </div>
    </div>
  );
}
