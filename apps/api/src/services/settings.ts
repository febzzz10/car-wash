export type SettingMap = ReadonlyMap<string, string>;

export async function loadSettings(
  env: Env,
  organizationId: string,
  branchId: string | null,
): Promise<SettingMap> {
  const result = await env.DB.prepare(
    `SELECT setting_key, value_text, branch_id
     FROM business_settings
     WHERE organization_id = ? AND (branch_id IS NULL OR branch_id = ?)
     ORDER BY CASE WHEN branch_id IS NULL THEN 0 ELSE 1 END`,
  )
    .bind(organizationId, branchId)
    .all<{
      branch_id: string | null;
      setting_key: string;
      value_text: string | null;
    }>();
  return new Map(
    result.results.map((row) => [row.setting_key, row.value_text ?? ""]),
  );
}

export function booleanSetting(
  settings: SettingMap,
  key: string,
  fallback: boolean,
): boolean {
  const value = settings.get(key);
  return value === undefined ? fallback : value.toLowerCase() === "true";
}

export function integerSetting(
  settings: SettingMap,
  key: string,
  fallback: number,
): number {
  const value = Number(settings.get(key));
  return Number.isSafeInteger(value) ? value : fallback;
}

export function stringSetting(
  settings: SettingMap,
  key: string,
  fallback: string,
): string {
  return settings.get(key) || fallback;
}
