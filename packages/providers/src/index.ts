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

import { MockCompanyProvider } from './mock.js';
import { OpenApiProvider } from './openapi/provider.js';
import { MemoryCache, MemoryCostLedger } from './http.js';
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
  return new OpenApiProvider({
    token,
    ambiente: options.ambiente ?? 'produzione',
    cache: options.cache ?? new MemoryCache(),
    ledger: options.ledger ?? new MemoryCostLedger(),
  });
}
