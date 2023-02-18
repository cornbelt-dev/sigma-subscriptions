import { ErgoAddress, Network, SAFE_MIN_BOX_VALUE } from "@fleet-sdk/core";
import { Buffer } from 'buffer';

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