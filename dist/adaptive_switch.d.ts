export declare enum AdaptiveMode {
    TURBO = "TURBO",// 50ms — Valid sequence, low latency
    FULL = "FULL"
}
export interface TTTRecord {
    time: number;
    txOrder: string[];
    grgPayload: Uint8Array[];
}
export interface Block {
    timestamp: number;
    txs: string[];
    data: Uint8Array;
}
export declare class AdaptiveSwitch {
    private windowSize;
    private threshold;
    private history;
    private currentMode;
    private minBlocks;
    private penaltyCooldown;
    private consecutiveFailures;
    private turboEntryThreshold;
    private turboMaintainThreshold;
    /**
     * TTT의 핵심 메커니즘: 타임스탬프 순서 일치율에 따른 Turbo/Full 모드 전환
     */
    verifyBlock(block: Block, tttRecord: TTTRecord): AdaptiveMode;
    /**
     * 모드에 따른 수수료 할인율 반환
     * TURBO: 20% 할인 (수익 증가 유도)
     * FULL: 할인 없음
     */
    getFeeDiscount(): number;
    /**
     * 현재 모드 조회
     */
    getCurrentMode(): AdaptiveMode;
    /**
     * 테스트용: 이력 초기화
     */
    reset(): void;
    private compareTransactionOrder;
}
