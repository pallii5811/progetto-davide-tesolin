/**
 * L'etichetta «la più esposta», e quando tacerla.
 *
 * Il plurale per il pari merito c'era già: «la più esposta» su una di cinque ubicazioni
 * identiche direbbe che le altre quattro lo sono meno. Mancava il caso estremo. Su RED
 * GROUP S.R.L. le ubicazioni erano due, con le stesse classi di pericolo, ed entrambe
 * portavano «fra le più esposte»: un'etichetta che sta su tutte le righe non distingue
 * nessuna riga, e occupa il posto dove l'occhio cerca l'unica che conta.
 */
export function etichettaPiuEsposta(
  piuEsposta: boolean,
  quantePiuEsposte: number,
  totali: number,
): string | null {
  if (!piuEsposta || totali <= 1 || quantePiuEsposte >= totali) return null;
  return quantePiuEsposte > 1 ? 'fra le più esposte' : 'la più esposta';
}
