use jni::objects::{JClass, JString};
use jni::sys::jstring;
use jni::JNIEnv;
use kaspa_addresses::{
    Address as KaspaAddress, Prefix as KaspaAddressPrefix, Version as KaspaAddressVersion,
};
use kaspa_bip32::secp256k1::SecretKey as KaspaSecretKey;
use kaspa_bip32::{
    ChildNumber as KaspaChildNumber, DerivationPath as KaspaDerivationPath,
    ExtendedPrivateKey as KaspaExtendedPrivateKey,
};
use kaspa_consensus_core::{
    config::params::Params as KaspaParams,
    mass::{Mass as KaspaMass, MassCalculator as KaspaMassCalculator},
    network::NetworkType as KaspaNetworkType,
    sign::{sign_with_multiple_v2 as kaspa_sign_with_multiple_v2, verify as kaspa_verify},
    subnets::{SubnetworkId, SUBNETWORK_ID_SIZE},
    tx::{
        SignableTransaction as KaspaSignableTransaction, Transaction as KaspaTransaction,
        TransactionInput as KaspaTransactionInput, TransactionOutput as KaspaTransactionOutput,
        UtxoEntry as KaspaUtxoEntry,
    },
};
use kaspa_grpc_client::GrpcClient;
use kaspa_rpc_core::{api::rpc::RpcApi, RpcTransaction, RpcUtxosByAddressesEntry};
use kaspa_txscript::pay_to_address_script;
use serde::{Deserialize, Serialize};
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::time::{Duration, Instant};
#[cfg(target_os = "ios")]
use std::{alloc, ptr};

const BACKEND_NAME: &str = "rusty-kaspa-jni";
const C_ABI_BACKEND_NAME: &str = "rusty-kaspa-c-abi";

#[cfg(target_os = "ios")]
#[no_mangle]
pub unsafe extern "C" fn sys_alloc_aligned(bytes: usize, align: usize) -> *mut u8 {
    let Ok(layout) = alloc::Layout::from_size_align(bytes, align) else {
        return ptr::null_mut();
    };
    alloc::alloc(layout)
}
const BACKEND_VERSION: &str = "0.1.0";
const IGRA_VERSION: u8 = 0x9;
const IGRA_CANONICAL_RAW_TX_TYPE: u8 = 0x04;
const IGRA_CANONICAL_RAW_HEADER: u8 = (IGRA_VERSION << 4) | IGRA_CANONICAL_RAW_TX_TYPE;
const IGRA_MAX_L2DATA_BYTES: usize = 24_800;
const DEFAULT_TX_ID_PREFIX: &str = "97b4";
const DEFAULT_LANE_ID: &str = "97b10000";
const DEFAULT_MINING_TIMEOUT_SECS: u64 = 120;
const KASPA_TX_VERSION_NATIVE: u16 = 0;
const KASPA_TX_VERSION_TOCCATA: u16 = 1;
const KASPA_TOCCATA_COMPUTE_BUDGET_PER_INPUT: u16 = 10;
const KASPA_SUBNETWORK_NAMESPACE_LEN: usize = 4;
const BASE_SUBMIT_FEE_SOMPI: u64 = 200_000;
const INITIAL_FEE_PER_PAYLOAD_BYTE_SOMPI: u64 = 200;
const EXTRA_INPUT_FEE_SOMPI: u64 = 100_000;
const CURRENT_KASPA_MIN_RELAY_FEE_PER_KG_SOMPI: u64 = 100_000;
const FEE_SELECTION_ATTEMPTS: usize = 4;
const MAX_STANDARD_KASPA_TX_MASS: u64 = 100_000;
const MIN_CHANGE_SOMPI: u64 = 1_000;

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildAndSignCarrierTxRequest {
    seed_hex: Option<String>,
    network: Option<String>,
    payload_hex: Option<String>,
    rpc_url: Option<String>,
    tx_id_prefix: Option<String>,
    lane_id: Option<String>,
    mining_timeout_secs: Option<u64>,
    account: Option<u32>,
    change: Option<u32>,
    index: Option<u32>,
    derivation_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmitCarrierTxRequest {
    raw_tx_json: Option<String>,
    raw_tx_hex: Option<String>,
    rpc_url: Option<String>,
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
struct BuildAndSignCarrierTxResponse {
    raw_tx_json: String,
    carrier_tx_id: String,
    source_address: String,
    network: String,
    derivation_path: String,
    tx_id_prefix: String,
    lane_id: String,
    payload_nonce: u64,
    payload_bytes: usize,
    l2data_bytes: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SubmitCarrierTxResponse {
    kaspa_tx_id: String,
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
            supports_carrier_signing: true,
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

#[no_mangle]
pub extern "system" fn Java_com_kraken_superwallet_modules_igrakaspa_IgraKaspaRustBackend_buildAndSignCarrierTxJson(
    mut env: JNIEnv,
    _class: JClass,
    params_json: JString,
) -> jstring {
    let result = read_java_string(&mut env, &params_json)
        .and_then(|params_json| build_and_sign_carrier_tx_json(&params_json));

    match result {
        Ok(response) => to_java_json(&mut env, &response),
        Err(message) => to_java_json(
            &mut env,
            &ErrorResponse {
                error_code: "E_IGRA_KASPA_RUST_BUILD_SIGN_FAILED",
                message,
            },
        ),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kraken_superwallet_modules_igrakaspa_IgraKaspaRustBackend_submitCarrierTxJson(
    mut env: JNIEnv,
    _class: JClass,
    params_json: JString,
) -> jstring {
    let result = read_java_string(&mut env, &params_json)
        .and_then(|params_json| submit_carrier_tx_json(&params_json));

    match result {
        Ok(response) => to_java_json(&mut env, &response),
        Err(message) => to_java_json(
            &mut env,
            &ErrorResponse {
                error_code: "E_IGRA_KASPA_RUST_SUBMIT_FAILED",
                message,
            },
        ),
    }
}

#[no_mangle]
pub extern "C" fn igra_kaspa_backend_status_json() -> *mut c_char {
    to_c_json(&BridgeStatus {
        module_name: "IgraKaspa",
        bridge_version: BACKEND_VERSION,
        backend: C_ABI_BACKEND_NAME,
        rust_backend: true,
        supports_carrier_signing: true,
        supports_bridge_benchmark: true,
        supports_carrier_address_derivation: true,
    })
}

#[no_mangle]
pub extern "C" fn igra_kaspa_derive_carrier_address_json(
    params_json: *const c_char,
) -> *mut c_char {
    let result = read_c_string(params_json)
        .and_then(|params_json| derive_carrier_address_json(&params_json));

    match result {
        Ok(response) => to_c_json(&response),
        Err(message) => to_c_json(&ErrorResponse {
            error_code: "E_IGRA_KASPA_RUST_DERIVE_FAILED",
            message,
        }),
    }
}

#[no_mangle]
pub extern "C" fn igra_kaspa_build_and_sign_carrier_tx_json(
    params_json: *const c_char,
) -> *mut c_char {
    let result = read_c_string(params_json)
        .and_then(|params_json| build_and_sign_carrier_tx_json(&params_json));

    match result {
        Ok(response) => to_c_json(&response),
        Err(message) => to_c_json(&ErrorResponse {
            error_code: "E_IGRA_KASPA_RUST_BUILD_SIGN_FAILED",
            message,
        }),
    }
}

#[no_mangle]
pub extern "C" fn igra_kaspa_submit_carrier_tx_json(params_json: *const c_char) -> *mut c_char {
    let result =
        read_c_string(params_json).and_then(|params_json| submit_carrier_tx_json(&params_json));

    match result {
        Ok(response) => to_c_json(&response),
        Err(message) => to_c_json(&ErrorResponse {
            error_code: "E_IGRA_KASPA_RUST_SUBMIT_FAILED",
            message,
        }),
    }
}

#[no_mangle]
pub extern "C" fn igra_kaspa_free_string(value: *mut c_char) {
    if value.is_null() {
        return;
    }

    unsafe {
        let _ = CString::from_raw(value);
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

fn build_and_sign_carrier_tx_json(
    params_json: &str,
) -> Result<BuildAndSignCarrierTxResponse, String> {
    let request: BuildAndSignCarrierTxRequest = serde_json::from_str(params_json)
        .map_err(|err| format!("invalid buildAndSignCarrierTx params JSON: {err}"))?;
    let built = build_signed_carrier_tx(&request)?;
    let rpc_transaction = RpcTransaction::from(&built.transaction);
    let raw_tx_json = serde_json::to_string(&rpc_transaction)
        .map_err(|err| format!("failed to encode signed Kaspa RPC transaction JSON: {err}"))?;

    Ok(BuildAndSignCarrierTxResponse {
        raw_tx_json,
        carrier_tx_id: built.carrier_tx_id,
        source_address: built.source_address,
        network: built.network,
        derivation_path: built.derivation_path,
        tx_id_prefix: built.tx_id_prefix,
        lane_id: built.lane_id,
        payload_nonce: built.payload_nonce,
        payload_bytes: built.payload_bytes,
        l2data_bytes: built.l2data_bytes,
    })
}

fn submit_carrier_tx_json(params_json: &str) -> Result<SubmitCarrierTxResponse, String> {
    let request: SubmitCarrierTxRequest = serde_json::from_str(params_json)
        .map_err(|err| format!("invalid submitCarrierTx params JSON: {err}"))?;
    let rpc_url = request
        .rpc_url
        .as_deref()
        .ok_or_else(|| "submitCarrierTx requires rpcUrl".to_string())?;
    let raw_tx_json = resolve_raw_tx_json(&request)?;
    let rpc_transaction: RpcTransaction = serde_json::from_str(&raw_tx_json)
        .map_err(|err| format!("rawTxJson is not a valid Kaspa RPC transaction JSON: {err}"))?;
    let kaspa_tx_id = with_tokio_runtime(|| async move {
        let client = connect_kaspa_rpc(rpc_url).await?;
        let tx_id = client
            .submit_transaction(rpc_transaction, false)
            .await
            .map_err(|err| format!("Kaspa submit_transaction failed: {err}"))?;
        Ok::<_, String>(tx_id.to_string())
    })?;

    Ok(SubmitCarrierTxResponse { kaspa_tx_id })
}

struct BuiltCarrierTx {
    transaction: KaspaTransaction,
    carrier_tx_id: String,
    source_address: String,
    network: String,
    derivation_path: String,
    tx_id_prefix: String,
    lane_id: String,
    payload_nonce: u64,
    payload_bytes: usize,
    l2data_bytes: usize,
}

fn build_signed_carrier_tx(
    request: &BuildAndSignCarrierTxRequest,
) -> Result<BuiltCarrierTx, String> {
    let seed = decode_seed_hex(request.seed_hex.as_deref().ok_or_else(|| {
        "buildAndSignCarrierTx requires seedHex from the unlocked wallet seed buffer".to_string()
    })?)?;
    let raw_tx = decode_hex(
        request
            .payload_hex
            .as_deref()
            .ok_or_else(|| "buildAndSignCarrierTx requires payloadHex".to_string())?,
        "payloadHex",
    )?;
    validate_canonical_raw_tx(&raw_tx)?;
    let network = request
        .network
        .clone()
        .unwrap_or_else(|| "testnet-10".to_string());
    let (network_type, address_prefix) = kaspa_network_descriptor(&network)?;
    let account = request.account.unwrap_or(0);
    let change = request.change.unwrap_or(0);
    let index = request.index.unwrap_or(0);
    let derivation_path = request
        .derivation_path
        .clone()
        .unwrap_or_else(|| format!("m/44'/111111'/{account}'/{change}/{index}"));
    let private_key = derive_private_key_from_seed(&seed, &derivation_path)?;
    let source_address = kaspa_address_from_private_key(&private_key, address_prefix)?;
    let rpc_url = request
        .rpc_url
        .as_deref()
        .ok_or_else(|| "buildAndSignCarrierTx requires rpcUrl".to_string())?;
    let tx_id_prefix = normalize_hex(
        request
            .tx_id_prefix
            .as_deref()
            .unwrap_or(DEFAULT_TX_ID_PREFIX),
        "txIdPrefix",
    )?;
    let tx_id_prefix_bytes = hex::decode(&tx_id_prefix)
        .map_err(|err| format!("txIdPrefix must be hex encoded: {err}"))?;
    if tx_id_prefix_bytes.is_empty() {
        return Err("txIdPrefix cannot be empty".to_string());
    }
    let lane_id = request
        .lane_id
        .clone()
        .unwrap_or_else(|| DEFAULT_LANE_ID.to_string());
    let subnetwork_id = parse_igra_lane_id(&lane_id)?;
    let timeout = Duration::from_secs(
        request
            .mining_timeout_secs
            .unwrap_or(DEFAULT_MINING_TIMEOUT_SECS),
    );
    let utxos = with_tokio_runtime(|| async {
        let client = connect_kaspa_rpc(rpc_url).await?;
        client
            .get_utxos_by_addresses(vec![source_address.clone()])
            .await
            .map_err(|err| format!("failed to load Kaspa UTXOs: {err}"))
    })?;
    let (payload_nonce, transaction) = mine_and_build_signed_payload_transaction(
        &private_key,
        &source_address,
        network_type,
        IGRA_CANONICAL_RAW_HEADER,
        &raw_tx,
        &tx_id_prefix_bytes,
        subnetwork_id,
        timeout,
        &utxos,
    )?;
    let carrier_tx_id = transaction.id().to_string();
    let payload_bytes = transaction.payload.len();

    Ok(BuiltCarrierTx {
        transaction,
        carrier_tx_id,
        source_address: source_address.to_string(),
        network,
        derivation_path,
        tx_id_prefix,
        lane_id,
        payload_nonce,
        payload_bytes,
        l2data_bytes: raw_tx.len(),
    })
}

fn resolve_raw_tx_json(request: &SubmitCarrierTxRequest) -> Result<String, String> {
    if let Some(raw_tx_json) = request.raw_tx_json.as_ref() {
        return Ok(raw_tx_json.clone());
    }
    let raw_tx_hex = request
        .raw_tx_hex
        .as_deref()
        .ok_or_else(|| "submitCarrierTx requires rawTxJson or rawTxHex".to_string())?;
    let bytes = decode_hex(raw_tx_hex, "rawTxHex")?;
    String::from_utf8(bytes).map_err(|err| format!("rawTxHex is not UTF-8 JSON: {err}"))
}

async fn connect_kaspa_rpc(rpc_url: &str) -> Result<GrpcClient, String> {
    let mut attempt = 0u64;
    loop {
        match GrpcClient::connect(rpc_url.to_string()).await {
            Ok(client) => return Ok(client),
            Err(_err) if attempt < 2 => {
                attempt = attempt.saturating_add(1);
                tokio::time::sleep(Duration::from_millis(200 * attempt)).await;
            }
            Err(err) => return Err(format!("failed to connect to Kaspa RPC {rpc_url}: {err}")),
        }
    }
}

fn with_tokio_runtime<F, Fut, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|err| format!("failed to start native Tokio runtime: {err}"))?
        .block_on(f())
}

fn validate_canonical_raw_tx(raw_tx: &[u8]) -> Result<(), String> {
    let first = raw_tx
        .first()
        .ok_or_else(|| "empty canonical raw transaction bytes".to_string())?;
    if *first == 0x03 || *first == 0x04 {
        return Err(
            "EIP-4844 and EIP-7702 canonical transactions are not supported by Igra carrier"
                .to_string(),
        );
    }
    if raw_tx.len() > IGRA_MAX_L2DATA_BYTES {
        return Err(format!(
            "canonical raw transaction size {} bytes exceeds max {}",
            raw_tx.len(),
            IGRA_MAX_L2DATA_BYTES
        ));
    }
    Ok(())
}

fn decode_seed_hex(seed_hex: &str) -> Result<Vec<u8>, String> {
    let seed_hex = seed_hex.trim().trim_start_matches("0x");
    if seed_hex.is_empty() {
        return Err("seedHex cannot be empty".to_string());
    }
    hex::decode(seed_hex).map_err(|err| format!("seedHex must be hex encoded: {err}"))
}

fn decode_hex(value: &str, label: &str) -> Result<Vec<u8>, String> {
    let value = normalize_hex(value, label)?;
    if value.len() % 2 != 0 {
        return Err(format!("{label} must contain an even number of hex digits"));
    }
    hex::decode(value).map_err(|err| format!("{label} must be hex encoded: {err}"))
}

fn normalize_hex(value: &str, label: &str) -> Result<String, String> {
    let value = value
        .trim()
        .trim_start_matches("0x")
        .trim_start_matches("0X");
    if value.is_empty() {
        return Err(format!("{label} cannot be empty"));
    }
    if !value.as_bytes().iter().all(u8::is_ascii_hexdigit) {
        return Err(format!("{label} must be hex encoded"));
    }
    Ok(value.to_ascii_lowercase())
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

fn kaspa_network_descriptor(
    network: &str,
) -> Result<(KaspaNetworkType, KaspaAddressPrefix), String> {
    match network.trim().to_ascii_lowercase().as_str() {
        "mainnet" | "kaspa-mainnet" => Ok((KaspaNetworkType::Mainnet, KaspaAddressPrefix::Mainnet)),
        "testnet" | "testnet-10" | "tn10" => {
            Ok((KaspaNetworkType::Testnet, KaspaAddressPrefix::Testnet))
        }
        "devnet" => Ok((KaspaNetworkType::Devnet, KaspaAddressPrefix::Devnet)),
        "simnet" => Ok((KaspaNetworkType::Simnet, KaspaAddressPrefix::Simnet)),
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
    Ok(KaspaAddress::new(
        prefix,
        KaspaAddressVersion::PubKey,
        &payload,
    ))
}

fn build_payload_with_nonce(header: u8, l2data: &[u8], nonce: u32) -> Vec<u8> {
    let mut payload = Vec::with_capacity(1 + l2data.len().saturating_add(4));
    payload.push(header);
    payload.extend_from_slice(l2data);
    payload.extend_from_slice(&nonce.to_be_bytes());
    payload
}

fn parse_igra_lane_id(value: &str) -> Result<SubnetworkId, String> {
    let value = normalize_hex(value, "laneId")?;
    let subnetwork_id = match value.len() {
        8 => {
            let mut namespace = [0u8; KASPA_SUBNETWORK_NAMESPACE_LEN];
            hex::decode_to_slice(value, &mut namespace)
                .map_err(|err| format!("laneId is invalid hex: {err}"))?;
            let mut bytes = [0u8; SUBNETWORK_ID_SIZE];
            bytes[..KASPA_SUBNETWORK_NAMESPACE_LEN].copy_from_slice(&namespace);
            SubnetworkId::from_bytes(bytes)
        }
        40 => {
            let mut bytes = [0u8; SUBNETWORK_ID_SIZE];
            hex::decode_to_slice(value, &mut bytes)
                .map_err(|err| format!("laneId is invalid hex: {err}"))?;
            SubnetworkId::from_bytes(bytes)
        }
        len => {
            return Err(format!(
                "laneId expected 8 hex chars or 40 hex chars, got {len}"
            ));
        }
    };

    let bytes: &[u8; SUBNETWORK_ID_SIZE] = subnetwork_id.as_ref();
    if bytes[1..].iter().all(|byte| *byte == 0) {
        return Err("laneId reserved system lane shape is not allowed".to_string());
    }
    if bytes[KASPA_SUBNETWORK_NAMESPACE_LEN..]
        .iter()
        .any(|byte| *byte != 0)
    {
        return Err(
            "laneId full lane id must use user-lane shape [namespace(4), zero_tail(16)]"
                .to_string(),
        );
    }

    Ok(subnetwork_id)
}

fn mine_and_build_signed_payload_transaction(
    private_key: &[u8; 32],
    source_address: &KaspaAddress,
    network_type: KaspaNetworkType,
    payload_header: u8,
    l2data: &[u8],
    tx_id_prefix: &[u8],
    subnetwork_id: SubnetworkId,
    timeout: Duration,
    utxos: &[RpcUtxosByAddressesEntry],
) -> Result<(u64, KaspaTransaction), String> {
    if utxos.is_empty() {
        return Err(format!(
            "insufficient Kaspa UTXOs for fee payment (source address: {source_address})"
        ));
    }

    let payload_len = 1usize.saturating_add(l2data.len()).saturating_add(4);
    let mut sorted = utxos.to_vec();
    sorted.sort_by_key(|entry| std::cmp::Reverse(entry.utxo_entry.amount));
    let source_script_public_key = pay_to_address_script(source_address);
    let consensus_params = KaspaParams::from(network_type);
    let mass_calculator = KaspaMassCalculator::new_with_consensus_params(&consensus_params);
    let mass_cofactors = consensus_params.mempool_block_mass_cofactors().after();

    let mut fee_floor = initial_fee_sompi(payload_len, 1);
    for attempt in 0..FEE_SELECTION_ATTEMPTS {
        let mut selected = Vec::new();
        let mut total_input = 0u64;
        for entry in sorted.iter().cloned() {
            total_input = total_input.saturating_add(entry.utxo_entry.amount);
            selected.push(entry);
            let selected_fee = fee_floor.max(initial_fee_sompi(payload_len, selected.len()));
            let required_total = selected_fee.saturating_add(MIN_CHANGE_SOMPI);
            if total_input >= required_total {
                break;
            }
        }

        let fee = fee_floor.max(initial_fee_sompi(payload_len, selected.len()));
        let required_total = fee.saturating_add(MIN_CHANGE_SOMPI);
        if total_input < required_total {
            return Err(format!(
                "insufficient Kaspa UTXOs for fee payment (source address: {source_address})"
            ));
        }

        let tx_version = if subnetwork_id == SubnetworkId::default() {
            KASPA_TX_VERSION_NATIVE
        } else {
            KASPA_TX_VERSION_TOCCATA
        };
        let inputs = selected
            .iter()
            .map(|entry| {
                let outpoint = entry.outpoint.clone().into();
                if tx_version == KASPA_TX_VERSION_TOCCATA {
                    KaspaTransactionInput::new_with_compute_budget(
                        outpoint,
                        Vec::new(),
                        0,
                        KASPA_TOCCATA_COMPUTE_BUDGET_PER_INPUT,
                    )
                } else {
                    KaspaTransactionInput::new(outpoint, Vec::new(), 0, 1)
                }
            })
            .collect::<Vec<_>>();
        let output_value = total_input.saturating_sub(fee);
        if output_value < MIN_CHANGE_SOMPI {
            return Err(format!(
                "insufficient Kaspa UTXOs for fee payment (source address: {source_address})"
            ));
        }
        let outputs = vec![KaspaTransactionOutput::new(
            output_value,
            source_script_public_key.clone(),
        )];

        let payload = build_payload_with_nonce(payload_header, l2data, 0);
        let nonce_offset = payload.len().saturating_sub(4);
        let mut tx = KaspaTransaction::new(
            tx_version,
            inputs,
            outputs,
            0,
            subnetwork_id.clone(),
            0,
            payload,
        );

        let start = Instant::now();
        let mut nonce = 0_u32;
        loop {
            if start.elapsed() > timeout {
                return Err(format!(
                    "timed out mining kaspa txid prefix after {}ms",
                    timeout.as_millis()
                ));
            }

            tx.payload[nonce_offset..].copy_from_slice(&nonce.to_be_bytes());
            tx.finalize();
            if tx.id().as_bytes().starts_with(tx_id_prefix) {
                break;
            }

            nonce = nonce.wrapping_add(1);
            if nonce == 0 {
                if let Some(first) = tx.outputs.first_mut() {
                    first.value = first.value.saturating_sub(1);
                }
                tx.finalize();
            }
        }

        let entries = selected
            .iter()
            .map(|entry| KaspaUtxoEntry {
                amount: entry.utxo_entry.amount,
                script_public_key: entry.utxo_entry.script_public_key.clone(),
                block_daa_score: entry.utxo_entry.block_daa_score,
                is_coinbase: entry.utxo_entry.is_coinbase,
                covenant_id: entry.utxo_entry.covenant_id,
            })
            .collect::<Vec<_>>();

        let signable = KaspaSignableTransaction::with_entries(tx, entries);
        let signed = kaspa_sign_with_multiple_v2(signable, std::slice::from_ref(private_key))
            .fully_signed()
            .map_err(|err| format!("failed to sign Kaspa tx: {err}"))?;
        kaspa_verify(&signed.as_verifiable())
            .map_err(|err| format!("invalid Kaspa signature set: {err}"))?;

        if !signed.tx.id().as_bytes().starts_with(tx_id_prefix) {
            return Err(
                "mined Kaspa txid prefix changed after signing; refusing to broadcast".to_string(),
            );
        }

        let non_contextual = mass_calculator.calc_non_contextual_masses(&signed.tx);
        let contextual = mass_calculator
            .calc_contextual_masses(&signed.as_verifiable())
            .ok_or_else(|| "failed to calculate Kaspa tx storage mass".to_string())?;
        let storage_mass = contextual.storage_mass;
        let mass = KaspaMass::new(non_contextual, contextual).normalized_max(&mass_cofactors);
        if mass > MAX_STANDARD_KASPA_TX_MASS {
            return Err(format!(
                "Kaspa transaction mass {mass} exceeds standard limit {MAX_STANDARD_KASPA_TX_MASS}"
            ));
        }

        let output_total = signed
            .tx
            .outputs
            .iter()
            .fold(0_u64, |sum, output| sum.saturating_add(output.value));
        let actual_fee = total_input.saturating_sub(output_total);
        let required_relay_fee = minimum_relay_fee_sompi_for_mass(mass);
        if actual_fee >= required_relay_fee {
            let tx = signed.tx;
            tx.set_storage_mass(storage_mass);
            return Ok((nonce as u64, tx));
        }

        if attempt + 1 == FEE_SELECTION_ATTEMPTS {
            return Err(format!(
                "Kaspa transaction fee {actual_fee} is below required relay fee {required_relay_fee} for mass {mass}"
            ));
        }

        fee_floor = required_relay_fee;
    }

    Err("failed to select a sufficient Kaspa relay fee".to_string())
}

fn initial_fee_sompi(payload_len: usize, inputs: usize) -> u64 {
    let payload_len = u64::try_from(payload_len).unwrap_or(u64::MAX);
    let input_tail = u64::try_from(inputs.saturating_sub(1)).unwrap_or(u64::MAX);
    BASE_SUBMIT_FEE_SOMPI
        .max(payload_len.saturating_mul(INITIAL_FEE_PER_PAYLOAD_BYTE_SOMPI))
        .saturating_add(input_tail.saturating_mul(EXTRA_INPUT_FEE_SOMPI))
}

fn minimum_relay_fee_sompi_for_mass(mass: u64) -> u64 {
    let mut fee = mass.saturating_mul(CURRENT_KASPA_MIN_RELAY_FEE_PER_KG_SOMPI) / 1000;
    if fee == 0 {
        fee = CURRENT_KASPA_MIN_RELAY_FEE_PER_KG_SOMPI;
    }
    fee
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

fn read_c_string(value: *const c_char) -> Result<String, String> {
    if value.is_null() {
        return Err("params JSON pointer was null".to_string());
    }

    unsafe {
        CStr::from_ptr(value)
            .to_str()
            .map(str::to_owned)
            .map_err(|err| format!("params JSON was not valid UTF-8: {err}"))
    }
}

fn to_c_json<T: Serialize>(value: &T) -> *mut c_char {
    let json = serde_json::to_string(value).unwrap_or_else(|err| {
        format!(
            "{{\"errorCode\":\"E_IGRA_KASPA_JSON_FAILED\",\"message\":\"failed to encode JSON: {err}\"}}"
        )
    });
    match CString::new(json) {
        Ok(value) => value.into_raw(),
        Err(err) => {
            let fallback = format!(
                "{{\"errorCode\":\"E_IGRA_KASPA_JSON_FAILED\",\"message\":\"failed to encode C string: {err}\"}}"
            );
            CString::new(fallback)
                .expect("fallback JSON does not contain interior NUL")
                .into_raw()
        }
    }
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
