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

/**
 * I nomi che il prodotto si dà da solo quando nessuno gliene ha dato uno.
 *
 * Non sono denominazioni: sono segnaposti, e per l'art. 58 valgono quanto un campo vuoto.
 * Il primo lo scrive l'installazione (`deploy/02-database.sh`), il secondo è il ripiego del
 * servizio quando `AEGIS_TENANT` resta da compilare (`apps/api/src/persistenza.ts`).
 *
 * Perché esistono qui: il controllo sotto guardava soltanto la stringa vuota, e un
 * segnaposto vuoto non è. Un intermediario che compilava il numero RUI senza toccare il
 * nome vedeva l'avviso sparire, e il documento usciva intestato «Studio da configurare» —
 * consegnato a un assicurato, con l'obbligo formalmente rispettato e sostanzialmente no.
 * Il difetto era invisibile proprio perché il campo era pieno.
 *
 * La denominazione la mette l'intermediario, non chi installa: è il suo nome, e nessun
 * altro lo conosce. Il prodotto non può metterlo al posto suo; può solo non lasciarlo
 * passare in silenzio.
 */
const SEGNAPOSTI: readonly string[] = ['studio da configurare', 'intermediario predefinito'];

function denominazioneNonCompilata(denominazione: string): boolean {
  const pulita = denominazione.trim().toLowerCase();
  return pulita === '' || SEGNAPOSTI.includes(pulita);
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

  const senzaNome = denominazioneNonCompilata(studio.denominazione);
  /*
    Il segnaposto si nomina, invece di dire genericamente «manca».

    «Manca la denominazione» davanti a un campo che sullo schermo contiene «Studio da
    configurare» sembra un guasto del programma, e si impara a ignorarlo. Dire quale nome
    finirebbe sul documento rende evidente cosa succede a non intervenire.
  */
  const segnaposto = senzaNome && studio.denominazione.trim() !== '';

  const mancanti = [
    senzaNome ? 'la denominazione dell’intermediario' : null,
    studio.numeroRui === null || studio.numeroRui.trim() === '' ? 'il numero di iscrizione al RUI' : null,
  ].filter((v): v is string => v !== null);

  if (mancanti.length === 0) return null;

  return (
    `Intestazione incompleta: manca ${mancanti.join(' e ')}, che l’art. 58 del Reg. IVASS ` +
    '40/2018 richiede sui documenti consegnati al contraente. ' +
    (segnaposto
      ? `Il documento uscirebbe intestato «${studio.denominazione.trim()}», che è il nome ` +
        'provvisorio dell’installazione e non quello dello studio. '
      : '') +
    'Completare l’anagrafica in Impostazioni → Anagrafica studio prima della consegna.'
  );
}
