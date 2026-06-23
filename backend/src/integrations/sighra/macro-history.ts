import { query, queryOne } from "../../db/client.js";

const MACRO_DATE_EXPR = `(created_at::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date`;
const TODAY_BRT = `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date`;

export async function cleanupOldMacrosHistory(): Promise<void> {
  await query(`
    DELETE FROM macros_history
    WHERE ${MACRO_DATE_EXPR} < ${TODAY_BRT} - INTERVAL '1 day'
  `);
}

export async function getTodayMacros(): Promise<unknown[]> {
  const result = await query(`
    SELECT *
    FROM macros_history
    WHERE ${MACRO_DATE_EXPR} >= ${TODAY_BRT} - INTERVAL '1 day'
    ORDER BY created_at::timestamptz DESC
  `);
  return result.rows;
}

export async function getLastOperationalMacroFromHistory(
  plate: string,
): Promise<{ macro_description: string; created_at: string } | undefined> {
  return queryOne<{ macro_description: string; created_at: string }>(
    `
    SELECT macro_description, created_at
    FROM macros_history
    WHERE plate = $1
      AND ${MACRO_DATE_EXPR} >= ${TODAY_BRT} - INTERVAL '1 day'
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
    ORDER BY created_at::timestamptz DESC
    LIMIT 1
  `,
    [plate],
  );
}
