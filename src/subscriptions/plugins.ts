import { Box, first, OneOrMore, TokenAmount } from "@fleet-sdk/common";
import {
    Amount,
    ErgoAddress,
    FleetPlugin,
    OutputBuilder,
    SAFE_MIN_BOX_VALUE,
    SByte,
    SColl,
    SConstant,
    SGroupElement,
    SLong,
    SParse,
    SSigmaProp,
    Network,
    TokensCollection
} from "@fleet-sdk/core";
import * as CONSTANTS from "./constants";
import * as UTIL from "./util";
import { stringToBytes } from "@scure/base";
import { blake2b } from "@noble/hashes/blake2b";
import { hexToBytes } from "@noble/hashes/utils";
import { Contract, GetContractAddress } from "./contracts";
import { ServiceConfig } from "./types";
const BLAKE_256_HASH_LENGTH = 32;

export function CreateServiceConfig(networkType: Network, config: ServiceConfig): FleetPlugin {

    const serviceAddress = ErgoAddress.fromBase58(config.address);
    const serviceConfigAddress = ErgoAddress.fromBase58(GetContractAddress(Contract.CONFIG, networkType));
    const serviceContractAddress = ErgoAddress.fromBase58(GetContractAddress(Contract.SERVICE, networkType));
    const serviceContractHash = blake2b(hexToBytes(serviceContractAddress.ergoTree), { dkLen: BLAKE_256_HASH_LENGTH });

    return ({ addOutputs }) => {
        addOutputs([
            new OutputBuilder(SAFE_MIN_BOX_VALUE, serviceConfigAddress)
                .mintToken({
                    amount: "1",
                    name: config.name + " Config",
                    decimals: 0,
                    description: config.description
                })
                .setAdditionalRegisters({
                    R4: SConstant(SSigmaProp(SGroupElement(first(serviceAddress.getPublicKeys())))),
                    R5: SConstant(SColl(SByte, serviceContractHash)),             
                    R6: SConstant(SLong(config.fee)),
                    R7: SConstant(SLong(config.length)),
                    R8: SConstant(SColl(SByte, stringToBytes("utf8", config.name))),
                    R9: SConstant(SColl(SByte, stringToBytes("utf8", config.description)))
                })
        ]);
    }
}

export function EditServiceConfig(networkType: Network, config: ServiceConfig, serviceConfigBox: Box<Amount>): FleetPlugin {

    const serviceAddress = ErgoAddress.fromBase58(config.address);
    const serviceConfig = ErgoAddress.fromBase58(GetContractAddress(Contract.CONFIG, networkType));
    const serviceContractAddress = ErgoAddress.fromBase58(GetContractAddress(Contract.SERVICE, networkType));
    const serviceContractHash = blake2b(hexToBytes(serviceContractAddress.ergoTree), { dkLen: BLAKE_256_HASH_LENGTH });
    
    return ({ addInputs, addOutputs }) => {
        addInputs(serviceConfigBox);
        addOutputs([
            new OutputBuilder(SAFE_MIN_BOX_VALUE, serviceConfig)
                .addTokens(serviceConfigBox.assets)
                .setAdditionalRegisters({
                    R4: SConstant(SSigmaProp(SGroupElement(first(serviceAddress.getPublicKeys())))),
                    R5: SConstant(SColl(SByte, serviceContractHash)),
                    R6: SConstant(SLong(config.fee)),
                    R7: SConstant(SLong(config.length)),
                    R8: SConstant(SColl(SByte, stringToBytes("utf8", config.name))),
                    R9: SConstant(SColl(SByte, stringToBytes("utf8", config.description)))
                })
        ]);
    }
}

export function CreateService(networkType: Network,
    inputs: Box<Amount>[],
    serviceConfigBox: Box<Amount>,
    maxSubscriptions?: string): FleetPlugin {
    
    const serviceConfigNFT = serviceConfigBox.assets[0].tokenId;
    const subscribeAddress = ErgoAddress.fromBase58(GetContractAddress(Contract.SUBSCRIBE, networkType));

    // by defualt allow more subscriptions to be issued than people on earth to be safe
    let subscriptions = maxSubscriptions ?? "10000000000";

    const mintTokenId = inputs[0].boxId;

    return ({ addDataInputs, addInputs, addOutputs }) => {
        addDataInputs(serviceConfigBox);
        addInputs(inputs);
        addOutputs([
            new OutputBuilder(SAFE_MIN_BOX_VALUE, subscribeAddress)
                .addTokens({
                    amount: subscriptions,
                    tokenId: mintTokenId
                })
                .setAdditionalRegisters({ // set EIP-004 token standard
                    R4: serviceConfigBox.additionalRegisters.R8,
                    R5: serviceConfigBox.additionalRegisters.R9,
                    R6: SConstant(SColl(SByte, stringToBytes("utf8", "0"))),
                    R7: SConstant(SColl(SByte, serviceConfigNFT))
                })
        ]);
    }
}

export function CreateSubscription(networkType: Network,
    inputs: Box<Amount>[],
    subscribeBox: Box<Amount>,
    serviceConfigBox: Box<Amount>,
    subscriberAddress: ErgoAddress,
    startDate: Date): FleetPlugin {
    
    const serviceConfigNFT = serviceConfigBox.assets[0].tokenId;
    const subscribeAddress = ErgoAddress.fromBase58(GetContractAddress(Contract.SUBSCRIBE, networkType));
    const serviceContractAddress = ErgoAddress.fromBase58(GetContractAddress(Contract.SERVICE, networkType));

    const serviceFee = BigInt(SParse(serviceConfigBox.additionalRegisters.R6!));
    const serviceLength = Number(SParse(serviceConfigBox.additionalRegisters.R7!));
    const serviceTokenName = UTIL.decodeColl(serviceConfigBox.additionalRegisters.R8!);
    const serviceTokenDescription = UTIL.decodeColl(serviceConfigBox.additionalRegisters.R9!);

    // calculate end date based on desired start date
    const serviceStart = startDate.getTime();
    const serviceEnd = new Date(startDate).getTime() + serviceLength;

    // ensure subscription box is first input
    inputs.unshift(subscribeBox);

    const mintTokenId = subscribeBox.boxId;
    const subscribeBoxTokensRemaining = BigInt(subscribeBox.assets[0].amount) - BigInt(1);

    return ({ addDataInputs, addInputs, addOutputs }) => {
        addDataInputs(serviceConfigBox);
        addInputs(inputs);
        addOutputs([
            new OutputBuilder(SAFE_MIN_BOX_VALUE, subscribeAddress)
                .addTokens(
                    { tokenId: subscribeBox.assets[0].tokenId, amount: subscribeBoxTokensRemaining }
                )
                .setAdditionalRegisters(subscribeBox.additionalRegisters),
            new OutputBuilder(SAFE_MIN_BOX_VALUE, subscriberAddress)
                .addTokens({
                    amount: "1",
                    tokenId: mintTokenId
                })
                .setAdditionalRegisters({ // set EIP-004 token standard
                    R4: SConstant(SColl(SByte, stringToBytes("utf8", serviceTokenName + " - Subscription"))),
                    R5: SConstant(SColl(SByte, stringToBytes("utf8", serviceTokenDescription!))),
                    R6: SConstant(SColl(SByte, stringToBytes("utf8", "0")))
                }),
            new OutputBuilder(serviceFee.toString(), serviceContractAddress)
                .addTokens([
                    { tokenId: subscribeBox.assets[0].tokenId, amount: "1" },
                    { tokenId: mintTokenId, amount: "1" }
                ])
                .setAdditionalRegisters({
                    R4: SConstant(SColl(SByte, serviceConfigNFT)),
                    R5: SConstant(SLong(serviceStart)),
                    R6: SConstant(SLong(serviceEnd))
                })
        ]);
    }
}

export function RenewSubscription(networkType: Network,
    inputs: Box<Amount>[],
    subscriptionBox: Box<Amount>,
    serviceConfigBox: Box<Amount>,
    devConfigBox: Box<Amount> | undefined): FleetPlugin {

    const serviceConfigNFT = serviceConfigBox.assets[0].tokenId;
    const serviceContractAddress = ErgoAddress.fromBase58(GetContractAddress(Contract.SERVICE, networkType));
    const serviceAddress = ErgoAddress.fromPublicKey(serviceConfigBox.additionalRegisters.R4!.substring(4));
    const serviceFee = BigInt(SParse(serviceConfigBox.additionalRegisters.R6!));
    const serviceLength = Number(SParse(serviceConfigBox.additionalRegisters.R7!));

    // calculate new start and new end dates based on current subscriptionBox
    const currentServiceEnd = Number(SParse(subscriptionBox.additionalRegisters.R6!));
    const newServiceStart = currentServiceEnd;
    const newServiceEnd = newServiceStart + serviceLength;

    // ensure subscription box is first input
    inputs.unshift(subscriptionBox);

    const outputs = [
        new OutputBuilder(serviceFee.toString(), serviceContractAddress)
            .addTokens(subscriptionBox.assets)
            .setAdditionalRegisters({
                R4: SConstant(SColl(SByte, serviceConfigNFT)),
                R5: SConstant(SLong(newServiceStart)),
                R6: SConstant(SLong(newServiceEnd))
            }),
        new OutputBuilder(subscriptionBox.value, serviceAddress)];
    const devOutput: OutputBuilder | undefined = _getDevOutput(devConfigBox, subscriptionBox.value);
    if (devOutput) {
        outputs.push(devOutput);
    }

    return ({ addDataInputs, addInputs, addOutputs }) => {
        addDataInputs(serviceConfigBox, devConfigBox);
        addInputs(inputs);
        addOutputs(outputs);
    };
}

export function CancelSubscription(subscriptionTokenBox: Box<Amount>,
    subscriptionBox: Box<Amount>,
    serviceConfigBox: Box<Amount>,
    devConfigBox: Box<Amount> | undefined,
    subscriberAddress: ErgoAddress): FleetPlugin {

    const serviceAddress = ErgoAddress.fromPublicKey(serviceConfigBox.additionalRegisters.R4!.substring(4));

    let outputs: OneOrMore<OutputBuilder> = [];
    const currentTime = new Date().getTime()
    const totalERG = Number(subscriptionBox.value);
    const serviceStart = Number(SParse(subscriptionBox.additionalRegisters.R5!));
    const serviceEnd = Number(SParse(subscriptionBox.additionalRegisters.R6!));

     if (currentTime > serviceEnd) {
        // service has expired
        throw new Error("Service Has Expired");
    } else {       
        let serviceTokens = subscriptionBox.assets;
        let subscriptionToken: TokenAmount<Amount> | undefined = subscriptionTokenBox.assets.find(a => a.tokenId == serviceTokens[1].tokenId)
        let refund = 0; 
        let fee = Number(SAFE_MIN_BOX_VALUE);
        
        if (currentTime < serviceStart) {
            // total refund
            refund = totalERG;
        } else {
            // parital refund
            const nextHour = currentTime - (currentTime % Number(CONSTANTS.LENGTH_IN_MILISECONDS.HOUR)) + Number(CONSTANTS.LENGTH_IN_MILISECONDS.HOUR);     
            const refundPercent = Math.floor(((serviceEnd - nextHour) * 100) / (serviceEnd - serviceStart));
            const exactRefund = Math.floor((totalERG * refundPercent) / 100);
            refund = exactRefund - (exactRefund % Number(SAFE_MIN_BOX_VALUE));
            fee = totalERG - refund;
        }
        if (refund > 0) {
            outputs.push(new OutputBuilder((fee).toString(), serviceAddress)
                .addTokens(serviceTokens)
                .addTokens(subscriptionToken!));
            outputs.push(new OutputBuilder((refund).toString(), subscriberAddress));
        } else {
            throw new Error("Refund calcuated to 0");
        }
    }

    // dev fee
    const devOutput: OutputBuilder | undefined = _getDevOutput(devConfigBox, subscriptionBox.value);
    if (devOutput) {
        outputs.push(devOutput);
    }

    return ({ addDataInputs, addInputs, addOutputs }) => {
        addDataInputs(serviceConfigBox, devConfigBox);
        addInputs([subscriptionTokenBox, subscriptionBox]);
        addOutputs(outputs);
    };
}

export function CollectSubscriptionFee(subscriptionBox: Box<Amount>,
    serviceConfigBox: Box<Amount>,
    devConfigBox: Box<Amount> | undefined): FleetPlugin {

    const serviceAddress = ErgoAddress.fromPublicKey(serviceConfigBox.additionalRegisters.R4!.substring(4));

    const outputs = [new OutputBuilder(subscriptionBox.value, serviceAddress).addTokens(subscriptionBox.assets)]
    const devOutput: OutputBuilder | undefined = _getDevOutput(devConfigBox, subscriptionBox.value);
    if (devOutput) {
        outputs.push(devOutput);
    }
    
    return ({ addDataInputs, addInputs, addOutputs }) => {
        addDataInputs(serviceConfigBox, devConfigBox);
        addInputs(subscriptionBox);
        addOutputs(outputs);
    };
}

export function CollectSubscriptionFeeBulk(subscriptionBoxes: Box<Amount>[],
    serviceConfigBox: Box<Amount>,
    devConfigBox: Box<Amount> | undefined): FleetPlugin {

    const serviceAddress = ErgoAddress.fromPublicKey(serviceConfigBox.additionalRegisters.R4!.substring(4));

    // dev fee
    const totalERG = BigInt(subscriptionBoxes.filter(b => b).reduce((sum, current) => sum + Number(current.value), 0));
    const allTokens: TokensCollection = new TokensCollection();
    subscriptionBoxes.forEach(box => {
        allTokens.add(box.assets);
    });

    const outputs = [new OutputBuilder(totalERG, serviceAddress).addTokens(allTokens)]
    const devOutput: OutputBuilder | undefined = _getDevOutput(devConfigBox, totalERG);
    if (devOutput) {
        outputs.push(devOutput);
    }
    
    return ({ addDataInputs, addInputs, addOutputs }) => {
        addDataInputs(serviceConfigBox, devConfigBox);
        addInputs(subscriptionBoxes);
        addOutputs(outputs);
    };
}

function _getDevOutput(devConfigBox: Box<Amount> | undefined,
    subscriptionFee: Amount) : OutputBuilder | undefined {

    if (devConfigBox) {
        const devAddress = ErgoAddress.fromPublicKey(devConfigBox.additionalRegisters.R4!.substring(4));
        const feePercent = BigInt(SParse(devConfigBox.additionalRegisters.R5!)); // 1000 -> 1%
        const minFee: string = SParse(devConfigBox.additionalRegisters.R6!);
        const fixedFee: string = devConfigBox.additionalRegisters.R7 ? SParse(devConfigBox.additionalRegisters.R7) : '';
    
        // fixed fee or calculate % fee 
        let devFee = minFee;
        if (fixedFee !== '') {
            devFee = fixedFee;
        } else {
            devFee = ((feePercent / BigInt(10000)) * BigInt(subscriptionFee)).toString();
        }
    
        const fee = UTIL.ensureSafeValueString(devFee);
        return new OutputBuilder(fee, devAddress)
    }
    return undefined;
}