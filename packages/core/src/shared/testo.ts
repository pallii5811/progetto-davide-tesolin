/**
 * Le trasformazioni di testo che il prodotto può permettersi.
 *
 * Una sola, per ora, e nasce da un difetto che nessuno stava cercando: l'ha fatto vedere
 * `scripts/audit-testo-schermo.ts` mentre inseguiva tutt'altro.
 */

/**
 * Rende minuscola **soltanto l'iniziale** di un'etichetta, per infilarla dentro una frase.
 *
 * IL DIFETTO CHE SOSTITUISCE. Il codice faceva `label.toLowerCase()` sull'etichetta intera,
 * e nella motivazione di adeguatezza usciva:
 *
 *   «…rischi residui a carico dell'impresa: … responsabilità amministrativa dell'ente
 *    (d.lgs. 231/2001) (rilevante).»
 *
 * `D.Lgs.` è la citazione di una legge, e scritta così è sbagliata su un documento che
 * l'intermediario consegna al cliente e che, davanti a una contestazione, va in un
 * fascicolo. Lo stesso capitava a `CAT NAT` — che diventava `cat nat` — e alle
 * certificazioni `ISO 9001, 14001, 27001, 45001` nel report.
 *
 * PERCHÉ L'OPERAZIONE GIUSTA È PIÙ STRETTA. Ciò che serve è una sola cosa: che la parola
 * non cominci in maiuscolo perché sta in mezzo a una frase. Tutto il resto dell'etichetta
 * non va toccato, perché le maiuscole che contiene ci sono per un motivo.
 *
 * E l'iniziale si abbassa solo quando apre una **parola comune**, cioè quando il secondo
 * carattere è una lettera minuscola. Davanti a una sigla non si tocca niente: `RCT` e
 * `CAT NAT` diventerebbero `rCT` e `cAT NAT`, che è peggio del problema di partenza.
 *
 * La condizione è «seconda lettera minuscola», non «seconda lettera maiuscola» negata, e
 * la differenza l'ha trovata la prova: in `D&O` il secondo carattere è `&`, che non è né
 * maiuscolo né minuscolo. Con la condizione al rovescio passava, e usciva `d&O`.
 */
export function inizialeMinuscola(etichetta: string): string {
  const prima = etichetta.charAt(0);
  const seconda = etichetta.charAt(1);
  if (prima === '' || prima === prima.toLowerCase()) return etichetta;
  const secondaMinuscola = seconda !== '' && seconda !== seconda.toUpperCase();
  return secondaMinuscola ? prima.toLowerCase() + etichetta.slice(1) : etichetta;
}
