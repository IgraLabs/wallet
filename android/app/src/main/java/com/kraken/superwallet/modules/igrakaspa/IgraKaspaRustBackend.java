package com.kraken.superwallet.modules.igrakaspa;

public final class IgraKaspaRustBackend {
    private static final boolean loaded;
    private static final String loadError;

    static {
        boolean didLoad = false;
        String error = null;

        try {
            System.loadLibrary("igra_kaspa");
            didLoad = true;
        } catch (Throwable throwable) {
            error = throwable.toString();
        }

        loaded = didLoad;
        loadError = error;
    }

    private IgraKaspaRustBackend() {}

    public static boolean isLoaded() {
        return loaded;
    }

    public static String getLoadError() {
        return loadError;
    }

    public static native String backendStatusJson();

    public static native String deriveCarrierAddressJson(String paramsJson);

    public static native String buildAndSignCarrierTxJson(String paramsJson);

    public static native String submitCarrierTxJson(String paramsJson);
}
