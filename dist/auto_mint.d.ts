import { EVMConnector } from "./evm_connector";
import { AutoMintConfig, MintResult } from "./types";
/**
 * AutoMintEngine - TTT 자동 민팅 엔진
 * 시간 합성, 동적 수수료 계산, EVM 민팅을 하나의 루프로 결합
 */
export declare class AutoMintEngine {
    private config;
    private timeSynthesis;
    private feeEngine;
    private evmConnector;
    private feeCollector;
    private timer;
    private isRunning;
    private isProcessing;
    private onMintCallback?;
    private onFailureCallback?;
    private onLatencyCallback?;
    private cachedSigner;
    private consecutiveFailures;
    private maxConsecutiveFailures;
    private potSigner;
    constructor(config: AutoMintConfig);
    getEvmConnector(): EVMConnector;
    setOnMint(callback: (result: MintResult) => void): void;
    setOnFailure(callback: (error: Error) => void): void;
    setOnLatency(callback: (ms: number) => void): void;
    /**
     * 엔진 초기화 (RPC 연결 및 컨트랙트 설정)
     */
    initialize(): Promise<void>;
    /**
     * 자동 민팅 루프 시작
     */
    start(): void;
    /**
     * 자동 민팅 루프 정지
     */
    stop(): void;
    /**
     * 단일 민트 틱 실행
     * 시간합성 → tokenId 생성 → EVM mint 호출 → 수수료 계산/차감
     */
    mintTick(): Promise<void>;
    private signFeeMessage;
}
