import { AutoMintConfig, TTTClientConfig } from "./types";
/**
 * TTTClient - DEX 운영자용 SDK 진입점
 * 모든 내부 모듈을 초기화하고 자동 민팅 프로세스를 관리
 */
export declare class TTTClient {
    private config;
    private autoMintEngine;
    private poolRegistry;
    private isInitialized;
    private mintCount;
    private totalFeesPaid;
    private signer;
    private lastTokenId;
    constructor(config: AutoMintConfig);
    /**
     * Static factory for Base Mainnet
     */
    static forBase(config: Omit<TTTClientConfig, 'network'>): Promise<TTTClient>;
    /**
     * Static factory for Base Sepolia
     */
    static forSepolia(config: Omit<TTTClientConfig, 'network'>): Promise<TTTClient>;
    /**
     * Universal factory to create and initialize a client
     */
    static create(config: TTTClientConfig): Promise<TTTClient>;
    /**
     * SDK 초기화: RPC 연결, 시간 소스 설정, 수수료 엔진 연결
     */
    initialize(): Promise<void>;
    /**
     * 자동 민팅 프로세스 시작
     */
    startAutoMint(): void;
    /**
     * 자동 민팅 프로세스 정지
     */
    stopAutoMint(): void;
    /**
     * List registered pools.
     */
    listPools(): string[];
    /**
     * Get stats for a specific pool.
     */
    getPoolStats(poolAddress: string): {
        minted: bigint;
        burned: bigint;
    } | null;
    /**
     * 현재 SDK 상태 및 통계 반환 (잔고, 민팅 수, 수수료 등)
     */
    getStatus(): Promise<{
        isInitialized: boolean;
        tier: string;
        mintCount: number;
        totalFeesPaid: string;
        balance: string;
        tttBalance: string;
        lastTokenId: string | null;
    }>;
}
