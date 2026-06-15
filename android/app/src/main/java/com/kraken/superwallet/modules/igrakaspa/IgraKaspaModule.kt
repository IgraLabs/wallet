package com.kraken.superwallet.modules.igrakaspa

import android.os.SystemClock
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import org.json.JSONObject

class IgraKaspaModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String {
        return "IgraKaspa"
    }

    @ReactMethod
    fun getBridgeStatus(promise: Promise) {
        if (IgraKaspaRustBackend.isLoaded()) {
            resolveJsonObject(IgraKaspaRustBackend.backendStatusJson(), promise)
            return
        }

        val status = Arguments.createMap()
        status.putString("moduleName", name)
        status.putString("bridgeVersion", BRIDGE_VERSION)
        status.putString("backend", "kotlin-placeholder")
        status.putBoolean("rustBackend", false)
        status.putBoolean("supportsCarrierSigning", false)
        status.putBoolean("supportsBridgeBenchmark", true)
        status.putBoolean("supportsCarrierAddressDerivation", false)
        status.putString("rustBackendLoadError", IgraKaspaRustBackend.getLoadError())
        promise.resolve(status)
    }

    @ReactMethod
    fun echoPayload(payload: String, promise: Promise) {
        val result = Arguments.createMap()
        result.putDouble("payloadBytes", payload.toByteArray(Charsets.UTF_8).size.toDouble())
        result.putDouble("checksum", checksum(payload).toDouble())
        promise.resolve(result)
    }

    @ReactMethod
    fun benchmarkBridge(payloadBytes: Double, iterations: Double, promise: Promise) {
        val byteCount = payloadBytes.toInt().coerceIn(0, MAX_BENCHMARK_PAYLOAD_BYTES)
        val count = iterations.toInt().coerceIn(1, MAX_BENCHMARK_ITERATIONS)
        val payload = "a".repeat(byteCount)

        val startedAt = SystemClock.elapsedRealtimeNanos()
        var checksum = 0
        for (i in 0 until count) {
            checksum = checksum xor checksum(payload)
        }
        val elapsedNs = SystemClock.elapsedRealtimeNanos() - startedAt

        val result = Arguments.createMap()
        result.putDouble("iterations", count.toDouble())
        result.putDouble("payloadBytes", byteCount.toDouble())
        result.putDouble("elapsedMs", elapsedNs.toDouble() / 1_000_000.0)
        result.putDouble("nsPerIteration", elapsedNs.toDouble() / count.toDouble())
        result.putDouble("checksum", checksum.toDouble())
        result.putString("backend", "kotlin-placeholder")
        promise.resolve(result)
    }

    @ReactMethod
    fun deriveCarrierAddress(params: ReadableMap, promise: Promise) {
        if (!IgraKaspaRustBackend.isLoaded()) {
            rejectRustBackendMissing(promise, "deriveCarrierAddress")
            return
        }

        try {
            val result = IgraKaspaRustBackend.deriveCarrierAddressJson(readableMapToJson(params).toString())
            resolveJsonObject(result, promise)
        } catch (error: Throwable) {
            promise.reject(
                "E_IGRA_KASPA_RUST_DERIVE_FAILED",
                "deriveCarrierAddress failed in the Rusty-Kaspa native backend: ${error.message}"
            )
        }
    }

    @ReactMethod
    fun getCarrierBalance(params: ReadableMap, promise: Promise) {
        rejectRustBackendMissing(promise, "getCarrierBalance")
    }

    @ReactMethod
    fun buildAndSignCarrierTx(params: ReadableMap, promise: Promise) {
        if (!IgraKaspaRustBackend.isLoaded()) {
            rejectRustBackendMissing(promise, "buildAndSignCarrierTx")
            return
        }

        try {
            val result = IgraKaspaRustBackend.buildAndSignCarrierTxJson(readableMapToJson(params).toString())
            resolveJsonObject(result, promise)
        } catch (error: Throwable) {
            promise.reject(
                "E_IGRA_KASPA_RUST_BUILD_SIGN_FAILED",
                "buildAndSignCarrierTx failed in the Rusty-Kaspa native backend: ${error.message}"
            )
        }
    }

    @ReactMethod
    fun submitCarrierTx(params: ReadableMap, promise: Promise) {
        if (!IgraKaspaRustBackend.isLoaded()) {
            rejectRustBackendMissing(promise, "submitCarrierTx")
            return
        }

        try {
            val result = IgraKaspaRustBackend.submitCarrierTxJson(readableMapToJson(params).toString())
            resolveJsonObject(result, promise)
        } catch (error: Throwable) {
            promise.reject(
                "E_IGRA_KASPA_RUST_SUBMIT_FAILED",
                "submitCarrierTx failed in the Rusty-Kaspa native backend: ${error.message}"
            )
        }
    }

    private fun rejectRustBackendMissing(promise: Promise, method: String) {
        promise.reject(
            "E_IGRA_KASPA_RUST_BACKEND_MISSING",
            "$method requires the Rusty-Kaspa native backend. The RN bridge is present, but carrier signing is intentionally disabled. loadError=${IgraKaspaRustBackend.getLoadError()}"
        )
    }

    private fun resolveJsonObject(json: String, promise: Promise) {
        val jsonObject = JSONObject(json)
        val errorCode = jsonObject.optString("errorCode", "")
        if (errorCode.isNotEmpty()) {
            promise.reject(errorCode, jsonObject.optString("message", "IgraKaspa native backend failed"))
            return
        }
        promise.resolve(jsonObjectToWritableMap(jsonObject))
    }

    private fun readableMapToJson(params: ReadableMap): JSONObject {
        val json = JSONObject()
        val iterator = params.keySetIterator()
        while (iterator.hasNextKey()) {
            val key = iterator.nextKey()
            if (params.isNull(key)) {
                json.put(key, JSONObject.NULL)
            } else {
                when (params.getType(key)) {
                    ReadableType.Boolean -> json.put(key, params.getBoolean(key))
                    ReadableType.Number -> {
                        val value = params.getDouble(key)
                        if (value % 1.0 == 0.0) {
                            json.put(key, value.toLong())
                        } else {
                            json.put(key, value)
                        }
                    }
                    ReadableType.String -> json.put(key, params.getString(key))
                    else -> Unit
                }
            }
        }
        return json
    }

    private fun jsonObjectToWritableMap(json: JSONObject) = Arguments.createMap().apply {
        val keys = json.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            when (val value = json.get(key)) {
                is Boolean -> putBoolean(key, value)
                is Int -> putInt(key, value)
                is Long -> putDouble(key, value.toDouble())
                is Double -> putDouble(key, value)
                is Number -> putDouble(key, value.toDouble())
                JSONObject.NULL -> putNull(key)
                else -> putString(key, value.toString())
            }
        }
    }

    private fun checksum(value: String): Int {
        var hash = 0
        for (char in value) {
            hash = (hash * 31) xor char.code
        }
        return hash
    }

    companion object {
        private const val BRIDGE_VERSION = "0.1.0"
        private const val MAX_BENCHMARK_PAYLOAD_BYTES = 256 * 1024
        private const val MAX_BENCHMARK_ITERATIONS = 100_000
    }
}
