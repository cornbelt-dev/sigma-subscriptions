import { ErgoAddress, TransactionBuilder, Amount, Box, SParse, Network } from "@fleet-sdk/core";
import { AssetBalance, EIP12ErgoAPI, UnsignedTransaction } from "@nautilus-js/eip12-types"
import * as SERVICES from "./services";
import * as CONSTANTS from "./constants"
import { CreateServiceConfig, EditServiceConfig, CreateService, CreateSubscription, RenewSubscription, CancelSubscription, CollectSubscriptionFee } from "./plugins";
import { SigmaSubscriptionsAuthResponse, Subscription, Service, ServiceConfig } from "./types";

export class SigmaSubscriptions {

    
    NetworkType: Network;
    API_URL: string;

    constructor(network: Network, explorerApiUrl?: string) {
        this.NetworkType = network;
        this.API_URL = explorerApiUrl ?? (network == Network.Mainnet ? CONSTANTS.EXPLORER_API_URL : CONSTANTS.TESTNET_EXPLORER_API_URL);
    }

    public async auth(ergo: EIP12ErgoAPI,
        serviceTokenId: string): Promise<SigmaSubscriptionsAuthResponse> {

        let response: SigmaSubscriptionsAuthResponse = { auth: false, suggestRenewal: false };

        const walletTokens = await ergo.get_balance("all");
        const subscriptionBoxes: Box<Amount>[] = await SERVICES.getSubsciptionBoxes(this.NetworkType, this.API_URL, serviceTokenId);
        const subscriptionBox: Box<Amount> | undefined = subscriptionBoxes.find(b => walletTokens.find(t => t.tokenId == b.assets[1].tokenId));

        if (subscriptionBox) {
            const now = new Date();
            const serviceStart = Number(SParse(subscriptionBox.additionalRegisters.R5!));
            const serviceEnd = Number(SParse(subscriptionBox.additionalRegisters.R6!));
            const percentRemaining = (serviceEnd - now.getTime()) / (serviceEnd - serviceStart);

            response.serviceEndDate = new Date(serviceEnd);
            response.auth = response.serviceEndDate > now;
            response.suggestRenewal = percentRemaining < 0.25 && percentRemaining > 0
            response.subscriptionToken = walletTokens.find(t => t.tokenId == subscriptionBox.assets[1].tokenId)?.tokenId;
        }

        return response;
    }

    public async createServiceConfig(ergo: EIP12ErgoAPI,
        name: string,
        description: string,
        fee: number | string | bigint,
        length: number | string | bigint,
        serviceAddress?: string): Promise<UnsignedTransaction> {
       
        const inputs = await ergo.get_utxos();
        const currentHeight = await ergo.get_current_height();
        const walletAddress = await ergo.get_change_address();          
        const serviceAddr = serviceAddress ?? walletAddress;

        const tx = new TransactionBuilder(currentHeight)
            .from(inputs)
            .extend(CreateServiceConfig(this.NetworkType, ErgoAddress.fromBase58(serviceAddr), name, description, fee, length))
            .sendChangeTo(walletAddress)
            .payMinFee()
            .build("EIP-12");

        return tx;
    }

    public async editServiceConfig(ergo: EIP12ErgoAPI,
        serviceConfigNFT: string,
        name: string,
        description: string,
        fee: number | string | bigint,
        length: number | string | bigint,
        serviceAddress?: string): Promise<UnsignedTransaction> {
        
        const inputs = await ergo.get_utxos();
        const currentHeight = await ergo.get_current_height();
        const walletAddress = await ergo.get_change_address();
        const serviceAddr = serviceAddress ?? walletAddress;
        const serviceConfigBox: Box<Amount> | undefined = await SERVICES.getServiceConfig(this.API_URL, serviceConfigNFT);
        
        if (serviceConfigBox) {
            const tx = new TransactionBuilder(currentHeight)
                .from(inputs)
                .extend(EditServiceConfig(this.NetworkType, serviceConfigBox, ErgoAddress.fromBase58(serviceAddr), name, description, fee, length))
                .sendChangeTo(walletAddress)
                .payMinFee()
                .build("EIP-12");
    
            return tx;
        } else {
            throw new Error("Service Config Box not found.");
        }
    }

    public async createService(ergo: EIP12ErgoAPI,
        serviceConfigNFT: string,
        maxSubscriptions?: string): Promise<UnsignedTransaction> {
        
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

    public async subscribe(ergo: EIP12ErgoAPI,
        serviceTokenId: string): Promise<UnsignedTransaction> {
        
        const inputs = await ergo.get_utxos();
        const currentHeight = await ergo.get_current_height();
        const subscriberAddress = ErgoAddress.fromBase58(await ergo.get_change_address());
        const subscribeBox: Box<Amount> | undefined = await SERVICES.getSubscribeBox(this.NetworkType, this.API_URL, serviceTokenId);

        if (subscribeBox) {                   
            const serviceConfigNFT = subscribeBox.additionalRegisters.R7?.substring(4);
            const serviceConfig: Box<Amount> | undefined  = await SERVICES.getServiceConfig(this.API_URL, serviceConfigNFT!);

            if (serviceConfig) {
                const tx = new TransactionBuilder(currentHeight)
                    .extend(CreateSubscription(this.NetworkType, inputs, subscribeBox, serviceConfig, subscriberAddress))
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

    public async renew(ergo: EIP12ErgoAPI,
        subscriptionTokenId: string): Promise<UnsignedTransaction> {
        
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

    public async cancel(ergo: EIP12ErgoAPI,
        subscriptionTokenId: string): Promise<UnsignedTransaction> {

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

    public async collect(ergo: EIP12ErgoAPI,
        subscribeBoxId: string): Promise<UnsignedTransaction> {

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
        let configs: ServiceConfig[] = [];   
        const networkType = this.NetworkType; 
        const api_url = this.API_URL;
        const config: Box<Amount> | undefined = await SERVICES.getServiceConfig(this.API_URL, serviceConfigNFT);
        if (config) {
            const serviceConfig: ServiceConfig = {
                configNFT: config.assets[0].tokenId,
                address: config.additionalRegisters.R4 ?? '',
                name: config.additionalRegisters.R8 ?? '',
                description: config.additionalRegisters.R9 ?? '',
                length: Number(config.additionalRegisters.R7 ?? ''),
                fee: BigInt(config.additionalRegisters.R6 ?? '')
            }
            return serviceConfig;
        }
        return undefined;
    }

    public async getServiceConfigs(serviceAddress: string): Promise<ServiceConfig[]> {    
        let configs: ServiceConfig[] = [];   
        const networkType = this.NetworkType; 
        const api_url = this.API_URL;
        const serviceConfigs: Box<Amount>[] = await SERVICES.getServiceConfigsByAddress(this.NetworkType, this.API_URL, serviceAddress);
        serviceConfigs.forEach(async function (serviceConfig) {
            const configNFT = serviceConfig.assets[0].tokenId;
            const address = serviceConfig.additionalRegisters.R4 ?? '';
            const fee = serviceConfig.additionalRegisters.R6 ?? '';
            const length = serviceConfig.additionalRegisters.R7 ?? '';
            const name = serviceConfig.additionalRegisters.R8 ?? '';
            const desc = serviceConfig.additionalRegisters.R9 ?? '';
            configs.push({
                configNFT: configNFT,
                address: address,
                name: name,
                description: desc,
                length: Number(length),
                fee: BigInt(fee)
            });
        });
        return configs;
    }

    public async getServices(serviceAddress: string): Promise<Service[]> {    
        let services: Service[] = [];   
        const networkType = this.NetworkType; 
        const api_url = this.API_URL;
        const configs: ServiceConfig[] = await this.getServiceConfigs(serviceAddress);
        configs.forEach(async function (config) {
            const boxes : Box<Amount>[] = await SERVICES.getSubscribeBoxesByServiceConfig(networkType, api_url, config.configNFT);
            if (boxes) {
                boxes.forEach(async function (box) {
                    services.push({
                        config: config,
                        tokenId: box.assets[0].tokenId
                    });
                });
            }
        });
        return services;
    }
    
    public async getSubscriptions(serviceTokenId: string): Promise<Subscription[]> {     
        let subscriptions: Subscription[] = [];
        const subscribeBox : Box<Amount> | undefined = await SERVICES.getSubscribeBox(this.NetworkType, this.API_URL, serviceTokenId);
        if (subscribeBox) {
            const configNFT = subscribeBox.additionalRegisters.R7 ?? '';
            const serviceConfig: Box<Amount> | undefined = await SERVICES.getServiceConfig(this.API_URL, configNFT);
            if (serviceConfig) {
                const address = serviceConfig.additionalRegisters.R4 ?? '';
                const fee = serviceConfig.additionalRegisters.R6 ?? '';
                const length = serviceConfig.additionalRegisters.R7 ?? '';
                const name = serviceConfig.additionalRegisters.R8 ?? '';
                const desc = serviceConfig.additionalRegisters.R9 ?? '';
                const boxes : Box<Amount>[] = await SERVICES.getSubsciptionBoxes(this.NetworkType, this.API_URL, serviceTokenId);
                subscriptions = boxes.map(b => ({ 
                    tokenId: b.assets.find(t => t.tokenId == b.assets[1].tokenId)?.tokenId, 
                    startDate: b.additionalRegisters.R5 ? new Date(b.additionalRegisters.R5) : undefined, 
                    endDate: b.additionalRegisters.R6 ? new Date(b.additionalRegisters.R6) : undefined, 
                    service: { 
                        config: {
                            configNFT: configNFT,
                            address: address,
                            name: name,
                            description: desc,
                            length: Number(length),
                            fee: BigInt(fee),
                        },
                        tokenId: serviceTokenId
                    }
                }));
            }
        }
        return subscriptions;
    }

}