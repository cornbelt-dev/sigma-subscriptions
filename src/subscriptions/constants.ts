
// Endpoints
export const EXPLORER_API_URL = "https://api.ergoplatform.com/api/v1/";

//export const TESTNET_EXPLORER_API_URL = "https://api-testnet.ergoplatform.com/api/v1/";
export const TESTNET_EXPLORER_API_URL = "https://tn-ergo-explorer.anetabtc.io/api/v1/";

// Dev Settings
export const DEV_NFT = "bcb2fcee4773f28e7495abfe780628561e8fc57f2bb0f4626189a38c5e9cab74";
export const TESTNET_DEV_NFT = "bcb2fcee4773f28e7495abfe780628561e8fc57f2bb0f4626189a38c5e9cab74";

export const ONE_ERG_IN_NANOERG = 1000000000;

export enum LENGTH_IN_MILISECONDS {
    MINUTE = '60000',
    MINUTES_5 = '300000',
    MINUTES_10 = '600000',
    MINUTES_15 = '900000',
    MINUTES_30 = '1800000',
    HOUR = '3600000',            
    DAY = '86400000',        
    WEEK = '604800000',
    MONTH = '2629743000',
    YEAR = '31556926000'
}