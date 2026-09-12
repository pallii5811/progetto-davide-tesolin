/**
 * Generato da scripts/genera-esposizione-settoriale.ts — non editare a mano.
 * Sorgente: packages/core/src/risk/data/esposizione-settoriale.csv (87 divisioni ATECO 2025)
 *
 * Punteggi di GIUDIZIO ESPERTO da 1 a 7, non misure di sinistrosità. Vedi l'intestazione
 * dello script generatore per la provenienza e per ciò che questi numeri non sono.
 */

export interface EsposizioneSettoriale {
  /** Pericolosità intrinseca di incendio ed esplosione dell'attività svolta. */
  readonly incendio: number;
  /** Quanto l'attività dipende da sistemi informatici per continuare a operare. */
  readonly dipendenzaDigitale: number;
  /** Quanto sono sensibili le informazioni che quell'attività tratta di norma. */
  readonly sensibilitaDati: number;
  /** Quanto l'attività è esposta a pagamenti, ordini e trasferimenti digitali. */
  readonly esposizioneTransazioni: number;
  /** Quanto il settore è un bersaglio interessante o remunerativo per un attaccante. */
  readonly attrattivitaAttacco: number;
}

export const ESPOSIZIONE_SETTORIALE: Readonly<Record<string, EsposizioneSettoriale>> = {
  '01': {
    incendio: 4,
    dipendenzaDigitale: 2,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 2,
  }, // Produzioni vegetali e animali, caccia e servizi connessi
  '02': {
    incendio: 5,
    dipendenzaDigitale: 2,
    sensibilitaDati: 1,
    esposizioneTransazioni: 1,
    attrattivitaAttacco: 2,
  }, // Silvicoltura e utilizzo di aree forestali
  '03': {
    incendio: 4,
    dipendenzaDigitale: 2,
    sensibilitaDati: 1,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 2,
  }, // Pesca e acquacoltura
  '05': {
    incendio: 7,
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 4,
  }, // Estrazione di carbone e lignite
  '06': {
    incendio: 7,
    dipendenzaDigitale: 5,
    sensibilitaDati: 2,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 5,
  }, // Estrazione di petrolio greggio e gas naturale
  '07': {
    incendio: 6,
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 4,
  }, // Estrazione di minerali metalliferi
  '08': {
    incendio: 6,
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 4,
  }, // Altre attività estrattive
  '09': {
    incendio: 6,
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 4,
  }, // Attività dei servizi di supporto all’estrazione
  '10': {
    incendio: 5,
    dipendenzaDigitale: 4,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 5,
  }, // Produzione di prodotti alimentari
  '11': {
    incendio: 5,
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 4,
  }, // Produzione di bevande
  '12': {
    incendio: 6,
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 4,
  }, // Produzione di prodotti del tabacco
  '13': {
    incendio: 5,
    dipendenzaDigitale: 3,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 4,
  }, // Fabbricazione di tessili
  '14': {
    incendio: 4,
    dipendenzaDigitale: 3,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 3,
  }, // Fabbricazione di articoli di abbigliamento
  '15': {
    incendio: 5,
    dipendenzaDigitale: 3,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 3,
  }, // Fabbricazione di pelli e cuoio e articoli in pelle e simili di altri materiali
  '16': {
    incendio: 6,
    dipendenzaDigitale: 3,
    sensibilitaDati: 1,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 4,
  }, // Produzione e lavorazione del legno e dei prodotti a base di legno e sughero, esclusi i mobili, fabbricazione di articoli in paglia e materiale da intreccio
  '17': {
    incendio: 6,
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 4,
  }, // Fabbricazione di carta e di prodotti di carta
  '18': {
    incendio: 5,
    dipendenzaDigitale: 4,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 4,
  }, // Stampa e riproduzione di supporti registrati
  '19': {
    incendio: 7,
    dipendenzaDigitale: 5,
    sensibilitaDati: 2,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 6,
  }, // Fabbricazione di coke e prodotti derivanti dalla raffinazione del petrolio
  '20': {
    incendio: 7,
    dipendenzaDigitale: 5,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 6,
  }, // Fabbricazione di prodotti chimici
  '21': {
    incendio: 6,
    dipendenzaDigitale: 6,
    sensibilitaDati: 6,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 6,
  }, // Fabbricazione di prodotti farmaceutici di base e di preparati farmaceutici
  '22': {
    incendio: 6,
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 5,
  }, // Fabbricazione di prodotti in gomma e in materie plastiche
  '23': {
    incendio: 6,
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 5,
  }, // Fabbricazione di altri prodotti della lavorazione di minerali non metalliferi
  '24': {
    incendio: 7,
    dipendenzaDigitale: 5,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 5,
  }, // Fabbricazione di metalli di base
  '25': {
    incendio: 6,
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 5,
  }, // Fabbricazione di prodotti in metallo, esclusi macchinari e attrezzature
  '26': {
    incendio: 5,
    dipendenzaDigitale: 6,
    sensibilitaDati: 4,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 6,
  }, // Fabbricazione di computer e prodotti di elettronica e ottica
  '27': {
    incendio: 5,
    dipendenzaDigitale: 5,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 5,
  }, // Fabbricazione di apparecchiature elettriche
  '28': {
    incendio: 6,
    dipendenzaDigitale: 5,
    sensibilitaDati: 3,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 5,
  }, // Fabbricazione di macchinari e apparecchiature n.c.a.
  '29': {
    incendio: 6,
    dipendenzaDigitale: 6,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 6,
  }, // Fabbricazione di autoveicoli, rimorchi e semirimorchi
  '30': {
    incendio: 6,
    dipendenzaDigitale: 6,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 6,
  }, // Fabbricazione di altri mezzi di trasporto
  '31': {
    incendio: 6,
    dipendenzaDigitale: 3,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 4,
  }, // Fabbricazione di mobili
  '32': {
    incendio: 5,
    dipendenzaDigitale: 4,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 4,
  }, // Altre attività manifatturiere
  '33': {
    incendio: 5,
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 4,
  }, // Riparazione, manutenzione e installazione di macchine e apparecchiature
  '35': {
    incendio: 7,
    dipendenzaDigitale: 7,
    sensibilitaDati: 4,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 7,
  }, // Fornitura di energia elettrica, gas, vapore e aria condizionata
  '36': {
    incendio: 4,
    dipendenzaDigitale: 6,
    sensibilitaDati: 4,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 6,
  }, // Raccolta, trattamento e fornitura di acqua
  '37': {
    incendio: 5,
    dipendenzaDigitale: 5,
    sensibilitaDati: 3,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 5,
  }, // Gestione delle reti fognarie
  '38': {
    incendio: 6,
    dipendenzaDigitale: 5,
    sensibilitaDati: 3,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 5,
  }, // Attività di raccolta, recupero e smaltimento dei rifiuti
  '39': {
    incendio: 6,
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 4,
  }, // Attività di risanamento e altri servizi di gestione dei rifiuti
  '41': {
    incendio: 5,
    dipendenzaDigitale: 3,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 4,
  }, // Costruzione di edifici residenziali e non residenziali
  '42': {
    incendio: 5,
    dipendenzaDigitale: 4,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 5,
  }, // Ingegneria civile
  '43': {
    incendio: 5,
    dipendenzaDigitale: 3,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivitaAttacco: 4,
  }, // Lavori di costruzione specializzati
  '46': {
    incendio: 4,
    dipendenzaDigitale: 4,
    sensibilitaDati: 4,
    esposizioneTransazioni: 5,
    attrattivitaAttacco: 4,
  }, // Commercio all’ingrosso
  '47': {
    incendio: 3,
    dipendenzaDigitale: 5,
    sensibilitaDati: 5,
    esposizioneTransazioni: 6,
    attrattivitaAttacco: 5,
  }, // Commercio al dettaglio
  '49': {
    incendio: 4,
    dipendenzaDigitale: 6,
    sensibilitaDati: 4,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 6,
  }, // Trasporto terrestre e trasporto mediante condotte
  '50': {
    incendio: 5,
    dipendenzaDigitale: 5,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 5,
  }, // Trasporto marittimo e per vie d’acqua interne
  '51': {
    incendio: 5,
    dipendenzaDigitale: 7,
    sensibilitaDati: 5,
    esposizioneTransazioni: 6,
    attrattivitaAttacco: 7,
  }, // Trasporto aereo
  '52': {
    incendio: 5,
    dipendenzaDigitale: 6,
    sensibilitaDati: 4,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 6,
  }, // Magazzinaggio, deposito e attività di supporto ai trasporti
  '53': {
    incendio: 3,
    dipendenzaDigitale: 6,
    sensibilitaDati: 4,
    esposizioneTransazioni: 5,
    attrattivitaAttacco: 5,
  }, // Attività postali e di corriere
  '55': {
    incendio: 4,
    dipendenzaDigitale: 6,
    sensibilitaDati: 6,
    esposizioneTransazioni: 6,
    attrattivitaAttacco: 5,
  }, // Servizi di alloggio
  '56': {
    incendio: 4,
    dipendenzaDigitale: 4,
    sensibilitaDati: 5,
    esposizioneTransazioni: 6,
    attrattivitaAttacco: 4,
  }, // Attività di servizi di ristorazione
  '58': {
    incendio: 2,
    dipendenzaDigitale: 6,
    sensibilitaDati: 5,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 5,
  }, // Attività editoriali
  '59': {
    incendio: 3,
    dipendenzaDigitale: 6,
    sensibilitaDati: 4,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 5,
  }, // Attività di produzione, post-produzione e distribuzione cinematografica, di video e programmi televisivi, di registrazioni musicali e sonore
  '60': {
    incendio: 3,
    dipendenzaDigitale: 7,
    sensibilitaDati: 5,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 6,
  }, // Attività di programmazione, trasmissione, agenzie di stampa e altre attività di distribuzione di contenuti
  '61': {
    incendio: 3,
    dipendenzaDigitale: 7,
    sensibilitaDati: 6,
    esposizioneTransazioni: 5,
    attrattivitaAttacco: 7,
  }, // Telecomunicazioni
  '62': {
    incendio: 2,
    dipendenzaDigitale: 7,
    sensibilitaDati: 6,
    esposizioneTransazioni: 5,
    attrattivitaAttacco: 7,
  }, // Attività di programmazione, consulenza informatica e attività connesse
  '63': {
    incendio: 4,
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 6,
    attrattivitaAttacco: 7,
  }, // Infrastrutture informatiche, elaborazione dati, hosting e altri servizi di informazione
  '64': {
    incendio: 2,
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 7,
    attrattivitaAttacco: 7,
  }, // Attività dei servizi finanziari, escluse le assicurazioni e i fondi pensione
  '65': {
    incendio: 2,
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 7,
    attrattivitaAttacco: 7,
  }, // Assicurazioni, riassicurazioni e fondi pensione, escluse le assicurazioni sociali obbligatorie
  '66': {
    incendio: 2,
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 7,
    attrattivitaAttacco: 6,
  }, // Attività ausiliarie dei servizi finanziari e delle attività assicurative
  '68': {
    incendio: 3,
    dipendenzaDigitale: 4,
    sensibilitaDati: 5,
    esposizioneTransazioni: 5,
    attrattivitaAttacco: 4,
  }, // Attività immobiliari
  '69': {
    incendio: 1,
    dipendenzaDigitale: 6,
    sensibilitaDati: 7,
    esposizioneTransazioni: 6,
    attrattivitaAttacco: 5,
  }, // Attività legali e di contabilità
  '70': {
    incendio: 1,
    dipendenzaDigitale: 6,
    sensibilitaDati: 6,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 5,
  }, // Attività di sedi centrali e consulenza gestionale
  '71': {
    incendio: 2,
    dipendenzaDigitale: 5,
    sensibilitaDati: 4,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 4,
  }, // Attività di architettura e ingegneria, collaudi e analisi tecniche
  '72': {
    incendio: 3,
    dipendenzaDigitale: 6,
    sensibilitaDati: 6,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 6,
  }, // Ricerca scientifica e sviluppo
  '73': {
    incendio: 2,
    dipendenzaDigitale: 6,
    sensibilitaDati: 6,
    esposizioneTransazioni: 5,
    attrattivitaAttacco: 5,
  }, // Attività di pubblicità, ricerche di mercato e pubbliche relazioni
  '74': {
    incendio: 2,
    dipendenzaDigitale: 5,
    sensibilitaDati: 5,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 4,
  }, // Altre attività professionali, scientifiche e tecniche
  '75': {
    incendio: 3,
    dipendenzaDigitale: 5,
    sensibilitaDati: 7,
    esposizioneTransazioni: 5,
    attrattivitaAttacco: 5,
  }, // Servizi veterinari
  '77': {
    incendio: 4,
    dipendenzaDigitale: 5,
    sensibilitaDati: 5,
    esposizioneTransazioni: 6,
    attrattivitaAttacco: 5,
  }, // Attività di noleggio e leasing operativo
  '78': {
    incendio: 1,
    dipendenzaDigitale: 6,
    sensibilitaDati: 7,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 5,
  }, // Attività di ricerca, selezione, fornitura di risorse umane
  '79': {
    incendio: 1,
    dipendenzaDigitale: 7,
    sensibilitaDati: 6,
    esposizioneTransazioni: 7,
    attrattivitaAttacco: 5,
  }, // Attività di agenzie di viaggio, tour operator e altri servizi di prenotazione e attività connesse
  '80': {
    incendio: 3,
    dipendenzaDigitale: 6,
    sensibilitaDati: 7,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 6,
  }, // Attività di investigazione e vigilanza
  '81': {
    incendio: 4,
    dipendenzaDigitale: 3,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 3,
  }, // Attività di servizi per edifici e per la cura del paesaggio
  '82': {
    incendio: 2,
    dipendenzaDigitale: 6,
    sensibilitaDati: 6,
    esposizioneTransazioni: 5,
    attrattivitaAttacco: 5,
  }, // Attività amministrative, di supporto per le funzioni di ufficio e altri servizi di supporto alle imprese
  '84': {
    incendio: 2,
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 5,
    attrattivitaAttacco: 7,
  }, // Amministrazione pubblica e difesa, assicurazione sociale obbligatoria
  '85': {
    incendio: 2,
    dipendenzaDigitale: 6,
    sensibilitaDati: 7,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 5,
  }, // Istruzione e formazione
  '86': {
    incendio: 4,
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 6,
    attrattivitaAttacco: 7,
  }, // Attività per la salute umana
  '87': {
    incendio: 3,
    dipendenzaDigitale: 6,
    sensibilitaDati: 7,
    esposizioneTransazioni: 5,
    attrattivitaAttacco: 6,
  }, // Attività di assistenza residenziale
  '88': {
    incendio: 2,
    dipendenzaDigitale: 5,
    sensibilitaDati: 7,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 5,
  }, // Attività di assistenza sociale non residenziale
  '90': {
    incendio: 4,
    dipendenzaDigitale: 4,
    sensibilitaDati: 4,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 4,
  }, // Attività di creazione artistica e rappresentazioni artistiche
  '91': {
    incendio: 3,
    dipendenzaDigitale: 5,
    sensibilitaDati: 6,
    esposizioneTransazioni: 3,
    attrattivitaAttacco: 5,
  }, // Attività di biblioteche, archivi, musei e altre attività culturali
  '92': {
    incendio: 3,
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 7,
    attrattivitaAttacco: 7,
  }, // Attività di giochi d’azzardo e scommesse
  '93': {
    incendio: 4,
    dipendenzaDigitale: 5,
    sensibilitaDati: 5,
    esposizioneTransazioni: 6,
    attrattivitaAttacco: 5,
  }, // Attività sportive, di intrattenimento e divertimento
  '94': {
    incendio: 2,
    dipendenzaDigitale: 4,
    sensibilitaDati: 6,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 5,
  }, // Attività di organizzazioni associative
  '95': {
    incendio: 5,
    dipendenzaDigitale: 4,
    sensibilitaDati: 3,
    esposizioneTransazioni: 4,
    attrattivitaAttacco: 4,
  }, // Riparazione e manutenzione di computer, beni per uso personale e per la casa, autoveicoli e motocicli
  '96': {
    incendio: 3,
    dipendenzaDigitale: 3,
    sensibilitaDati: 5,
    esposizioneTransazioni: 5,
    attrattivitaAttacco: 3,
  }, // Attività di servizi alla persona
  '97': {
    incendio: 1,
    dipendenzaDigitale: 1,
    sensibilitaDati: 3,
    esposizioneTransazioni: 1,
    attrattivitaAttacco: 1,
  }, // Attività di famiglie e convivenze come datori di lavoro per personale domestico
  '98': {
    incendio: 1,
    dipendenzaDigitale: 1,
    sensibilitaDati: 1,
    esposizioneTransazioni: 1,
    attrattivitaAttacco: 1,
  }, // Produzione di beni e servizi indifferenziati per uso proprio da parte di famiglie e convivenze
  '99': {
    incendio: 2,
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 5,
    attrattivitaAttacco: 7,
  }, // Attività di organizzazioni e organismi extraterritoriali
};
