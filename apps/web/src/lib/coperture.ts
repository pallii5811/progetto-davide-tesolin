/**
 * Elenco delle coperture per i menu a tendina.
 *
 * Duplica volutamente gli identificativi del catalogo di dominio: il pacchetto `@aegis/core`
 * è ESM puro e importarlo in un componente client trascinerebbe il motore di rischio dentro
 * il bundle del browser. Il disallineamento è impedito dal confine API, che valida gli
 * identificativi con lo stesso enum del dominio e rifiuta con 400 quello che non riconosce.
 */

export const COPERTURE = [
  { valore: 'incendio', testo: 'Incendio ed eventi complementari' },
  { valore: 'furto-rapina', testo: 'Furto e rapina' },
  { valore: 'catastrofali', testo: 'Rischi catastrofali (CAT NAT)' },
  { valore: 'guasti-macchine', testo: 'Guasti macchine' },
  { valore: 'elettronica', testo: 'Elettronica (all risks)' },
  { valore: 'danni-indiretti', testo: 'Danni indiretti / Business Interruption' },
  { valore: 'rct', testo: 'RCT — Responsabilità civile verso terzi' },
  { valore: 'rco', testo: 'RCO — Verso prestatori di lavoro' },
  { valore: 'rc-prodotti', testo: 'RC Prodotti' },
  { valore: 'rc-inquinamento', testo: 'RC Inquinamento e danno ambientale' },
  { valore: 'rc-professionale', testo: 'RC Professionale' },
  { valore: 'd-and-o', testo: 'D&O — Amministratori e sindaci' },
  { valore: 'cyber', testo: 'Cyber risk' },
  { valore: 'infortuni-dipendenti', testo: 'Infortuni dipendenti' },
  { valore: 'infortuni-titolare', testo: 'Infortuni titolare e soci' },
  { valore: 'malattia-key-man', testo: 'Malattia e spese mediche key man' },
  { valore: 'tcm-key-man', testo: 'Temporanea caso morte key man' },
  { valore: 'rca-flotta', testo: 'RC Auto (libro matricola)' },
  { valore: 'kasko-flotta', testo: 'Garanzie accessorie veicoli' },
  { valore: 'merci-trasportate', testo: 'Merci trasportate' },
  { valore: 'credito-commerciale', testo: 'Assicurazione del credito commerciale' },
  { valore: 'cauzioni', testo: 'Cauzioni e fideiussioni' },
  { valore: 'tutela-legale', testo: 'Tutela legale' },
] as const satisfies readonly { valore: string; testo: string }[];

export type CoperturaId = (typeof COPERTURE)[number]['valore'];

const MAPPA = new Map<string, string>(COPERTURE.map((c) => [c.valore, c.testo]));

export function etichettaCopertura(id: string): string {
  return MAPPA.get(id) ?? id;
}
