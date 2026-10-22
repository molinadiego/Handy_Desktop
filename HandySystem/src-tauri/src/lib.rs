use serde::Deserialize;
use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

const WORKSPACE_ID: &str = "local-workspace";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewClientDraft {
    id: String,
    name: String,
    company_name: Option<String>,
    phone: String,
    email: Option<String>,
}

#[derive(Deserialize)]
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
struct CreateRequestBundleInput {
    request_id: String,
    client_id: Option<String>,
    property_id: Option<String>,
    client_type: String,
    contact_name: String,
    contact_phone: String,
    tenant_name: Option<String>,
    tenant_phone: Option<String>,
    address_line1: String,
    address_line2: Option<String>,
    city: String,
    subdivision: Option<String>,
    postal_code: Option<String>,
    description: String,
    preferred_at: Option<String>,
    new_client: Option<NewClientDraft>,
    new_property: Option<NewPropertyDraft>,
}

fn optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim().to_owned();
        (!trimmed.is_empty()).then_some(trimmed)
    })
}

async fn persist_request_bundle(
    pool: &SqlitePool,
    input: CreateRequestBundleInput,
) -> Result<(), String> {
    if !matches!(input.client_type.as_str(), "direct" | "property_manager") {
        return Err("Tipo de cliente inválido".into());
    }
    if input.contact_name.trim().is_empty()
        || input.contact_phone.trim().is_empty()
        || input.address_line1.trim().is_empty()
        || input.description.trim().is_empty()
    {
        return Err("Faltan campos obligatorios de la solicitud".into());
    }

    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;

    let resolved_client_id = if let Some(client) = input.new_client {
        if client.name.trim().is_empty() || client.phone.trim().is_empty() {
            return Err("El cliente nuevo necesita nombre y teléfono".into());
        }
        sqlx::query(
            "INSERT INTO clients (id, workspace_id, type, name, company_name, phone, email, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(&client.id)
        .bind(WORKSPACE_ID)
        .bind(&input.client_type)
        .bind(client.name.trim())
        .bind(optional_text(client.company_name))
        .bind(client.phone.trim())
        .bind(optional_text(client.email))
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        Some(client.id)
    } else if let Some(client_id) = input.client_id {
        let client_type: Option<String> =
            sqlx::query_scalar("SELECT type FROM clients WHERE id = ? AND workspace_id = ?")
                .bind(&client_id)
                .bind(WORKSPACE_ID)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?;
        if client_type.as_deref() != Some(input.client_type.as_str()) {
            return Err(
                "El cliente seleccionado no existe o no coincide con el tipo elegido".into(),
            );
        }
        Some(client_id)
    } else {
        None
    };

    let resolved_property_id = if let Some(property) = input.new_property {
        let client_id = resolved_client_id.as_deref().ok_or_else(|| {
            "Selecciona o crea un cliente antes de agregar una propiedad".to_string()
        })?;
        if property.address_line1.trim().is_empty() {
            return Err("La propiedad nueva necesita una dirección".into());
        }
        sqlx::query(
            "INSERT INTO properties (id, workspace_id, address_line1, address_line2, city, subdivision, postal_code, country_code, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(&property.id)
        .bind(WORKSPACE_ID)
        .bind(property.address_line1.trim())
        .bind(optional_text(property.address_line2))
        .bind(property.city.trim())
        .bind(optional_text(property.subdivision))
        .bind(optional_text(property.postal_code))
        .bind(optional_text(property.country_code))
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;

        let relationship_type = if input.client_type == "property_manager" {
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
        .bind(&property.id)
        .bind(client_id)
        .bind(relationship_type)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        Some(property.id)
    } else if let Some(property_id) = input.property_id {
        let exists: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM properties WHERE id = ? AND workspace_id = ?")
                .bind(&property_id)
                .bind(WORKSPACE_ID)
                .fetch_one(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?;
        if exists == 0 {
            return Err("La propiedad seleccionada ya no existe".into());
        }
        Some(property_id)
    } else {
        None
    };

    sqlx::query(
        "INSERT INTO requests
         (id, workspace_id, client_id, property_id, client_type, contact_name, contact_phone, tenant_name, tenant_phone,
          address_line1, address_line2, city, subdivision, postal_code, description, preferred_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&input.request_id)
    .bind(WORKSPACE_ID)
    .bind(resolved_client_id)
    .bind(resolved_property_id)
    .bind(&input.client_type)
    .bind(input.contact_name.trim())
    .bind(input.contact_phone.trim())
    .bind(optional_text(input.tenant_name))
    .bind(optional_text(input.tenant_phone))
    .bind(input.address_line1.trim())
    .bind(optional_text(input.address_line2))
    .bind(input.city.trim())
    .bind(optional_text(input.subdivision))
    .bind(optional_text(input.postal_code))
    .bind(input.description.trim())
    .bind(input.preferred_at)
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
async fn create_request_bundle(
    app: AppHandle,
    input: CreateRequestBundleInput,
) -> Result<(), String> {
    let database_path = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("handyman.db");
    let options = SqliteConnectOptions::new()
        .filename(database_path)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| error.to_string())?;
    let result = persist_request_bundle(&pool, input).await;
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
                    vec![Migration {
                        version: 1,
                        description: "initial_schema",
                        sql: include_str!("../migrations/0001_initial.sql"),
                        kind: MigrationKind::Up,
                    }],
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![create_request_bundle])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new_request_bundle() -> CreateRequestBundleInput {
        CreateRequestBundleInput {
            request_id: "request-1".into(),
            client_id: None,
            property_id: None,
            client_type: "property_manager".into(),
            contact_name: "Manager Contact".into(),
            contact_phone: "555-0100".into(),
            tenant_name: Some("Tenant Name".into()),
            tenant_phone: Some("555-0101".into()),
            address_line1: "10 Oak Street".into(),
            address_line2: None,
            city: "Austin".into(),
            subdivision: Some("TX".into()),
            postal_code: None,
            description: "Repair a faucet".into(),
            preferred_at: None,
            new_client: Some(NewClientDraft {
                id: "client-1".into(),
                name: "Manager Contact".into(),
                company_name: Some("Oak Property Group".into()),
                phone: "555-0100".into(),
                email: None,
            }),
            new_property: Some(NewPropertyDraft {
                id: "property-1".into(),
                address_line1: "10 Oak Street".into(),
                address_line2: None,
                city: "Austin".into(),
                subdivision: Some("TX".into()),
                postal_code: None,
                country_code: Some("US".into()),
            }),
        }
    }

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
        pool
    }

    #[test]
    fn inline_manager_property_and_request_commit_as_one_bundle() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            persist_request_bundle(&pool, new_request_bundle())
                .await
                .unwrap();

            let counts: (i64, i64, i64) = sqlx::query_as(
                "SELECT (SELECT COUNT(*) FROM clients), (SELECT COUNT(*) FROM properties), (SELECT COUNT(*) FROM requests)",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(counts, (1, 1, 1));

            let relation: (String, String) = sqlx::query_as(
                "SELECT c.type, h.relationship_type FROM clients c
                 JOIN property_client_history h ON h.client_id = c.id",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(relation, ("property_manager".into(), "manager".into()));

            let request: (Option<String>, Option<String>, Option<String>) = sqlx::query_as(
                "SELECT client_id, property_id, tenant_name FROM requests WHERE id = 'request-1'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(
                request,
                (
                    Some("client-1".into()),
                    Some("property-1".into()),
                    Some("Tenant Name".into())
                )
            );
            pool.close().await;
        });
    }

    #[test]
    fn failed_inline_property_creation_rolls_back_new_client() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query(
                "INSERT INTO properties (id, workspace_id, address_line1, city, created_at, updated_at)
                 VALUES ('property-1', ?, 'Existing Address', 'Austin', 'now', 'now')",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();

            let result = persist_request_bundle(&pool, new_request_bundle()).await;
            assert!(result.is_err());
            let client_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM clients")
                .fetch_one(&pool)
                .await
                .unwrap();
            let request_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM requests")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(client_count, 0);
            assert_eq!(request_count, 0);
            pool.close().await;
        });
    }
}
