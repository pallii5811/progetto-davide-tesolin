-- I punteggi delle tre protezioni del foglio Veezco accanto a ogni analisi: Property Risk,
-- Business Interruption (il punteggio fisico e la perdita di un giorno) e Cyber Risk.
--
-- Richiesta di Simone del 19/09/2026: «metti anche il punteggio property risk, cyber risk e
-- business interruption che si vede per ogni azienda nel crm». L'analisi salvava solo la sintesi,
-- e le protezioni non c'erano: il CRM le legge da qui senza rifare il calcolo e senza aprire il JSON.
--
-- Solo aggiunte, vuote per le analisi già salvate: si riempiono alla prossima apertura della
-- scheda, che rifà l'analisi dall'archivio senza spesa. I valori vanno da 1 a 7 come nel foglio;
-- fuori scala o negativi si rifiutano.
ALTER TABLE analisi ADD COLUMN IF NOT EXISTS property_risk numeric(4,2)
  CHECK (property_risk IS NULL OR (property_risk >= 0 AND property_risk <= 7));
--> statement-breakpoint
ALTER TABLE analisi ADD COLUMN IF NOT EXISTS bi_punteggio numeric(4,2)
  CHECK (bi_punteggio IS NULL OR (bi_punteggio >= 0 AND bi_punteggio <= 7));
--> statement-breakpoint
ALTER TABLE analisi ADD COLUMN IF NOT EXISTS bi_perdita_giornaliera_centesimi bigint
  CHECK (bi_perdita_giornaliera_centesimi IS NULL OR bi_perdita_giornaliera_centesimi >= 0);
--> statement-breakpoint
ALTER TABLE analisi ADD COLUMN IF NOT EXISTS cyber_risk numeric(3,1)
  CHECK (cyber_risk IS NULL OR (cyber_risk >= 0 AND cyber_risk <= 7));
