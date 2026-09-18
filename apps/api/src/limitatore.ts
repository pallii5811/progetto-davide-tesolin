/**
 * Il freno delle rotte pubbliche: registrazione, password dimenticata, codici.
 *
 * Sono le uniche rotte che chiunque può chiamare senza sessione, e ciascuna ha un costo per
 * qualcuno: uno studio finto nel database, un'email spedita alla casella di un altro, un
 * indirizzo da indovinare. Il blocco dopo cinque password sbagliate protegge l'accesso; qui
 * serve la stessa cosa per le porte nuove.
 *
 * In memoria, di proposito: l'API gira in un solo processo, e un riavvio che azzera i
 * contatori non apre niente di grave — al massimo concede un nuovo giro di tentativi. Una
 * tabella per questo sarebbe una scrittura a ogni richiesta anonima, cioè proprio il carico
 * che il freno deve togliere.
 *
 * Finestra scorrevole: si contano gli eventi degli ultimi `finestraMs`, non quelli dell'ora
 * solare, così non esiste un istante in cui il contatore si azzera e si può ripartire a raffica.
 */
export class Limitatore {
  private readonly eventi = new Map<string, number[]>();

  /** Tetto di chiavi tenute in memoria: oltre, si fa pulizia di quelle ormai scadute. */
  private static readonly MASSIMO_CHIAVI = 20_000;

  /**
   * Le chiavi che cominciano così (i tetti complessivi) non si sacrificano mai nella pulizia.
   *
   * Dalla revisione di sicurezza del 18/09/2026: la pulizia toglieva per prime le chiavi più
   * vecchie, e il tetto complessivo — creato alla prima registrazione — era sempre la più
   * vecchia. Bastavano ventimila richieste da indirizzi diversi per azzerarlo.
   */
  static readonly PREFISSO_GLOBALE = 'globale:';

  /**
   * Registra un tentativo e dice se è ammesso. Un tentativo rifiutato non si conta: chi è
   * fermo non allunga da solo la propria attesa a ogni nuova prova.
   */
  consenti(chiave: string, limite: number, finestraMs: number, adesso: number = Date.now()): boolean {
    if (limite <= 0) return true;
    const recenti = (this.eventi.get(chiave) ?? []).filter((t) => t > adesso - finestraMs);
    // Tolta e rimessa: la chiave usata ora va in fondo all'ordine, e la pulizia, che parte
    // dalle prime, sacrifica quelle ferme da più tempo invece di quelle vive.
    this.eventi.delete(chiave);
    if (recenti.length >= limite) {
      this.eventi.set(chiave, recenti);
      return false;
    }
    recenti.push(adesso);
    this.eventi.set(chiave, recenti);
    if (this.eventi.size > Limitatore.MASSIMO_CHIAVI) this.pulisci(adesso, finestraMs);
    return true;
  }

  private pulisci(adesso: number, finestraMs: number): void {
    for (const [chiave, tempi] of this.eventi) {
      if (tempi.every((t) => t <= adesso - finestraMs)) this.eventi.delete(chiave);
    }
    // Se sono tutte recenti, si sacrificano le più vecchie: meglio dimenticare qualche
    // contatore che lasciar crescere la memoria senza limite sotto un attacco distribuito.
    // Mai i tetti complessivi.
    if (this.eventi.size > Limitatore.MASSIMO_CHIAVI) {
      let eccesso = this.eventi.size - Limitatore.MASSIMO_CHIAVI;
      for (const chiave of this.eventi.keys()) {
        if (eccesso <= 0) break;
        if (chiave.startsWith(Limitatore.PREFISSO_GLOBALE)) continue;
        this.eventi.delete(chiave);
        eccesso -= 1;
      }
    }
  }
}

/**
 * La chiave di un indirizzo per il freno.
 *
 * Un IPv4 è sé stesso. Un IPv6 conta per la sua rete /64: chiunque ne abbia una ne ha
 * diciotto miliardi di miliardi di indirizzi, e contarli uno per uno vorrebbe dire non
 * frenare nessuno. Un IPv4 scritto in forma IPv6 (`::ffff:1.2.3.4`) torna IPv4.
 */
export function chiaveIndirizzo(ip: string): string {
  const pulito = ip.trim().toLowerCase();
  const mappato = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(pulito);
  if (mappato?.[1] !== undefined) return mappato[1];
  if (!pulito.includes(':')) return pulito;

  const [testa = '', coda = ''] = pulito.split('::');
  const gruppiTesta = testa === '' ? [] : testa.split(':');
  const gruppiCoda = pulito.includes('::') ? (coda === '' ? [] : coda.split(':')) : [];
  const mancanti = pulito.includes('::') ? 8 - gruppiTesta.length - gruppiCoda.length : 0;
  const completi = pulito.includes('::')
    ? [...gruppiTesta, ...Array<string>(Math.max(0, mancanti)).fill('0'), ...gruppiCoda]
    : gruppiTesta;
  return `${completi
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/** Un limite letto dall'ambiente, con il suo valore predefinito. Zero lo spegne; testo non numerico no. */
export function limiteDaAmbiente(nome: string, predefinito: number, ambiente = process.env): number {
  const valore = ambiente[nome];
  if (valore === undefined || valore.trim() === '') return predefinito;
  const numero = Number.parseInt(valore, 10);
  return Number.isFinite(numero) && numero >= 0 ? numero : predefinito;
}
