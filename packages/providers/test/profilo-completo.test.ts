/**
 * Il profilo completo (`IT-full`), sulla risposta reale.
 *
 * Porta le tre cose che l'anagrafica estesa non ha e che il prodotto dichiarava mancanti:
 * le **cariche**, le **sedi** e il **gruppo**. Non la sostituisce: `IT-full` non contiene i
 * bilanci sintetici decennali su cui si calcolano crescita e tendenze. Sono due dataset
 * diversi, e chi li crede alternativi compra il servizio caro e perde metà del dato.
 *
 * I frammenti qui sotto sono copiati dalla risposta vera di OPENAPI S.p.A. — la stessa
 * azienda usata per gli altri collaudi sul dato reale. Ogni asserzione corrisponde a una
 * differenza fra questo servizio e quello che già usavamo: differenze che, lette male,
 * producono un indirizzo senza provincia o un amministratore senza nome.
 */

import { describe, expect, it } from 'vitest';
import { mappaProfiloCompleto } from '../src/openapi/mapper.js';
import { mappaIndicatoriFornitore } from '../src/openapi/indicatori.js';

const RISPOSTA_REALE = {
  managers: [
    {
      isLegalRepresentative: true,
      age: 52,
      birthDate: '1973-10-01T22:00:00',
      birthTown: 'ROMA (RM)',
      name: 'LUCA',
      surname: 'SCURIATTI',
      taxCode: 'SCRLCU73R02H501H',
      roles: [
        {
          role: { code: 'AUN', description: 'Managing director' },
          roleStartDate: '2026-07-16T22:00:00',
        },
      ],
      gender: { code: 'M', description: 'Man' },
    },
    {
      // Fra le cariche compaiono anche le persone giuridiche: il socio unico societario.
      isLegalRepresentative: false,
      companyName: 'OPEN HOLDING SRL',
      taxCode: '16935371001',
      roles: [
        {
          role: { code: 'SOU', description: 'Sole owner' },
          roleStartDate: '2022-12-14T23:00:00',
        },
      ],
    },
    {
      isLegalRepresentative: false,
      age: 65,
      name: 'LUCA',
      surname: 'ROSSI',
      taxCode: 'RSSLCU61L12H501X',
      roles: [
        {
          role: { code: 'PCS', description: 'Chairman of board of auditors' },
          roleStartDate: '2023-01-01T23:00:00',
        },
      ],
    },
  ],
  allOffices: [
    {
      companyDetails: {
        officeType: { code: 'SSL', description: 'Administrative headquarter and registered office' },
      },
      address: {
        zipCode: '00143',
        province: { code: 'RM', description: 'ROMA' },
        region: { code: '12', description: 'LAZIO' },
        country: { code: 'IT', description: 'Italia' },
        streetName: 'VIALE FILIPPO TOMMASO MARINETTI, 221',
        town: 'ROMA',
      },
    },
    {
      companyDetails: { officeType: { code: 'UL', description: 'Local units' } },
      address: {
        zipCode: '05100',
        province: { code: 'TR', description: 'TERNI' },
        region: { code: '10', description: 'UMBRIA' },
        country: { code: 'IT', description: 'Italia' },
        streetName: 'PIAZZA SAN GIOVANNI DECOLLATO, 6',
        town: 'TERNI',
      },
    },
  ],
  corporateGroups: {
    belongsToGroup: true,
    groupName: 'SCURIATTI',
    totalGroupSubsidiaries: 0,
    hasForeignParents: false,
    hasForeignSubsidiaries: false,
    holdingCompanyName: 'LUCA SCURIATTI',
  },
};

describe('Cariche dal profilo completo', () => {
  const profilo = mappaProfiloCompleto(RISPOSTA_REALE);

  it('legge nome, cognome e codice fiscale di ogni carica', () => {
    expect(profilo.cariche).toHaveLength(3);
    expect(profilo.cariche[0]?.nominativo).toBe('SCURIATTI LUCA');
    expect(profilo.cariche[0]?.codiceFiscale).toBe('SCRLCU73R02H501H');
  });

  it('individua il rappresentante legale', () => {
    // È il nominativo che finisce sui documenti contrattuali: sbagliarlo non è un
    // dettaglio anagrafico, è un vizio del contratto.
    const legale = profilo.cariche.filter((c) => c.isRappresentanteLegale);
    expect(legale).toHaveLength(1);
    expect(legale[0]?.nominativo).toBe('SCURIATTI LUCA');
    expect(legale[0]?.ruolo).toBe('Managing director');
  });

  it('conserva anche le cariche ricoperte da società', () => {
    // Il socio unico è una S.r.l.: ha nome societario e nessun cognome. Scartarlo
    // perché «non è una persona» toglierebbe dalla vista proprio chi controlla.
    const holding = profilo.cariche.find((c) => c.codiceFiscale === '16935371001');
    expect(holding?.nominativo).toBe('OPEN HOLDING SRL');
    expect(holding?.ruolo).toBe('Sole owner');
  });

  it('registra la data di nomina, che dice da quanto quella persona decide', () => {
    expect(profilo.cariche[0]?.dataNomina?.getUTCFullYear()).toBe(2026);
  });
});

describe('Sedi dal profilo completo', () => {
  const profilo = mappaProfiloCompleto(RISPOSTA_REALE);

  it('trova tutte le ubicazioni, non solo la sede legale', () => {
    // È il dato che fa vivere l'analisi multi-sede: l'anagrafica estesa ne conosce una,
    // qui ce ne sono due, in due regioni diverse.
    expect(profilo.unitaLocali).toHaveLength(2);
    expect(profilo.unitaLocali[0]?.tipo).toBe('sede-legale');
    expect(profilo.unitaLocali[1]?.tipo).not.toBe('sede-legale');
  });

  it('legge la provincia, che qui è un oggetto e non una stringa', () => {
    /*
      In `IT-start` e `IT-advanced` la provincia è la stringa «RM»; qui è
      `{ code: 'RM', description: 'ROMA' }`. Letta con lo stesso lettore, resta vuota — e
      un'ubicazione senza provincia perde la classificazione sismica e idraulica, cioè
      esattamente ciò per cui la si è comprata.
    */
    expect(profilo.unitaLocali[0]?.indirizzo.provincia).toBe('RM');
    expect(profilo.unitaLocali[1]?.indirizzo.provincia).toBe('TR');
  });

  it('separa il civico dal nome della via', () => {
    // Qui la via arriva in un pezzo solo, con il civico dopo la virgola: «VIALE FILIPPO
    // TOMMASO MARINETTI, 221». Lasciarlo dentro il nome della via impedisce di
    // riconoscere lo stesso indirizzo quando arriva dall'altro servizio, e la sede
    // verrebbe contata due volte.
    expect(profilo.unitaLocali[0]?.indirizzo.via).toBe('VIALE FILIPPO TOMMASO MARINETTI');
    expect(profilo.unitaLocali[0]?.indirizzo.civico).toBe('221');
    expect(profilo.unitaLocali[1]?.indirizzo.civico).toBe('6');
  });

  it('conserva comune, CAP e regione', () => {
    expect(profilo.unitaLocali[1]?.indirizzo.comune).toBe('TERNI');
    expect(profilo.unitaLocali[1]?.indirizzo.cap).toBe('05100');
    expect(profilo.unitaLocali[1]?.indirizzo.regione).toBe('UMBRIA');
  });
});

describe('Gruppo dal profilo completo', () => {
  const profilo = mappaProfiloCompleto(RISPOSTA_REALE);

  it('dichiara l’appartenenza al gruppo e chi sta al vertice', () => {
    expect(profilo.gruppo?.appartieneAGruppo).toBe(true);
    expect(profilo.gruppo?.denominazione).toBe('SCURIATTI');
    /*
      Il vertice è una **persona fisica**, non una società: per la D&O e per la key man è
      la differenza fra assicurare una struttura e assicurare un uomo solo.

      Si chiama `verticeDichiarato` e non `capogruppo` proprio per questo: l'altro
      `capogruppo`, quello dell'assetto proprietario, è la società socia di controllo e
      porta una partita IVA che l'interfaccia trasforma in un collegamento. Un link verso
      «LUCA SCURIATTI» produrrebbe una ricerca a vuoto, per giunta a pagamento.
    */
    expect(profilo.gruppo?.verticeDichiarato).toBe('LUCA SCURIATTI');
  });

  it('non trasforma un gruppo non dichiarato in un gruppo assente', () => {
    /*
      Il campo era scritto con `?? false`: un registro che tace diventava un «no».

      Non era innocuo, perché la stessa risposta espone lo stesso fatto anche fra gli
      indicatori, dove il tipo è corretto: la scheda avrebbe mostrato un «no» inventato
      accanto a un «non dichiarato» vero.
    */
    const senzaFlag = mappaProfiloCompleto({ corporateGroups: { groupName: 'ALFA' } });
    expect(senzaFlag.gruppo?.appartieneAGruppo).toBeNull();
    expect(senzaFlag.gruppo?.denominazione).toBe('ALFA');
  });

  it('il controllo dall’estero si legge negli indicatori, dove il tipo è giusto', () => {
    // Era un doppione: lo stesso nodo `corporateGroups` letto due volte, una con il tipo
    // corretto e una con `?? false`. È rimasta la copia buona, che è già a schermo.
    expect(mappaIndicatoriFornitore(RISPOSTA_REALE).qualifiche?.haControllantiEstere).toBe(false);
  });
});

describe('Sezioni assenti', () => {
  it('non inventa nulla quando la risposta non porta le sezioni', () => {
    const vuoto = mappaProfiloCompleto({});
    expect(vuoto.cariche).toEqual([]);
    expect(vuoto.unitaLocali).toEqual([]);
    expect(vuoto.gruppo).toBeNull();
  });
});
