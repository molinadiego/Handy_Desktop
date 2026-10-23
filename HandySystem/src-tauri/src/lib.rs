use serde::Deserialize;
use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

const WORKSPACE_ID: &str = "local-workspace";

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NewClientDraft {
    id: String,
    name: String,
    company_name: Option<String>,
    phone: String,
    email: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct NewPropertyDraft {
    id: String,
    address_line1: String,
    address_line2: Option<String>,
    city: String,
    subdivision: Option<String>,
    postal_code: Option<String>,
    country_code: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CorrectClientProfileInput {
    client_id: String,
    name: String,
    company_name: Option<String>,
    phone: String,
    email: Option<String>,
    related_work_order_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CorrectPropertyProfileInput {
    property_id: String,
    address_line1: String,
    address_line2: Option<String>,
    city: String,
    subdivision: Option<String>,
    postal_code: Option<String>,
    country_code: Option<String>,
    related_work_order_ids: Vec<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CreateEstimateInput {
    order_id: String,
    description: String,
    billing_mode: String,
    amount_minor: i64,
    discount_kind: String,
    discount_value: i64,
    currency_code: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviseEstimateInput {
    estimate_id: String,
    description: String,
    billing_mode: String,
    amount_minor: i64,
    discount_kind: String,
    discount_value: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangeEstimateStatusInput {
    estimate_id: String,
    status: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CreateWorkOrderInput {
    new_client: Option<NewClientDraft>,
    new_property: Option<NewPropertyDraft>,
    client_id: Option<String>,
    property_id: Option<String>,
    client_type: Option<String>,
    recipient_name: Option<String>,
    contact_name: Option<String>,
    contact_phone: Option<String>,
    tenant_name: Option<String>,
    tenant_phone: Option<String>,
    address_line1: Option<String>,
    address_line2: Option<String>,
    city: Option<String>,
    subdivision: Option<String>,
    postal_code: Option<String>,
    description: Option<String>,
    billing_mode: Option<String>,
    amount_minor: Option<i64>,
    currency_code: Option<String>,
    scheduled_at: Option<String>,
    scheduled_end_at: Option<String>,
    priority: String,
    access_instructions: Option<String>,
    lockbox_code: Option<String>,
    gate_code: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct UpdateWorkOrderInput {
    work_order_id: String,
    status: String,
    priority: String,
    scheduled_at: Option<String>,
    scheduled_end_at: Option<String>,
    access_instructions: Option<String>,
    lockbox_code: Option<String>,
    gate_code: Option<String>,
    client_type: Option<String>,
    recipient_name: Option<String>,
    contact_name: Option<String>,
    contact_phone: Option<String>,
    tenant_name: Option<String>,
    tenant_phone: Option<String>,
    address_line1: Option<String>,
    address_line2: Option<String>,
    city: Option<String>,
    description: Option<String>,
}

fn optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim().to_owned();
        (!trimmed.is_empty()).then_some(trimmed)
    })
}

async fn open_database_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let database_path = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("handyman.db");
    let options = SqliteConnectOptions::new()
        .filename(database_path)
        .foreign_keys(true);
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| error.to_string())
}

async fn persist_client_profile_correction(
    pool: &SqlitePool,
    input: CorrectClientProfileInput,
) -> Result<(), String> {
    if input.name.trim().is_empty() || input.phone.trim().is_empty() {
        return Err("El nombre y el teléfono del cliente son obligatorios".into());
    }
    let new_name = input.name.trim().to_owned();
    let new_company = optional_text(input.company_name);
    let new_phone = input.phone.trim().to_owned();
    let new_email = optional_text(input.email);
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;

    let old: (String, Option<String>, String, Option<String>) = sqlx::query_as(
        "SELECT name, company_name, phone, email FROM clients WHERE id = ? AND workspace_id = ?",
    )
    .bind(&input.client_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "No se encontró el cliente para corregir".to_string())?;

    let changed_name = old.0 != new_name;
    let changed_company = old.1 != new_company;
    let changed_phone = old.2 != new_phone;
    let changed_email = old.3 != new_email;
    if !(changed_name || changed_company || changed_phone || changed_email) {
        transaction
            .commit()
            .await
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    let correction_id = uuid::Uuid::new_v4().to_string();
    let old_json = serde_json::json!({
        "name": old.0,
        "companyName": old.1,
        "phone": old.2,
        "email": old.3,
    });
    let new_json = serde_json::json!({
        "name": new_name,
        "companyName": new_company,
        "phone": new_phone,
        "email": new_email,
    });
    sqlx::query(
        "INSERT INTO profile_corrections
         (id, workspace_id, source_type, source_id, old_values_json, new_values_json, created_at)
         VALUES (?, ?, 'client', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&correction_id)
    .bind(WORKSPACE_ID)
    .bind(&input.client_id)
    .bind(old_json.to_string())
    .bind(new_json.to_string())
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;

    sqlx::query(
        "UPDATE clients SET name = ?, company_name = ?, phone = ?, email = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND workspace_id = ?",
    )
    .bind(&new_name)
    .bind(&new_company)
    .bind(&new_phone)
    .bind(&new_email)
    .bind(&input.client_id)
    .bind(WORKSPACE_ID)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;

    for work_order_id in input.related_work_order_ids {
        let old_order: (String, String) = sqlx::query_as(
            "SELECT contact_name, contact_phone FROM work_orders
             WHERE id = ? AND workspace_id = ? AND client_id = ?",
        )
        .bind(&work_order_id)
        .bind(WORKSPACE_ID)
        .bind(&input.client_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Una orden seleccionada ya no está vinculada al cliente".to_string())?;

        let corrected_name = if changed_name {
            &new_name
        } else {
            &old_order.0
        };
        let corrected_phone = if changed_phone {
            &new_phone
        } else {
            &old_order.1
        };
        if corrected_name == &old_order.0 && corrected_phone == &old_order.1 {
            continue;
        }

        let record_id = uuid::Uuid::new_v4().to_string();
        let old_order_json = serde_json::json!({
            "contactName": old_order.0,
            "contactPhone": old_order.1,
        });
        let new_order_json = serde_json::json!({
            "contactName": corrected_name,
            "contactPhone": corrected_phone,
        });
        sqlx::query(
            "INSERT INTO profile_correction_records
             (id, workspace_id, correction_id, record_type, record_id, old_values_json, new_values_json, created_at)
             VALUES (?, ?, ?, 'work_order', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(record_id)
        .bind(WORKSPACE_ID)
        .bind(&correction_id)
        .bind(&work_order_id)
        .bind(old_order_json.to_string())
        .bind(new_order_json.to_string())
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;

        sqlx::query(
            "UPDATE work_orders SET contact_name = ?, contact_phone = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ? AND workspace_id = ? AND client_id = ?",
        )
        .bind(corrected_name)
        .bind(corrected_phone)
        .bind(&work_order_id)
        .bind(WORKSPACE_ID)
        .bind(&input.client_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
    }

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn persist_property_profile_correction(
    pool: &SqlitePool,
    input: CorrectPropertyProfileInput,
) -> Result<(), String> {
    if input.address_line1.trim().is_empty() || input.city.trim().is_empty() {
        return Err("La dirección y la ciudad de la propiedad son obligatorias".into());
    }
    let new_line1 = input.address_line1.trim().to_owned();
    let new_line2 = optional_text(input.address_line2);
    let new_city = input.city.trim().to_owned();
    let new_subdivision = optional_text(input.subdivision);
    let new_postal_code = optional_text(input.postal_code);
    let new_country_code = optional_text(input.country_code).map(|value| value.to_uppercase());
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;

    let old: (
        String,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = sqlx::query_as(
        "SELECT address_line1, address_line2, city, subdivision, postal_code, country_code
             FROM properties WHERE id = ? AND workspace_id = ?",
    )
    .bind(&input.property_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "No se encontró la propiedad para corregir".to_string())?;

    let changed_line1 = old.0 != new_line1;
    let changed_line2 = old.1 != new_line2;
    let changed_city = old.2 != new_city;
    let changed_subdivision = old.3 != new_subdivision;
    let changed_postal_code = old.4 != new_postal_code;
    let changed_country = old.5 != new_country_code;
    if !(changed_line1
        || changed_line2
        || changed_city
        || changed_subdivision
        || changed_postal_code
        || changed_country)
    {
        transaction
            .commit()
            .await
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    let correction_id = uuid::Uuid::new_v4().to_string();
    let old_json = serde_json::json!({
        "addressLine1": old.0,
        "addressLine2": old.1,
        "city": old.2,
        "subdivision": old.3,
        "postalCode": old.4,
        "countryCode": old.5,
    });
    let new_json = serde_json::json!({
        "addressLine1": new_line1,
        "addressLine2": new_line2,
        "city": new_city,
        "subdivision": new_subdivision,
        "postalCode": new_postal_code,
        "countryCode": new_country_code,
    });
    sqlx::query(
        "INSERT INTO profile_corrections
         (id, workspace_id, source_type, source_id, old_values_json, new_values_json, created_at)
         VALUES (?, ?, 'property', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&correction_id)
    .bind(WORKSPACE_ID)
    .bind(&input.property_id)
    .bind(old_json.to_string())
    .bind(new_json.to_string())
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;

    sqlx::query(
        "UPDATE properties
         SET address_line1 = ?, address_line2 = ?, city = ?, subdivision = ?, postal_code = ?, country_code = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND workspace_id = ?",
    )
    .bind(&new_line1)
    .bind(&new_line2)
    .bind(&new_city)
    .bind(&new_subdivision)
    .bind(&new_postal_code)
    .bind(&new_country_code)
    .bind(&input.property_id)
    .bind(WORKSPACE_ID)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;

    for work_order_id in input.related_work_order_ids {
        let old_order: (
            String,
            Option<String>,
            String,
            Option<String>,
            Option<String>,
        ) = sqlx::query_as(
            "SELECT address_line1, address_line2, city, subdivision, postal_code FROM work_orders
                 WHERE id = ? AND workspace_id = ? AND property_id = ?",
        )
        .bind(&work_order_id)
        .bind(WORKSPACE_ID)
        .bind(&input.property_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Una orden seleccionada ya no está vinculada a la propiedad".to_string())?;

        let corrected = (
            if changed_line1 {
                &new_line1
            } else {
                &old_order.0
            },
            if changed_line2 {
                &new_line2
            } else {
                &old_order.1
            },
            if changed_city {
                &new_city
            } else {
                &old_order.2
            },
            if changed_subdivision {
                &new_subdivision
            } else {
                &old_order.3
            },
            if changed_postal_code {
                &new_postal_code
            } else {
                &old_order.4
            },
        );
        if corrected.0 == &old_order.0
            && corrected.1 == &old_order.1
            && corrected.2 == &old_order.2
            && corrected.3 == &old_order.3
            && corrected.4 == &old_order.4
        {
            continue;
        }

        let record_id = uuid::Uuid::new_v4().to_string();
        let old_order_json = serde_json::json!({
            "addressLine1": old_order.0,
            "addressLine2": old_order.1,
            "city": old_order.2,
            "subdivision": old_order.3,
            "postalCode": old_order.4,
        });
        let new_order_json = serde_json::json!({
            "addressLine1": corrected.0,
            "addressLine2": corrected.1,
            "city": corrected.2,
            "subdivision": corrected.3,
            "postalCode": corrected.4,
        });
        sqlx::query(
            "INSERT INTO profile_correction_records
             (id, workspace_id, correction_id, record_type, record_id, old_values_json, new_values_json, created_at)
             VALUES (?, ?, ?, 'work_order', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(record_id)
        .bind(WORKSPACE_ID)
        .bind(&correction_id)
        .bind(&work_order_id)
        .bind(old_order_json.to_string())
        .bind(new_order_json.to_string())
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;

        sqlx::query(
            "UPDATE work_orders SET address_line1 = ?, address_line2 = ?, city = ?, subdivision = ?, postal_code = ?,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ? AND workspace_id = ? AND property_id = ?",
        )
        .bind(corrected.0)
        .bind(corrected.1)
        .bind(corrected.2)
        .bind(corrected.3)
        .bind(corrected.4)
        .bind(&work_order_id)
        .bind(WORKSPACE_ID)
        .bind(&input.property_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
    }

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn calculate_estimate_amounts(
    amount_minor: i64,
    discount_kind: &str,
    discount_value: i64,
) -> Result<(i64, i64), String> {
    if amount_minor < 0 || discount_value < 0 {
        return Err("El importe y el descuento no pueden ser negativos".into());
    }
    let discount_minor = match discount_kind {
        "amount" if discount_value <= amount_minor => discount_value,
        "amount" => return Err("El descuento no puede superar el importe".into()),
        "percent" if discount_value <= 10_000 => {
            ((amount_minor as i128 * discount_value as i128 + 5_000) / 10_000) as i64
        }
        "percent" => return Err("El descuento porcentual debe estar entre 0 y 100".into()),
        _ => return Err("Tipo de descuento inválido".into()),
    };
    Ok((discount_minor, amount_minor - discount_minor))
}

fn validate_estimate_content(description: &str, billing_mode: &str) -> Result<(), String> {
    if description.trim().is_empty() {
        return Err("La descripción del presupuesto es obligatoria".into());
    }
    if !matches!(billing_mode, "fixed" | "time_materials") {
        return Err("Modalidad de cobro inválida".into());
    }
    Ok(())
}

async fn persist_estimate_from_order(
    pool: &SqlitePool,
    input: CreateEstimateInput,
) -> Result<String, String> {
    validate_estimate_content(&input.description, &input.billing_mode)?;
    if input.currency_code.trim().is_empty() {
        return Err(
            "Configura la moneda principal del negocio antes de crear un presupuesto".into(),
        );
    }
    let (discount_minor, total_minor) = calculate_estimate_amounts(
        input.amount_minor,
        &input.discount_kind,
        input.discount_value,
    )?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;

    let workspace_currency: Option<String> =
        sqlx::query_scalar("SELECT currency_code FROM workspaces WHERE id = ?")
            .bind(WORKSPACE_ID)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?
            .flatten();
    if workspace_currency.as_deref() != Some(input.currency_code.as_str()) {
        return Err(
            "La moneda del presupuesto debe coincidir con la moneda principal del negocio".into(),
        );
    }

    let order: (
        Option<String>,
        Option<String>,
        String,
        String,
        String,
        String,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
        String,
    ) = sqlx::query_as(
        "SELECT w.client_id, w.property_id, w.client_type, w.contact_name, w.contact_phone,
                w.address_line1, w.address_line2, w.city, w.subdivision, w.postal_code, w.recipient_name
         FROM work_orders w WHERE w.id = ? AND w.workspace_id = ?",
    )
    .bind(&input.order_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "No se encontró la orden para crear el presupuesto".to_string())?;

    let estimate_id = uuid::Uuid::new_v4().to_string();
    let version_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO estimates (id, workspace_id, work_order_id, client_id, property_id, current_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&estimate_id)
    .bind(WORKSPACE_ID)
    .bind(&input.order_id)
    .bind(&order.0)
    .bind(&order.1)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;

    sqlx::query(
        "INSERT INTO estimate_versions
         (id, workspace_id, estimate_id, version_number, status, billing_mode, description,
          amount_minor, discount_kind, discount_value, discount_minor, total_minor, currency_code,
          recipient_name, contact_name, contact_phone, address_line1, address_line2, city, subdivision, postal_code, created_at)
         VALUES (?, ?, ?, 1, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&version_id)
    .bind(WORKSPACE_ID)
    .bind(&estimate_id)
    .bind(&input.billing_mode)
    .bind(input.description.trim())
    .bind(input.amount_minor)
    .bind(&input.discount_kind)
    .bind(input.discount_value)
    .bind(discount_minor)
    .bind(total_minor)
    .bind(&input.currency_code)
    .bind(&order.10)
    .bind(&order.3)
    .bind(&order.4)
    .bind(&order.5)
    .bind(&order.6)
    .bind(&order.7)
    .bind(&order.8)
    .bind(&order.9)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;

    {
        sqlx::query("UPDATE work_orders SET estimate_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ? AND estimate_id IS NULL")
            .bind(&estimate_id)
            .bind(&input.order_id)
            .bind(WORKSPACE_ID)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    }

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(estimate_id)
}

async fn persist_estimate_revision(
    pool: &SqlitePool,
    input: ReviseEstimateInput,
) -> Result<i64, String> {
    validate_estimate_content(&input.description, &input.billing_mode)?;
    let (discount_minor, total_minor) = calculate_estimate_amounts(
        input.amount_minor,
        &input.discount_kind,
        input.discount_value,
    )?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;

    let current_version: i64 = sqlx::query_scalar(
        "SELECT current_version FROM estimates WHERE id = ? AND workspace_id = ?",
    )
    .bind(&input.estimate_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "No se encontró el presupuesto para revisar".to_string())?;
    let snapshot: (String, String, String, String, String, Option<String>, String, Option<String>, Option<String>) =
        sqlx::query_as(
            "SELECT currency_code, recipient_name, contact_name, contact_phone, address_line1,
                    address_line2, city, subdivision, postal_code
             FROM estimate_versions WHERE estimate_id = ? AND version_number = ? AND workspace_id = ?",
        )
        .bind(&input.estimate_id)
        .bind(current_version)
        .bind(WORKSPACE_ID)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
    let next_version = current_version + 1;

    sqlx::query(
        "INSERT INTO estimate_versions
         (id, workspace_id, estimate_id, version_number, status, billing_mode, description,
          amount_minor, discount_kind, discount_value, discount_minor, total_minor, currency_code,
          recipient_name, contact_name, contact_phone, address_line1, address_line2, city, subdivision, postal_code, created_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(WORKSPACE_ID)
    .bind(&input.estimate_id)
    .bind(next_version)
    .bind(&input.billing_mode)
    .bind(input.description.trim())
    .bind(input.amount_minor)
    .bind(&input.discount_kind)
    .bind(input.discount_value)
    .bind(discount_minor)
    .bind(total_minor)
    .bind(&snapshot.0)
    .bind(&snapshot.1)
    .bind(&snapshot.2)
    .bind(&snapshot.3)
    .bind(&snapshot.4)
    .bind(&snapshot.5)
    .bind(&snapshot.6)
    .bind(&snapshot.7)
    .bind(&snapshot.8)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    sqlx::query(
        "UPDATE estimates SET current_version = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND workspace_id = ?",
    )
    .bind(next_version)
    .bind(&input.estimate_id)
    .bind(WORKSPACE_ID)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;

    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(next_version)
}

async fn persist_estimate_status(
    pool: &SqlitePool,
    input: ChangeEstimateStatusInput,
) -> Result<(), String> {
    if !matches!(
        input.status.as_str(),
        "draft" | "sent" | "accepted" | "expired" | "cancelled"
    ) {
        return Err("Estado de presupuesto inválido".into());
    }
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let current_version: i64 = sqlx::query_scalar(
        "SELECT current_version FROM estimates WHERE id = ? AND workspace_id = ?",
    )
    .bind(&input.estimate_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "No se encontró el presupuesto".to_string())?;
    let current_status: String = sqlx::query_scalar(
        "SELECT status FROM estimate_versions WHERE estimate_id = ? AND version_number = ? AND workspace_id = ?",
    )
    .bind(&input.estimate_id)
    .bind(current_version)
    .bind(WORKSPACE_ID)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    let mut order_id: Option<String> =
        sqlx::query_scalar("SELECT work_order_id FROM estimates WHERE id = ? AND workspace_id = ?")
            .bind(&input.estimate_id)
            .bind(WORKSPACE_ID)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?
            .flatten();
    let valid_transition = match current_status.as_str() {
        "draft" => matches!(input.status.as_str(), "sent" | "accepted" | "cancelled"),
        "sent" => matches!(input.status.as_str(), "accepted" | "expired" | "cancelled"),
        _ => false,
    };
    if !valid_transition {
        return Err("No se permite esa transición. Para revisar, crea una nueva versión.".into());
    }
    sqlx::query(
        "UPDATE estimate_versions
         SET status = ?,
             sent_at = CASE WHEN ? = 'sent' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE sent_at END,
             accepted_at = CASE WHEN ? = 'accepted' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE accepted_at END
         WHERE estimate_id = ? AND version_number = ? AND workspace_id = ?",
    )
    .bind(&input.status)
    .bind(&input.status)
    .bind(&input.status)
    .bind(&input.estimate_id)
    .bind(current_version)
    .bind(WORKSPACE_ID)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    if order_id.is_none() && matches!(input.status.as_str(), "sent" | "accepted" | "cancelled") {
        let snapshot: (
            Option<String>,
            Option<String>,
            String,
            String,
            String,
            String,
            Option<String>,
            String,
            String,
            Option<String>,
            Option<String>,
            String,
            i64,
            String,
            String,
        ) = sqlx::query_as(
            "SELECT e.client_id, e.property_id, v.id, v.recipient_name, v.contact_name, v.contact_phone,
                    v.address_line2, v.address_line1, v.city, v.subdivision, v.postal_code,
                    v.description, v.total_minor, v.currency_code, v.billing_mode
             FROM estimates e JOIN estimate_versions v ON v.estimate_id = e.id
             WHERE e.id = ? AND e.workspace_id = ? AND v.version_number = ?",
        )
        .bind(&input.estimate_id)
        .bind(WORKSPACE_ID)
        .bind(current_version)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        let client_type: String = if let Some(client_id) = snapshot.0.as_deref() {
            sqlx::query_scalar("SELECT type FROM clients WHERE id = ? AND workspace_id = ?")
                .bind(client_id)
                .bind(WORKSPACE_ID)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?
                .unwrap_or_else(|| "direct".into())
        } else {
            "direct".into()
        };
        let generated_order_id = uuid::Uuid::new_v4().to_string();
        let order_status = match input.status.as_str() {
            "sent" => "pending_approval",
            "accepted" => "accepted",
            "cancelled" => "cancelled",
            _ => unreachable!(),
        };
        let agreed_amount = if input.status == "accepted" {
            snapshot.12
        } else {
            0
        };
        sqlx::query(
            "INSERT INTO work_orders
             (id, workspace_id, estimate_id, estimate_version_id, client_id, property_id, client_type,
              recipient_name, contact_name, contact_phone, tenant_name, tenant_phone, address_line1,
              address_line2, city, subdivision, postal_code, description, billing_mode, agreed_amount_minor,
              currency_code, status, priority, cancelled_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'normal',
                     CASE WHEN ? = 'cancelled' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END,
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(&generated_order_id)
        .bind(WORKSPACE_ID)
        .bind(&input.estimate_id)
        .bind(&snapshot.2)
        .bind(&snapshot.0)
        .bind(&snapshot.1)
        .bind(&client_type)
        .bind(&snapshot.3)
        .bind(&snapshot.4)
        .bind(&snapshot.5)
        .bind(&snapshot.7)
        .bind(&snapshot.6)
        .bind(&snapshot.8)
        .bind(&snapshot.9)
        .bind(&snapshot.10)
        .bind(&snapshot.11)
        .bind(snapshot.14.as_str())
        .bind(agreed_amount)
        .bind(&snapshot.13)
        .bind(order_status)
        .bind(&input.status)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        sqlx::query("UPDATE estimates SET work_order_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ? AND work_order_id IS NULL")
            .bind(&generated_order_id)
            .bind(&input.estimate_id)
            .bind(WORKSPACE_ID)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
        order_id = Some(generated_order_id);
    }
    if let Some(order_id) = order_id {
        match input.status.as_str() {
            "sent" => {
                sqlx::query("UPDATE work_orders SET status = 'pending_approval', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ? AND status = 'pending'")
                    .bind(&order_id).bind(WORKSPACE_ID).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
            }
            "accepted" => {
                let total_minor: i64 = sqlx::query_scalar("SELECT total_minor FROM estimate_versions WHERE estimate_id = ? AND version_number = ? AND workspace_id = ?")
                    .bind(&input.estimate_id).bind(current_version).bind(WORKSPACE_ID).fetch_one(&mut *transaction).await.map_err(|error| error.to_string())?;
                sqlx::query("UPDATE work_orders SET status = 'accepted', agreed_amount_minor = ?, estimate_id = ?, estimate_version_id = (SELECT id FROM estimate_versions WHERE estimate_id = ? AND version_number = ?), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ? AND status IN ('pending', 'pending_approval')")
                    .bind(total_minor).bind(&input.estimate_id).bind(&input.estimate_id).bind(current_version).bind(&order_id).bind(WORKSPACE_ID)
                    .execute(&mut *transaction).await.map_err(|error| error.to_string())?;
            }
            "cancelled" => {
                sqlx::query("UPDATE work_orders SET status = 'cancelled', cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ? AND status IN ('pending', 'pending_approval')")
                    .bind(&order_id).bind(WORKSPACE_ID).execute(&mut *transaction).await.map_err(|error| error.to_string())?;
            }
            _ => {}
        }
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn persist_work_order(
    pool: &SqlitePool,
    input: CreateWorkOrderInput,
) -> Result<String, String> {
    if !matches!(
        input.priority.as_str(),
        "low" | "normal" | "high" | "urgent"
    ) {
        return Err("Prioridad de orden inválida".into());
    }
    if input
        .client_type
        .as_deref()
        .is_some_and(|value| !matches!(value, "direct" | "property_manager"))
    {
        return Err("Tipo de cliente inválido".into());
    }
    for value in [
        &input.contact_name,
        &input.contact_phone,
        &input.address_line1,
        &input.description,
    ] {
        if value.as_deref().is_some_and(|text| text.trim().is_empty()) {
            return Err("Nombre, teléfono, dirección y descripción son obligatorios".into());
        }
    }
    let scheduled_at = optional_text(input.scheduled_at);
    let scheduled_end_at = optional_text(input.scheduled_end_at);
    if scheduled_at.is_some() != scheduled_end_at.is_some() {
        return Err("La cita requiere fecha/hora de inicio y finalización".into());
    }
    let status = if scheduled_at.is_some() {
        "scheduled"
    } else {
        "pending"
    };
    if let (Some(start), Some(end)) = (&scheduled_at, &scheduled_end_at) {
        if end <= start {
            return Err("La finalización debe ser posterior al inicio".into());
        }
    }
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;

    let (
        client_id,
        property_id,
        client_type,
        recipient_name,
        contact_name,
        contact_phone,
        tenant_name,
        tenant_phone,
        address_line1,
        address_line2,
        city,
        subdivision,
        postal_code,
        description,
        billing_mode,
        amount_minor,
        currency_code,
    ) = {
        let client_type = input.client_type.as_deref().unwrap_or("direct");
        if !matches!(client_type, "direct" | "property_manager") {
            return Err("Tipo de cliente inválido".into());
        }
        let resolved_client_id = if let Some(new_client) = input.new_client {
            if new_client.name.trim().is_empty() || new_client.phone.trim().is_empty() {
                return Err("El cliente nuevo necesita nombre y teléfono".into());
            }
            sqlx::query(
                "INSERT INTO clients (id, workspace_id, type, name, company_name, phone, email, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            )
            .bind(&new_client.id)
            .bind(WORKSPACE_ID)
            .bind(client_type)
            .bind(new_client.name.trim())
            .bind(optional_text(new_client.company_name))
            .bind(new_client.phone.trim())
            .bind(optional_text(new_client.email))
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
            Some(new_client.id)
        } else {
            input.client_id
        };
        if let Some(client_id) = resolved_client_id.as_deref() {
            let stored_type: Option<String> =
                sqlx::query_scalar("SELECT type FROM clients WHERE id = ? AND workspace_id = ?")
                    .bind(client_id)
                    .bind(WORKSPACE_ID)
                    .fetch_optional(&mut *transaction)
                    .await
                    .map_err(|error| error.to_string())?;
            if stored_type.as_deref() != Some(client_type) {
                return Err("El cliente seleccionado no existe o es de otro tipo".into());
            }
        }
        let resolved_property_id = if let Some(new_property) = input.new_property {
            let client_id = resolved_client_id.as_deref().ok_or_else(|| {
                "Selecciona o crea un cliente antes de agregar una propiedad".to_string()
            })?;
            if new_property.address_line1.trim().is_empty() || new_property.city.trim().is_empty() {
                return Err("La propiedad nueva necesita dirección y ciudad".into());
            }
            sqlx::query(
                "INSERT INTO properties (id, workspace_id, address_line1, address_line2, city, subdivision, postal_code, country_code, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            )
            .bind(&new_property.id)
            .bind(WORKSPACE_ID)
            .bind(new_property.address_line1.trim())
            .bind(optional_text(new_property.address_line2))
            .bind(new_property.city.trim())
            .bind(optional_text(new_property.subdivision))
            .bind(optional_text(new_property.postal_code))
            .bind(optional_text(new_property.country_code))
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
            let relationship_type = if client_type == "property_manager" {
                "manager"
            } else {
                "owner"
            };
            sqlx::query(
                "INSERT INTO property_client_history (id, workspace_id, property_id, client_id, relationship_type, valid_from)
                 VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(WORKSPACE_ID)
            .bind(&new_property.id)
            .bind(client_id)
            .bind(relationship_type)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
            Some(new_property.id)
        } else if let Some(property_id) = input.property_id {
            let exists: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM properties WHERE id = ? AND workspace_id = ?",
            )
            .bind(&property_id)
            .bind(WORKSPACE_ID)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
            if exists == 0 {
                return Err("La propiedad seleccionada no existe en este negocio".into());
            }
            Some(property_id)
        } else {
            None
        };
        let contact_name = input.contact_name.as_deref().unwrap_or("").trim();
        let contact_phone = input.contact_phone.as_deref().unwrap_or("").trim();
        let address_line1 = input.address_line1.as_deref().unwrap_or("").trim();
        let city = input.city.as_deref().unwrap_or("").trim();
        let description = input.description.as_deref().unwrap_or("").trim();
        if contact_name.is_empty()
            || contact_phone.is_empty()
            || address_line1.is_empty()
            || description.is_empty()
        {
            return Err("Nombre, teléfono, dirección y descripción son obligatorios".into());
        }
        let billing_mode = input.billing_mode.as_deref().unwrap_or("fixed");
        if !matches!(billing_mode, "fixed" | "time_materials") {
            return Err("Modalidad de cobro inválida".into());
        }
        let amount_minor = input.amount_minor.unwrap_or(0);
        if amount_minor < 0 {
            return Err("El importe no puede ser negativo".into());
        }
        let currency_code = input.currency_code.as_deref().unwrap_or("");
        let workspace_currency: Option<String> =
            sqlx::query_scalar("SELECT currency_code FROM workspaces WHERE id = ?")
                .bind(WORKSPACE_ID)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?
                .flatten();
        if workspace_currency.as_deref() != Some(currency_code) {
            return Err("La orden debe usar la moneda principal del negocio".into());
        }
        (
            resolved_client_id,
            resolved_property_id,
            client_type.to_owned(),
            optional_text(input.recipient_name).unwrap_or_else(|| contact_name.to_owned()),
            contact_name.to_owned(),
            contact_phone.to_owned(),
            optional_text(input.tenant_name),
            optional_text(input.tenant_phone),
            address_line1.to_owned(),
            optional_text(input.address_line2),
            city.to_owned(),
            optional_text(input.subdivision),
            optional_text(input.postal_code),
            description.to_owned(),
            billing_mode.to_owned(),
            amount_minor,
            currency_code.to_owned(),
        )
    };

    let order_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO work_orders
         (id, workspace_id, client_id, property_id, client_type,
          recipient_name, contact_name, contact_phone, tenant_name, tenant_phone, address_line1, address_line2,
          city, subdivision, postal_code, description, billing_mode, agreed_amount_minor, currency_code, status,
           priority, access_instructions, lockbox_code, gate_code, scheduled_at, scheduled_end_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&order_id)
    .bind(WORKSPACE_ID)
    .bind(&client_id)
    .bind(&property_id)
    .bind(&client_type)
    .bind(&recipient_name)
    .bind(&contact_name)
    .bind(&contact_phone)
    .bind(optional_text(tenant_name))
    .bind(optional_text(tenant_phone))
    .bind(&address_line1)
    .bind(optional_text(address_line2))
    .bind(&city)
    .bind(optional_text(subdivision))
    .bind(optional_text(postal_code))
    .bind(&description)
    .bind(&billing_mode)
    .bind(amount_minor)
    .bind(&currency_code)
    .bind(status)
    .bind(&input.priority)
    .bind(optional_text(input.access_instructions))
    .bind(optional_text(input.lockbox_code))
    .bind(optional_text(input.gate_code))
    .bind(scheduled_at)
    .bind(scheduled_end_at)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(order_id)
}

async fn persist_work_order_update(
    pool: &SqlitePool,
    input: UpdateWorkOrderInput,
) -> Result<(), String> {
    if !matches!(
        input.status.as_str(),
        "pending"
            | "pending_approval"
            | "accepted"
            | "scheduled"
            | "in_progress"
            | "completed"
            | "cancelled"
    ) {
        return Err("Estado de orden inválido".into());
    }
    if !matches!(
        input.priority.as_str(),
        "low" | "normal" | "high" | "urgent"
    ) {
        return Err("Prioridad de orden inválida".into());
    }
    if input
        .client_type
        .as_deref()
        .is_some_and(|value| !matches!(value, "direct" | "property_manager"))
    {
        return Err("Tipo de cliente inválido".into());
    }
    for value in [
        &input.contact_name,
        &input.contact_phone,
        &input.address_line1,
        &input.description,
    ] {
        if value.as_deref().is_some_and(|text| text.trim().is_empty()) {
            return Err("Nombre, teléfono, dirección y descripción son obligatorios".into());
        }
    }
    let scheduled_at = optional_text(input.scheduled_at);
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let (current_status, current_schedule, current_end): (String, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT status, scheduled_at, scheduled_end_at FROM work_orders WHERE id = ? AND workspace_id = ?",
    )
    .bind(&input.work_order_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "No se encontró la orden de trabajo".to_string())?;

    let same_status = current_status == input.status;
    let allowed = same_status
        || match current_status.as_str() {
            "pending" | "accepted" => matches!(input.status.as_str(), "scheduled" | "cancelled"),
            "pending_approval" => input.status == "cancelled",
            "scheduled" => matches!(input.status.as_str(), "in_progress" | "cancelled"),
            "in_progress" => matches!(input.status.as_str(), "completed" | "cancelled"),
            _ => false,
        };
    if !allowed {
        return Err("No se permite esa transición de estado".into());
    }
    let scheduled_end_at = optional_text(input.scheduled_end_at);
    let effective_schedule = scheduled_at.or(current_schedule);
    let effective_end = scheduled_end_at.or(current_end);
    if input.status == "scheduled" && (effective_schedule.is_none() || effective_end.is_none()) {
        return Err("Ingresa fecha y hora de inicio y finalización antes de agendar".into());
    }
    if let (Some(start), Some(end)) = (&effective_schedule, &effective_end) {
        if end <= start {
            return Err("La finalización debe ser posterior al inicio".into());
        }
    }

    sqlx::query(
        "UPDATE work_orders
         SET status = ?, priority = ?, scheduled_at = ?, scheduled_end_at = ?, access_instructions = ?, lockbox_code = ?, gate_code = ?,
             client_type = COALESCE(?, client_type), recipient_name = COALESCE(?, recipient_name),
             contact_name = COALESCE(?, contact_name), contact_phone = COALESCE(?, contact_phone),
             tenant_name = COALESCE(?, tenant_name), tenant_phone = COALESCE(?, tenant_phone),
             address_line1 = COALESCE(?, address_line1), address_line2 = COALESCE(?, address_line2),
             city = COALESCE(?, city), description = COALESCE(?, description),
             started_at = CASE WHEN ? = 'in_progress' AND started_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE started_at END,
             completed_at = CASE WHEN ? = 'completed' AND completed_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE completed_at END,
             cancelled_at = CASE WHEN ? = 'cancelled' AND cancelled_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE cancelled_at END,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND workspace_id = ?",
    )
    .bind(&input.status)
    .bind(&input.priority)
    .bind(effective_schedule)
    .bind(effective_end)
    .bind(optional_text(input.access_instructions))
    .bind(optional_text(input.lockbox_code))
    .bind(optional_text(input.gate_code))
    .bind(optional_text(input.client_type))
    .bind(optional_text(input.recipient_name))
    .bind(optional_text(input.contact_name))
    .bind(optional_text(input.contact_phone))
    .bind(optional_text(input.tenant_name))
    .bind(optional_text(input.tenant_phone))
    .bind(optional_text(input.address_line1))
    .bind(optional_text(input.address_line2))
    .bind(optional_text(input.city))
    .bind(optional_text(input.description))
    .bind(&input.status)
    .bind(&input.status)
    .bind(&input.status)
    .bind(&input.work_order_id)
    .bind(WORKSPACE_ID)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn correct_client_profile(
    app: AppHandle,
    input: CorrectClientProfileInput,
) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_client_profile_correction(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn correct_property_profile(
    app: AppHandle,
    input: CorrectPropertyProfileInput,
) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_property_profile_correction(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn create_estimate_from_order(
    app: AppHandle,
    input: CreateEstimateInput,
) -> Result<String, String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_estimate_from_order(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn revise_estimate(app: AppHandle, input: ReviseEstimateInput) -> Result<i64, String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_estimate_revision(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn change_estimate_status(
    app: AppHandle,
    input: ChangeEstimateStatusInput,
) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_estimate_status(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn create_work_order(app: AppHandle, input: CreateWorkOrderInput) -> Result<String, String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_work_order(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn update_work_order(app: AppHandle, input: UpdateWorkOrderInput) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_work_order_update(&pool, input).await;
    pool.close().await;
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:handyman.db",
                    vec![
                        Migration {
                            version: 1,
                            description: "initial_schema",
                            sql: include_str!("../migrations/0001_initial.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 2,
                            description: "profile_correction_audit",
                            sql: include_str!("../migrations/0002_profile_corrections.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 3,
                            description: "versioned_estimates",
                            sql: include_str!("../migrations/0003_estimates.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 4,
                            description: "work_orders",
                            sql: include_str!("../migrations/0004_work_orders.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 5,
                            description: "workspace_language",
                            sql: include_str!("../migrations/0005_workspace_language.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 6,
                            description: "order_first_workflow",
                            sql: include_str!("../migrations/0006_order_first_workflow.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 7,
                            description: "unique_order_estimate",
                            sql: include_str!("../migrations/0007_unique_order_estimate.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 8,
                            description: "remove_requests",
                            sql: include_str!("../migrations/0008_remove_requests.sql"),
                            kind: MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            correct_client_profile,
            correct_property_profile,
            create_estimate_from_order,
            revise_estimate,
            change_estimate_status,
            create_work_order,
            update_work_order
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_pool() -> SqlitePool {
        let options = SqliteConnectOptions::new()
            .in_memory(true)
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0001_initial.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0002_profile_corrections.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0003_estimates.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0004_work_orders.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0005_workspace_language.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0006_order_first_workflow.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0007_unique_order_estimate.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0008_remove_requests.sql"))
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    async fn insert_standalone_estimate(pool: &SqlitePool, estimate_id: &str, total_minor: i64) {
        sqlx::query(
            "INSERT INTO estimates (id, workspace_id, work_order_id, current_version, created_at, updated_at)
             VALUES (?, ?, NULL, 1, 'now', 'now')",
        )
        .bind(estimate_id)
        .bind(WORKSPACE_ID)
        .execute(pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO estimate_versions
             (id, workspace_id, estimate_id, version_number, status, billing_mode, description, amount_minor,
              discount_kind, discount_value, discount_minor, total_minor, currency_code, recipient_name,
              contact_name, contact_phone, address_line1, city, created_at)
             VALUES (?, ?, ?, 1, 'draft', 'fixed', 'Test work', ?, 'amount', 0, 0, ?, 'USD',
                     'Taylor Customer', 'Taylor Customer', '555-0182', '44 Cedar Road', 'Austin', 'now')",
        )
        .bind(format!("{estimate_id}-v1"))
        .bind(WORKSPACE_ID)
        .bind(estimate_id)
        .bind(total_minor)
        .bind(total_minor)
        .execute(pool)
        .await
        .unwrap();
    }

    #[test]
    fn client_correction_updates_selected_work_order_and_keeps_tenant_contact() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query(
                "INSERT INTO clients (id, workspace_id, type, name, phone, created_at, updated_at)
                 VALUES ('client-1', ?, 'property_manager', 'Old Manager', '555-0100', 'now', 'now')",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO work_orders
                 (id, workspace_id, client_id, client_type, recipient_name, contact_name, contact_phone, tenant_name, tenant_phone,
                  address_line1, city, description, billing_mode, agreed_amount_minor, currency_code, status, created_at, updated_at)
                 VALUES ('order-1', ?, 'client-1', 'property_manager', 'Old Manager', 'Old Manager', '555-0100',
                         'Tenant', '555-0199', '10 Oak', 'Austin', 'Repair faucet', 'fixed', 0, 'USD', 'pending', 'now', 'now')",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();

            persist_client_profile_correction(
                &pool,
                CorrectClientProfileInput {
                    client_id: "client-1".into(),
                    name: "New Manager".into(),
                    company_name: None,
                    phone: "555-0200".into(),
                    email: None,
                    related_work_order_ids: vec!["order-1".into()],
                },
            )
            .await
            .unwrap();

            let order: (String, String, String) = sqlx::query_as(
                "SELECT contact_name, contact_phone, tenant_phone FROM work_orders WHERE id = 'order-1'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(
                order,
                ("New Manager".into(), "555-0200".into(), "555-0199".into())
            );
            let audits: (i64, i64) = sqlx::query_as(
                "SELECT (SELECT COUNT(*) FROM profile_corrections), (SELECT COUNT(*) FROM profile_correction_records)",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(audits, (1, 1));
            pool.close().await;
        });
    }

    #[test]
    fn client_correction_rolls_back_when_selected_order_is_not_linked() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query(
                "INSERT INTO clients (id, workspace_id, type, name, phone, created_at, updated_at)
                 VALUES ('client-1', ?, 'direct', 'Old Name', '555-0100', 'now', 'now')",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();

            let result = persist_client_profile_correction(
                &pool,
                CorrectClientProfileInput {
                    client_id: "client-1".into(),
                    name: "Corrected Name".into(),
                    company_name: None,
                    phone: "555-0200".into(),
                    email: None,
                    related_work_order_ids: vec!["not-linked".into()],
                },
            )
            .await;

            assert!(result.is_err());
            let client: (String, String) =
                sqlx::query_as("SELECT name, phone FROM clients WHERE id = 'client-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            let correction_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM profile_corrections")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(client, ("Old Name".into(), "555-0100".into()));
            assert_eq!(correction_count, 0);
            pool.close().await;
        });
    }

    #[test]
    fn property_correction_updates_selected_order_without_reassigning_property() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query(
                "INSERT INTO clients (id, workspace_id, type, name, phone, created_at, updated_at)
                 VALUES ('client-1', ?, 'direct', 'Owner', '555-0100', 'now', 'now')",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO properties (id, workspace_id, address_line1, city, created_at, updated_at)
                 VALUES ('property-1', ?, '10 Old Oak', 'Austin', 'now', 'now')",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO property_client_history
                 (id, workspace_id, property_id, client_id, relationship_type, valid_from)
                 VALUES ('history-1', ?, 'property-1', 'client-1', 'owner', 'now')",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO work_orders
                 (id, workspace_id, client_id, property_id, client_type, recipient_name, contact_name, contact_phone,
                  address_line1, city, description, billing_mode, agreed_amount_minor, currency_code, status, created_at, updated_at)
                 VALUES ('order-1', ?, 'client-1', 'property-1', 'direct', 'Owner', 'Owner', '555-0100',
                         '10 Old Oak', 'Austin', 'Repair faucet', 'fixed', 0, 'USD', 'pending', 'now', 'now')",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();

            persist_property_profile_correction(
                &pool,
                CorrectPropertyProfileInput {
                    property_id: "property-1".into(),
                    address_line1: "10 New Oak".into(),
                    address_line2: None,
                    city: "Austin".into(),
                    subdivision: None,
                    postal_code: None,
                    country_code: None,
                    related_work_order_ids: vec!["order-1".into()],
                },
            )
            .await
            .unwrap();

            let address: String =
                sqlx::query_scalar("SELECT address_line1 FROM work_orders WHERE id = 'order-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            let relation: (String, String, Option<String>) = sqlx::query_as(
                "SELECT client_id, relationship_type, valid_to FROM property_client_history WHERE property_id = 'property-1'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(address, "10 New Oak");
            assert_eq!(relation, ("client-1".into(), "owner".into(), None));
            pool.close().await;
        });
    }

    #[test]
    fn estimate_creation_and_revision_preserve_versions_on_order() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query("UPDATE workspaces SET currency_code = 'USD' WHERE id = ?")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query(
                "INSERT INTO work_orders
                 (id, workspace_id, client_type, recipient_name, contact_name, contact_phone, address_line1, city,
                  description, billing_mode, agreed_amount_minor, currency_code, status, priority, created_at, updated_at)
                 VALUES ('order-q1', ?, 'direct', 'Sam Customer', 'Sam Customer', '555-0100', '12 Pine', 'Austin',
                         'Fix a door', 'fixed', 0, 'USD', 'pending', 'normal', 'now', 'now')",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();

            let estimate_id = persist_estimate_from_order(
                &pool,
                CreateEstimateInput {
                    order_id: "order-q1".into(),
                    description: "Repair and align entry door".into(),
                    billing_mode: "fixed".into(),
                    amount_minor: 10_000,
                    discount_kind: "percent".into(),
                    discount_value: 1_000,
                    currency_code: "USD".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            assert_eq!(
                persist_estimate_revision(
                    &pool,
                    ReviseEstimateInput {
                        estimate_id: estimate_id.clone(),
                        description: "Repair door and replace hinge".into(),
                        billing_mode: "fixed".into(),
                        amount_minor: 12_000,
                        discount_kind: "amount".into(),
                        discount_value: 500,
                    },
                )
                .await
                .unwrap(),
                2
            );
            let versions: (i64, i64) = sqlx::query_as(
                "SELECT COUNT(*), SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END)
                 FROM estimate_versions WHERE estimate_id = ?",
            )
            .bind(&estimate_id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(versions, (2, 2));
            let initial_total: i64 = sqlx::query_scalar(
                "SELECT total_minor FROM estimate_versions WHERE estimate_id = ? AND version_number = 1",
            )
            .bind(&estimate_id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(initial_total, 9_000);
            let estimate_order: Option<String> =
                sqlx::query_scalar("SELECT work_order_id FROM estimates WHERE id = ?")
                    .bind(&estimate_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(estimate_order.as_deref(), Some("order-q1"));
            persist_estimate_status(
                &pool,
                ChangeEstimateStatusInput {
                    estimate_id: estimate_id.clone(),
                    status: "sent".into(),
                },
            )
            .await
            .unwrap();
            persist_estimate_status(
                &pool,
                ChangeEstimateStatusInput {
                    estimate_id,
                    status: "accepted".into(),
                },
            )
            .await
            .unwrap();
            let order_status: String =
                sqlx::query_scalar("SELECT status FROM work_orders WHERE id = 'order-q1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(order_status, "accepted");
            pool.close().await;
        });
    }

    #[test]
    fn estimate_requires_workspace_currency() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let result = persist_estimate_from_order(
                &pool,
                CreateEstimateInput {
                    order_id: "missing-order".into(),
                    description: "Repair".into(),
                    billing_mode: "fixed".into(),
                    amount_minor: 10_000,
                    discount_kind: "amount".into(),
                    discount_value: 0,
                    currency_code: "USD".into(),
                    ..Default::default()
                },
            )
            .await;
            assert!(result.is_err());
            let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM estimates")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(count, 0);
            pool.close().await;
        });
    }

    #[test]
    fn order_first_flow_links_optional_estimate_and_updates_order_states() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let retired_requests_table: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'requests'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(retired_requests_table, 0);
            sqlx::query("UPDATE workspaces SET currency_code = 'USD' WHERE id = ?")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();
            let order_id = persist_work_order(
                &pool,
                CreateWorkOrderInput {
                    client_type: Some("direct".into()),
                    contact_name: Some("Taylor Customer".into()),
                    contact_phone: Some("555-0162".into()),
                    address_line1: Some("20 Oak Street".into()),
                    city: Some("Austin".into()),
                    description: Some("Repair a leaking faucet".into()),
                    billing_mode: Some("fixed".into()),
                    amount_minor: Some(0),
                    currency_code: Some("USD".into()),
                    lockbox_code: Some("8421".into()),
                    gate_code: Some("7390".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let (lockbox_code, gate_code): (Option<String>, Option<String>) =
                sqlx::query_as("SELECT lockbox_code, gate_code FROM work_orders WHERE id = ?")
                    .bind(&order_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(lockbox_code.as_deref(), Some("8421"));
            assert_eq!(gate_code.as_deref(), Some("7390"));

            let estimate_id = persist_estimate_from_order(
                &pool,
                CreateEstimateInput {
                    order_id: order_id.clone(),
                    description: "Replace faucet cartridge".into(),
                    billing_mode: "fixed".into(),
                    amount_minor: 24_000,
                    discount_kind: "amount".into(),
                    discount_value: 0,
                    currency_code: "USD".into(),
                },
            )
            .await
            .unwrap();
            persist_estimate_status(
                &pool,
                ChangeEstimateStatusInput {
                    estimate_id: estimate_id.clone(),
                    status: "sent".into(),
                },
            )
            .await
            .unwrap();
            let awaiting: String =
                sqlx::query_scalar("SELECT status FROM work_orders WHERE id = ?")
                    .bind(&order_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(awaiting, "pending_approval");

            persist_estimate_status(
                &pool,
                ChangeEstimateStatusInput {
                    estimate_id,
                    status: "accepted".into(),
                },
            )
            .await
            .unwrap();
            let accepted: (String, i64) =
                sqlx::query_as("SELECT status, agreed_amount_minor FROM work_orders WHERE id = ?")
                    .bind(&order_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(accepted, ("accepted".into(), 24_000));

            let another_order_id = persist_work_order(
                &pool,
                CreateWorkOrderInput {
                    client_type: Some("direct".into()),
                    contact_name: Some("Jordan Customer".into()),
                    contact_phone: Some("555-0191".into()),
                    address_line1: Some("5 Pine Road".into()),
                    city: Some("Austin".into()),
                    description: Some("Replace a broken latch".into()),
                    billing_mode: Some("fixed".into()),
                    currency_code: Some("USD".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let another_estimate_id = persist_estimate_from_order(
                &pool,
                CreateEstimateInput {
                    order_id: another_order_id.clone(),
                    description: "Replace the latch".into(),
                    billing_mode: "fixed".into(),
                    amount_minor: 6_000,
                    discount_kind: "amount".into(),
                    discount_value: 0,
                    currency_code: "USD".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            persist_estimate_status(
                &pool,
                ChangeEstimateStatusInput {
                    estimate_id: another_estimate_id.clone(),
                    status: "sent".into(),
                },
            )
            .await
            .unwrap();
            persist_estimate_status(
                &pool,
                ChangeEstimateStatusInput {
                    estimate_id: another_estimate_id,
                    status: "cancelled".into(),
                },
            )
            .await
            .unwrap();
            let cancelled: String =
                sqlx::query_scalar("SELECT status FROM work_orders WHERE id = ?")
                    .bind(&another_order_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(cancelled, "cancelled");

            let verbal_order_id = persist_work_order(
                &pool,
                CreateWorkOrderInput {
                    client_type: Some("direct".into()),
                    contact_name: Some("Casey Customer".into()),
                    contact_phone: Some("555-0147".into()),
                    address_line1: Some("88 Cedar Lane".into()),
                    description: Some("Adjust a sticking door".into()),
                    currency_code: Some("USD".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let verbal_estimate_id = persist_estimate_from_order(
                &pool,
                CreateEstimateInput {
                    order_id: verbal_order_id.clone(),
                    description: "Adjust the door".into(),
                    billing_mode: "fixed".into(),
                    amount_minor: 3_500,
                    discount_kind: "amount".into(),
                    discount_value: 0,
                    currency_code: "USD".into(),
                },
            )
            .await
            .unwrap();
            persist_estimate_status(
                &pool,
                ChangeEstimateStatusInput {
                    estimate_id: verbal_estimate_id,
                    status: "accepted".into(),
                },
            )
            .await
            .unwrap();
            let verbal_acceptance: String =
                sqlx::query_scalar("SELECT status FROM work_orders WHERE id = ?")
                    .bind(&verbal_order_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(verbal_acceptance, "accepted");
            pool.close().await;
        });
    }

    #[test]
    fn standalone_estimate_status_creates_matching_order() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query("UPDATE workspaces SET currency_code = 'USD' WHERE id = ?")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();
            insert_standalone_estimate(&pool, "standalone-approved", 7_500).await;
            persist_estimate_status(
                &pool,
                ChangeEstimateStatusInput {
                    estimate_id: "standalone-approved".into(),
                    status: "accepted".into(),
                },
            )
            .await
            .unwrap();
            let (accepted_order_id, status, amount): (String, String, i64) = sqlx::query_as(
                "SELECT w.id, w.status, w.agreed_amount_minor FROM estimates e JOIN work_orders w ON w.id = e.work_order_id WHERE e.id = 'standalone-approved'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(status, "accepted");
            assert_eq!(amount, 7_500);
            persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: accepted_order_id.clone(),
                    status: "scheduled".into(),
                    priority: "normal".into(),
                    scheduled_at: Some("2026-11-02T14:00:00Z".into()),
                    scheduled_end_at: Some("2026-11-02T18:00:00Z".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let scheduled_status: String =
                sqlx::query_scalar("SELECT status FROM work_orders WHERE id = ?")
                    .bind(&accepted_order_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(scheduled_status, "scheduled");

            insert_standalone_estimate(&pool, "standalone-cancelled", 4_000).await;
            persist_estimate_status(
                &pool,
                ChangeEstimateStatusInput {
                    estimate_id: "standalone-cancelled".into(),
                    status: "sent".into(),
                },
            )
            .await
            .unwrap();
            persist_estimate_status(
                &pool,
                ChangeEstimateStatusInput {
                    estimate_id: "standalone-cancelled".into(),
                    status: "cancelled".into(),
                },
            )
            .await
            .unwrap();
            let cancelled_status: String = sqlx::query_scalar(
                "SELECT w.status FROM estimates e JOIN work_orders w ON w.id = e.work_order_id WHERE e.id = 'standalone-cancelled'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(cancelled_status, "cancelled");
            pool.close().await;
        });
    }

    #[test]
    fn work_order_inline_client_and_property_are_atomic() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query("UPDATE workspaces SET currency_code = 'USD' WHERE id = ?")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();
            let order_id = persist_work_order(
                &pool,
                CreateWorkOrderInput {
                    new_client: Some(NewClientDraft {
                        id: "inline-manager".into(),
                        name: "Oak Property Group".into(),
                        company_name: Some("Oak Property Group LLC".into()),
                        phone: "555-0201".into(),
                        email: None,
                    }),
                    new_property: Some(NewPropertyDraft {
                        id: "inline-property".into(),
                        address_line1: "10 Oak Street".into(),
                        address_line2: None,
                        city: "Austin".into(),
                        subdivision: Some("TX".into()),
                        postal_code: Some("78701".into()),
                        country_code: Some("US".into()),
                    }),
                    client_type: Some("property_manager".into()),
                    recipient_name: Some("Oak Property Group LLC".into()),
                    contact_name: Some("Tenant Contact".into()),
                    contact_phone: Some("555-0202".into()),
                    tenant_name: Some("Tenant Contact".into()),
                    tenant_phone: Some("555-0202".into()),
                    address_line1: Some("10 Oak Street".into()),
                    city: Some("Austin".into()),
                    description: Some("Repair the kitchen faucet".into()),
                    currency_code: Some("USD".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let linked: (Option<String>, Option<String>) =
                sqlx::query_as("SELECT client_id, property_id FROM work_orders WHERE id = ?")
                    .bind(&order_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(
                linked,
                (
                    Some("inline-manager".into()),
                    Some("inline-property".into())
                )
            );
            let relationship: String = sqlx::query_scalar(
                "SELECT relationship_type FROM property_client_history WHERE property_id = 'inline-property'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(relationship, "manager");

            let failed = persist_work_order(
                &pool,
                CreateWorkOrderInput {
                    new_client: Some(NewClientDraft {
                        id: "rolled-back-client".into(),
                        name: "Should Roll Back".into(),
                        company_name: None,
                        phone: "555-0300".into(),
                        email: None,
                    }),
                    new_property: Some(NewPropertyDraft {
                        id: "invalid-property".into(),
                        address_line1: "99 Pine".into(),
                        address_line2: None,
                        city: "".into(),
                        subdivision: None,
                        postal_code: None,
                        country_code: None,
                    }),
                    client_type: Some("direct".into()),
                    contact_name: Some("Should Roll Back".into()),
                    contact_phone: Some("555-0300".into()),
                    address_line1: Some("99 Pine".into()),
                    description: Some("A test order".into()),
                    currency_code: Some("USD".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await;
            assert!(failed.is_err());
            let rolled_back: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM clients WHERE id = 'rolled-back-client'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(rolled_back, 0);
            pool.close().await;
        });
    }
}
