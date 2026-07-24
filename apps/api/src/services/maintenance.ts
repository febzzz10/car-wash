interface RetainedAsset {
  readonly branch_id: string | null;
  readonly created_at: string;
  readonly id: string;
  readonly object_key: string;
  readonly organization_id: string;
  readonly retention_days: number | null;
}

interface ExpiringReward {
  readonly customer_id: string;
  readonly id: string;
  readonly organization_id: string;
  readonly remaining_amount_minor: number;
  readonly version: number;
}

interface OrganizationRetention {
  readonly organization_id: string;
  readonly retention_days: number | null;
}

function isPastRetention(
  createdAt: string,
  retentionDays: number | null,
  now: Date,
  fallback: number,
): boolean {
  const days = Math.max(1, retentionDays ?? fallback);
  return Date.parse(createdAt) < now.getTime() - days * 86_400_000;
}

export async function reconcileOperationalCaches(
  env: Env,
  now = new Date(),
): Promise<void> {
  const timestamp = now.toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE customers SET
      total_visits_cached = (SELECT COUNT(*) FROM wash_jobs w WHERE w.customer_id = customers.id AND w.status = 'COMPLETED'),
      total_spent_minor_cached = COALESCE((SELECT SUM(total_amount_minor) FROM wash_jobs w WHERE w.customer_id = customers.id AND w.status = 'COMPLETED'), 0),
      last_visit_at = (SELECT MAX(completed_at) FROM wash_jobs w WHERE w.customer_id = customers.id AND w.status = 'COMPLETED'),
      updated_at = ?`,
    ).bind(timestamp),
    env.DB.prepare(
      `UPDATE vehicles SET last_wash_at =
      (SELECT MAX(completed_at) FROM wash_jobs w WHERE w.vehicle_id = vehicles.id AND w.status = 'COMPLETED'),
      updated_at = ?`,
    ).bind(timestamp),
    env.DB.prepare(
      `UPDATE coupons SET total_usage_count_cached =
      (SELECT COUNT(*) FROM coupon_redemptions cr WHERE cr.coupon_id = coupons.id AND cr.status IN ('RESERVED', 'REDEEMED')),
      updated_at = ?`,
    ).bind(timestamp),
    env.DB.prepare(
      `UPDATE referral_codes SET successful_referrals_cached =
      (SELECT COUNT(*) FROM referral_redemptions rr WHERE rr.referral_code_id = referral_codes.id AND rr.status = 'REWARD_ISSUED'),
      updated_at = ?`,
    ).bind(timestamp),
  ]);
}

export async function runScheduledMaintenance(
  env: Env,
  now = new Date(),
): Promise<void> {
  const timestamp = now.toISOString();
  await env.DB.prepare(
    "UPDATE referral_codes SET status = 'EXPIRED', updated_at = ? WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at < ?",
  )
    .bind(timestamp, timestamp)
    .run();
  const expiring = await env.DB.prepare(
    "SELECT id, organization_id, customer_id, remaining_amount_minor, version FROM referral_rewards WHERE status = 'AVAILABLE' AND expires_at IS NOT NULL AND expires_at < ? LIMIT 500",
  )
    .bind(timestamp)
    .all<ExpiringReward>();
  if (expiring.results.length > 0) {
    await env.DB.batch(
      expiring.results.flatMap((reward) => [
        env.DB.prepare(
          "UPDATE referral_rewards SET status = 'EXPIRED', remaining_amount_minor = 0, updated_at = ?, version = version + 1 WHERE id = ? AND status = 'AVAILABLE' AND version = ?",
        ).bind(timestamp, reward.id, reward.version),
        env.DB.prepare(
          "INSERT INTO referral_reward_transactions (id, referral_reward_id, customer_id, transaction_type, amount_minor, balance_after_minor, reason, created_at) VALUES (?, ?, ?, 'EXPIRE', ?, 0, 'SCHEDULED_EXPIRY', ?)",
        ).bind(
          crypto.randomUUID(),
          reward.id,
          reward.customer_id,
          reward.remaining_amount_minor,
          timestamp,
        ),
        env.DB.prepare(
          "INSERT INTO audit_logs (id, organization_id, action, record_type, record_id, severity, reason, created_at) VALUES (?, ?, 'REFERRAL_REWARD_EXPIRED', 'REFERRAL_REWARD', ?, 'INFO', 'SCHEDULED_EXPIRY', ?)",
        ).bind(
          crypto.randomUUID(),
          reward.organization_id,
          reward.id,
          timestamp,
        ),
      ]),
    );
  }

  const assets = await env.DB.prepare(
    `SELECT fa.id, fa.organization_id, fa.branch_id,
    fa.object_key, fa.created_at, CAST(bs.value_text AS INTEGER) AS retention_days
    FROM file_assets fa LEFT JOIN business_settings bs
      ON bs.organization_id = fa.organization_id AND bs.branch_id IS NULL
      AND bs.setting_key = 'privacy.photo_retention_days'
    WHERE fa.asset_type IN ('VEHICLE_LIVE_PHOTO', 'VEHICLE_PROFILE_PHOTO')
      AND fa.upload_status = 'READY' LIMIT 500`,
  ).all<RetainedAsset>();
  for (const asset of assets.results) {
    if (!isPastRetention(asset.created_at, asset.retention_days, now, 365))
      continue;
    await env.UPLOADS.delete(asset.object_key);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM vehicle_photos WHERE file_asset_id = ?").bind(
        asset.id,
      ),
      env.DB.prepare(
        "UPDATE file_assets SET upload_status = 'DELETED', deleted_at = ? WHERE id = ? AND upload_status = 'READY'",
      ).bind(timestamp, asset.id),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, organization_id, branch_id, action, record_type, record_id, severity, reason, created_at) VALUES (?, ?, ?, 'PRIVATE_PHOTO_RETAINED_AND_DELETED', 'FILE_ASSET', ?, 'INFO', 'RETENTION_POLICY', ?)",
      ).bind(
        crypto.randomUUID(),
        asset.organization_id,
        asset.branch_id,
        asset.id,
        timestamp,
      ),
    ]);
  }

  const locations = await env.DB.prepare(
    `SELECT lc.id, lc.organization_id, lc.captured_at,
    CAST(bs.value_text AS INTEGER) AS retention_days
    FROM location_captures lc LEFT JOIN business_settings bs
      ON bs.organization_id = lc.organization_id AND bs.branch_id IS NULL
      AND bs.setting_key = 'privacy.location_retention_days' LIMIT 1000`,
  ).all<{
    captured_at: string;
    id: string;
    organization_id: string;
    retention_days: number | null;
  }>();
  const expiredLocations = locations.results.filter((location) =>
    isPastRetention(location.captured_at, location.retention_days, now, 365),
  );
  if (expiredLocations.length > 0)
    await env.DB.batch(
      expiredLocations.map((location) =>
        env.DB.prepare(
          "DELETE FROM location_captures WHERE id = ? AND organization_id = ?",
        ).bind(location.id, location.organization_id),
      ),
    );
  const temporaryAssets = await env.DB.prepare(
    `SELECT fa.id, fa.organization_id, fa.branch_id, fa.bucket_name,
    fa.object_key, fa.created_at, CAST(bs.value_text AS INTEGER) AS retention_days
    FROM file_assets fa LEFT JOIN business_settings bs
      ON bs.organization_id = fa.organization_id AND bs.branch_id IS NULL
      AND bs.setting_key = 'privacy.temporary_file_retention_days'
    WHERE fa.upload_status IN ('PENDING', 'FAILED') LIMIT 500`,
  ).all<
    RetainedAsset & {
      readonly bucket_name: "UPLOADS" | "INVOICES";
    }
  >();
  for (const asset of temporaryAssets.results) {
    if (!isPastRetention(asset.created_at, asset.retention_days, now, 7))
      continue;
    const bucket =
      asset.bucket_name === "INVOICES" ? env.INVOICES : env.UPLOADS;
    await bucket.delete(asset.object_key);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE file_assets SET upload_status = 'DELETED', deleted_at = ? WHERE id = ? AND upload_status IN ('PENDING', 'FAILED')",
      ).bind(timestamp, asset.id),
      env.DB.prepare(
        "INSERT INTO audit_logs (id, organization_id, branch_id, action, record_type, record_id, severity, reason, created_at) VALUES (?, ?, ?, 'TEMPORARY_FILE_RETAINED_AND_DELETED', 'FILE_ASSET', ?, 'INFO', 'RETENTION_POLICY', ?)",
      ).bind(
        crypto.randomUUID(),
        asset.organization_id,
        asset.branch_id,
        asset.id,
        timestamp,
      ),
    ]);
  }
  const loginRetention = await env.DB.prepare(
    `SELECT o.id AS organization_id, CAST(bs.value_text AS INTEGER) AS retention_days
    FROM organizations o LEFT JOIN business_settings bs
      ON bs.organization_id = o.id AND bs.branch_id IS NULL
      AND bs.setting_key = 'privacy.login_attempt_retention_days'`,
  ).all<OrganizationRetention>();
  for (const organization of loginRetention.results) {
    const days = Math.max(1, organization.retention_days ?? 90);
    await env.DB.prepare(
      "DELETE FROM login_attempts WHERE organization_id = ? AND attempted_at < ?",
    )
      .bind(
        organization.organization_id,
        new Date(now.getTime() - days * 86_400_000).toISOString(),
      )
      .run();
  }
  await env.DB.prepare(
    "DELETE FROM login_attempts WHERE organization_id IS NULL AND attempted_at < ?",
  )
    .bind(new Date(now.getTime() - 90 * 86_400_000).toISOString())
    .run();
  await reconcileOperationalCaches(env, now);
}
