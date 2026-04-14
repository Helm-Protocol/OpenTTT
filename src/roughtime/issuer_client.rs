//! PoT Issuer HTTP client — OpenTTT public SDK
//!
//! This module is the ONLY way OpenTTT generates PoT records.
//! The actual GRG computation happens in Helm (private) — this is just
//! the HTTP client that calls the Helm Issuer API.
//!
//! Verifiers need only `pot_verifier.rs` — no Issuer dependency.
//!
//! Usage:
//!   let client = IssuerClient::new("https://api.helm-protocol.io");
//!   let pot = client.generate("8453:0xPool...", "T1_block").await?;

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Issuer API base URL (configurable for PoC / KTSat testing)
pub const DEFAULT_ISSUER_URL: &str = "https://api.helm-protocol.io";
pub const POC_ISSUER_URL: &str    = "http://localhost:8080";

#[derive(Debug, Clone, Serialize)]
pub struct GenerateRequest {
    pub ctx_id:        String,
    pub tier:          String,
    pub use_roughtime: bool,
    pub caller_did:    Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GenerateResponse {
    pub pot_hex:          String,
    pub timestamp_ns:     u64,
    pub tier:             String,
    pub chain_digest:     Option<String>,
    pub roughtime_k:      Option<usize>,
    pub r_flag:           bool,
    pub issuer_pubkey_hex: String,
    pub on_chain_hash:    String,
}

#[derive(Debug, Clone, Serialize)]
pub struct VerifyRequest {
    pub pot_hex:      String,
    pub ctx_id:       String,
    pub chain_digest: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VerifyResponse {
    pub valid:        bool,
    pub mode:         String,
    pub reason:       Option<String>,
    pub timestamp_ns: Option<u64>,
    pub age_ms:       Option<u64>,
}

#[derive(Debug)]
pub enum IssuerError {
    Http(String),
    Json(String),
    Timeout,
    IssuerRefused(String),
}

impl std::fmt::Display for IssuerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Http(e) => write!(f, "HTTP error: {}", e),
            Self::Json(e) => write!(f, "JSON parse error: {}", e),
            Self::Timeout  => write!(f, "Issuer request timed out"),
            Self::IssuerRefused(r) => write!(f, "Issuer refused: {}", r),
        }
    }
}

/// HTTP client for the Helm PoT Issuer API
pub struct IssuerClient {
    base_url: String,
    timeout:  Duration,
}

impl IssuerClient {
    pub fn new(base_url: &str) -> Self {
        Self { base_url: base_url.to_string(), timeout: Duration::from_secs(10) }
    }

    pub fn with_timeout(mut self, secs: u64) -> Self {
        self.timeout = Duration::from_secs(secs);
        self
    }

    /// POST /v1/pot/generate
    pub async fn generate(
        &self,
        ctx_id: &str,
        tier: &str,
    ) -> Result<GenerateResponse, IssuerError> {
        let url = format!("{}/v1/pot/generate", self.base_url);
        let body = serde_json::to_string(&GenerateRequest {
            ctx_id:        ctx_id.to_string(),
            tier:          tier.to_string(),
            use_roughtime: true,
            caller_did:    None,
        }).map_err(|e| IssuerError::Json(e.to_string()))?;

        let resp = self.http_post(&url, &body).await?;
        serde_json::from_str(&resp).map_err(|e| IssuerError::Json(e.to_string()))
    }

    /// POST /v1/pot/verify (convenience — verifiers can also do this locally)
    pub async fn verify_remote(
        &self,
        pot_hex: &str,
        ctx_id: &str,
        chain_digest: Option<&str>,
    ) -> Result<VerifyResponse, IssuerError> {
        let url = format!("{}/v1/pot/verify", self.base_url);
        let body = serde_json::to_string(&VerifyRequest {
            pot_hex:      pot_hex.to_string(),
            ctx_id:       ctx_id.to_string(),
            chain_digest: chain_digest.map(|s| s.to_string()),
        }).map_err(|e| IssuerError::Json(e.to_string()))?;

        let resp = self.http_post(&url, &body).await?;
        serde_json::from_str(&resp).map_err(|e| IssuerError::Json(e.to_string()))
    }

    /// Raw HTTP POST using tokio (no reqwest dependency — stays minimal)
    async fn http_post(&self, url: &str, body: &str) -> Result<String, IssuerError> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpStream;

        // Parse URL manually (keep zero-dep)
        let (host, path) = self.parse_url(url)?;
        let addr = format!("{}:80", host);

        let mut stream = tokio::time::timeout(
            self.timeout,
            TcpStream::connect(&addr),
        ).await
        .map_err(|_| IssuerError::Timeout)?
        .map_err(|e| IssuerError::Http(e.to_string()))?;

        let request = format!(
            "POST {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            path, host, body.len(), body
        );
        stream.write_all(request.as_bytes()).await
            .map_err(|e| IssuerError::Http(e.to_string()))?;

        let mut response = String::new();
        stream.read_to_string(&mut response).await
            .map_err(|e| IssuerError::Http(e.to_string()))?;

        // Extract body (after \r\n\r\n)
        response.find("\r\n\r\n")
            .map(|i| response[i+4..].to_string())
            .ok_or_else(|| IssuerError::Http("no body in response".to_string()))
    }

    fn parse_url<'a>(&self, url: &'a str) -> Result<(&'a str, &'a str), IssuerError> {
        let stripped = url.strip_prefix("http://")
            .or_else(|| url.strip_prefix("https://"))
            .ok_or_else(|| IssuerError::Http("invalid URL".to_string()))?;
        let slash = stripped.find('/').unwrap_or(stripped.len());
        let host = &stripped[..slash];
        let path = if slash < stripped.len() { &stripped[slash..] } else { "/" };
        Ok((host, path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_url_parse_with_path() {
        let client = IssuerClient::new("http://localhost:8080");
        let (host, path) = client.parse_url("http://localhost:8080/v1/pot/generate").unwrap();
        assert_eq!(host, "localhost:8080");
        assert_eq!(path, "/v1/pot/generate");
    }

    #[test]
    fn test_url_parse_root() {
        let client = IssuerClient::new("http://api.helm-protocol.io");
        let (host, path) = client.parse_url("http://api.helm-protocol.io/v1/pot/generate").unwrap();
        assert_eq!(host, "api.helm-protocol.io");
        assert_eq!(path, "/v1/pot/generate");
    }

    #[test]
    fn test_default_urls_defined() {
        assert!(DEFAULT_ISSUER_URL.starts_with("https://"));
        assert!(POC_ISSUER_URL.starts_with("http://"));
    }

    #[test]
    fn test_generate_request_serialization() {
        let req = GenerateRequest {
            ctx_id: "8453:0xPool".to_string(),
            tier: "T1_block".to_string(),
            use_roughtime: true,
            caller_did: None,
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("T1_block"));
        assert!(json.contains("8453:0xPool"));
    }
}
