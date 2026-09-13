/**
 * Le tabelle del foglio «Veezco_Analisi Rischio.xlsx», trascritte da uno script e non a mano.
 *
 * Il foglio è la metodologia: queste righe ne sono la copia, non una reinterpretazione. Lo
 * script di trascrizione rifiuta di scrivere se i pesi non sommano a uno, se le divisioni ATECO
 * dei due fogli non coincidono, o se un punteggio cyber salvato nel foglio non torna col
 * ricalcolo dai quattro sotto-punteggi: sulle 87 righe tornano tutte.
 *
 * Le divisioni sono quelle della classificazione ATECO 2025 riportata nel foglio (fonte
 * dichiarata: istat.it/classificazione/ateco-2025). La divisione 45 della classificazione
 * precedente non vi compare: chi la porta resta non determinabile, invece di prendere il
 * punteggio di una riga che non è la sua.
 *
 * Il foglio cita una terza tabella, «Natural_Hazard_Risk», per convertire alluvione, sisma e
 * frana in punteggi da 1 a 7. Nel file non c'è: vedi `property-risk.ts`.
 *
 * Non modificare a mano: si rigenera dal foglio.
 */

export const FOGLIO_VEEZCO = 'Veezco_Analisi Rischio.xlsx';

/** Pesi del Property Risk, foglio «Protezione Property», colonna Weight. */
export const PESI_PROPERTY = { attivita: 0.3, tipoDiSito: 0.2, pericoliNaturali: 0.5 } as const;

/** Pesi del Cyber Risk, foglio «CR_Overview», colonna Weight. */
export const PESI_CYBER = {
  dipendenzaDigitale: 0.3,
  sensibilitaDati: 0.3,
  esposizioneTransazioni: 0.15,
  attrattivita: 0.25,
} as const;

export interface RigaAttivita {
  /** Titolo ufficiale della divisione, come nel foglio. */
  readonly titolo: string;
  /** Property activity score, da 1 a 7. */
  readonly punteggio: number;
  /** Risk band, come nel foglio. */
  readonly fascia: string;
}

/** Foglio «Activity_Risk»: il rischio intrinseco dell’attività, per divisione ATECO. */
export const RISCHIO_ATTIVITA: Readonly<Record<string, RigaAttivita>> = {
  '01': {
    titolo: 'Produzioni vegetali e animali, caccia e servizi connessi',
    punteggio: 4,
    fascia: 'Medium',
  },
  '02': { titolo: 'Silvicoltura e utilizzo di aree forestali', punteggio: 5, fascia: 'Medium-High' },
  '03': { titolo: 'Pesca e acquacoltura', punteggio: 4, fascia: 'Medium' },
  '05': { titolo: 'Estrazione di carbone e lignite', punteggio: 7, fascia: 'Very High' },
  '06': { titolo: 'Estrazione di petrolio greggio e gas naturale', punteggio: 7, fascia: 'Very High' },
  '07': { titolo: 'Estrazione di minerali metalliferi', punteggio: 6, fascia: 'High' },
  '08': { titolo: 'Altre attività estrattive', punteggio: 6, fascia: 'High' },
  '09': { titolo: 'Attività dei servizi di supporto all’estrazione', punteggio: 6, fascia: 'High' },
  '10': { titolo: 'Produzione di prodotti alimentari', punteggio: 5, fascia: 'Medium-High' },
  '11': { titolo: 'Produzione di bevande', punteggio: 5, fascia: 'Medium-High' },
  '12': { titolo: 'Produzione di prodotti del tabacco', punteggio: 6, fascia: 'High' },
  '13': { titolo: 'Fabbricazione di tessili', punteggio: 5, fascia: 'Medium-High' },
  '14': { titolo: 'Fabbricazione di articoli di abbigliamento', punteggio: 4, fascia: 'Medium' },
  '15': {
    titolo: 'Fabbricazione di pelli e cuoio e articoli in pelle e simili di altri materiali',
    punteggio: 5,
    fascia: 'Medium-High',
  },
  '16': {
    titolo:
      'Produzione e lavorazione del legno e dei prodotti a base di legno e sughero, esclusi i mobili; fabbricazione di articoli in paglia e materiale da intreccio',
    punteggio: 6,
    fascia: 'High',
  },
  '17': { titolo: 'Fabbricazione di carta e di prodotti di carta', punteggio: 6, fascia: 'High' },
  '18': { titolo: 'Stampa e riproduzione di supporti registrati', punteggio: 5, fascia: 'Medium-High' },
  '19': {
    titolo: 'Fabbricazione di coke e prodotti derivanti dalla raffinazione del petrolio',
    punteggio: 7,
    fascia: 'Very High',
  },
  '20': { titolo: 'Fabbricazione di prodotti chimici', punteggio: 7, fascia: 'Very High' },
  '21': {
    titolo: 'Fabbricazione di prodotti farmaceutici di base e di preparati farmaceutici',
    punteggio: 6,
    fascia: 'High',
  },
  '22': {
    titolo: 'Fabbricazione di prodotti in gomma e in materie plastiche',
    punteggio: 6,
    fascia: 'High',
  },
  '23': {
    titolo: 'Fabbricazione di altri prodotti della lavorazione di minerali non metalliferi',
    punteggio: 6,
    fascia: 'High',
  },
  '24': { titolo: 'Fabbricazione di metalli di base', punteggio: 7, fascia: 'Very High' },
  '25': {
    titolo: 'Fabbricazione di prodotti in metallo, esclusi macchinari e attrezzature',
    punteggio: 6,
    fascia: 'High',
  },
  '26': {
    titolo: 'Fabbricazione di computer e prodotti di elettronica e ottica',
    punteggio: 5,
    fascia: 'Medium-High',
  },
  '27': { titolo: 'Fabbricazione di apparecchiature elettriche', punteggio: 5, fascia: 'Medium-High' },
  '28': { titolo: 'Fabbricazione di macchinari e apparecchiature n.c.a.', punteggio: 6, fascia: 'High' },
  '29': { titolo: 'Fabbricazione di autoveicoli, rimorchi e semirimorchi', punteggio: 6, fascia: 'High' },
  '30': { titolo: 'Fabbricazione di altri mezzi di trasporto', punteggio: 6, fascia: 'High' },
  '31': { titolo: 'Fabbricazione di mobili', punteggio: 6, fascia: 'High' },
  '32': { titolo: 'Altre attività manifatturiere', punteggio: 5, fascia: 'Medium-High' },
  '33': {
    titolo: 'Riparazione, manutenzione e installazione di macchine e apparecchiature',
    punteggio: 5,
    fascia: 'Medium-High',
  },
  '35': {
    titolo: 'Fornitura di energia elettrica, gas, vapore e aria condizionata',
    punteggio: 7,
    fascia: 'Very High',
  },
  '36': { titolo: 'Raccolta, trattamento e fornitura di acqua', punteggio: 4, fascia: 'Medium' },
  '37': { titolo: 'Gestione delle reti fognarie', punteggio: 5, fascia: 'Medium-High' },
  '38': {
    titolo: 'Attività di raccolta, recupero e smaltimento dei rifiuti',
    punteggio: 6,
    fascia: 'High',
  },
  '39': {
    titolo: 'Attività di risanamento e altri servizi di gestione dei rifiuti',
    punteggio: 6,
    fascia: 'High',
  },
  '41': {
    titolo: 'Costruzione di edifici residenziali e non residenziali',
    punteggio: 5,
    fascia: 'Medium-High',
  },
  '42': { titolo: 'Ingegneria civile', punteggio: 5, fascia: 'Medium-High' },
  '43': { titolo: 'Lavori di costruzione specializzati', punteggio: 5, fascia: 'Medium-High' },
  '46': { titolo: 'Commercio all’ingrosso', punteggio: 4, fascia: 'Medium' },
  '47': { titolo: 'Commercio al dettaglio', punteggio: 3, fascia: 'Low-Medium' },
  '49': { titolo: 'Trasporto terrestre e trasporto mediante condotte', punteggio: 4, fascia: 'Medium' },
  '50': { titolo: 'Trasporto marittimo e per vie d’acqua interne', punteggio: 5, fascia: 'Medium-High' },
  '51': { titolo: 'Trasporto aereo', punteggio: 5, fascia: 'Medium-High' },
  '52': {
    titolo: 'Magazzinaggio, deposito e attività di supporto ai trasporti',
    punteggio: 5,
    fascia: 'Medium-High',
  },
  '53': { titolo: 'Attività postali e di corriere', punteggio: 3, fascia: 'Low-Medium' },
  '55': { titolo: 'Servizi di alloggio', punteggio: 4, fascia: 'Medium' },
  '56': { titolo: 'Attività di servizi di ristorazione', punteggio: 4, fascia: 'Medium' },
  '58': { titolo: 'Attività editoriali', punteggio: 2, fascia: 'Low' },
  '59': {
    titolo:
      'Attività di produzione, post-produzione e distribuzione cinematografica, di video e programmi televisivi, di registrazioni musicali e sonore',
    punteggio: 3,
    fascia: 'Low-Medium',
  },
  '60': {
    titolo:
      'Attività di programmazione, trasmissione, agenzie di stampa e altre attività di distribuzione di contenuti',
    punteggio: 3,
    fascia: 'Low-Medium',
  },
  '61': { titolo: 'Telecomunicazioni', punteggio: 3, fascia: 'Low-Medium' },
  '62': {
    titolo: 'Attività di programmazione, consulenza informatica e attività connesse',
    punteggio: 2,
    fascia: 'Low',
  },
  '63': {
    titolo: 'Infrastrutture informatiche, elaborazione dati, hosting e altri servizi di informazione',
    punteggio: 4,
    fascia: 'Medium',
  },
  '64': {
    titolo: 'Attività dei servizi finanziari, escluse le assicurazioni e i fondi pensione',
    punteggio: 2,
    fascia: 'Low',
  },
  '65': {
    titolo:
      'Assicurazioni, riassicurazioni e fondi pensione, escluse le assicurazioni sociali obbligatorie',
    punteggio: 2,
    fascia: 'Low',
  },
  '66': {
    titolo: 'Attività ausiliarie dei servizi finanziari e delle attività assicurative',
    punteggio: 2,
    fascia: 'Low',
  },
  '68': { titolo: 'Attività immobiliari', punteggio: 3, fascia: 'Low-Medium' },
  '69': { titolo: 'Attività legali e di contabilità', punteggio: 1, fascia: 'Very Low' },
  '70': { titolo: 'Attività di sedi centrali e consulenza gestionale', punteggio: 1, fascia: 'Very Low' },
  '71': {
    titolo: 'Attività di architettura e ingegneria; collaudi e analisi tecniche',
    punteggio: 2,
    fascia: 'Low',
  },
  '72': { titolo: 'Ricerca scientifica e sviluppo', punteggio: 3, fascia: 'Low-Medium' },
  '73': {
    titolo: 'Attività di pubblicità, ricerche di mercato e pubbliche relazioni',
    punteggio: 2,
    fascia: 'Low',
  },
  '74': { titolo: 'Altre attività professionali, scientifiche e tecniche', punteggio: 2, fascia: 'Low' },
  '75': { titolo: 'Servizi veterinari', punteggio: 3, fascia: 'Low-Medium' },
  '77': { titolo: 'Attività di noleggio e leasing operativo', punteggio: 4, fascia: 'Medium' },
  '78': {
    titolo: 'Attività di ricerca, selezione, fornitura di risorse umane',
    punteggio: 1,
    fascia: 'Very Low',
  },
  '79': {
    titolo:
      'Attività di agenzie di viaggio, tour operator e altri servizi di prenotazione e attività connesse',
    punteggio: 1,
    fascia: 'Very Low',
  },
  '80': { titolo: 'Attività di investigazione e vigilanza', punteggio: 3, fascia: 'Low-Medium' },
  '81': {
    titolo: 'Attività di servizi per edifici e per la cura del paesaggio',
    punteggio: 4,
    fascia: 'Medium',
  },
  '82': {
    titolo:
      'Attività amministrative, di supporto per le funzioni di ufficio e altri servizi di supporto alle imprese',
    punteggio: 2,
    fascia: 'Low',
  },
  '84': {
    titolo: 'Amministrazione pubblica e difesa; assicurazione sociale obbligatoria',
    punteggio: 2,
    fascia: 'Low',
  },
  '85': { titolo: 'Istruzione e formazione', punteggio: 2, fascia: 'Low' },
  '86': { titolo: 'Attività per la salute umana', punteggio: 4, fascia: 'Medium' },
  '87': { titolo: 'Attività di assistenza residenziale', punteggio: 3, fascia: 'Low-Medium' },
  '88': { titolo: 'Attività di assistenza sociale non residenziale', punteggio: 2, fascia: 'Low' },
  '90': {
    titolo: 'Attività di creazione artistica e rappresentazioni artistiche',
    punteggio: 4,
    fascia: 'Medium',
  },
  '91': {
    titolo: 'Attività di biblioteche, archivi, musei e altre attività culturali',
    punteggio: 3,
    fascia: 'Low-Medium',
  },
  '92': { titolo: 'Attività di giochi d’azzardo e scommesse', punteggio: 3, fascia: 'Low-Medium' },
  '93': { titolo: 'Attività sportive, di intrattenimento e divertimento', punteggio: 4, fascia: 'Medium' },
  '94': { titolo: 'Attività di organizzazioni associative', punteggio: 2, fascia: 'Low' },
  '95': {
    titolo:
      'Riparazione e manutenzione di computer, beni per uso personale e per la casa, autoveicoli e motocicli',
    punteggio: 5,
    fascia: 'Medium-High',
  },
  '96': { titolo: 'Attività di servizi alla persona', punteggio: 3, fascia: 'Low-Medium' },
  '97': {
    titolo: 'Attività di famiglie e convivenze come datori di lavoro per personale domestico',
    punteggio: 1,
    fascia: 'Very Low',
  },
  '98': {
    titolo:
      'Produzione di beni e servizi indifferenziati per uso proprio da parte di famiglie e convivenze',
    punteggio: 1,
    fascia: 'Very Low',
  },
  '99': { titolo: 'Attività di organizzazioni e organismi extraterritoriali', punteggio: 2, fascia: 'Low' },
};

export interface RigaTipoDiSito {
  readonly tipo: string;
  /** `null` dove il foglio scrive «—»: il tipo non è una destinazione d'uso fisica. */
  readonly punteggio: number | null;
  readonly motivo: string;
}

/** Foglio «Site Type_Risk»: la natura fisica della sede. */
export const RISCHIO_TIPO_DI_SITO: readonly RigaTipoDiSito[] = [
  { tipo: 'Ufficio', punteggio: 1, motivo: 'Very limited physical/process hazard' },
  { tipo: 'Filiale', punteggio: 2, motivo: 'Mainly administrative/commercial activity' },
  { tipo: 'Agenzia', punteggio: 2, motivo: 'Mainly service/commercial premises' },
  { tipo: 'Negozio', punteggio: 3, motivo: 'Stock + electrical equipment + public access' },
  { tipo: 'Laboratorio', punteggio: 4, motivo: 'Equipment and potentially technical processes' },
  { tipo: 'Deposito', punteggio: 4, motivo: 'Concentration of goods, usually less operational activity' },
  { tipo: 'Magazzino', punteggio: 5, motivo: 'Larger stock exposure / storage concentration' },
  { tipo: 'Officina', punteggio: 6, motivo: 'Machinery, tools, hot work / mechanical operations possible' },
  {
    tipo: 'Stabilimento',
    punteggio: 7,
    motivo: 'Industrial processes, machinery and higher physical hazard',
  },
  {
    tipo: 'Sede secondaria',
    punteggio: null,
    motivo: 'Legal/organizational classification, not a physical-use type',
  },
  { tipo: 'Unknown / Other', punteggio: null, motivo: 'Use ATECO/activity as fallback' },
];

export interface RigaCyber {
  readonly titolo: string;
  readonly dipendenzaDigitale: number;
  readonly sensibilitaDati: number;
  readonly esposizioneTransazioni: number;
  readonly attrattivita: number;
  /** Il «Final Cyber Risk Score» salvato nel foglio: serve a verificare il ricalcolo. */
  readonly punteggioDelFoglio: number;
}

/** Foglio «Cyber_Risk_Lookup»: i quattro sotto-punteggi per divisione ATECO. */
export const RISCHIO_CYBER: Readonly<Record<string, RigaCyber>> = {
  '01': {
    titolo: 'Produzioni vegetali e animali, caccia e servizi connessi',
    dipendenzaDigitale: 2,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 2,
    punteggioDelFoglio: 2,
  },
  '02': {
    titolo: 'Silvicoltura e utilizzo di aree forestali',
    dipendenzaDigitale: 2,
    sensibilitaDati: 1,
    esposizioneTransazioni: 1,
    attrattivita: 2,
    punteggioDelFoglio: 1.6,
  },
  '03': {
    titolo: 'Pesca e acquacoltura',
    dipendenzaDigitale: 2,
    sensibilitaDati: 1,
    esposizioneTransazioni: 2,
    attrattivita: 2,
    punteggioDelFoglio: 1.7,
  },
  '05': {
    titolo: 'Estrazione di carbone e lignite',
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 4,
    punteggioDelFoglio: 3.1,
  },
  '06': {
    titolo: 'Estrazione di petrolio greggio e gas naturale',
    dipendenzaDigitale: 5,
    sensibilitaDati: 2,
    esposizioneTransazioni: 3,
    attrattivita: 5,
    punteggioDelFoglio: 3.8,
  },
  '07': {
    titolo: 'Estrazione di minerali metalliferi',
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 4,
    punteggioDelFoglio: 3.1,
  },
  '08': {
    titolo: 'Altre attività estrattive',
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 4,
    punteggioDelFoglio: 3.1,
  },
  '09': {
    titolo: 'Attività dei servizi di supporto all’estrazione',
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 4,
    punteggioDelFoglio: 3.1,
  },
  '10': {
    titolo: 'Produzione di prodotti alimentari',
    dipendenzaDigitale: 4,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivita: 5,
    punteggioDelFoglio: 3.8,
  },
  '11': {
    titolo: 'Produzione di bevande',
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 3,
    attrattivita: 4,
    punteggioDelFoglio: 3.3,
  },
  '12': {
    titolo: 'Produzione di prodotti del tabacco',
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 4,
    attrattivita: 4,
    punteggioDelFoglio: 3.4,
  },
  '13': {
    titolo: 'Fabbricazione di tessili',
    dipendenzaDigitale: 3,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 4,
    punteggioDelFoglio: 2.8,
  },
  '14': {
    titolo: 'Fabbricazione di articoli di abbigliamento',
    dipendenzaDigitale: 3,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 3,
    punteggioDelFoglio: 2.6,
  },
  '15': {
    titolo: 'Fabbricazione di pelli e cuoio e articoli in pelle e simili di altri materiali',
    dipendenzaDigitale: 3,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 3,
    punteggioDelFoglio: 2.6,
  },
  '16': {
    titolo:
      'Produzione e lavorazione del legno e dei prodotti a base di legno e sughero, esclusi i mobili; fabbricazione di articoli in paglia e materiale da intreccio',
    dipendenzaDigitale: 3,
    sensibilitaDati: 1,
    esposizioneTransazioni: 2,
    attrattivita: 4,
    punteggioDelFoglio: 2.5,
  },
  '17': {
    titolo: 'Fabbricazione di carta e di prodotti di carta',
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 4,
    punteggioDelFoglio: 3.1,
  },
  '18': {
    titolo: 'Stampa e riproduzione di supporti registrati',
    dipendenzaDigitale: 4,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivita: 4,
    punteggioDelFoglio: 3.6,
  },
  '19': {
    titolo: 'Fabbricazione di coke e prodotti derivanti dalla raffinazione del petrolio',
    dipendenzaDigitale: 5,
    sensibilitaDati: 2,
    esposizioneTransazioni: 3,
    attrattivita: 6,
    punteggioDelFoglio: 4.1,
  },
  '20': {
    titolo: 'Fabbricazione di prodotti chimici',
    dipendenzaDigitale: 5,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivita: 6,
    punteggioDelFoglio: 4.4,
  },
  '21': {
    titolo: 'Fabbricazione di prodotti farmaceutici di base e di preparati farmaceutici',
    dipendenzaDigitale: 6,
    sensibilitaDati: 6,
    esposizioneTransazioni: 4,
    attrattivita: 6,
    punteggioDelFoglio: 5.7,
  },
  '22': {
    titolo: 'Fabbricazione di prodotti in gomma e in materie plastiche',
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 5,
    punteggioDelFoglio: 3.4,
  },
  '23': {
    titolo: 'Fabbricazione di altri prodotti della lavorazione di minerali non metalliferi',
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 5,
    punteggioDelFoglio: 3.4,
  },
  '24': {
    titolo: 'Fabbricazione di metalli di base',
    dipendenzaDigitale: 5,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 5,
    punteggioDelFoglio: 3.7,
  },
  '25': {
    titolo: 'Fabbricazione di prodotti in metallo, esclusi macchinari e attrezzature',
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 5,
    punteggioDelFoglio: 3.4,
  },
  '26': {
    titolo: 'Fabbricazione di computer e prodotti di elettronica e ottica',
    dipendenzaDigitale: 6,
    sensibilitaDati: 4,
    esposizioneTransazioni: 3,
    attrattivita: 6,
    punteggioDelFoglio: 5,
  },
  '27': {
    titolo: 'Fabbricazione di apparecchiature elettriche',
    dipendenzaDigitale: 5,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivita: 5,
    punteggioDelFoglio: 4.1,
  },
  '28': {
    titolo: 'Fabbricazione di macchinari e apparecchiature n.c.a.',
    dipendenzaDigitale: 5,
    sensibilitaDati: 3,
    esposizioneTransazioni: 2,
    attrattivita: 5,
    punteggioDelFoglio: 4,
  },
  '29': {
    titolo: 'Fabbricazione di autoveicoli, rimorchi e semirimorchi',
    dipendenzaDigitale: 6,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivita: 6,
    punteggioDelFoglio: 4.7,
  },
  '30': {
    titolo: 'Fabbricazione di altri mezzi di trasporto',
    dipendenzaDigitale: 6,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivita: 6,
    punteggioDelFoglio: 4.7,
  },
  '31': {
    titolo: 'Fabbricazione di mobili',
    dipendenzaDigitale: 3,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 4,
    punteggioDelFoglio: 2.8,
  },
  '32': {
    titolo: 'Altre attività manifatturiere',
    dipendenzaDigitale: 4,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivita: 4,
    punteggioDelFoglio: 3.6,
  },
  '33': {
    titolo: 'Riparazione, manutenzione e installazione di macchine e apparecchiature',
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 4,
    punteggioDelFoglio: 3.1,
  },
  '35': {
    titolo: 'Fornitura di energia elettrica, gas, vapore e aria condizionata',
    dipendenzaDigitale: 7,
    sensibilitaDati: 4,
    esposizioneTransazioni: 4,
    attrattivita: 7,
    punteggioDelFoglio: 5.7,
  },
  '36': {
    titolo: 'Raccolta, trattamento e fornitura di acqua',
    dipendenzaDigitale: 6,
    sensibilitaDati: 4,
    esposizioneTransazioni: 3,
    attrattivita: 6,
    punteggioDelFoglio: 5,
  },
  '37': {
    titolo: 'Gestione delle reti fognarie',
    dipendenzaDigitale: 5,
    sensibilitaDati: 3,
    esposizioneTransazioni: 2,
    attrattivita: 5,
    punteggioDelFoglio: 4,
  },
  '38': {
    titolo: 'Attività di raccolta, recupero e smaltimento dei rifiuti',
    dipendenzaDigitale: 5,
    sensibilitaDati: 3,
    esposizioneTransazioni: 2,
    attrattivita: 5,
    punteggioDelFoglio: 4,
  },
  '39': {
    titolo: 'Attività di risanamento e altri servizi di gestione dei rifiuti',
    dipendenzaDigitale: 4,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 4,
    punteggioDelFoglio: 3.1,
  },
  '41': {
    titolo: 'Costruzione di edifici residenziali e non residenziali',
    dipendenzaDigitale: 3,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivita: 4,
    punteggioDelFoglio: 3.3,
  },
  '42': {
    titolo: 'Ingegneria civile',
    dipendenzaDigitale: 4,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivita: 5,
    punteggioDelFoglio: 3.8,
  },
  '43': {
    titolo: 'Lavori di costruzione specializzati',
    dipendenzaDigitale: 3,
    sensibilitaDati: 2,
    esposizioneTransazioni: 2,
    attrattivita: 4,
    punteggioDelFoglio: 2.8,
  },
  '46': {
    titolo: 'Commercio all’ingrosso',
    dipendenzaDigitale: 4,
    sensibilitaDati: 4,
    esposizioneTransazioni: 5,
    attrattivita: 4,
    punteggioDelFoglio: 4.2,
  },
  '47': {
    titolo: 'Commercio al dettaglio',
    dipendenzaDigitale: 5,
    sensibilitaDati: 5,
    esposizioneTransazioni: 6,
    attrattivita: 5,
    punteggioDelFoglio: 5.2,
  },
  '49': {
    titolo: 'Trasporto terrestre e trasporto mediante condotte',
    dipendenzaDigitale: 6,
    sensibilitaDati: 4,
    esposizioneTransazioni: 4,
    attrattivita: 6,
    punteggioDelFoglio: 5.1,
  },
  '50': {
    titolo: 'Trasporto marittimo e per vie d’acqua interne',
    dipendenzaDigitale: 5,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivita: 5,
    punteggioDelFoglio: 4.1,
  },
  '51': {
    titolo: 'Trasporto aereo',
    dipendenzaDigitale: 7,
    sensibilitaDati: 5,
    esposizioneTransazioni: 6,
    attrattivita: 7,
    punteggioDelFoglio: 6.3,
  },
  '52': {
    titolo: 'Magazzinaggio, deposito e attività di supporto ai trasporti',
    dipendenzaDigitale: 6,
    sensibilitaDati: 4,
    esposizioneTransazioni: 4,
    attrattivita: 6,
    punteggioDelFoglio: 5.1,
  },
  '53': {
    titolo: 'Attività postali e di corriere',
    dipendenzaDigitale: 6,
    sensibilitaDati: 4,
    esposizioneTransazioni: 5,
    attrattivita: 5,
    punteggioDelFoglio: 5,
  },
  '55': {
    titolo: 'Servizi di alloggio',
    dipendenzaDigitale: 6,
    sensibilitaDati: 6,
    esposizioneTransazioni: 6,
    attrattivita: 5,
    punteggioDelFoglio: 5.8,
  },
  '56': {
    titolo: 'Attività di servizi di ristorazione',
    dipendenzaDigitale: 4,
    sensibilitaDati: 5,
    esposizioneTransazioni: 6,
    attrattivita: 4,
    punteggioDelFoglio: 4.6,
  },
  '58': {
    titolo: 'Attività editoriali',
    dipendenzaDigitale: 6,
    sensibilitaDati: 5,
    esposizioneTransazioni: 4,
    attrattivita: 5,
    punteggioDelFoglio: 5.2,
  },
  '59': {
    titolo:
      'Attività di produzione, post-produzione e distribuzione cinematografica, di video e programmi televisivi, di registrazioni musicali e sonore',
    dipendenzaDigitale: 6,
    sensibilitaDati: 4,
    esposizioneTransazioni: 4,
    attrattivita: 5,
    punteggioDelFoglio: 4.9,
  },
  '60': {
    titolo:
      'Attività di programmazione, trasmissione, agenzie di stampa e altre attività di distribuzione di contenuti',
    dipendenzaDigitale: 7,
    sensibilitaDati: 5,
    esposizioneTransazioni: 4,
    attrattivita: 6,
    punteggioDelFoglio: 5.7,
  },
  '61': {
    titolo: 'Telecomunicazioni',
    dipendenzaDigitale: 7,
    sensibilitaDati: 6,
    esposizioneTransazioni: 5,
    attrattivita: 7,
    punteggioDelFoglio: 6.4,
  },
  '62': {
    titolo: 'Attività di programmazione, consulenza informatica e attività connesse',
    dipendenzaDigitale: 7,
    sensibilitaDati: 6,
    esposizioneTransazioni: 5,
    attrattivita: 7,
    punteggioDelFoglio: 6.4,
  },
  '63': {
    titolo: 'Infrastrutture informatiche, elaborazione dati, hosting e altri servizi di informazione',
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 6,
    attrattivita: 7,
    punteggioDelFoglio: 6.9,
  },
  '64': {
    titolo: 'Attività dei servizi finanziari, escluse le assicurazioni e i fondi pensione',
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 7,
    attrattivita: 7,
    punteggioDelFoglio: 7,
  },
  '65': {
    titolo:
      'Assicurazioni, riassicurazioni e fondi pensione, escluse le assicurazioni sociali obbligatorie',
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 7,
    attrattivita: 7,
    punteggioDelFoglio: 7,
  },
  '66': {
    titolo: 'Attività ausiliarie dei servizi finanziari e delle attività assicurative',
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 7,
    attrattivita: 6,
    punteggioDelFoglio: 6.8,
  },
  '68': {
    titolo: 'Attività immobiliari',
    dipendenzaDigitale: 4,
    sensibilitaDati: 5,
    esposizioneTransazioni: 5,
    attrattivita: 4,
    punteggioDelFoglio: 4.5,
  },
  '69': {
    titolo: 'Attività legali e di contabilità',
    dipendenzaDigitale: 6,
    sensibilitaDati: 7,
    esposizioneTransazioni: 6,
    attrattivita: 5,
    punteggioDelFoglio: 6.1,
  },
  '70': {
    titolo: 'Attività di sedi centrali e consulenza gestionale',
    dipendenzaDigitale: 6,
    sensibilitaDati: 6,
    esposizioneTransazioni: 4,
    attrattivita: 5,
    punteggioDelFoglio: 5.5,
  },
  '71': {
    titolo: 'Attività di architettura e ingegneria; collaudi e analisi tecniche',
    dipendenzaDigitale: 5,
    sensibilitaDati: 4,
    esposizioneTransazioni: 3,
    attrattivita: 4,
    punteggioDelFoglio: 4.2,
  },
  '72': {
    titolo: 'Ricerca scientifica e sviluppo',
    dipendenzaDigitale: 6,
    sensibilitaDati: 6,
    esposizioneTransazioni: 4,
    attrattivita: 6,
    punteggioDelFoglio: 5.7,
  },
  '73': {
    titolo: 'Attività di pubblicità, ricerche di mercato e pubbliche relazioni',
    dipendenzaDigitale: 6,
    sensibilitaDati: 6,
    esposizioneTransazioni: 5,
    attrattivita: 5,
    punteggioDelFoglio: 5.6,
  },
  '74': {
    titolo: 'Altre attività professionali, scientifiche e tecniche',
    dipendenzaDigitale: 5,
    sensibilitaDati: 5,
    esposizioneTransazioni: 4,
    attrattivita: 4,
    punteggioDelFoglio: 4.6,
  },
  '75': {
    titolo: 'Servizi veterinari',
    dipendenzaDigitale: 5,
    sensibilitaDati: 7,
    esposizioneTransazioni: 5,
    attrattivita: 5,
    punteggioDelFoglio: 5.6,
  },
  '77': {
    titolo: 'Attività di noleggio e leasing operativo',
    dipendenzaDigitale: 5,
    sensibilitaDati: 5,
    esposizioneTransazioni: 6,
    attrattivita: 5,
    punteggioDelFoglio: 5.2,
  },
  '78': {
    titolo: 'Attività di ricerca, selezione, fornitura di risorse umane',
    dipendenzaDigitale: 6,
    sensibilitaDati: 7,
    esposizioneTransazioni: 4,
    attrattivita: 5,
    punteggioDelFoglio: 5.8,
  },
  '79': {
    titolo:
      'Attività di agenzie di viaggio, tour operator e altri servizi di prenotazione e attività connesse',
    dipendenzaDigitale: 7,
    sensibilitaDati: 6,
    esposizioneTransazioni: 7,
    attrattivita: 5,
    punteggioDelFoglio: 6.2,
  },
  '80': {
    titolo: 'Attività di investigazione e vigilanza',
    dipendenzaDigitale: 6,
    sensibilitaDati: 7,
    esposizioneTransazioni: 4,
    attrattivita: 6,
    punteggioDelFoglio: 6,
  },
  '81': {
    titolo: 'Attività di servizi per edifici e per la cura del paesaggio',
    dipendenzaDigitale: 3,
    sensibilitaDati: 3,
    esposizioneTransazioni: 3,
    attrattivita: 3,
    punteggioDelFoglio: 3,
  },
  '82': {
    titolo:
      'Attività amministrative, di supporto per le funzioni di ufficio e altri servizi di supporto alle imprese',
    dipendenzaDigitale: 6,
    sensibilitaDati: 6,
    esposizioneTransazioni: 5,
    attrattivita: 5,
    punteggioDelFoglio: 5.6,
  },
  '84': {
    titolo: 'Amministrazione pubblica e difesa; assicurazione sociale obbligatoria',
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 5,
    attrattivita: 7,
    punteggioDelFoglio: 6.7,
  },
  '85': {
    titolo: 'Istruzione e formazione',
    dipendenzaDigitale: 6,
    sensibilitaDati: 7,
    esposizioneTransazioni: 4,
    attrattivita: 5,
    punteggioDelFoglio: 5.8,
  },
  '86': {
    titolo: 'Attività per la salute umana',
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 6,
    attrattivita: 7,
    punteggioDelFoglio: 6.9,
  },
  '87': {
    titolo: 'Attività di assistenza residenziale',
    dipendenzaDigitale: 6,
    sensibilitaDati: 7,
    esposizioneTransazioni: 5,
    attrattivita: 6,
    punteggioDelFoglio: 6.2,
  },
  '88': {
    titolo: 'Attività di assistenza sociale non residenziale',
    dipendenzaDigitale: 5,
    sensibilitaDati: 7,
    esposizioneTransazioni: 4,
    attrattivita: 5,
    punteggioDelFoglio: 5.5,
  },
  '90': {
    titolo: 'Attività di creazione artistica e rappresentazioni artistiche',
    dipendenzaDigitale: 4,
    sensibilitaDati: 4,
    esposizioneTransazioni: 4,
    attrattivita: 4,
    punteggioDelFoglio: 4,
  },
  '91': {
    titolo: 'Attività di biblioteche, archivi, musei e altre attività culturali',
    dipendenzaDigitale: 5,
    sensibilitaDati: 6,
    esposizioneTransazioni: 3,
    attrattivita: 5,
    punteggioDelFoglio: 5,
  },
  '92': {
    titolo: 'Attività di giochi d’azzardo e scommesse',
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 7,
    attrattivita: 7,
    punteggioDelFoglio: 7,
  },
  '93': {
    titolo: 'Attività sportive, di intrattenimento e divertimento',
    dipendenzaDigitale: 5,
    sensibilitaDati: 5,
    esposizioneTransazioni: 6,
    attrattivita: 5,
    punteggioDelFoglio: 5.2,
  },
  '94': {
    titolo: 'Attività di organizzazioni associative',
    dipendenzaDigitale: 4,
    sensibilitaDati: 6,
    esposizioneTransazioni: 4,
    attrattivita: 5,
    punteggioDelFoglio: 4.9,
  },
  '95': {
    titolo:
      'Riparazione e manutenzione di computer, beni per uso personale e per la casa, autoveicoli e motocicli',
    dipendenzaDigitale: 4,
    sensibilitaDati: 3,
    esposizioneTransazioni: 4,
    attrattivita: 4,
    punteggioDelFoglio: 3.7,
  },
  '96': {
    titolo: 'Attività di servizi alla persona',
    dipendenzaDigitale: 3,
    sensibilitaDati: 5,
    esposizioneTransazioni: 5,
    attrattivita: 3,
    punteggioDelFoglio: 3.9,
  },
  '97': {
    titolo: 'Attività di famiglie e convivenze come datori di lavoro per personale domestico',
    dipendenzaDigitale: 1,
    sensibilitaDati: 3,
    esposizioneTransazioni: 1,
    attrattivita: 1,
    punteggioDelFoglio: 1.6,
  },
  '98': {
    titolo:
      'Produzione di beni e servizi indifferenziati per uso proprio da parte di famiglie e convivenze',
    dipendenzaDigitale: 1,
    sensibilitaDati: 1,
    esposizioneTransazioni: 1,
    attrattivita: 1,
    punteggioDelFoglio: 1,
  },
  '99': {
    titolo: 'Attività di organizzazioni e organismi extraterritoriali',
    dipendenzaDigitale: 7,
    sensibilitaDati: 7,
    esposizioneTransazioni: 5,
    attrattivita: 7,
    punteggioDelFoglio: 6.7,
  },
};
