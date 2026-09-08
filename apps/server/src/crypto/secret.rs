use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SecretError {
    #[error("Malformed encrypted secret")]
    Malformed,
    #[error("Saved password could not be decrypted (the encryption key changed). Edit the connection and re-enter the password.")]
    DecryptionFailed,
}

#[derive(Clone)]
pub struct SecretCipher {
    key: [u8; 32],
}

impl SecretCipher {
    pub fn new(master_key: &str) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(format!("geto-secret:{}", master_key).as_bytes());
        let result = hasher.finalize();
        let mut key = [0u8; 32];
        key.copy_from_slice(&result);
        Self { key }
    }

    pub fn encrypt(&self, plain: &str) -> String {
        let mut iv = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut iv);

        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        let nonce = Nonce::from_slice(&iv);

        let encrypted = cipher.encrypt(nonce, plain.as_bytes()).expect("encryption failure");
        let (ciphertext, tag) = encrypted.split_at(encrypted.len() - 16);

        format!(
            "v1:{}:{}:{}",
            BASE64.encode(iv),
            BASE64.encode(tag),
            BASE64.encode(ciphertext)
        )
    }

    pub fn decrypt(&self, encoded: &str) -> Result<String, SecretError> {
        let parts: Vec<&str> = encoded.split(':').collect();
        if parts.len() != 4 || parts[0] != "v1" {
            return Err(SecretError::Malformed);
        }

        let iv = BASE64.decode(parts[1]).map_err(|_| SecretError::Malformed)?;
        let tag = BASE64.decode(parts[2]).map_err(|_| SecretError::Malformed)?;
        let ciphertext = BASE64.decode(parts[3]).map_err(|_| SecretError::Malformed)?;

        if iv.len() != 12 || tag.len() != 16 {
            return Err(SecretError::Malformed);
        }

        let mut payload = ciphertext;
        payload.extend_from_slice(&tag);

        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&self.key));
        let nonce = Nonce::from_slice(&iv);

        let decrypted = cipher
            .decrypt(nonce, payload.as_ref())
            .map_err(|_| SecretError::DecryptionFailed)?;

        String::from_utf8(decrypted).map_err(|_| SecretError::DecryptionFailed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let cipher = SecretCipher::new("test-master-key-12345");
        let secret = "MySecretPassword!2026";
        let encrypted = cipher.encrypt(secret);
        assert!(encrypted.starts_with("v1:"));

        let decrypted = cipher.decrypt(&encrypted).expect("decryption failed");
        assert_eq!(decrypted, secret);
    }

    #[test]
    fn test_empty_string_roundtrip() {
        let cipher = SecretCipher::new("test-master-key-12345");
        let secret = "";
        let encrypted = cipher.encrypt(secret);
        let decrypted = cipher.decrypt(&encrypted).expect("decryption failed");
        assert_eq!(decrypted, secret);
    }

    #[test]
    fn test_wrong_key_fails() {
        let cipher1 = SecretCipher::new("key-1");
        let cipher2 = SecretCipher::new("key-2");
        let encrypted = cipher1.encrypt("super-secret");
        let result = cipher2.decrypt(&encrypted);
        assert!(result.is_err());
    }

    #[test]
    fn test_decrypt_real_typescript_ciphertext() {
        let cipher = SecretCipher::new("geto-default-master-key-3f9a1c7e5b2d48a0d6e1");
        let ts_encrypted = "v1:rQHz++/dq4sHSaGP:oscJE08oKnLsoElphYeSsg==:sG7L3lGVMBuwzHLM2eKTvg==";
        let decrypted = cipher.decrypt(ts_encrypted).expect("failed to decrypt TypeScript ciphertext");
        println!("Decrypted password from TypeScript: {}", decrypted);
        assert!(!decrypted.is_empty());
    }
}
