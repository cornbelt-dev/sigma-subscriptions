
// Endpoints
export const EXPLORER_API_URL = "https://api.ergoplatform.com/api/v1/";

//export const TESTNET_EXPLORER_API_URL = "https://api-testnet.ergoplatform.com/api/v1/";
export const TESTNET_EXPLORER_API_URL = "https://tn-ergo-explorer.anetabtc.io/api/v1/";

// Dev Settings
export const DEV_NFT = "bcb2fcee4773f28e7495abfe780628561e8fc57f2bb0f4626189a38c5e9cab74";
export const TESTNET_DEV_NFT = "bcb2fcee4773f28e7495abfe780628561e8fc57f2bb0f4626189a38c5e9cab74";

export const ONE_ERG_IN_NANOERG = 1000000000;

export const MILISECONDS_IN_SECOND = 1000;

export enum LENGTH_IN_MILISECONDS {
    MINUTE = '60000',
    MINUTES_5 = '300000',
    MINUTES_10 = '600000',
    MINUTES_15 = '900000',
    MINUTES_30 = '1800000',
    HOUR = '3600000',            
    DAY = '86400000',        
    WEEK = '604800000',
    MONTH = '2592000000',
    YEAR = '31536000000'
}

export const KNOWN_TOKENS = [
    ["ERG", "ERG" ],
    ["ERG", "0000000000000000000000000000000000000000000000000000000000000000" ],
    ["SIGRSV", "003bd19d0187117f130b62e1bcab0939929ff5c7709f843c5c4dd158949285d0" ],
    [ "SIGUSD", "03faf2cb329f2e90d6d23b58d91bbb6c046aa143261cc21f52fbe2824bfcbf04" ],
    [ "NETA", "472c3d4ecaa08fb7392ff041ee2e6af75f4a558810a74b28600549d5392810e8" ],
    [ "ERGOPAD", "d71693c49a84fbbecd4908c94813b46514b18b67a99952dc1e6e4791556de413" ],
    [ "PAIDEIA", "1fd6e032e8476c4aa54c18c1a308dce83940e8f4a28f576440513ed7326ad489" ]
]