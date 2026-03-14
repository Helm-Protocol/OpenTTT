import { FeeCalculation } from "./dynamic_fee";
import { EVMConnector } from "./evm_connector";
/**
 * ProtocolFeeCollector - Helm 프로토콜 수수료 수취 및 검증 담당
 * x402 컴플라이언스를 위해 EIP-712 서명 검증을 포함
 */
export declare class ProtocolFeeCollector {
    private totalCollected;
    private chainId;
    private verifyingContract;
    private usedSignatures;
    private readonly MAX_REPLAY_CACHE;
    private readonly REPLAY_TTL_MS;
    private evmConnector;
    private protocolFeeRecipient;
    private feeContract;
    constructor(chainId: number, verifyingContract: string, evmConnector: EVMConnector, protocolFeeRecipient: string);
    /**
     * R3-P0-2: Verify chainId matches the actual connected network.
     * Must be called after EVMConnector.connect() to prevent cross-chain signature replay.
     */
    validateChainId(): Promise<void>;
    private getFeeContract;
    /**
     * 민팅 수수료 수취 (Stablecoin)
     * @param feeCalc - DynamicFeeEngine에서 계산된 수수료 정보
     * @param signature - EIP-712 서명 (필수, x402 검증용)
     * @param user - 서명자 주소
     * @param nonce - 중복 방지 nonce
     * @param deadline - 서명 유효 기한
     */
    collectMintFee(feeCalc: FeeCalculation, signature: string, user: string, nonce: bigint, deadline: number): Promise<void>;
    /**
     * 소각 수수료 수취
     * @param feeCalc - DynamicFeeEngine에서 계산된 수수료 정보
     * @param signature - EIP-712 서명 (필수)
     * @param user - 서명자 주소
     * @param nonce - 중복 방지 nonce
     * @param deadline - 서명 유효 기한
     */
    collectBurnFee(feeCalc: FeeCalculation, signature: string, user: string, nonce: bigint, deadline: number): Promise<void>;
    /**
     * 현재까지 수취한 총 수수료 반환
     */
    getCollectedFees(): Promise<bigint>;
    /**
     * P1-2: Prune expired signatures from replay cache
     */
    private lastPruneTime;
    private static readonly PRUNE_INTERVAL_MS;
    private pruneExpiredSignatures;
    /**
     * EIP-712 서명 검증 (x402 compliance)
     */
    private verifySignature;
}
