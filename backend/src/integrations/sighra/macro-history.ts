import type Database from "better-sqlite3";

export function cleanupOldMacrosHistory(db: Database.Database): void {
  db.prepare(
    `
    DELETE FROM macros_history
    WHERE date(datetime(created_at, '-3 hours')) < date('now', '-1 day', 'localtime')
  `,
  ).run();
}

export function getLastOperationalMacroFromHistory(
  db: Database.Database,
  plate: string,
): { macro_description: string; created_at: string } | undefined {
  return db
    .prepare(
      `
    SELECT macro_description, created_at
    FROM macros_history
    WHERE plate = ?
      AND date(datetime(created_at, '-3 hours')) >= date('now', '-1 day', 'localtime')
      AND (
        UPPER(macro_description) LIKE '%IN. VIAGEM VAZIO%' OR
        UPPER(macro_description) LIKE '%REIN. VIAGEM VAZIO%' OR
        UPPER(macro_description) LIKE '%IN. VIAGEM CARREGADO%' OR
        UPPER(macro_description) LIKE '%REIN. VIAGEM CARREGADO%' OR
        UPPER(macro_description) LIKE '%REIN. VIAGEM CARREGA%' OR
        UPPER(macro_description) LIKE '%AGUARD. CARREGA%' OR
        UPPER(macro_description) LIKE '%EFET. CARREGA%' OR
        UPPER(macro_description) LIKE '%AGUARD. DESCARREGA%' OR
        UPPER(macro_description) LIKE '%EFET. DESCARREGA%' OR
        UPPER(macro_description) LIKE '%FIM DESC./REINICIO%' OR
        UPPER(macro_description) LIKE '%FIM DESCARG /REINICI%' OR
        UPPER(macro_description) LIKE '%FIM DESCARGA /REINICI%'
      )
    ORDER BY datetime(created_at) DESC
    LIMIT 1
  `,
    )
    .get(plate) as { macro_description: string; created_at: string } | undefined;
}
