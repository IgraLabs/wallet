#ifndef IGRA_KASPA_RUST_H
#define IGRA_KASPA_RUST_H

#ifdef __cplusplus
extern "C" {
#endif

char *igra_kaspa_backend_status_json(void);
char *igra_kaspa_derive_carrier_address_json(const char *params_json);
char *igra_kaspa_build_and_sign_carrier_tx_json(const char *params_json);
char *igra_kaspa_submit_carrier_tx_json(const char *params_json);
void igra_kaspa_free_string(char *value);

#ifdef __cplusplus
}
#endif

#endif
