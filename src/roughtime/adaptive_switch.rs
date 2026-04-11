//! AdaptiveSwitch — Rust port of src/adaptive_switch.ts
//! 
//! Implements the TLA+ spec (Appendix A of draft-helmprotocol-tttps-02):
//!   States: {TURBO, FULL}
//!   TURBO_ENTRY:    match_rate ≥ 0.95 over 20 blocks, fail_count = 0
//!   TURBO_MAINTAIN: match_rate ≥ 0.85
//!   INVARIANT NoForcedTurbo: TURBO requires healthy match_rate AND no integrity failures
//!   INVARIANT DelayRejectionTriggersFull: late submission → FULL
//!   LIVENESS EventualTurbo: sustained good behaviour → TURBO

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AdaptiveMode {
    /// Verified ordering, low latency (~50ms), 20% fee discount
    Turbo,
    /// Potentially Byzantine or stale, standard latency (~127ms)
    Full,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdaptiveSwitch {
    window:            usize,        // sliding window size (default 20)
    turbo_entry:       f64,          // threshold to enter TURBO (0.95)
    turbo_maintain:    f64,          // threshold to maintain TURBO (0.85)
    history:           Vec<bool>,    // ring buffer of block results
    mode:              AdaptiveMode,
    penalty_cooldown:  u32,          // blocks remaining in backoff
    fail_count:        u32,          // consecutive integrity failures
    backoff_base:      u32,          // exponential backoff base (blocks)
    /// Tier tolerance in milliseconds
    tier_tolerance_ms: u64,
}

impl Default for AdaptiveSwitch {
    fn default() -> Self {
        Self::new(100)
    }
}

impl AdaptiveSwitch {
    pub fn new(tier_tolerance_ms: u64) -> Self {
        Self {
            window:           20,
            turbo_entry:      0.95,
            turbo_maintain:   0.85,
            history:          Vec::with_capacity(20),
            mode:             AdaptiveMode::Full,
            penalty_cooldown: 0,
            fail_count:       0,
            backoff_base:     2,
            tier_tolerance_ms,
        }
    }

    /// Gate 2: recency check
    /// Returns true if PoT is within tier_tolerance of submission time
    pub fn check_recency(&self, pot_timestamp_ms: u64, submission_ms: u64) -> bool {
        submission_ms.saturating_sub(pot_timestamp_ms) <= self.tier_tolerance_ms
    }

    /// Main verification step (Gate 2 + mode update)
    /// order_ok:    transaction order matches PoT record
    /// time_ok:     timestamp within tier_tolerance
    /// integrity_ok: GRG/HMAC gate passed (Gate 1, verified upstream)
    pub fn verify_block(
        &mut self,
        order_ok: bool,
        time_ok:  bool,
        integrity_ok: bool,
    ) -> AdaptiveMode {
        // TLA+ invariant: integrity failure → forced FULL
        if !integrity_ok {
            self.fail_count += 1;
            self.penalty_cooldown = self.backoff_base.pow(self.fail_count.min(8));
            self.mode = AdaptiveMode::Full;
            return self.mode;
        }

        // TLA+ invariant: delay outside tolerance → FULL + backoff
        if !time_ok {
            self.fail_count += 1;
            self.penalty_cooldown = self.backoff_base.pow(self.fail_count.min(8));
            self.mode = AdaptiveMode::Full;
            return self.mode;
        }

        // Decrement cooldown
        if self.penalty_cooldown > 0 {
            self.penalty_cooldown -= 1;
        }

        let seq_ok = order_ok && time_ok;
        self.history.push(seq_ok);
        if self.history.len() > self.window {
            self.history.remove(0);
        }

        let match_rate = self.match_rate();
        let threshold  = if self.mode == AdaptiveMode::Turbo {
            self.turbo_maintain
        } else {
            self.turbo_entry
        };

        if self.history.len() >= self.window
            && match_rate >= threshold
            && self.penalty_cooldown == 0
            && self.fail_count == 0
        {
            self.mode = AdaptiveMode::Turbo;
        } else if match_rate < threshold || self.penalty_cooldown > 0 {
            self.mode = AdaptiveMode::Full;
        }

        self.mode
    }

    pub fn match_rate(&self) -> f64 {
        if self.history.is_empty() { return 0.0; }
        self.history.iter().filter(|&&v| v).count() as f64 / self.history.len() as f64
    }

    pub fn fee_discount(&self) -> f64 {
        if self.mode == AdaptiveMode::Turbo { 0.20 } else { 0.0 }
    }

    pub fn mode(&self) -> AdaptiveMode { self.mode }

    pub fn fail_count(&self) -> u32 { self.fail_count }

    pub fn penalty_cooldown(&self) -> u32 { self.penalty_cooldown }

    pub fn reset(&mut self) {
        self.history.clear();
        self.mode = AdaptiveMode::Full;
        self.fail_count = 0;
        self.penalty_cooldown = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fill_good(sw: &mut AdaptiveSwitch, n: usize) {
        for _ in 0..n { sw.verify_block(true, true, true); }
    }

    #[test]
    fn test_initial_full() {
        let sw = AdaptiveSwitch::new(100);
        assert_eq!(sw.mode(), AdaptiveMode::Full);
    }

    #[test]
    fn test_turbo_entry_after_20_good() {
        let mut sw = AdaptiveSwitch::new(100);
        fill_good(&mut sw, 20);
        assert_eq!(sw.mode(), AdaptiveMode::Turbo);
    }

    #[test]
    fn test_integrity_fail_forces_full() {
        let mut sw = AdaptiveSwitch::new(100);
        fill_good(&mut sw, 20);
        assert_eq!(sw.mode(), AdaptiveMode::Turbo);
        // integrity failure
        sw.verify_block(true, true, false);
        assert_eq!(sw.mode(), AdaptiveMode::Full,
            "NoForcedTurbo invariant: integrity failure must force FULL");
    }

    #[test]
    fn test_delay_forces_full() {
        let mut sw = AdaptiveSwitch::new(100);
        fill_good(&mut sw, 20);
        assert_eq!(sw.mode(), AdaptiveMode::Turbo);
        // late submission (time_ok=false)
        sw.verify_block(true, false, true);
        assert_eq!(sw.mode(), AdaptiveMode::Full,
            "DelayRejectionTriggersFull invariant");
    }

    #[test]
    fn test_exponential_backoff() {
        let mut sw = AdaptiveSwitch::new(100);
        sw.verify_block(true, false, true); // fail 1 → backoff = 2^1 = 2
        assert_eq!(sw.penalty_cooldown(), 2);
        sw.verify_block(true, false, true); // fail 2 → backoff = 2^2 = 4
        assert_eq!(sw.penalty_cooldown(), 4);
    }

    #[test]
    fn test_recency_check() {
        let sw = AdaptiveSwitch::new(200); // T1_block 200ms
        assert!(sw.check_recency(1000, 1150));   // 150ms → ok
        assert!(!sw.check_recency(1000, 1250));  // 250ms → stale
    }

    #[test]
    fn test_fee_discount_turbo() {
        let mut sw = AdaptiveSwitch::new(100);
        assert_eq!(sw.fee_discount(), 0.0);
        fill_good(&mut sw, 20);
        assert!((sw.fee_discount() - 0.20).abs() < 1e-9);
    }

    #[test]
    fn test_reset_clears_state() {
        let mut sw = AdaptiveSwitch::new(100);
        fill_good(&mut sw, 20);
        sw.reset();
        assert_eq!(sw.mode(), AdaptiveMode::Full);
        assert_eq!(sw.fail_count(), 0);
    }

    #[test]
    fn test_no_turbo_before_window_full() {
        let mut sw = AdaptiveSwitch::new(100);
        fill_good(&mut sw, 19); // 19 < 20
        assert_eq!(sw.mode(), AdaptiveMode::Full,
            "Should not enter TURBO before window is full");
    }
}
