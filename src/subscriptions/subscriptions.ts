import { ErgoAddress, TransactionBuilder, Amount, Box, SParse, Network } from "@fleet-sdk/core";
import { AssetBalance, EIP12ErgoAPI, UnsignedTransaction } from "@nautilus-js/eip12-types"
import * as SERVICES from "./services";
import * as CONSTANTS from "./constants";
import * as UTIL from "./util";
import { CreateServiceConfig, EditServiceConfig, CreateService, CreateSubscription, RenewSubscription, CancelSubscription, CollectSubscriptionFee } from "./plugins";
import { SigmaSubscriptionsAuthResponse, Subscription, Service, ServiceConfig } from "./types";
import { utimes } from "fs";

export class SigmaSubscriptions {
    
    NetworkType: Network;
    API_URL: string;

    constructor(network: Network, explorerApiUrl?: string) {
        this.NetworkType = network;
        this.API_URL = explorerApiUrl ?? (network == Network.Mainnet ? CONSTANTS.EXPLORER_API_URL : CONSTANTS.TESTNET_EXPLORER_API_URL);
    }


    public async auth(subscriptionTokenId: string): Promise<SigmaSubscriptionsAuthResponse> {

        let response: SigmaSubscriptionsAuthResponse = { auth: false, suggestRenewal: false };
        const subscriptionBox: Box<Amount> | undefined = await SERVICES.getSubsciptionBoxBySubsciptionTokenId(this.API_URL, subscriptionTokenId);
        if (subscriptionBox) {
            return UTIL.boxToAuthReponse(subscriptionBox);
        }

        return response;
    }

    public async authWallet(ergo: EIP12ErgoAPI, serviceTokenId: string): Promise<SigmaSubscriptionsAuthResponse> {

        let response: SigmaSubscriptionsAuthResponse = { auth: false, suggestRenewal: false };
        const walletTokens = await ergo.get_balance("all");
        const subscriptionBoxes: Box<Amount>[] = await SERVICES.getSubsciptionBoxes(this.NetworkType, this.API_URL, serviceTokenId);
        const subscriptionBox: Box<Amount> | undefined = subscriptionBoxes.find(b => walletTokens.find(t => t.tokenId == b.assets[1]?.tokenId));

        if (subscriptionBox) {
            return UTIL.boxToAuthReponse(subscriptionBox);
        }

        return response;
    }

    public async createServiceConfig(ergo: EIP12ErgoAPI, config: ServiceConfig): Promise<UnsignedTransaction> {
       
        const inputs = await ergo.get_utxos();
        const currentHeight = await ergo.get_current_height();
        const walletAddress = await ergo.get_change_address();
        if (!config.address) {
            config.address = walletAddress;
        }

        const tx = new TransactionBuilder(currentHeight)
            .from(inputs)
            .extend(CreateServiceConfig(this.NetworkType, config))
            .sendChangeTo(walletAddress)
            .payMinFee()
            .build("EIP-12");

        return tx;
    }

    public async editServiceConfig(ergo: EIP12ErgoAPI, config: ServiceConfig): Promise<UnsignedTransaction> {
        
        const inputs = await ergo.get_utxos();
        const currentHeight = await ergo.get_current_height();
        const walletAddress = await ergo.get_change_address();
        const serviceConfigBox: Box<Amount> | undefined = await SERVICES.getServiceConfig(this.API_URL, config.configNFT);
        if (!config.address) {
            config.address = serviceConfigBox?.additionalRegisters.R4 ?? walletAddress;
        }
        
        if (serviceConfigBox) {
            const tx = new TransactionBuilder(currentHeight)
                .from(inputs)
                .extend(EditServiceConfig(this.NetworkType, config, serviceConfigBox))
                .sendChangeTo(walletAddress)
                .payMinFee()
                .build("EIP-12");

            return tx;
        } else {
            throw new Error("Service Config Box not found.");
        }
    }

    public async createService(ergo: EIP12ErgoAPI, serviceConfigNFT: string, maxSubscriptions?: string): Promise<UnsignedTransaction> {
        
        const inputs = await ergo.get_utxos();
        const currentHeight = await ergo.get_current_height();
        const serviceAddress = await ergo.get_change_address();            
        const serviceConfigBox: Box<Amount> | undefined = await SERVICES.getServiceConfig(this.API_URL, serviceConfigNFT);
            
        if (serviceConfigBox) {
            const tx = new TransactionBuilder(currentHeight)
                .extend(CreateService(this.NetworkType, inputs, serviceConfigBox, maxSubscriptions))
                .sendChangeTo(serviceAddress)
                .payMinFee()
                .build("EIP-12");

            return tx;
        } else {
            throw new Error("Service Config Box not found.");
        }
    }

    public async subscribe(ergo: EIP12ErgoAPI, serviceTokenId: string, startDate = new Date()): Promise<UnsignedTransaction> {
        
        const inputs = await ergo.get_utxos();
        const currentHeight = await ergo.get_current_height();
        const subscriberAddress = ErgoAddress.fromBase58(await ergo.get_change_address());
        const subscribeBox: Box<Amount> | undefined = await SERVICES.getSubscribeBox(this.NetworkType, this.API_URL, serviceTokenId);

        if (subscribeBox) {                   
            const serviceConfigNFT = subscribeBox.additionalRegisters.R7?.substring(4);
            const serviceConfig: Box<Amount> | undefined  = await SERVICES.getServiceConfig(this.API_URL, serviceConfigNFT!);

            if (serviceConfig) {
                const tx = new TransactionBuilder(currentHeight)
                    .extend(CreateSubscription(this.NetworkType, inputs, subscribeBox, serviceConfig, subscriberAddress, startDate))
                    .sendChangeTo(subscriberAddress)
                    .payMinFee()
                    .build("EIP-12");

                return tx;
            } else {
                throw new Error("Service Config Box for Subscribe Box was not found.");
            }
        } else {     
            throw new Error("Subscribe Box not found.");
        }
    }

    public async renew(ergo: EIP12ErgoAPI, subscriptionTokenId: string): Promise<UnsignedTransaction> {
        
        const inputs = await ergo.get_utxos();
        const currentHeight = await ergo.get_current_height();
        const subscriberAddress = ErgoAddress.fromBase58(await ergo.get_change_address());
        const subscriptionBox: Box<Amount> | undefined = await SERVICES.getSubsciptionBoxBySubsciptionTokenId(this.API_URL, subscriptionTokenId);

        if (subscriptionBox) {                   
            const serviceConfigNFT = subscriptionBox.additionalRegisters.R4?.substring(4);
            const serviceConfig: Box<Amount> | undefined = await SERVICES.getServiceConfig(this.API_URL, serviceConfigNFT!);
            
            if (serviceConfig) {                   
                const devConfig: Box<Amount> = await SERVICES.getDevConfigBox(this.NetworkType, this.API_URL);
                const tx = new TransactionBuilder(currentHeight)
                    .extend(RenewSubscription(this.NetworkType, inputs, subscriptionBox, serviceConfig, devConfig))
                    .sendChangeTo(subscriberAddress)
                    .payMinFee()
                    .build("EIP-12");

                return tx;
            } else {     
                throw new Error("Service Config Box for Subscription Box was not found.");
            }
        } else {     
            throw new Error("Subscription Box not found.");
        }
    }

    public async cancel(ergo: EIP12ErgoAPI, subscriptionTokenId: string): Promise<UnsignedTransaction> {

        let allInputs = await ergo.get_utxos();
        const currentHeight = await ergo.get_current_height();
        const subscriberAddress = ErgoAddress.fromBase58(await ergo.get_change_address());
        const subscriptionBox: Box<Amount> | undefined = await SERVICES.getSubsciptionBoxBySubsciptionTokenId(this.API_URL, subscriptionTokenId);

        if (subscriptionBox) {         
            const serviceConfigNFT = subscriptionBox.additionalRegisters.R4?.substring(4);
            const serviceConfig: Box<Amount> | undefined = await SERVICES.getServiceConfig(this.API_URL, serviceConfigNFT!);

            if (serviceConfig) {  
                const devConfig: Box<Amount> = await SERVICES.getDevConfigBox(this.NetworkType, this.API_URL);                    
                const inputs = allInputs.filter(b => b.assets.find(a => a.tokenId != subscriptionTokenId));
                const subscriptionTokenBox = allInputs.find(b => b.assets.find(a => a.tokenId == subscriptionTokenId));

                const tx = new TransactionBuilder(currentHeight)
                    .from(inputs)
                    .extend(CancelSubscription(subscriptionTokenBox!, subscriptionBox, serviceConfig, devConfig, subscriberAddress))
                    .sendChangeTo(subscriberAddress)
                    .payMinFee()
                    .build("EIP-12");

                return tx;
            } else {     
                throw new Error("Service Config Box for Subscription Box was not found.");
            }
        } else {     
            throw new Error("Subscription Box not found.");
        }   
    }

    public async collect(ergo: EIP12ErgoAPI, subscribeBoxId: string): Promise<UnsignedTransaction> {

        const inputs = await ergo.get_utxos();
        const currentHeight = await ergo.get_current_height();
        const serviceAddress = ErgoAddress.fromBase58(await ergo.get_change_address());
        const subscriptionBox: Box<Amount> | undefined = await SERVICES.getSubsciptionBoxByBoxId(this.API_URL, subscribeBoxId);

        if (subscriptionBox) {  
            const serviceConfigNFT = subscriptionBox.additionalRegisters.R4?.substring(4);
            const serviceConfig: Box<Amount> | undefined = await SERVICES.getServiceConfig(this.API_URL, serviceConfigNFT!);
            
            if (serviceConfig) {  
                const devConfig: Box<Amount> = await SERVICES.getDevConfigBox(this.NetworkType, this.API_URL);

                const tx = new TransactionBuilder(currentHeight)
                    .from(inputs)
                    .extend(CollectSubscriptionFee(subscriptionBox, serviceConfig, devConfig))
                    .sendChangeTo(serviceAddress)
                    .payMinFee()
                    .build("EIP-12");

                return tx;
            } else {     
                throw new Error("Service Config Box for Subscription Box was not found.");
            }
        } else {     
            throw new Error("Subscription Box not found.");
        }   
    }

    public async getServiceConfig(serviceConfigNFT: string): Promise<ServiceConfig | undefined> {
        const config: Box<Amount> | undefined = await SERVICES.getServiceConfig(this.API_URL, serviceConfigNFT);
        if (config) {
            return UTIL.boxToConfig(config, this.NetworkType);
        }
        return undefined;
    }

    public async getServiceConfigs(serviceAddress: string): Promise<ServiceConfig[]> {    
        let configs: ServiceConfig[] = [];   
        const networkType = this.NetworkType;
        const serviceConfigs: Box<Amount>[] = await SERVICES.getServiceConfigsByAddress(networkType, this.API_URL, serviceAddress);
        serviceConfigs.forEach(async function (config) {
            configs.push(UTIL.boxToConfig(config, networkType));
        });
        return configs;
    }

    public async getServices(serviceConfigNFT: string): Promise<Service[]> {    
        let services: Service[] = [];
        const networkType = this.NetworkType;
        const api_url = this.API_URL;
        const config: ServiceConfig | undefined = await this.getServiceConfig(serviceConfigNFT);
        if (config) {
            const boxes : Box<Amount>[] = await SERVICES.getSubscribeBoxesByServiceConfig(networkType, api_url, config.configNFT);
            if (boxes) {
                boxes.forEach(async function (box) {
                    services.push({
                        config: config,
                        tokenId: box.assets[0].tokenId
                    });
                });
            }
        }
        return services;
    }

    public async getServicesByAddress(serviceAddress: string): Promise<Service[]> {    
        let services: Service[] = [];
        const networkType = this.NetworkType;
        const api_url = this.API_URL;
        const configs: ServiceConfig[] = await this.getServiceConfigs(serviceAddress);
        for (const config of configs) {
            const boxes : Box<Amount>[] = await SERVICES.getSubscribeBoxesByServiceConfig(networkType, api_url, config.configNFT);
            if (boxes) {
                boxes.forEach(async function (box) {
                    services.push({
                        config: config,
                        tokenId: box.assets[0].tokenId
                    });
                });
            }
        }
        return services;
    }
    
    public async getSubscriptions(serviceTokenId: string): Promise<Subscription[]> {     
        let subscriptions: Subscription[] = [];
        const subscribeBox : Box<Amount> | undefined = await SERVICES.getSubscribeBox(this.NetworkType, this.API_URL, serviceTokenId);
        if (subscribeBox) {
            const configNFT = subscribeBox.additionalRegisters.R7 ? subscribeBox.additionalRegisters.R7.substring(4) : '';
            const serviceConfig: Box<Amount> | undefined = await SERVICES.getServiceConfig(this.API_URL, configNFT);
            if (serviceConfig) {
                const config = UTIL.boxToConfig(serviceConfig, this.NetworkType);                
                const boxes : Box<Amount>[] = await SERVICES.getSubsciptionBoxes(this.NetworkType, this.API_URL, serviceTokenId);                
                for (const box of boxes) {
                    const subscriptionToken = box.assets.find(t => t.tokenId == box.assets[1].tokenId)?.tokenId;
                    if (subscriptionToken) {
                        const walletAddress: string = await SERVICES.getWalletAddressBySubsciptionTokenId(this.NetworkType, this.API_URL, subscriptionToken) ?? '';
                        subscriptions.push(UTIL.boxToSubscription(box, walletAddress, subscriptionToken, serviceTokenId, config));
                    }
                }
            }
        }
        return subscriptions;
    }
    
    public async getSubscriptionsForWallet(ergo: EIP12ErgoAPI): Promise<Subscription[]> {     
        let subscriptions: Subscription[] = [];

        const walletAddress = await ergo.get_change_address();
        const tokenIds = (await ergo.get_balance("all")).map(b => b.tokenId).filter(t => !CONSTANTS.KNOWN_TOKENS.map(kt => kt[1]).includes(t)); 
        for (const tokenId of tokenIds) {
            const box : Box<Amount> | undefined = await SERVICES.getSubsciptionBoxBySubsciptionTokenId(this.API_URL, tokenId);  
            if (box) {
                const serviceToken = box.assets[0].tokenId;
                const serviceConfigNFT = box.additionalRegisters.R4?.substring(4);
                if (serviceConfigNFT) {
                    const serviceConfig: Box<Amount> | undefined = await SERVICES.getServiceConfig(this.API_URL, serviceConfigNFT);
                    if (serviceConfig) {
                        subscriptions.push(UTIL.boxToSubscription(box, walletAddress, tokenId, serviceToken, UTIL.boxToConfig(serviceConfig, this.NetworkType)))
                    }
                }
            }
        }
        return subscriptions;
    }

}