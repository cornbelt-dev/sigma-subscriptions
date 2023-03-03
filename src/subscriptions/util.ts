import { Amount, ErgoAddress, Network, SAFE_MIN_BOX_VALUE, Box, SParse } from "@fleet-sdk/core";
import { Buffer } from 'buffer';
import { ServiceConfig, SigmaSubscriptionsAuthResponse, Subscription } from "./types";

export const COLL_BYTE_PREFIX = "0e";
export const MIN_COLL_LENGTH = 4;

export function ensureSafeValueString(value: string) {
    return (BigInt(value) < SAFE_MIN_BOX_VALUE ? BigInt(value) : SAFE_MIN_BOX_VALUE).toString();
}

export function getErgoTree(ergoAddress: ErgoAddress) {
    return ergoAddress.ergoTree.substring(2);
}

export function parseAdditionalRegisters(json: { [s: string]: any; } | ArrayLike<unknown>) {
    let reg: any = {}
    Object.entries(json).forEach(([key, value]) => {
        if (isDict(value)) {
            reg[key] = value["serializedValue"];
        } else {
            reg[key] = value;
        }
    });
    return reg;
}

export function isDict(i: unknown) {
    return typeof i === 'object' && i !== null && !(i instanceof Array) && !(i instanceof Date);
}


export function decodeColl(input: string, encoding: BufferEncoding = "utf8"): string | undefined {
    if (!isColl(input)) {
        return;
    }

    return decodeConst(input, COLL_BYTE_PREFIX.length, encoding);
}

export function isColl(input: string): boolean {
    return input.startsWith(COLL_BYTE_PREFIX) && input.length >= MIN_COLL_LENGTH;
}

function decodeConst(
    input: string,
    position: number,
    encoding: BufferEncoding
): string | undefined {
    const [start, length] = getCollSpan(input, position);
    if (!length) {
        return;
    }

    return Buffer.from(input.slice(start, start + length), "hex").toString(encoding);
}

function getCollSpan(input: string, start: number): [start: number, length: number | undefined] {
    return decodeVlq(input, start);
}

function decodeVlq(input: string, position: number): [cursor: number, value: number | undefined] {
    let len = 0;
    let readNext = true;
    do {
        const lenChunk = parseInt(input.slice(position, (position += 2)), 16);
        if (isNaN(lenChunk)) {
            return [position, undefined];
        }

        readNext = (lenChunk & 0x80) !== 0;
        len = 128 * len + (lenChunk & 0x7f);
    } while (readNext);

    return [position, len * 2];
}

export function boxToConfig(box: Box<Amount>, networkType: Network): ServiceConfig {
    const serviceConfig: ServiceConfig = {
        configNFT: box.assets[0].tokenId,
        address: ErgoAddress.fromPublicKey(box.additionalRegisters.R4!.substring(4), networkType).toString(),
        fee: box.additionalRegisters.R6 ? BigInt(SParse(box.additionalRegisters.R6)) : 0n,
        length: box.additionalRegisters.R7 ? BigInt(SParse(box.additionalRegisters.R7)) : 0n,
        name: box.additionalRegisters.R8 ? decodeColl(box.additionalRegisters.R8) ?? '' : '',
        description: box.additionalRegisters.R9 ? decodeColl(box.additionalRegisters.R9) ?? '' : '',
    }
    return serviceConfig;
}

export function boxToSubscription(box: Box<Amount>, walletAddress: string, subscriptionTokenId: string, serviceTokenId: string, config: ServiceConfig): Subscription {
    
    const now = new Date();
    let percentRemaining = 0;
    const serviceStart = box.additionalRegisters.R5 ? Number(SParse(box.additionalRegisters.R5)) : undefined;
    const serviceEnd = box.additionalRegisters.R6 ? Number(SParse(box.additionalRegisters.R6)) : undefined;
    if (serviceStart && serviceEnd) {
        percentRemaining = (serviceEnd - now.getTime()) / (serviceEnd - serviceStart);
    }
    const subsciption: Subscription = { 
        boxId: box.boxId,
        walletAddress: walletAddress,
        tokenId: subscriptionTokenId,
        fee: BigInt(box.value), 
        startDate: serviceStart ? new Date(serviceStart) : undefined, 
        endDate: serviceEnd ? new Date(serviceEnd) : undefined,        
        suggestRenewal: percentRemaining < 0.25,
        expired: percentRemaining <= 0,
        service: { 
            config: config,
            tokenId: serviceTokenId
        }
    }
    return subsciption;
}

export function boxToAuthReponse(box: Box<Amount>): SigmaSubscriptionsAuthResponse {

    let response: SigmaSubscriptionsAuthResponse = { auth: false, suggestRenewal: false }

    const serviceStart = box.additionalRegisters.R5 ? Number(SParse(box.additionalRegisters.R5)) : undefined;
    const serviceEnd = box.additionalRegisters.R6 ? Number(SParse(box.additionalRegisters.R6)) : undefined;
    if (serviceEnd && serviceStart) {
        const now = new Date();
        const percentRemaining = (serviceEnd - now.getTime()) / (serviceEnd - serviceStart);
        response.serviceEndDate = new Date(serviceEnd);
        response.auth = response.serviceEndDate > now;
        response.suggestRenewal = percentRemaining < 0.25 && percentRemaining > 0;
        response.subscriptionToken = box.assets[1]?.tokenId;
    }
    return response;
}