/**
 * Il report esce senza intestazione dello studio, e non lo dice.
 *
 * Il documento si intitola documentazione ai sensi dell'art. 58 del Reg. IVASS 40/2018 —
 * e quel regolamento chiede che i documenti consegnati al contraente **identifichino
 * l'intermediario e il suo numero di iscrizione al RUI**. Se l'anagrafica dello studio non
 * è stata compilata, o se il servizio non risponde, l'intestazione semplicemente non
 * compariva: il report usciva anonimo, con la stessa faccia di quello intestato, e
 * nessuno se ne accorgeva finché non arrivava in mano a un ispettore.
 *
 * La scelta di **non bloccare il documento** resta giusta: un documento senza logo è un
 * documento incompleto, uno che non si apre è un lavoro perso. Ciò che mancava è la
 * dichiarazione. Un'assenza dichiarata si può rimediare in trenta secondi prima di
 * stampare; un'assenza silenziosa si scopre dopo.
 *
 * La frase si compone dai valori, e nomina esattamente ciò che manca.
 */

/** I soli campi che contano per l'obbligo dell'art. 58: chi è, e con quale iscrizione. */
export interface IntestazioneStudio {
  readonly denominazione: string;
  readonly numeroRui: string | null;
}

export function avvisoIntestazione(studio: IntestazioneStudio | null): string | null {
  if (studio === null) {
    return (
      'Documento non intestato: l’anagrafica dello studio non è disponibile, quindi mancano ' +
      'la denominazione dell’intermediario e il numero di iscrizione al RUI che l’art. 58 del ' +
      'Reg. IVASS 40/2018 richiede sui documenti consegnati al contraente. Compilarla in ' +
      'Impostazioni → Anagrafica studio prima della consegna.'
    );
  }

  const mancanti = [
    studio.denominazione.trim() === '' ? 'la denominazione dell’intermediario' : null,
    studio.numeroRui === null || studio.numeroRui.trim() === '' ? 'il numero di iscrizione al RUI' : null,
  ].filter((v): v is string => v !== null);

  if (mancanti.length === 0) return null;

  return (
    `Intestazione incompleta: manca ${mancanti.join(' e ')}, che l’art. 58 del Reg. IVASS ` +
    '40/2018 richiede sui documenti consegnati al contraente. Completare l’anagrafica in ' +
    'Impostazioni → Anagrafica studio prima della consegna.'
  );
}
