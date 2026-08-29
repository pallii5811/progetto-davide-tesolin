/**
 * Il titolare effettivo ricavato dai soci già acquistati.
 *
 * Nasce da un'obiezione giusta: OpenAPI vende una visura apposta a **1,10 €**, ma
 * l'anagrafica estesa che ogni analisi compra già a **0,10 €** contiene i soci con nome,
 * cognome e quota. Quando i soci sono persone fisiche, il titolare effettivo è già lì, e
 * comprarlo una seconda volta a undici volte il prezzo è buttare denaro.
 *
 * Le prove qui sotto separano i casi in cui si può ricavare da quelli in cui la visura
 * serve davvero — perché sbagliare in un verso costa soldi inutili, e sbagliare nell'altro
 * costa un obbligo di legge non adempiuto.
 */

import { describe, expect, it } from 'vitest';
import { analizzaAssetto } from '../src/governance/assetto.js';
import { analizzaTitolareEffettivo, SOGLIA_PARTECIPAZIONE } from '../src/governance/titolare-effettivo.js';
import type { AssettoProprietario, PersonaChiave, SocioDiRilievo } from '../src/governance/assetto.js';
import type { Assetti } from '../src/company/profile.js';

/** Una persona chiave in virtù della sola carica: lo stato che il ramo residuale cerca. */
function amministratore(p: Partial<PersonaChiave> = {}): PersonaChiave {
  return {
    denominazione: 'AMMINISTRATORE UNICO',
    codiceFiscale: 'MNSNCO70A01H501X',
    quotaPercentuale: null,
    ruolo: 'Amministratore unico',
    rappresentanteLegale: true,
    eta: null,
    motivo: 'carica',
    ...p,
  };
}

function socio(p: Partial<SocioDiRilievo> = {}): SocioDiRilievo {
  return {
    denominazione: 'MARIO ROSSI',
    codiceFiscale: 'RSSMRA70A01H501X',
    tipo: 'persona-fisica',
    quotaPercentuale: 100,
    ...p,
  };
}

function assetto(p: Partial<AssettoProprietario> = {}): AssettoProprietario {
  return {
    tipoControllo: 'socio-unico-persona-fisica',
    tipoControlloEtichetta: 'Socio unico persona fisica',
    numeroSoci: 1,
    soci: [socio()],
    quotaPrimoSocio: 100,
    compagineCompleta: true,
    capogruppo: null,
    soggettaADirezioneECoordinamento: false,
    personeChiave: [],
    caricheDisponibili: true,
    cariche: [],
    implicazioni: [],
    domande: [],
    confidenza: 'alta',
    ...p,
  };
}

describe('Titolare effettivo', () => {
  it('con soci persone fisiche non serve comprare nulla', () => {
    const esito = analizzaTitolareEffettivo(assetto());

    expect(esito.titolari).toHaveLength(1);
    expect(esito.titolari[0]?.nominativo).toBe('MARIO ROSSI');
    expect(esito.titolari[0]?.criterio).toBe('partecipazione');
    expect(esito.catenaChiusa).toBe(true);

    // È il punto di tutta la funzione: dire che la visura non serve, invece di lasciarla
    // comprare per sicurezza.
    expect(esito.azione).toContain('non è necessaria');
  });

  it('sotto la soglia del 25% non è titolare effettivo per partecipazione', () => {
    const frammentata = assetto({
      soci: [
        socio({ denominazione: 'A', quotaPercentuale: 20 }),
        socio({ denominazione: 'B', quotaPercentuale: 20 }),
        socio({ denominazione: 'C', quotaPercentuale: 20 }),
        socio({ denominazione: 'D', quotaPercentuale: 20 }),
        socio({ denominazione: 'E', quotaPercentuale: 20 }),
      ],
      personeChiave: [amministratore()],
    });

    const esito = analizzaTitolareEffettivo(frammentata);

    /*
      Cinque soci al 20% non producono alcun titolare per partecipazione: si scende al
      criterio residuale, che la norma prevede ma che è anche l'esito più esposto a
      contestazione — perché è quello che si ottiene anche quando non si è cercato
      abbastanza. Qui la visura è giustificata, e il prodotto lo dice.
    */
    expect(esito.titolari[0]?.criterio).toBe('residuale-amministratore');
    expect(esito.confidenza).toBe('bassa');
    expect(esito.azione).toContain('giustificata');
  });

  /*
    La prova che quel ramo esiste davvero.

    Quella qui sopra costruisce a mano un `AssettoProprietario`, ed è il motivo per cui il
    difetto è sopravvissuto: descriveva uno stato che il codice di produzione non sapeva
    produrre. `personeChiave` conteneva i soli soci con quota ≥ 66%, e a questo punto si
    arriva solo se nessuno supera il 25% — l'elenco era sempre vuoto e il criterio
    residuale non si accendeva mai, nemmeno con l'amministratore già comprato.

    Questa parte dal dato grezzo e passa da `analizzaAssetto`: se il ramo tornasse
    irraggiungibile, fallirebbe.
  */
  it('e il criterio residuale si raggiunge dai dati, non da uno stato inventato', () => {
    const quotaVenti = ['A', 'B', 'C', 'D', 'E'].map((n) => ({
      denominazione: n,
      codiceFiscale: null,
      tipo: 'persona-fisica' as const,
      quotaPercentuale: 20,
      quotaValore: null,
      socioDal: null,
    }));

    const grezzo: Assetti = {
      soci: quotaVenti,
      cariche: [
        {
          nominativo: 'BIANCHI LUCA',
          codiceFiscale: 'BNCLCU70A01F205X',
          ruolo: 'Amministratore unico',
          dataNomina: null,
          isRappresentanteLegale: true,
          eta: 61,
          dataNascita: null,
          luogoNascita: null,
        },
      ],
      controllante: null,
      controllate: [],
    };

    const esito = analizzaTitolareEffettivo(
      analizzaAssetto(grezzo, { formaGiuridica: 'srl', addetti: 20 }),
    );

    expect(esito.titolari[0]?.criterio).toBe('residuale-amministratore');
    expect(esito.titolari[0]?.nominativo).toBe('BIANCHI LUCA');
    // Resta a confidenza bassa: la norma lo prevede, ma è l'esito più contestabile.
    expect(esito.confidenza).toBe('bassa');
  });

  it('senza cariche acquisite resta «non determinabile», e la visura serve davvero', () => {
    // La correzione non deve trasformare un'assenza in una risposta: se gli
    // amministratori non sono stati comprati, il prodotto non se li inventa.
    const senzaCariche: Assetti = {
      soci: ['A', 'B', 'C', 'D', 'E'].map((n) => ({
        denominazione: n,
        codiceFiscale: null,
        tipo: 'persona-fisica' as const,
        quotaPercentuale: 20,
        quotaValore: null,
        socioDal: null,
      })),
      cariche: [],
      controllante: null,
      controllate: [],
    };

    const esito = analizzaTitolareEffettivo(
      analizzaAssetto(senzaCariche, { formaGiuridica: 'srl', addetti: 20 }),
    );

    expect(esito.titolari).toHaveLength(0);
    expect(esito.azione).toContain('non determinabile');
  });

  it('quando il socio è una società, la catena non si chiude', () => {
    const conHolding = assetto({
      tipoControllo: 'controllo-societario',
      soci: [
        socio({
          denominazione: 'OPEN HOLDING S.R.L.',
          codiceFiscale: '16935371001',
          tipo: 'persona-giuridica',
          quotaPercentuale: 100,
        }),
      ],
    });

    const esito = analizzaTitolareEffettivo(conHolding);

    /*
      È il caso reale registrato in `.sonda/`: l'anagrafica dà «OPEN HOLDING S.R.L. 100%»,
      cioè la partecipante e non la persona. Qui i soci **non bastano**, ed è il caso in cui
      l'obiezione «tanto ho già i soci» è sbagliata.
    */
    expect(esito.catenaChiusa).toBe(false);
    expect(esito.daRisalire.map((s) => s.denominazione)).toContain('OPEN HOLDING S.R.L.');

    // Ma prima di spendere 1,10 € si risale con un'anagrafica da 0,10 €, e l'azione lo dice
    // col prezzo accanto: è ciò che rende la scelta verificabile invece che opinabile.
    expect(esito.azione).toContain('0,10 €');
    expect(esito.azione).toContain('1,10 €');
  });

  it('una società senza codice fiscale non è risalibile, e allora la visura serve', () => {
    const opaca = assetto({
      soci: [
        socio({
          denominazione: 'SOCIETÀ ESTERA LTD',
          codiceFiscale: null,
          tipo: 'persona-giuridica',
          quotaPercentuale: 100,
        }),
      ],
    });

    const esito = analizzaTitolareEffettivo(opaca);
    expect(esito.azione).toContain('non è risalibile');
  });

  it('una compagine incompleta viene dichiarata, non ignorata', () => {
    const incompleta = assetto({
      soci: [socio({ quotaPercentuale: 60 })],
      compagineCompleta: false,
    });

    const esito = analizzaTitolareEffettivo(incompleta);

    /*
      Se le quote note non coprono l'intero capitale, la persona sopra soglia potrebbe
      essere proprio quella che manca. Senza questa nota chi legge concluderebbe che i
      titolari siano solo quelli elencati — che è un'affermazione, non un dato.
    */
    expect(esito.note.join(' ')).toContain(`${SOGLIA_PARTECIPAZIONE}%`);
    expect(esito.confidenza).toBe('media');
  });

  it('senza soci non inventa nessuno', () => {
    const esito = analizzaTitolareEffettivo(assetto({ soci: [], numeroSoci: 0 }));

    expect(esito.titolari).toHaveLength(0);
    expect(esito.catenaChiusa).toBe(false);
    expect(esito.azione).toContain('visura');
  });
});
