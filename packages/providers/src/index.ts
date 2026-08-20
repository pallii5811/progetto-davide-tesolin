/**
 * @aegis/providers — acquisizione dati da fornitori esterni.
 *
 * Il dominio dipende dalla porta `CompanyDataProvider`, non dalle implementazioni.
 */

export * from './port.js';
export * from './http.js';
export * from './mock.js';
export * from './openapi/config.js';
export * from './openapi/autorizzazioni.js';
export * from './openapi/parse.js';
export * from './openapi/mapper.js';
export * from './openapi/negativita.js';
export * from './openapi/provider.js';
export * from './openapi/prezzi.js';
export * from './openapi/campi-noti.js';
export * from './openapi/sorveglianza-campi.js';
export * from './territorio/contesto.js';

import { MockCompanyProvider } from './mock.js';
import { OpenApiProvider } from './openapi/provider.js';
import { MemoryCache, MemoryCostLedger } from './http.js';
import { OPENAPI_DEFAULT_CONFIG } from './openapi/config.js';
import { conPrezzi, prezziDaConfigurazione } from './openapi/prezzi.js';
import type { Cache, CostLedger } from './http.js';
import type { CompanyDataProvider } from './port.js';

export interface ProviderFactoryOptions {
  readonly openApiToken?: string | undefined;
  readonly ambiente?: 'produzione' | 'test' | undefined;
  readonly cache?: Cache | undefined;
  readonly ledger?: CostLedger | undefined;
}

/**
 * Sceglie il provider in base alla configurazione disponibile.
 *
 * Senza token si degrada ai dati dimostrativi invece di fallire all'avvio: la piattaforma
 * deve essere installabile e mostrabile prima ancora di avere le credenziali.
 */
export function createCompanyProvider(options: ProviderFactoryOptions = {}): CompanyDataProvider {
  const token = options.openApiToken?.trim() ?? '';
  if (token === '') {
    return new MockCompanyProvider();
  }
  /*
    I prezzi effettivi dipendono dal contratto: lo stesso servizio costa 0,30 € a chiamata
    singola e meno di 9 centesimi in abbonamento a volume. Governano il tetto di spesa e il
    credito residuo, quindi devono poter essere dichiarati senza toccare il codice.
  */
  const prezzi = prezziDaConfigurazione(process.env['AEGIS_PREZZI_CENTESIMI']);

  return new OpenApiProvider({
    token,
    ambiente: options.ambiente ?? 'produzione',
    config: conPrezzi(OPENAPI_DEFAULT_CONFIG, prezzi),
    cache: options.cache ?? new MemoryCache(),
    ledger: options.ledger ?? new MemoryCostLedger(),
  });
}
