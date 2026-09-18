use std::sync::Arc;
use russh::client::{self, AuthResult, Config, Handler};
use russh::keys::{decode_secret_key, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use tokio::sync::oneshot;

use crate::error::AppError;
use crate::store::connections::{SshAuthMethod, SshSecret};

#[derive(Clone)]
struct TunnelHandler;

impl Handler for TunnelHandler {
    type Error = russh::Error;

    fn check_server_key(
        &mut self,
        _server_public_key: &PublicKeyOrCertificate,
    ) -> impl std::future::Future<Output = Result<bool, Self::Error>> + Send {
        async { Ok(true) }
    }
}

pub struct SshTunnel {
    pub local_port: u16,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl SshTunnel {
    pub async fn start(
        ssh: &SshSecret,
        remote_host: &str,
        remote_port: u16,
    ) -> Result<Self, AppError> {
        let ssh_host = ssh.host.trim();
        let ssh_port = if ssh.port > 0 { ssh.port as u16 } else { 22 };

        // Pre-validate credentials before establishing network connection
        let decoded_priv_key = match ssh.auth_method {
            SshAuthMethod::Key => {
                let key_str = ssh.private_key.as_deref().ok_or_else(|| {
                    AppError::BadRequest("SSH private key is missing".to_string())
                })?;
                let pass = ssh.passphrase.as_deref();
                let priv_key = decode_secret_key(key_str, pass).map_err(|e| {
                    AppError::Database(format!("Failed to decode SSH private key: {}", e))
                })?;
                Some(priv_key)
            }
            SshAuthMethod::Password => None,
        };

        let mut config = Config::default();
        config.inactivity_timeout = Some(std::time::Duration::from_secs(300));
        let config = Arc::new(config);
        let handler = TunnelHandler;

        let mut handle = client::connect(config, (ssh_host, ssh_port), handler)
            .await
            .map_err(|e| {
                AppError::Database(format!(
                    "Failed to connect to SSH host {}:{}: {}",
                    ssh_host, ssh_port, e
                ))
            })?;

        let auth_success = match ssh.auth_method {
            SshAuthMethod::Password => {
                let pwd = ssh.password.as_deref().unwrap_or_default();
                let res = handle
                    .authenticate_password(&ssh.username, pwd)
                    .await
                    .map_err(|e| {
                        AppError::Database(format!("SSH password authentication failed: {}", e))
                    })?;
                matches!(res, AuthResult::Success)
            }
            SshAuthMethod::Key => {
                let priv_key = decoded_priv_key.expect("validated above");
                let key_with_alg = PrivateKeyWithHashAlg::new(Arc::new(priv_key), None);
                let res = handle
                    .authenticate_publickey(&ssh.username, key_with_alg)
                    .await
                    .map_err(|e| {
                        AppError::Database(format!("SSH public key authentication failed: {}", e))
                    })?;
                matches!(res, AuthResult::Success)
            }
        };

        if !auth_success {
            return Err(AppError::Database(
                "SSH authentication rejected by server".to_string(),
            ));
        }

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| {
                AppError::Database(format!(
                    "Failed to bind local port for SSH tunnel: {}",
                    e
                ))
            })?;

        let local_port = listener
            .local_addr()
            .map_err(|e| AppError::Database(e.to_string()))?
            .port();

        let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
        let target_host = remote_host.to_string();
        let target_port = remote_port as u32;

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        tracing::debug!("SSH tunnel on local port {} received shutdown signal", local_port);
                        break;
                    }
                    res = listener.accept() => {
                        match res {
                            Ok((mut local_stream, _)) => {
                                let channel_res = handle
                                    .channel_open_direct_tcpip(
                                        target_host.clone(),
                                        target_port,
                                        "127.0.0.1",
                                        local_port as u32,
                                    )
                                    .await;

                                match channel_res {
                                    Ok(channel) => {
                                        let mut channel_stream = channel.into_stream();
                                        tokio::spawn(async move {
                                            if let Err(e) = tokio::io::copy_bidirectional(
                                                &mut local_stream,
                                                &mut channel_stream,
                                            )
                                            .await
                                            {
                                                tracing::trace!("SSH tunnel stream copy finished: {}", e);
                                            }
                                        });
                                    }
                                    Err(e) => {
                                        tracing::error!("Failed to open direct-tcpip channel: {}", e);
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::error!("Local listener error in SSH tunnel: {}", e);
                                break;
                            }
                        }
                    }
                }
            }
            let _ = handle.disconnect(russh::Disconnect::ByApplication, "", "en").await;
        });

        Ok(Self {
            local_port,
            shutdown_tx: Some(shutdown_tx),
        })
    }

    pub fn close(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        self.close();
    }
}
