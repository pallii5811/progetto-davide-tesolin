/**
 * Le norme che cambiano con la forma giuridica, in un punto solo.
 *
 * Il prodotto citava «artt. 2392 ss. c.c.» come fonte della responsabilità degli
 * amministratori a ogni società di capitali. Quegli articoli sono norme della **S.p.A.**:
 * per la S.r.l. — che è la forma della quasi totalità del portafoglio di un intermediario
 * italiano, ed è la società dell'esempio dimostrativo — la norma è l'art. 2476 c.c.
 *
 * Non è un dettaglio da giuristi. Una citazione sbagliata è più dannosa di una mancante,
 * perché dà l'aria della competenza a un errore: il primo commercialista che legge il
 * fascicolo di adeguatezza la vede, e da lì in poi mette in dubbio anche i numeri.
 *
 * La stessa citazione errata viveva in quattro file diversi — `coverage/taxonomy.ts`,
 * `risk/taxonomy.ts`, `governance/assetto.ts`, `coverage/sums-insured.ts` — che è il modo
 * in cui un errore sopravvive alle correzioni: se ne trova una copia, si corregge quella,
 * e le altre tre restano. Qui c'è una copia sola.
 */

import type { FormaGiuridica } from '../company/profile.js';

/** Forme in cui esiste un organo amministrativo distinto dalla proprietà. */
export const FORME_CON_ORGANO_AMMINISTRATIVO: readonly FormaGiuridica[] = [
  'spa',
  'srl',
  'srls',
  'sapa',
  'cooperativa',
];

export function haOrganoAmministrativo(forma: FormaGiuridica): boolean {
  return FORME_CON_ORGANO_AMMINISTRATIVO.includes(forma);
}

/**
 * La norma sulla responsabilità degli amministratori, per forma giuridica.
 *
 * `null` dove non esiste un organo amministrativo distinto dai soci: nelle società di
 * persone e nella ditta individuale amministra chi possiede, e il tema non è la
 * responsabilità dell'organo ma quella patrimoniale del socio.
 */
export function normaResponsabilitaAmministratori(forma: FormaGiuridica): string | null {
  switch (forma) {
    case 'spa':
      return 'Artt. 2392-2395 c.c.';
    case 'srl':
    case 'srls':
      // L'azione dei creditori sociali contro gli amministratori di S.r.l. è stata
      // reintrodotta dall'art. 378 del D.Lgs. 14/2019, che ha aggiunto il comma 6
      // all'art. 2476: citarla è ciò che rende la D&O difendibile su una S.r.l.
      return 'Art. 2476 c.c. (azione dei creditori sociali: art. 378 D.Lgs. 14/2019)';
    case 'sapa':
      // Rinvio alla disciplina della S.p.A. in quanto compatibile.
      return 'Art. 2454 c.c., che rinvia agli artt. 2392-2395 c.c.';
    case 'cooperativa':
      // La cooperativa adotta il modello S.p.A. o quello S.r.l.: la norma applicabile
      // dipende dallo statuto, e il dato statutario non è nell'anagrafica camerale.
      return 'Art. 2519 c.c., che rinvia alla disciplina della S.p.A. o della S.r.l. secondo il modello adottato';
    default:
      return null;
  }
}

/**
 * La norma sulla responsabilità patrimoniale per le obbligazioni sociali.
 *
 * Serve alla RCT e a ogni frase sul patrimonio aggredibile. Cinque rami perché cinque
 * sono i regimi, e la formulazione unica che il prodotto usava — «nelle società di
 * persone si estende al patrimonio dei soci» — era corretta senza riserve per **una**
 * delle forme a cui veniva mostrata.
 */
export interface RegimeDiResponsabilita {
  /** Se il patrimonio personale di qualcuno risponde delle obbligazioni sociali. */
  readonly illimitata: boolean;
  /** Frase compiuta e vera per questa forma, da comporre nelle motivazioni. */
  readonly testo: string;
  readonly riferimento: string;
}

export function regimeDiResponsabilita(forma: FormaGiuridica): RegimeDiResponsabilita {
  switch (forma) {
    case 'snc':
      return {
        illimitata: true,
        testo:
          'Nella società in nome collettivo i soci rispondono solidalmente e illimitatamente delle ' +
          'obbligazioni sociali: un risarcimento che eccede il patrimonio della società aggredisce il loro.',
        riferimento: 'Art. 2291 c.c.',
      };
    case 'sas':
      return {
        illimitata: true,
        testo:
          'Nella società in accomandita semplice rispondono illimitatamente i soli soci accomandatari; ' +
          'gli accomandanti rispondono nei limiti della quota conferita.',
        riferimento: 'Art. 2313 c.c.',
      };
    case 'sapa':
      return {
        illimitata: true,
        testo:
          'Nella società in accomandita per azioni rispondono illimitatamente i soli soci accomandatari, ' +
          'che sono di diritto gli amministratori.',
        riferimento: 'Art. 2452 c.c.',
      };
    case 'ditta-individuale':
      return {
        illimitata: true,
        testo:
          'L’imprenditore individuale risponde delle obbligazioni con tutti i suoi beni presenti e futuri: ' +
          'fra patrimonio d’impresa e patrimonio personale non c’è separazione.',
        riferimento: 'Art. 2740 c.c.',
      };
    case 'spa':
    case 'srl':
    case 'srls':
      return {
        illimitata: false,
        testo:
          'Delle obbligazioni sociali risponde la sola società con il suo patrimonio: il massimale è ' +
          'quindi il limite oltre il quale il danno erode il capitale dell’impresa.',
        riferimento: forma === 'spa' ? 'Art. 2325 c.c.' : 'Art. 2462 c.c.',
      };
    default:
      /*
        Cooperative, consorzi, associazioni, fondazioni, enti pubblici e «altro».
        L'autonomia patrimoniale c'è quasi sempre, ma il regime dipende dallo statuto e
        dal tipo, e l'anagrafica camerale non lo dice. Si afferma il meno possibile: una
        frase vera e generica è preferibile a una precisa e sbagliata.
      */
      return {
        illimitata: false,
        testo:
          'Il risarcimento dovuto a terzi grava sul patrimonio dell’ente: il massimale è il limite oltre ' +
          'il quale il danno lo erode.',
        riferimento: 'Art. 2043 c.c.',
      };
  }
}
