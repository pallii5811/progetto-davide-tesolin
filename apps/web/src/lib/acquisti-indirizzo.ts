/**
 * Gli acquisti facoltativi, come si scrivono nell'indirizzo.
 *
 * Il livello di acquisto vive nella barra del browser — è una scelta del progetto, perché
 * sia visibile che cosa si sta per spendere — e va portato con sé quando si passa da una
 * schermata all'altra. Il report lo perdeva: il collegamento era nudo, e da lì l'analisi
 * ripartiva al livello di base.
 *
 * `?` compreso quando c'è qualcosa, stringa vuota quando non c'è nulla: un `?` da solo in
 * fondo a un indirizzo è un indirizzo diverso da quello senza, e finisce nella cronologia
 * come tale.
 */
export function acquistiNellIndirizzo(approfondita: boolean, eventiNegativi: boolean): string {
  const parti = [approfondita ? 'approfondita=1' : null, eventiNegativi ? 'negativita=1' : null].filter(
    (p): p is string => p !== null,
  );

  return parti.length === 0 ? '' : `?${parti.join('&')}`;
}
