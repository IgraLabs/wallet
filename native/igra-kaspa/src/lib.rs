use jni::objects::{JClass, JString};
use jni::sys::jstring;
use jni::JNIEnv;
use kaspa_addresses::{Address as KaspaAddress, Prefix as KaspaAddressPrefix, Version as KaspaAddressVersion};
use kaspa_bip32::secp256k1::SecretKey as KaspaSecretKey;
use kaspa_bip32::{
    ChildNumber as KaspaChildNumber, DerivationPath as KaspaDerivationPath,
    ExtendedPrivateKey as KaspaExtendedPrivateKey,
};
use serde::{Deserialize, Serialize};

const BACKEND_NAME: &str = "rusty-kaspa-jni";
const BACKEND_VERSION: &str = "0.1.0";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeriveCarrierAddressRequest {
    seed_hex: Option<String>,
    network: Option<String>,
    account: Option<u32>,
    change: Option<u32>,
    index: Option<u32>,
    derivation_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeStatus {
    module_name: &'static str,
    bridge_version: &'static str,
    backend: &'static str,
    rust_backend: bool,
    supports_carrier_signing: bool,
    supports_bridge_benchmark: bool,
    supports_carrier_address_derivation: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeriveCarrierAddressResponse {
    address: String,
    network: String,
    derivation_path: String,
    account: u32,
    change: u32,
    index: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorResponse {
    error_code: &'static str,
    message: String,
}

#[no_mangle]
pub extern "system" fn Java_com_kraken_superwallet_modules_igrakaspa_IgraKaspaRustBackend_backendStatusJson(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    to_java_json(
        &mut env,
        &BridgeStatus {
            module_name: "IgraKaspa",
            bridge_version: BACKEND_VERSION,
            backend: BACKEND_NAME,
            rust_backend: true,
            supports_carrier_signing: false,
            supports_bridge_benchmark: true,
            supports_carrier_address_derivation: true,
        },
    )
}

#[no_mangle]
pub extern "system" fn Java_com_kraken_superwallet_modules_igrakaspa_IgraKaspaRustBackend_deriveCarrierAddressJson(
    mut env: JNIEnv,
    _class: JClass,
    params_json: JString,
) -> jstring {
    let result = read_java_string(&mut env, &params_json)
        .and_then(|params_json| derive_carrier_address_json(&params_json));

    match result {
        Ok(response) => to_java_json(&mut env, &response),
        Err(message) => to_java_json(
            &mut env,
            &ErrorResponse {
                error_code: "E_IGRA_KASPA_RUST_DERIVE_FAILED",
                message,
            },
        ),
    }
}

fn derive_carrier_address_json(params_json: &str) -> Result<DeriveCarrierAddressResponse, String> {
    let request: DeriveCarrierAddressRequest = serde_json::from_str(params_json)
        .map_err(|err| format!("invalid deriveCarrierAddress params JSON: {err}"))?;
    let seed_hex = request.seed_hex.as_deref().ok_or_else(|| {
        "deriveCarrierAddress requires seedHex from the unlocked wallet seed buffer".to_string()
    })?;
    let seed = decode_seed_hex(seed_hex)?;
    let network = request.network.unwrap_or_else(|| "testnet-10".to_string());
    let prefix = kaspa_address_prefix(&network)?;
    let account = request.account.unwrap_or(0);
    let change = request.change.unwrap_or(0);
    let index = request.index.unwrap_or(0);
    let derivation_path = request
        .derivation_path
        .unwrap_or_else(|| format!("m/44'/111111'/{account}'/{change}/{index}"));
    let private_key = derive_private_key_from_seed(&seed, &derivation_path)?;
    let address = kaspa_address_from_private_key(&private_key, prefix)?;

    Ok(DeriveCarrierAddressResponse {
        address: address.to_string(),
        network,
        derivation_path,
        account,
        change,
        index,
    })
}

fn decode_seed_hex(seed_hex: &str) -> Result<Vec<u8>, String> {
    let seed_hex = seed_hex.trim().trim_start_matches("0x");
    if seed_hex.is_empty() {
        return Err("seedHex cannot be empty".to_string());
    }
    hex::decode(seed_hex).map_err(|err| format!("seedHex must be hex encoded: {err}"))
}

fn kaspa_address_prefix(network: &str) -> Result<KaspaAddressPrefix, String> {
    match network.trim().to_ascii_lowercase().as_str() {
        "mainnet" | "kaspa-mainnet" => Ok(KaspaAddressPrefix::Mainnet),
        "testnet" | "testnet-10" | "tn10" => Ok(KaspaAddressPrefix::Testnet),
        "devnet" => Ok(KaspaAddressPrefix::Devnet),
        "simnet" => Ok(KaspaAddressPrefix::Simnet),
        other => Err(format!("unsupported Kaspa network: {other}")),
    }
}

fn derive_private_key_from_seed(seed: &[u8], derivation_path: &str) -> Result<[u8; 32], String> {
    let xprv = KaspaExtendedPrivateKey::<KaspaSecretKey>::new(seed)
        .map_err(|err| format!("failed to create Kaspa extended private key: {err}"))?;
    let path = derivation_path
        .parse::<KaspaDerivationPath>()
        .map_err(|err| format!("invalid Kaspa derivation path `{derivation_path}`: {err}"))?;
    let mut node = xprv;

    // The Kaspa DerivationPath implementation is iterable in the same shape
    // used by rusty-kaspa CLI/wallet code.
    for child in path.into_iter() {
        let child_number: KaspaChildNumber = child;
        node = node
            .derive_child(child_number)
            .map_err(|err| format!("failed to derive Kaspa child key: {err}"))?;
    }

    Ok(node.private_key().secret_bytes())
}

fn kaspa_address_from_private_key(
    private_key: &[u8; 32],
    prefix: KaspaAddressPrefix,
) -> Result<KaspaAddress, String> {
    let secret = KaspaSecretKey::from_slice(private_key)
        .map_err(|err| format!("failed to parse Kaspa secret key: {err}"))?;
    let public_key = kaspa_bip32::secp256k1::PublicKey::from_secret_key_global(&secret);
    let payload = public_key.x_only_public_key().0.serialize();
    Ok(KaspaAddress::new(prefix, KaspaAddressVersion::PubKey, &payload))
}

fn read_java_string(env: &mut JNIEnv, value: &JString) -> Result<String, String> {
    env.get_string(value)
        .map(|value| value.into())
        .map_err(|err| format!("failed to read Java string: {err}"))
}

fn to_java_json<T: Serialize>(env: &mut JNIEnv, value: &T) -> jstring {
    let json = serde_json::to_string(value).unwrap_or_else(|err| {
        format!(
            "{{\"errorCode\":\"E_IGRA_KASPA_JSON_FAILED\",\"message\":\"failed to encode JSON: {err}\"}}"
        )
    });
    env.new_string(json)
        .expect("failed to allocate Java string")
        .into_raw()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_known_kaspa_testnet_address_from_bip39_seed() {
        let seed = hex::decode("5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4")
            .expect("seed hex");
        let private_key = derive_private_key_from_seed(&seed, "m/44'/111111'/0'/0/0")
            .expect("derive private key");
        let address = kaspa_address_from_private_key(&private_key, KaspaAddressPrefix::Testnet)
            .expect("derive address");

        assert_eq!(
            address.to_string(),
            "kaspatest:qqd6e65yefepe9wk0m9vuxdufxd80sphy67gwwd0vdaumzdt4tc9ssxd5s7gn"
        );
    }
}
