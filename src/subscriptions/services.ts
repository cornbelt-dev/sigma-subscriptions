import { AddressType, Amount, Box, ErgoAddress, Network } from "@fleet-sdk/core";
import { Contract, GetContractAddress } from "./contracts";
import * as CONSTANTS from "./constants";
import * as UTIL from "./util";
import { debug } from "console";

// Service Config
export async function getServiceConfig(API_URL: string, serviceNFT: string): Promise<Box<Amount> | undefined> {
    const boxes = await fetch(API_URL + 'boxes/unspent/byTokenId/' + serviceNFT).then(resp => resp.json());
    let configBox: Box<Amount> | undefined = boxes.items.find((b: Box<Amount>) => b.assets.find(a => a.tokenId == serviceNFT));
    if (configBox) {
        configBox.additionalRegisters = UTIL.parseAdditionalRegisters(configBox.additionalRegisters);
    }
    return configBox;
}

export async function getServiceConfigsByAddress(networkType: Network, API_URL: string, serviceAddress: string): Promise<Box<Amount>[]> {
    
    const serviceConfigAddress = ErgoAddress.fromBase58(GetContractAddress(Contract.CONFIG, networkType));
    let configBoxes: Box<Amount>[] = [];
    const boxes = await fetch(API_URL + 'boxes/unspent/byAddress/' + serviceConfigAddress).then(resp => resp.json());
    if (boxes) {
        boxes.items.forEach((b: Box<Amount>) =>
            b.additionalRegisters = UTIL.parseAdditionalRegisters(b.additionalRegisters)
        );
        configBoxes = boxes.items.filter((b: Box<Amount>) => ErgoAddress.fromPublicKey(b.additionalRegisters.R4!.substring(4), networkType).toString() == serviceAddress);
    }
    return configBoxes;
}

// Subscribe
export async function getSubscribeBoxes(networkType: Network, API_URL: string, serviceTokenId: string): Promise<Box<Amount>[]> {
    
    const subscribeAddress = ErgoAddress.fromBase58(GetContractAddress(Contract.SUBSCRIBE, networkType));

    const boxes = await fetch(API_URL + 'boxes/unspent/byAddress/' + subscribeAddress).then(resp => resp.json());
    let subscribeBoxes: Box<Amount>[] = boxes.items.filter((b: Box<Amount>) => b.assets.find(a => a.tokenId == serviceTokenId));
    subscribeBoxes.forEach((b: Box<Amount>) =>
        b.additionalRegisters = UTIL.parseAdditionalRegisters(b.additionalRegisters)
    );
    return subscribeBoxes;
}

export async function getSubscribeBoxesByServiceConfig(networkType: Network, API_URL: string, serviceConfigNFT: string): Promise<Box<Amount>[]> {
    
    let subscribeBoxes: Box<Amount>[] = [];
    const subscribeAddress = ErgoAddress.fromBase58(GetContractAddress(Contract.SUBSCRIBE, networkType));

    const boxes = await fetch(API_URL + 'boxes/unspent/byAddress/' + subscribeAddress).then(resp => resp.json());
    if (boxes) {
        boxes.items.forEach((b: Box<Amount>) =>
            b.additionalRegisters = UTIL.parseAdditionalRegisters(b.additionalRegisters)
        );
        subscribeBoxes = boxes.items.filter((b: Box<Amount>) => b.additionalRegisters.R7?.substring(4) == serviceConfigNFT);
    }
    return subscribeBoxes;
}

export async function getSubscribeBox(networkType: Network, API_URL: string, serviceTokenId: string): Promise<Box<Amount> | undefined> {
    
    const subscribeAddress = ErgoAddress.fromBase58(GetContractAddress(Contract.SUBSCRIBE, networkType));

    const boxes = await fetch(API_URL + 'boxes/unspent/byAddress/' + subscribeAddress).then(resp => resp.json());
    let subscribeBox: Box<Amount> | undefined = boxes.items.find((b: Box<Amount>) => b.assets.find(a => a.tokenId == serviceTokenId));
    if (subscribeBox){
        subscribeBox.additionalRegisters = UTIL.parseAdditionalRegisters(subscribeBox.additionalRegisters);
    }
    return subscribeBox;
}
    
// Subscriptions
export async function getSubsciptionBoxes(networkType: Network, API_URL: string, serviceTokenId: string): Promise<Box<Amount>[] | []> {

    const subscribeAddressErgoTree = ErgoAddress.fromBase58(GetContractAddress(Contract.SUBSCRIBE, networkType)).ergoTree;

    const boxes = await fetch(API_URL + 'boxes/unspent/byTokenId/' + serviceTokenId).then(resp => resp.json());
    const subsciptionBoxes: Box<Amount>[] = boxes.items.filter((b: Box<Amount>) => ErgoAddress.fromErgoTree(b.ergoTree).type != AddressType.P2PK && b.ergoTree != subscribeAddressErgoTree);
    subsciptionBoxes.forEach((b: Box<Amount>) => 
        b.additionalRegisters = UTIL.parseAdditionalRegisters(b.additionalRegisters)
    );
    return subsciptionBoxes;
}

export async function getSubsciptionBoxBySubsciptionTokenId(API_URL: string, subscriptionTokenId: string): Promise<Box<Amount> | undefined> {
    const boxes = await fetch(API_URL + 'boxes/unspent/byTokenId/' + subscriptionTokenId).then(resp => resp.json());
    let subscriptionBox: Box<Amount> = boxes.items.find((b: Box<Amount>) => ErgoAddress.fromErgoTree(b.ergoTree).type != AddressType.P2PK);   
    if (subscriptionBox) {
        subscriptionBox.additionalRegisters = UTIL.parseAdditionalRegisters(subscriptionBox.additionalRegisters);
    }  
    return subscriptionBox;
}

export async function getSubsciptionBoxByBoxId(API_URL: string, boxId: string): Promise<Box<Amount> | undefined> {
    const subscriptionBox: Box<Amount> = await fetch(API_URL + 'boxes/' + boxId).then(resp => resp.json());
    if (subscriptionBox) {
        subscriptionBox.additionalRegisters = UTIL.parseAdditionalRegisters(subscriptionBox.additionalRegisters);
    }
    return subscriptionBox;
}

export async function getSubsciptionBoxesByBoxId(API_URL: string, boxIds: string[]): Promise<Box<Amount>[]> {
    const subsciptionBoxes: Box<Amount>[] = [];
    for (const boxId of boxIds) {
        const subscriptionBox: Box<Amount> = await fetch(API_URL + 'boxes/' + boxId).then(resp => resp.json());
        if (subscriptionBox) {
            subscriptionBox.additionalRegisters = UTIL.parseAdditionalRegisters(subscriptionBox.additionalRegisters);
            subsciptionBoxes.push(subscriptionBox);
        }
    }
    return subsciptionBoxes;
}

export async function getWalletAddressBySubsciptionTokenId(networkType: Network, API_URL: string, subscriptionTokenId: string): Promise<string | undefined> {
    const boxes = await fetch(API_URL + 'boxes/unspent/byTokenId/' + subscriptionTokenId).then(resp => resp.json());
    let subscriptionBox: Box<Amount> = boxes.items.find((b: Box<Amount>) => ErgoAddress.fromErgoTree(b.ergoTree).type == AddressType.P2PK);   
    if (subscriptionBox) {
        subscriptionBox.additionalRegisters = UTIL.parseAdditionalRegisters(subscriptionBox.additionalRegisters);
        return ErgoAddress.fromErgoTree(subscriptionBox.ergoTree, networkType).toString();
    }  
    return undefined;
}

// Dev
export async function getDevConfigBox(newtorkType: Network, API_URL: string): Promise<Box<Amount> | undefined> {
    const devNFT = newtorkType == Network.Mainnet ? CONSTANTS.DEV_NFT : CONSTANTS.TESTNET_DEV_NFT;
    const boxes = await fetch(API_URL + 'boxes/unspent/byTokenId/' + devNFT).then(resp => resp.json());
    const configBox = boxes.items.find((b: Box<Amount>) => ErgoAddress.fromErgoTree(b.ergoTree).type == AddressType.P2S);
    if (configBox) {
        configBox.additionalRegisters = UTIL.parseAdditionalRegisters(configBox.additionalRegisters);
        return configBox;
    }
    return undefined;
}
