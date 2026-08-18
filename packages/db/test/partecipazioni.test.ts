/**
 * Collegamenti societari dentro il portafoglio.
 *
 * È la domanda che un intermediario si pone da solo, su un foglio, quando ha memoria dei
 * propri clienti: «ma questi due non sono la stessa famiglia?». Automatizzarla cambia il
 * dimensionamento, perché tre società che fanno capo alla stessa persona non sono tre
 * rischi indipendenti — e i massimali calcolati uno per uno lo danno per scontato.
 *
 * Ciò che questi test presidiano è soprattutto quando il collegamento **non** va fatto:
 * un falso legame fra due clienti è peggio di un legame mancato.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applicaSchemaTollerante,
  collegamentiSocietari,
  connetti,
  salvaPartecipazioni,
  schema,
} from '../src/index.js';
import type { Connessione } from '../src/index.js';

const CF_HOLDING = '16935371001';
const CF_PERSONA = 'RSSMRA80A01H501U';

describe('Collegamenti societari', () => {
  let connessione: Connessione;
  let tenantId: string;
  let altroTenantId: string;
  let alfa: string;
  let beta: string;
  let gamma: string;
  let estranea: string;

  beforeAll(async () => {
    connessione = await connetti();
    await applicaSchemaTollerante(connessione);

    const tenants = await connessione.db
      .insert(schema.tenants)
      .values([{ denominazione: 'Studio Uno' }, { denominazione: 'Studio Due' }])
      .returning({ id: schema.tenants.id });
    tenantId = tenants[0]!.id;
    altroTenantId = tenants[1]!.id;

    const aziende = await connessione.db
      .insert(schema.aziende)
      .values([
        { tenantId, denominazione: 'ALFA S.R.L.', partitaIva: '00000000001' },
        { tenantId, denominazione: 'BETA S.R.L.', partitaIva: '00000000002' },
        { tenantId, denominazione: 'GAMMA S.P.A.', partitaIva: '00000000003' },
        { tenantId: altroTenantId, denominazione: 'ESTRANEA S.R.L.', partitaIva: '00000000004' },
      ])
      .returning({ id: schema.aziende.id });
    alfa = aziende[0]!.id;
    beta = aziende[1]!.id;
    gamma = aziende[2]!.id;
    estranea = aziende[3]!.id;

    // La holding controlla ALFA e BETA; una persona fisica ha una minoranza in ALFA e GAMMA.
    await salvaPartecipazioni(connessione.db, tenantId, alfa, [
      {
        socioDenominazione: 'OPEN HOLDING S.R.L.',
        socioCodiceFiscale: CF_HOLDING,
        socioTipo: 'persona-giuridica',
        quotaPercentuale: 70,
        diControllo: true,
      },
      {
        socioDenominazione: 'MARIO ROSSI',
        socioCodiceFiscale: CF_PERSONA,
        socioTipo: 'persona-fisica',
        quotaPercentuale: 30,
        diControllo: false,
      },
    ]);

    await salvaPartecipazioni(connessione.db, tenantId, beta, [
      {
        socioDenominazione: 'OPEN HOLDING SRL',
        socioCodiceFiscale: CF_HOLDING,
        socioTipo: 'persona-giuridica',
        quotaPercentuale: 100,
        diControllo: true,
      },
    ]);

    await salvaPartecipazioni(connessione.db, tenantId, gamma, [
      {
        socioDenominazione: 'Rossi Mario',
        socioCodiceFiscale: CF_PERSONA,
        socioTipo: 'persona-fisica',
        quotaPercentuale: 51,
        diControllo: false,
      },
    ]);

    // Stesso socio, ma di un altro intermediario: non deve mai comparire.
    await salvaPartecipazioni(connessione.db, altroTenantId, estranea, [
      {
        socioDenominazione: 'OPEN HOLDING S.R.L.',
        socioCodiceFiscale: CF_HOLDING,
        socioTipo: 'persona-giuridica',
        quotaPercentuale: 100,
        diControllo: true,
      },
    ]);
  }, 90_000);

  afterAll(async () => {
    await connessione.chiudi();
  });

  it('trova le altre aziende che condividono un socio', async () => {
    const collegamenti = await collegamentiSocietari(connessione.db, tenantId, alfa);

    const perCf = new Map(collegamenti.map((c) => [c.socioCodiceFiscale, c]));
    expect(perCf.get(CF_HOLDING)?.aziende.map((a) => a.denominazione)).toEqual(['BETA S.R.L.']);
    expect(perCf.get(CF_PERSONA)?.aziende.map((a) => a.denominazione)).toEqual(['GAMMA S.P.A.']);
  });

  it('collega per codice fiscale, non per denominazione', async () => {
    // «OPEN HOLDING S.R.L.» e «OPEN HOLDING SRL» sono la stessa società; «MARIO ROSSI» e
    // «Rossi Mario» la stessa persona. Un confronto sui nomi avrebbe perso entrambi.
    const collegamenti = await collegamentiSocietari(connessione.db, tenantId, beta);
    expect(collegamenti).toHaveLength(1);
    expect(collegamenti[0]?.aziende[0]?.denominazione).toBe('ALFA S.R.L.');
  });

  it('non collega mai attraverso intermediari diversi', async () => {
    const collegamenti = await collegamentiSocietari(connessione.db, tenantId, beta);
    const denominazioni = collegamenti.flatMap((c) => c.aziende.map((a) => a.denominazione));

    // ESTRANEA ha lo stesso socio ma appartiene a un altro studio: mostrarla sarebbe una
    // fuga di dati fra clienti dello stesso applicativo.
    expect(denominazioni).not.toContain('ESTRANEA S.R.L.');
  });

  it('non collega l’azienda a se stessa', async () => {
    const collegamenti = await collegamentiSocietari(connessione.db, tenantId, alfa);
    const denominazioni = collegamenti.flatMap((c) => c.aziende.map((a) => a.denominazione));
    expect(denominazioni).not.toContain('ALFA S.R.L.');
  });

  it('riporta la quota e la qualifica di controllo dell’altra azienda', async () => {
    const collegamenti = await collegamentiSocietari(connessione.db, tenantId, alfa);
    const viaHolding = collegamenti.find((c) => c.socioCodiceFiscale === CF_HOLDING);

    expect(viaHolding?.aziende[0]?.quotaPercentuale).toBe(100);
    expect(viaHolding?.aziende[0]?.diControllo).toBe(true);
  });

  it('non inventa collegamenti quando il codice fiscale manca', async () => {
    const senzaCf = await connessione.db
      .insert(schema.aziende)
      .values({ tenantId, denominazione: 'DELTA S.R.L.', partitaIva: '00000000005' })
      .returning({ id: schema.aziende.id });

    // Due soci anonimi non sono la stessa persona: senza codice fiscale non si collega.
    await salvaPartecipazioni(connessione.db, tenantId, senzaCf[0]!.id, [
      {
        socioDenominazione: 'SOCIO NON IDENTIFICATO',
        socioCodiceFiscale: null,
        socioTipo: 'persona-fisica',
        quotaPercentuale: 100,
        diControllo: false,
      },
    ]);

    expect(await collegamentiSocietari(connessione.db, tenantId, senzaCf[0]!.id)).toEqual([]);
  });

  it('sostituisce la compagine invece di accumularne le versioni', async () => {
    await salvaPartecipazioni(connessione.db, tenantId, gamma, [
      {
        socioDenominazione: 'NUOVO SOCIO S.R.L.',
        socioCodiceFiscale: CF_HOLDING,
        socioTipo: 'persona-giuridica',
        quotaPercentuale: 100,
        diControllo: true,
      },
    ]);

    // GAMMA ora fa capo alla holding e non più alla persona fisica: se la vecchia riga
    // sopravvivesse, il portafoglio mostrerebbe un legame che non esiste più.
    const daAlfa = await collegamentiSocietari(connessione.db, tenantId, alfa);
    const viaPersona = daAlfa.find((c) => c.socioCodiceFiscale === CF_PERSONA);
    expect(viaPersona).toBeUndefined();
  });
});
