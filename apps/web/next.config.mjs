/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    AEGIS_API_URL: process.env.AEGIS_API_URL ?? 'http://127.0.0.1:3001',
  },
  /*
    Le pagine tolte il 17/09/2026 («AEGIS - cambi.pptx»): Monitoraggio, Catalogo rischi e
    Importa elenco clienti. Chi ha un segnalibro o un collegamento vecchio finisce sul CRM
    invece che su una pagina inesistente. Non permanenti: un 308 resta nella cache del
    browser, e se una di queste pagine tornasse il browser continuerebbe a saltarla.
  */
  async redirects() {
    return ['/monitoraggio', '/catalogo', '/portafoglio/importa'].map((source) => ({
      source,
      destination: '/portafoglio',
      permanent: false,
    }));
  },
};

export default nextConfig;
