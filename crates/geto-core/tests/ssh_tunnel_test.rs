use geto_core::db::ssh::SshTunnel;
use geto_core::error::AppError;
use geto_core::store::connections::{SshAuthMethod, SshSecret};

#[tokio::test]
async fn test_ssh_tunnel_missing_private_key() {
    let ssh = SshSecret {
        host: "127.0.0.1".to_string(),
        port: 2222,
        username: "testuser".to_string(),
        auth_method: SshAuthMethod::Key,
        password: None,
        private_key: None,
        passphrase: None,
    };

    let result = SshTunnel::start(&ssh, "localhost", 5432).await;
    match result {
        Err(AppError::BadRequest(msg)) => {
            assert!(
                msg.contains("SSH private key is missing"),
                "Expected missing key error, got: {}",
                msg
            );
        }
        other => panic!("Expected AppError::BadRequest, got {:?}", other.map(|_| ())),
    }
}

#[tokio::test]
async fn test_ssh_tunnel_invalid_private_key_format() {
    let ssh = SshSecret {
        host: "127.0.0.1".to_string(),
        port: 2222,
        username: "testuser".to_string(),
        auth_method: SshAuthMethod::Key,
        password: None,
        private_key: Some("NOT_A_VALID_OPENSSH_KEY".to_string()),
        passphrase: None,
    };

    let result = SshTunnel::start(&ssh, "localhost", 5432).await;
    match result {
        Err(AppError::Database(msg)) => {
            assert!(
                msg.contains("Failed to decode SSH private key"),
                "Expected decode key error, got: {}",
                msg
            );
        }
        other => panic!("Expected AppError::Database, got {:?}", other.map(|_| ())),
    }
}

#[tokio::test]
async fn test_ssh_tunnel_unreachable_ssh_host() {
    // Pick an unused local port that won't accept connections
    let ssh = SshSecret {
        host: "127.0.0.1".to_string(),
        port: 59998,
        username: "testuser".to_string(),
        auth_method: SshAuthMethod::Password,
        password: Some("secret".to_string()),
        private_key: None,
        passphrase: None,
    };

    let result = SshTunnel::start(&ssh, "localhost", 5432).await;
    match result {
        Err(AppError::Database(msg)) => {
            assert!(
                msg.contains("Failed to connect to SSH host"),
                "Expected connection failure, got: {}",
                msg
            );
        }
        other => panic!("Expected AppError::Database, got {:?}", other.map(|_| ())),
    }
}

#[tokio::test]
async fn test_ssh_tunnel_valid_ed25519_key_decoding_and_connection_failure() {
    // Generate valid ed25519 key
    let priv_key = ssh_key::PrivateKey::random(&mut rand::rngs::OsRng, ssh_key::Algorithm::Ed25519)
        .expect("failed to generate ed25519 key");
    let openssh_pem = priv_key
        .to_openssh(ssh_key::LineEnding::LF)
        .expect("failed to encode openssh key");

    let ssh = SshSecret {
        host: "127.0.0.1".to_string(),
        port: 59997,
        username: "testuser".to_string(),
        auth_method: SshAuthMethod::Key,
        password: None,
        private_key: Some(openssh_pem.to_string()),
        passphrase: None,
    };

    // Should successfully decode key, but fail on unreachable host
    let result = SshTunnel::start(&ssh, "localhost", 5432).await;
    match result {
        Err(AppError::Database(msg)) => {
            assert!(
                msg.contains("Failed to connect to SSH host"),
                "Expected connection failure after valid key parse, got: {}",
                msg
            );
        }
        other => panic!("Expected AppError::Database, got {:?}", other.map(|_| ())),
    }
}
