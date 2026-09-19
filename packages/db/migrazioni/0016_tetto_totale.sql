-- Il tetto di spesa COMPLESSIVO di uno studio, in centesimi: quanto può spendere in dati da
-- sempre, non al giorno.
--
-- Richiesta di Simone del 19/09/2026: un account di prova per un cliente che «in totale può
-- usare massimo 5 euro da OpenAPI». Il tetto giornaliero (AEGIS_TETTO_SPESA_GIORNALIERO_CENTESIMI)
-- è uguale per tutti e si azzera ogni notte: non basta a dire «cinque euro e basta».
--
-- Solo un'aggiunta, vuota per tutti: NULL vuol dire nessun tetto complessivo, quindi gli studi
-- che esistono già non cambiano comportamento. Un tetto negativo non ha senso e si rifiuta.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tetto_spesa_totale_centesimi bigint
  CHECK (tetto_spesa_totale_centesimi IS NULL OR tetto_spesa_totale_centesimi >= 0);
