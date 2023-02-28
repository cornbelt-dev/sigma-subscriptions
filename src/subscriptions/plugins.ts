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
    devConfigBox: Box<Amount>): FleetPlugin {

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

    // dev fee
    const devAddress = ErgoAddress.fromPublicKey(devConfigBox.additionalRegisters.R4!.substring(4));
    const devFee = _calculateDevFee(devConfigBox, subscriptionBox.value);

    return ({ addDataInputs, addInputs, addOutputs }) => {
        addDataInputs(serviceConfigBox, devConfigBox);
        addInputs(inputs);
        addOutputs([
            new OutputBuilder(serviceFee.toString(), serviceContractAddress)
                .addTokens(subscriptionBox.assets)
                .setAdditionalRegisters({
                    R4: SConstant(SColl(SByte, serviceConfigNFT)),
                    R5: SConstant(SLong(newServiceStart)),
                    R6: SConstant(SLong(newServiceEnd))
                }),
            new OutputBuilder(subscriptionBox.value, serviceAddress),
            new OutputBuilder(devFee, devAddress)
        ]);
    };
}

export function CancelSubscription(subscriptionTokenBox: Box<Amount>,
    subscriptionBox: Box<Amount>,
    serviceConfigBox: Box<Amount>,
    devConfigBox: Box<Amount>,
    subscriberAddress: ErgoAddress): FleetPlugin {

    const serviceAddress = ErgoAddress.fromPublicKey(serviceConfigBox.additionalRegisters.R4!.substring(4));

    let outputs: OneOrMore<OutputBuilder> = [];
    const currentTime = new Date().getTime()
    const totalERG = Number(subscriptionBox.value);
    const serviceStart = Number(SParse(subscriptionBox.additionalRegisters.R5!));
    const serviceEnd = Number(SParse(subscriptionBox.additionalRegisters.R6!));

    if (currentTime < serviceStart) {
        // full refund
        outputs.push(new OutputBuilder(totalERG.toString(), subscriberAddress));
    } else if (currentTime > serviceEnd) {
        // service has expired
        throw new Error("Service Has Expired");
    } else {
        const nextHour = currentTime - (currentTime % Number(CONSTANTS.LENGTH_IN_MILISECONDS.HOUR)) + Number(CONSTANTS.LENGTH_IN_MILISECONDS.HOUR);        
        let refund = Math.floor(totalERG * ((serviceEnd - nextHour) / (serviceEnd - serviceStart)));
        refund = refund - (refund % Number(SAFE_MIN_BOX_VALUE));
        if (refund > 0) {
            let serviceTokens = subscriptionBox.assets;
            let subscriptionToken: TokenAmount<Amount> | undefined = subscriptionTokenBox.assets.find(a => a.tokenId == serviceTokens[1].tokenId)
            outputs.push(new OutputBuilder((totalERG - refund).toString(), serviceAddress)
                .addTokens(serviceTokens)
                .addTokens(subscriptionToken!));
            outputs.push(new OutputBuilder((refund).toString(), subscriberAddress));
        } else {
            throw new Error("Refund calcuated to 0");
        }
    }

    // dev fee
    const devAddress = ErgoAddress.fromPublicKey(devConfigBox.additionalRegisters.R4!.substring(4));
    const devFee = _calculateDevFee(devConfigBox, subscriptionBox.value);
    outputs.push(new OutputBuilder(devFee, devAddress))

    return ({ addDataInputs, addInputs, addOutputs }) => {
        addDataInputs(serviceConfigBox, devConfigBox);
        addInputs([subscriptionTokenBox, subscriptionBox]);
        addOutputs(outputs);
    };
}

export function CollectSubscriptionFee(subscriptionBox: Box<Amount>,
    serviceConfigBox: Box<Amount>,
    devConfigBox: Box<Amount>): FleetPlugin {

    const serviceAddress = ErgoAddress.fromPublicKey(serviceConfigBox.additionalRegisters.R4!.substring(4));

    // dev fee
    const devAddress = ErgoAddress.fromPublicKey(devConfigBox.additionalRegisters.R4!.substring(4));
    const devFee = _calculateDevFee(devConfigBox, subscriptionBox.value);
    
    return ({ addDataInputs, addInputs, addOutputs }) => {
        addDataInputs(serviceConfigBox, devConfigBox);
        addInputs(subscriptionBox);
        addOutputs([
            new OutputBuilder(subscriptionBox.value, serviceAddress).addTokens(subscriptionBox.assets),
            new OutputBuilder(devFee, devAddress)
        ]);
    };
}

export function CollectSubscriptionFeeBulk(subscriptionBoxes: Box<Amount>[],
    serviceConfigBox: Box<Amount>,
    devConfigBox: Box<Amount>): FleetPlugin {

    const serviceAddress = ErgoAddress.fromPublicKey(serviceConfigBox.additionalRegisters.R4!.substring(4));

    // dev fee
    const devAddress = ErgoAddress.fromPublicKey(devConfigBox.additionalRegisters.R4!.substring(4));
    const totalERG = BigInt(subscriptionBoxes.filter(b => b).reduce((sum, current) => sum + Number(current.value), 0));
    const allTokens: TokensCollection = new TokensCollection();
    subscriptionBoxes.forEach(box => {
        allTokens.add(box.assets);
    });
    const devFee = _calculateDevFee(devConfigBox, totalERG);
    
    return ({ addDataInputs, addInputs, addOutputs }) => {
        addDataInputs(serviceConfigBox, devConfigBox);
        addInputs(subscriptionBoxes);
        addOutputs([
            new OutputBuilder(totalERG, serviceAddress).addTokens(allTokens),
            new OutputBuilder(devFee, devAddress)
        ]);
    };
}

function _calculateDevFee(devConfigBox: Box<Amount>,
    subscriptionFee: Amount) {

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

    return UTIL.ensureSafeValueString(devFee);
}