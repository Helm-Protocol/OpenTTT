import { TimeReading, SynthesizedTime, ProofOfTime } from "./types";
export interface TimeSource {
    name: string;
    getTime(): Promise<TimeReading>;
}
export declare class NTPSource implements TimeSource {
    name: string;
    private host;
    private port;
    constructor(name: string, host: string, port?: number);
    getTime(): Promise<TimeReading>;
}
export declare class TimeSynthesis {
    private sources;
    constructor(config?: {
        sources?: string[];
    });
    getFromSource(name: string): Promise<TimeReading>;
    /**
     * 3개 소스의 중앙값(median) 알고리즘을 사용한 타임 합성.
     * 1개 실패 시: 나머지 2개의 평균
     * 2개 실패 시: 마지막 1개 사용 + 경고
     * 3개 전부 실패 시: throw Error
     */
    synthesize(): Promise<SynthesizedTime>;
    /**
     * 합의된 시간과 서명(이론적 증명 데이터)을 포함한 PoT 생성
     */
    generateProofOfTime(): Promise<ProofOfTime>;
    /**
     * Verify Proof of Time integrity.
     */
    verifyProofOfTime(pot: ProofOfTime): boolean;
}
