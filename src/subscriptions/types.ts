export type SigmaSubscriptionsAuthResponse = {
    auth: boolean;
    suggestRenewal: boolean;
    subscriptionToken?: string;
    serviceEndDate?: Date;
};

export type ServiceConfig = {
    configNFT: string;
    address: string,
    name: string;
    description: string;
    length: number;
    fee: bigint;
}

export type Service = {
    config: ServiceConfig
    tokenId: string;
}

export type Subscription = {
    tokenId: string | undefined;
    startDate: Date | undefined;
    endDate: Date | undefined;
    service: Service;
}
