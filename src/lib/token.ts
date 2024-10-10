/*
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
*/

export interface TokenInfo {
  symbol: string;
  name: string | undefined;
  description: string | undefined;
  image: string | undefined;
  website: string | undefined;
  telegram: string | undefined;
  twitter: string | undefined;
  discord: string | undefined;
  tokenContractCode: string | undefined;
  adminContractsCode: string[] | undefined;
  data: object | undefined;
  isMDA: boolean | undefined;
}

export interface TokenState {
  tokenContractAddress: string;
  adminContractAddress: string;
  adminAddress: string;
  totalSupply: number;
  isPaused: boolean;
  decimals: number;
}

export interface DeployedTokenInfo extends TokenInfo, TokenState {}

export interface TokenDeployParams {
  tokenPrivateKey: string;
  adminContractPrivateKey: string;
  tokenPublicKey: string;
  adminContractPublicKey: string;
}
