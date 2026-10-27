use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{
    Engine as _,
    engine::general_purpose::{STANDARD as BASE64, URL_SAFE_NO_PAD as BASE64URL},
};
use chacha20poly1305::{KeyInit, XChaCha20Poly1305, XNonce, aead::Aead};
use keyring::Entry;
use rand::{RngCore, rngs::OsRng};
use serde::Deserialize;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{
    SqlitePool,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock, mpsc},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_sql::{Migration, MigrationKind};
use url::Url;

const WORKSPACE_ID: &str = "local-workspace";
// Keep in sync with the latest migration registered in `run`.
const LATEST_SCHEMA_VERSION: i64 = 35;
const BACKUP_KEYRING_SERVICE: &str = "com.handysystem.desktop.backups";
const BACKUP_CREDENTIALS_ACCOUNT: &str = "credentials-v1";
const BACKUP_CREDENTIALS_MIGRATION_MARKER: &str = "backup-credentials-v1-migration.done";
const BACKUP_CONFIGURATION_MARKER: &str = "encrypted-backups-configured.v1";
const BACKUP_MAGIC: &[u8; 6] = b"HSBK01";
const EMAIL_KEYRING_SERVICE: &str = "com.handysystem.desktop.email";
const EMAIL_KEYRING_ACCOUNT: &str = "local-workspace-oauth-v1";
static BACKUP_CREDENTIALS_CACHE: OnceLock<Mutex<BackupCredentialsCache>> = OnceLock::new();
static EMAIL_TOKENS_CACHE: OnceLock<Mutex<Option<StoredEmailTokens>>> = OnceLock::new();
static LOCAL_SESSIONS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalAuthStatus {
    setup_required: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalAuthInput {
    username: String,
    password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalSession {
    token: String,
    username: String,
    role: String,
    can_view_access_codes: bool,
    employee_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalUserSummary {
    id: String,
    username: String,
    can_view_access_codes: bool,
    active: bool,
    employee_id: Option<String>,
    employee_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateLocalUserInput {
    session_token: String,
    username: String,
    password: String,
    employee_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetLocalUserPermissionInput {
    session_token: String,
    user_id: String,
    can_view_access_codes: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetLocalUserEmployeeInput {
    session_token: String,
    user_id: String,
    employee_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetWorkOrderAccessCodesInput {
    session_token: String,
    work_order_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmployeeWorkOrderTransitionInput {
    session_token: String,
    assignment_id: String,
    status: String,
    cancellation_reason: Option<String>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WorkOrderTaskDraft {
    id: Option<String>,
    description: String,
    employee_ids: Vec<String>,
    #[serde(default)]
    assignment_history: Vec<WorkOrderTaskAssignmentSummary>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WorkOrderTaskAssignmentSummary {
    employee_id: String,
    employee_name: String,
    status: String,
    assigned_at: String,
    completed_at: Option<String>,
    cancelled_at: Option<String>,
    cancellation_reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveWorkOrderTasksInput {
    session_token: String,
    work_order_id: String,
    tasks: Vec<WorkOrderTaskDraft>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListWorkOrderTasksInput {
    session_token: String,
    work_order_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AssignedWorkTask {
    assignment_id: String,
    assignment_status: String,
    assigned_at: String,
    completed_at: Option<String>,
    cancelled_at: Option<String>,
    cancellation_reason: Option<String>,
    task_id: String,
    task_description: String,
    work_order_id: String,
    work_order_status: String,
    address_line1: String,
    city: String,
    contact_name: String,
    scheduled_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveEmployeeEstimateDraftInput {
    session_token: String,
    work_order_id: String,
    items: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkOrderAccessCodes {
    lockbox_code: Option<String>,
    gate_code: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupStatus {
    configured: bool,
    last_automatic_backup_unix: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigureBackupInput {
    password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RevealBackupRecoveryInput {
    password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendInvoiceEmailInput {
    invoice_id: String,
    recipient_email: String,
    provider: String,
    pdf_base64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectEmailProviderInput {
    provider: String,
    client_secret: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreBackupInput {
    backup_path: String,
    unlock_secret: String,
    new_password: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredBackupCredentials {
    password: String,
    recovery_code: String,
    master_key: String,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredEmailTokens {
    gmail: Option<ProviderOAuthTokens>,
    microsoft: Option<ProviderOAuthTokens>,
    gmail_client_secret: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderOAuthTokens {
    client_id: String,
    client_secret: Option<String>,
    account_email: String,
    access_token: String,
    refresh_token: Option<String>,
    scope: Option<String>,
    expires_at_unix: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
struct OAuthTokenResponse {
    access_token: String,
    expires_in: Option<u64>,
    refresh_token: Option<String>,
    scope: Option<String>,
}

#[derive(Deserialize)]
struct GoogleUserInfo {
    email: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MicrosoftUserInfo {
    mail: Option<String>,
    user_principal_name: Option<String>,
}

#[derive(Clone, Copy)]
struct OAuthProviderEndpoints {
    authorize: &'static str,
    token: &'static str,
    scopes: &'static str,
    user_info: &'static str,
}

#[derive(Clone, Default)]
enum BackupCredentialsCache {
    #[default]
    Unchecked,
    Missing,
    Present(StoredBackupCredentials),
    Unavailable(String),
}

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
    new_client_id: Option<String>,
    related_work_order_ids: Vec<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CreateEstimateInput {
    order_id: Option<String>,
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
    description: String,
    #[serde(default)]
    items: Vec<String>,
    billing_mode: String,
    amount_minor: Option<i64>,
    discount_kind: String,
    discount_value: i64,
    currency_code: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ReviseEstimateInput {
    estimate_id: String,
    description: String,
    items: Option<Vec<String>>,
    billing_mode: String,
    amount_minor: Option<i64>,
    discount_kind: String,
    discount_value: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangeEstimateStatusInput {
    estimate_id: String,
    status: String,
}

#[derive(sqlx::FromRow)]
struct EstimateToOrderSnapshot {
    client_id: Option<String>,
    property_id: Option<String>,
    client_type: String,
    tenant_name: Option<String>,
    tenant_phone: Option<String>,
    version_id: String,
    recipient_name: String,
    contact_name: String,
    contact_phone: String,
    address_line1: String,
    address_line2: Option<String>,
    city: String,
    subdivision: Option<String>,
    postal_code: Option<String>,
    description: String,
    total_minor: i64,
    currency_code: String,
    billing_mode: String,
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
    #[serde(default)]
    items: Vec<String>,
    #[serde(default)]
    employee_ids: Vec<String>,
    #[serde(default)]
    task_drafts: Vec<WorkOrderTaskDraft>,
    billing_mode: Option<String>,
    amount_minor: Option<i64>,
    price_confirmed: Option<bool>,
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
    items: Option<Vec<String>>,
    employee_ids: Option<Vec<String>>,
    #[serde(default)]
    task_drafts: Option<Vec<WorkOrderTaskDraft>>,
    amount_minor: Option<i64>,
    price_confirmed: Option<bool>,
    completed_items: Option<Vec<String>>,
    cancellation_reason: Option<String>,
    confirm_cancellation: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWorkTimeEntryInput {
    work_order_id: String,
    employee_id: String,
    entry_type: String,
    started_at: Option<String>,
    ended_at: Option<String>,
    work_occurred_at: String,
    amount_minor: Option<i64>,
    note: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveFollowUpTaskInput {
    task_type: String,
    entity_id: String,
    due_at: String,
    status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWorkOrderMaterialInput {
    work_order_id: String,
    material_name: String,
    quantity: f64,
    total_cost_minor: i64,
    unit_price_minor: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateExpenseInput {
    work_order_id: Option<String>,
    description: String,
    category: String,
    occurred_at: String,
    amount_minor: i64,
    vendor: Option<String>,
    note: Option<String>,
    receipt_file_name: Option<String>,
    receipt_mime_type: Option<String>,
    receipt_size_bytes: Option<i64>,
    receipt_data_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateEmployeePaymentInput {
    employee_id: String,
    work_order_id: Option<String>,
    work_time_entry_id: Option<String>,
    paid_at: String,
    amount_minor: i64,
    note: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateInvoiceInput {
    work_order_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VoidInvoiceInput {
    invoice_id: String,
    reason: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InvoicePaymentAllocationInput {
    invoice_id: String,
    amount_minor: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateCustomerPaymentInput {
    paid_at: String,
    amount_minor: i64,
    currency_code: String,
    note: Option<String>,
    allocations: Vec<InvoicePaymentAllocationInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWorkOrderExtraInput {
    work_order_id: String,
    description: String,
    reason: String,
    amount_minor: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewWorkOrderExtraInput {
    extra_id: String,
    action: String,
    approval_method: Option<String>,
    approval_note: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApplyCustomerPaymentInput {
    payment_id: String,
    allocations: Vec<InvoicePaymentAllocationInput>,
}

fn optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim().to_owned();
        (!trimmed.is_empty()).then_some(trimmed)
    })
}

fn normalize_work_items(
    items: Vec<String>,
    fallback: Option<String>,
) -> Result<Vec<String>, String> {
    let source = if items.is_empty() {
        fallback
            .unwrap_or_default()
            .lines()
            .map(str::to_owned)
            .collect()
    } else {
        items
    };
    let normalized: Vec<String> = source
        .into_iter()
        .map(|item| item.trim().to_owned())
        .filter(|item| !item.is_empty())
        .collect();
    if normalized.is_empty() {
        return Err("Agrega al menos un trabajo con descripción".into());
    }
    Ok(normalized)
}

async fn replace_work_order_items(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    order_id: &str,
    items: &[String],
) -> Result<(), String> {
    sqlx::query("DELETE FROM work_order_items WHERE workspace_id = ? AND work_order_id = ?")
        .bind(WORKSPACE_ID)
        .bind(order_id)
        .execute(&mut **transaction)
        .await
        .map_err(|error| error.to_string())?;
    for (index, description) in items.iter().enumerate() {
        sqlx::query("INSERT INTO work_order_items (id, workspace_id, work_order_id, position, description, created_at) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(WORKSPACE_ID)
            .bind(order_id)
            .bind((index + 1) as i64)
            .bind(description)
            .execute(&mut **transaction)
            .await
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

async fn replace_estimate_version_items(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    version_id: &str,
    items: &[String],
) -> Result<(), String> {
    sqlx::query(
        "DELETE FROM estimate_version_items WHERE workspace_id = ? AND estimate_version_id = ?",
    )
    .bind(WORKSPACE_ID)
    .bind(version_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| error.to_string())?;
    for (index, description) in items.iter().enumerate() {
        sqlx::query("INSERT INTO estimate_version_items (id, workspace_id, estimate_version_id, position, description, created_at) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(WORKSPACE_ID)
            .bind(version_id)
            .bind((index + 1) as i64)
            .bind(description)
            .execute(&mut **transaction)
            .await
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

async fn replace_work_order_assignments(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    order_id: &str,
    employee_ids: &[String],
) -> Result<(), String> {
    let mut unique = std::collections::BTreeSet::new();
    for employee_id in employee_ids {
        if !unique.insert(employee_id) {
            continue;
        }
        let exists: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM employees WHERE id = ? AND workspace_id = ?")
                .bind(employee_id)
                .bind(WORKSPACE_ID)
                .fetch_one(&mut **transaction)
                .await
                .map_err(|error| error.to_string())?;
        if exists != 1 {
            return Err("Uno de los empleados seleccionados no existe en este negocio".into());
        }
    }
    sqlx::query("DELETE FROM work_order_assignments WHERE work_order_id = ? AND workspace_id = ?")
        .bind(order_id)
        .bind(WORKSPACE_ID)
        .execute(&mut **transaction)
        .await
        .map_err(|error| error.to_string())?;
    for employee_id in unique {
        sqlx::query("INSERT INTO work_order_assignments (workspace_id, work_order_id, employee_id, assigned_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
            .bind(WORKSPACE_ID)
            .bind(order_id)
            .bind(employee_id)
            .execute(&mut **transaction)
            .await
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

async fn persist_work_order_task_drafts(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    order_id: &str,
    tasks: &[WorkOrderTaskDraft],
) -> Result<(), String> {
    for (position, draft) in tasks.iter().enumerate() {
        let description = draft.description.trim();
        if description.is_empty() || description.chars().count() > 500 {
            return Err("Cada tarea debe tener una descripción de hasta 500 caracteres".into());
        }
        let mut desired: Vec<String> = draft.employee_ids.iter().cloned().collect();
        desired.sort();
        desired.dedup();
        for employee_id in &desired {
            let exists: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM employees WHERE id = ? AND workspace_id = ?",
            )
            .bind(employee_id)
            .bind(WORKSPACE_ID)
            .fetch_one(&mut **transaction)
            .await
            .map_err(|error| error.to_string())?;
            if exists != 1 {
                return Err("Una de las personas asignadas ya no existe".into());
            }
        }
        let task_id = if let Some(id) = draft.id.as_deref() {
            let existing = sqlx::query_as::<_, (String, i64)>("SELECT t.description, (SELECT COUNT(*) FROM work_order_task_assignments a WHERE a.workspace_id = t.workspace_id AND a.task_id = t.id AND a.status != 'reassigned') FROM work_order_tasks t WHERE t.id = ? AND t.workspace_id = ? AND t.work_order_id = ? AND t.active = 1")
                .bind(id).bind(WORKSPACE_ID).bind(order_id).fetch_optional(&mut **transaction).await.map_err(|error| error.to_string())?
                .ok_or_else(|| "Una tarea no pertenece a esta orden".to_string())?;
            if existing.0 != description && existing.1 > 0 {
                return Err("No edites la descripción de una tarea con asignaciones; crea una tarea nueva para conservar el historial".into());
            }
            sqlx::query("UPDATE work_order_tasks SET description = ?, position = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ? AND work_order_id = ? AND active = 1")
                .bind(description).bind(position as i64).bind(id).bind(WORKSPACE_ID).bind(order_id)
                .execute(&mut **transaction).await.map_err(|error| error.to_string())?;
            id.to_owned()
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO work_order_tasks (id, workspace_id, work_order_id, description, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
                .bind(&id).bind(WORKSPACE_ID).bind(order_id).bind(description).bind(position as i64)
                .execute(&mut **transaction).await.map_err(|error| error.to_string())?;
            id
        };
        let active: Vec<String> = sqlx::query_scalar("SELECT employee_id FROM work_order_task_assignments WHERE workspace_id = ? AND task_id = ? AND status = 'assigned'")
            .bind(WORKSPACE_ID).bind(&task_id).fetch_all(&mut **transaction).await.map_err(|error| error.to_string())?;
        for employee_id in active
            .iter()
            .filter(|employee_id| !desired.contains(employee_id))
        {
            sqlx::query("UPDATE work_order_task_assignments SET status = 'reassigned', ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE workspace_id = ? AND task_id = ? AND employee_id = ? AND status = 'assigned'")
                .bind(WORKSPACE_ID).bind(&task_id).bind(employee_id).execute(&mut **transaction).await.map_err(|error| error.to_string())?;
        }
        for employee_id in desired
            .iter()
            .filter(|employee_id| !active.contains(employee_id))
        {
            sqlx::query("INSERT INTO work_order_task_assignments (id, workspace_id, task_id, employee_id, status, assigned_at) VALUES (?, ?, ?, ?, 'assigned', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
                .bind(uuid::Uuid::new_v4().to_string()).bind(WORKSPACE_ID).bind(&task_id).bind(employee_id)
                .execute(&mut **transaction).await.map_err(|error| error.to_string())?;
        }
    }
    Ok(())
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

fn backup_keyring_entry(name: &str) -> Result<Entry, String> {
    Entry::new(BACKUP_KEYRING_SERVICE, name).map_err(|error| error.to_string())
}

fn read_keyring_secret(name: &str) -> Result<Option<String>, String> {
    match backup_keyring_entry(name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn store_keyring_secret(name: &str, value: &str) -> Result<(), String> {
    backup_keyring_entry(name)?
        .set_password(value)
        .map_err(|error| error.to_string())
}

fn delete_backup_secret(name: &str) {
    if let Ok(entry) = backup_keyring_entry(name) {
        let _ = entry.delete_credential();
    }
}

fn read_email_tokens() -> Result<StoredEmailTokens, String> {
    if let Some(tokens) = EMAIL_TOKENS_CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| "No se pudo acceder a la caché de credenciales de email".to_string())?
        .clone()
    {
        return Ok(tokens);
    }
    let entry = Entry::new(EMAIL_KEYRING_SERVICE, EMAIL_KEYRING_ACCOUNT)
        .map_err(|error| error.to_string())?;
    let tokens = match entry.get_password() {
        Ok(serialized) => serde_json::from_str(&serialized)
            .map_err(|error| format!("Las credenciales OAuth guardadas no son válidas: {error}"))?,
        Err(keyring::Error::NoEntry) => StoredEmailTokens::default(),
        Err(error) => return Err(error.to_string()),
    };
    *EMAIL_TOKENS_CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| "No se pudo acceder a la caché de credenciales de email".to_string())? =
        Some(tokens.clone());
    Ok(tokens)
}

fn write_email_tokens(tokens: StoredEmailTokens) -> Result<(), String> {
    let entry = Entry::new(EMAIL_KEYRING_SERVICE, EMAIL_KEYRING_ACCOUNT)
        .map_err(|error| error.to_string())?;
    if tokens.gmail.is_none() && tokens.microsoft.is_none() && tokens.gmail_client_secret.is_none()
    {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => return Err(error.to_string()),
        }
        *EMAIL_TOKENS_CACHE
            .get_or_init(|| Mutex::new(None))
            .lock()
            .map_err(|_| "No se pudo acceder a la caché de credenciales de email".to_string())? =
            Some(tokens);
        return Ok(());
    }
    let serialized = serde_json::to_string(&tokens).map_err(|error| error.to_string())?;
    entry
        .set_password(&serialized)
        .map_err(|error| error.to_string())?;
    let persisted = entry.get_password().map_err(|error| error.to_string())?;
    if persisted != serialized {
        return Err("El Llavero no conservó los tokens OAuth de email".into());
    }
    *EMAIL_TOKENS_CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| "No se pudo acceder a la caché de credenciales de email".to_string())? =
        Some(tokens);
    Ok(())
}

fn oauth_provider_endpoints(provider: &str) -> Result<OAuthProviderEndpoints, String> {
    match provider {
        "gmail" => Ok(OAuthProviderEndpoints {
            authorize: "https://accounts.google.com/o/oauth2/v2/auth",
            token: "https://oauth2.googleapis.com/token",
            scopes: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
            user_info: "https://www.googleapis.com/oauth2/v2/userinfo",
        }),
        "microsoft" => Ok(OAuthProviderEndpoints {
            authorize: "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
            token: "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
            scopes: "openid email offline_access User.Read Mail.Send",
            user_info: "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
        }),
        _ => Err("Selecciona Gmail o Microsoft/Outlook".into()),
    }
}

fn receive_oauth_code(
    listener: TcpListener,
    redirect_uri: String,
    expected_state: String,
) -> Result<String, String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(300);
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
                let mut request = [0_u8; 8192];
                let length = stream
                    .read(&mut request)
                    .map_err(|error| error.to_string())?;
                let request = String::from_utf8_lossy(&request[..length]);
                let target = request
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(1))
                    .ok_or_else(|| {
                        "La respuesta OAuth local no tiene un formato válido".to_string()
                    })?;
                let callback_url =
                    Url::parse(&format!("{}{}", redirect_uri.trim_end_matches('/'), target))
                        .map_err(|error| error.to_string())?;
                let query: std::collections::HashMap<_, _> =
                    callback_url.query_pairs().into_owned().collect();
                let response_body = "Autorización recibida. Puedes volver a HandySystem.";
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    response_body.len(),
                    response_body
                );
                let _ = stream.write_all(response.as_bytes());
                if query.get("state") != Some(&expected_state) {
                    return Err("La validación de seguridad OAuth no coincidió".into());
                }
                if let Some(error) = query.get("error") {
                    return Err(format!("El proveedor canceló la autorización: {error}"));
                }
                return query
                    .get("code")
                    .cloned()
                    .ok_or_else(|| "El proveedor no devolvió el código OAuth".into());
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err("La autorización OAuth venció. Inténtalo otra vez.".into());
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

#[tauri::command]
async fn connect_email_provider(
    app: AppHandle,
    input: ConnectEmailProviderInput,
) -> Result<String, String> {
    let provider = input.provider;
    let endpoints = oauth_provider_endpoints(&provider)?;
    let pool = open_database_pool(&app).await?;
    let client_id: Option<String> = match provider.as_str() {
        "gmail" => sqlx::query_scalar("SELECT gmail_oauth_client_id FROM workspaces WHERE id = ?")
            .bind(WORKSPACE_ID)
            .fetch_optional(&pool)
            .await
            .map_err(|error| error.to_string())?
            .flatten(),
        "microsoft" => {
            sqlx::query_scalar("SELECT microsoft_oauth_client_id FROM workspaces WHERE id = ?")
                .bind(WORKSPACE_ID)
                .fetch_optional(&pool)
                .await
                .map_err(|error| error.to_string())?
                .flatten()
        }
        _ => None,
    };
    pool.close().await;
    let client_id = client_id
        .map(|id| id.trim().to_owned())
        .filter(|id| !id.is_empty())
        .ok_or_else(|| "Guarda primero el OAuth Client ID de este proveedor".to_string())?;
    let mut stored = read_email_tokens()?;
    if provider == "gmail" {
        if let Some(secret) = input
            .client_secret
            .as_deref()
            .map(str::trim)
            .filter(|secret| !secret.is_empty())
        {
            stored.gmail_client_secret = Some(secret.to_owned());
            write_email_tokens(stored.clone())?;
        }
    }
    let client_secret = if provider == "gmail" {
        stored.gmail_client_secret.clone()
    } else {
        None
    };

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    let redirect_uri = if provider == "microsoft" {
        format!("http://localhost:{port}/")
    } else {
        format!("http://127.0.0.1:{port}/")
    };
    let state = BASE64URL.encode(random_bytes::<32>());
    let verifier = BASE64URL.encode(random_bytes::<32>());
    let challenge = BASE64URL.encode(Sha256::digest(verifier.as_bytes()));
    let mut authorization_url =
        Url::parse(endpoints.authorize).map_err(|error| error.to_string())?;
    authorization_url
        .query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("response_mode", "query")
        .append_pair("scope", endpoints.scopes)
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256");
    if provider == "gmail" {
        authorization_url
            .query_pairs_mut()
            .append_pair("access_type", "offline")
            .append_pair("prompt", "consent");
    }
    app.opener()
        .open_url(authorization_url.to_string(), None::<&str>)
        .map_err(|error| format!("No se pudo abrir el navegador para OAuth: {error}"))?;
    let callback_state = state.clone();
    let callback_redirect = redirect_uri.clone();
    let code = tauri::async_runtime::spawn_blocking(move || {
        receive_oauth_code(listener, callback_redirect, callback_state)
    })
    .await
    .map_err(|error| error.to_string())??;

    let client = reqwest::Client::new();
    let mut token_params = vec![
        ("client_id".to_owned(), client_id.clone()),
        ("code".to_owned(), code),
        ("code_verifier".to_owned(), verifier),
        ("grant_type".to_owned(), "authorization_code".to_owned()),
        ("redirect_uri".to_owned(), redirect_uri.clone()),
    ];
    if let Some(secret) = client_secret.as_ref() {
        token_params.push(("client_secret".to_owned(), secret.clone()));
    }
    let response = client
        .post(endpoints.token)
        .form(&token_params)
        .send()
        .await
        .map_err(|error| format!("No se pudo conectar con el proveedor OAuth: {error}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let detail = oauth_error_detail(response).await;
        return Err(format!(
            "El proveedor OAuth rechazó la conexión ({status}): {detail}"
        ));
    }
    let response: OAuthTokenResponse = response
        .json()
        .await
        .map_err(|error| format!("La respuesta OAuth no es válida: {error}"))?;
    let granted_scope = response
        .scope
        .clone()
        .unwrap_or_else(|| endpoints.scopes.to_owned());
    if provider == "gmail"
        && !granted_scope
            .split_whitespace()
            .any(|scope| scope == "https://www.googleapis.com/auth/gmail.send")
    {
        return Err("Google no concedió el permiso gmail.send. Agrégalo en Google Auth Platform → Data Access y vuelve a autorizar Gmail.".into());
    }
    let access_token = response.access_token;
    let account_email = if provider == "gmail" {
        client
            .get(endpoints.user_info)
            .bearer_auth(&access_token)
            .send()
            .await
            .map_err(|error| error.to_string())?
            .error_for_status()
            .map_err(|error| error.to_string())?
            .json::<GoogleUserInfo>()
            .await
            .map_err(|error| error.to_string())?
            .email
            .ok_or_else(|| "Google no devolvió el correo de la cuenta".to_string())?
    } else {
        let info = client
            .get(endpoints.user_info)
            .bearer_auth(&access_token)
            .send()
            .await
            .map_err(|error| error.to_string())?
            .error_for_status()
            .map_err(|error| error.to_string())?
            .json::<MicrosoftUserInfo>()
            .await
            .map_err(|error| error.to_string())?;
        info.mail
            .or(info.user_principal_name)
            .ok_or_else(|| "Microsoft no devolvió el correo de la cuenta".to_string())?
    };
    let previous_refresh = if provider == "gmail" {
        stored
            .gmail
            .as_ref()
            .and_then(|token| token.refresh_token.clone())
    } else {
        stored
            .microsoft
            .as_ref()
            .and_then(|token| token.refresh_token.clone())
    };
    let token = ProviderOAuthTokens {
        client_id: client_id.clone(),
        client_secret: client_secret.clone(),
        account_email: account_email.clone(),
        access_token,
        refresh_token: response.refresh_token.or(previous_refresh),
        scope: Some(granted_scope),
        expires_at_unix: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .saturating_add(response.expires_in.unwrap_or(3600)),
    };
    if provider == "gmail" {
        stored.gmail = Some(token);
    } else {
        stored.microsoft = Some(token);
    }
    write_email_tokens(stored)?;
    let pool = open_database_pool(&app).await?;
    let query = if provider == "gmail" {
        "UPDATE workspaces SET gmail_connected_email = ? WHERE id = ?"
    } else {
        "UPDATE workspaces SET microsoft_connected_email = ? WHERE id = ?"
    };
    let result = sqlx::query(query)
        .bind(&account_email)
        .bind(WORKSPACE_ID)
        .execute(&pool)
        .await
        .map_err(|error| error.to_string());
    pool.close().await;
    result?;
    Ok(account_email)
}

#[tauri::command]
async fn disconnect_email_provider(app: AppHandle, provider: String) -> Result<(), String> {
    if !matches!(provider.as_str(), "gmail" | "microsoft") {
        return Err("Selecciona Gmail o Microsoft/Outlook".into());
    }
    let mut tokens = read_email_tokens()?;
    let query = if provider == "gmail" {
        tokens.gmail = None;
        tokens.gmail_client_secret = None;
        "UPDATE workspaces SET gmail_connected_email = NULL WHERE id = ?"
    } else {
        tokens.microsoft = None;
        "UPDATE workspaces SET microsoft_connected_email = NULL WHERE id = ?"
    };
    write_email_tokens(tokens)?;
    let pool = open_database_pool(&app).await?;
    let result = sqlx::query(query)
        .bind(WORKSPACE_ID)
        .execute(&pool)
        .await
        .map_err(|error| error.to_string());
    pool.close().await;
    result?;
    Ok(())
}

async fn oauth_error_detail(response: reqwest::Response) -> String {
    let body = response.text().await.unwrap_or_default();
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&body) else {
        return "Revisa el Client ID, el Client Secret y la configuración OAuth del proveedor"
            .into();
    };
    let error = value.get("error").and_then(|value| value.as_str());
    let description = value
        .get("error_description")
        .and_then(|value| value.as_str());
    match (error, description) {
        (Some(code), Some(description)) => format!("{code}: {description}"),
        (Some(code), None) => code.to_owned(),
        (None, Some(description)) => description.to_owned(),
        (None, None) => {
            "Revisa el Client ID, el Client Secret y la configuración OAuth del proveedor".into()
        }
    }
}

async fn provider_api_error_detail(response: reqwest::Response) -> String {
    let body = response.text().await.unwrap_or_default();
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&body) else {
        return "El proveedor no devolvió detalles. Verifica Gmail API y los permisos OAuth de envío.".into();
    };
    let error = value.get("error").unwrap_or(&value);
    let code = error
        .get("status")
        .or_else(|| error.get("code"))
        .and_then(|value| value.as_str());
    let message = error.get("message").and_then(|value| value.as_str());
    let reason = error
        .get("errors")
        .and_then(|value| value.as_array())
        .and_then(|errors| errors.first())
        .and_then(|error| error.get("reason"))
        .and_then(|value| value.as_str());
    match (code, reason, message) {
        (Some(code), Some(reason), Some(message)) => format!("{code}/{reason}: {message}"),
        (Some(code), None, Some(message)) => format!("{code}: {message}"),
        (None, Some(reason), Some(message)) => format!("{reason}: {message}"),
        (Some(code), _, None) => code.to_owned(),
        (None, Some(reason), None) => reason.to_owned(),
        _ => "El proveedor rechazó el envío. Verifica Gmail API y los permisos OAuth.".into(),
    }
}

async fn refresh_email_access_token(
    provider: &str,
    token: &mut ProviderOAuthTokens,
) -> Result<bool, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if token.expires_at_unix > now.saturating_add(60) {
        return Ok(false);
    }
    let refresh_token = token.refresh_token.as_deref().ok_or_else(|| {
        "La cuenta no entregó un refresh token; desconéctala y vuelve a conectarla".to_string()
    })?;
    let endpoints = oauth_provider_endpoints(provider)?;
    let mut params = vec![
        ("client_id".to_owned(), token.client_id.clone()),
        ("refresh_token".to_owned(), refresh_token.to_owned()),
        ("grant_type".to_owned(), "refresh_token".to_owned()),
    ];
    if let Some(secret) = token.client_secret.as_ref() {
        params.push(("client_secret".to_owned(), secret.clone()));
    }
    let response = reqwest::Client::new()
        .post(endpoints.token)
        .form(&params)
        .send()
        .await
        .map_err(|error| format!("No se pudo renovar la autorización de email: {error}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let detail = oauth_error_detail(response).await;
        return Err(format!(
            "El proveedor rechazó renovar la autorización ({status}): {detail}"
        ));
    }
    let refreshed: OAuthTokenResponse = response
        .json()
        .await
        .map_err(|error| format!("La respuesta de renovación no es válida: {error}"))?;
    token.access_token = refreshed.access_token;
    if refreshed.refresh_token.is_some() {
        token.refresh_token = refreshed.refresh_token;
    }
    token.expires_at_unix = now.saturating_add(refreshed.expires_in.unwrap_or(3600));
    if refreshed.scope.is_some() {
        token.scope = refreshed.scope;
    }
    Ok(true)
}

fn valid_email_address(email: &str) -> bool {
    let email = email.trim();
    !email.contains(['\r', '\n'])
        && email.len() <= 320
        && email.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
        })
}

#[tauri::command]
async fn send_invoice_email_command(
    app: AppHandle,
    input: SendInvoiceEmailInput,
) -> Result<(), String> {
    if !matches!(input.provider.as_str(), "gmail" | "microsoft") {
        return Err("Selecciona una cuenta Gmail o Microsoft conectada".into());
    }
    let recipient_email = input.recipient_email.trim();
    if !valid_email_address(recipient_email) {
        return Err("Ingresa una dirección de email válida".into());
    }
    if input.pdf_base64.len() > 30 * 1024 * 1024 {
        return Err("El PDF supera el límite de envío de 20 MiB".into());
    }
    let pdf = BASE64
        .decode(&input.pdf_base64)
        .map_err(|_| "El PDF adjunto no tiene un formato válido".to_string())?;
    if !pdf.starts_with(b"%PDF-") || pdf.len() > 20 * 1024 * 1024 {
        return Err("El adjunto debe ser un PDF válido de hasta 20 MiB".into());
    }

    let pool = open_database_pool(&app).await?;
    let invoice: Option<(String, String, String)> = sqlx::query_as(
        "SELECT reference_code, recipient_name, status
         FROM invoices WHERE id = ? AND workspace_id = ?",
    )
    .bind(&input.invoice_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&pool)
    .await
    .map_err(|error| error.to_string())?;
    let Some((reference_code, recipient_name, status)) = invoice else {
        pool.close().await;
        return Err("No se encontró la factura en este negocio".into());
    };
    pool.close().await;
    if status != "issued" {
        return Err("Solo se pueden enviar facturas emitidas".into());
    }

    let mut tokens = read_email_tokens()?;
    let token = if input.provider == "gmail" {
        tokens.gmail.as_mut()
    } else {
        tokens.microsoft.as_mut()
    }
    .ok_or_else(|| "Conecta primero la cuenta de email desde Configuración".to_string())?;
    if input.provider == "gmail"
        && !token.scope.as_deref().is_some_and(|scope| {
            scope
                .split_whitespace()
                .any(|scope| scope == "https://www.googleapis.com/auth/gmail.send")
        })
    {
        return Err("La autorización de Gmail no incluye gmail.send. Vuelve a conectar y acepta ese permiso.".into());
    }
    if refresh_email_access_token(&input.provider, token).await? {
        write_email_tokens(tokens.clone())?;
    }
    let token = if input.provider == "gmail" {
        tokens.gmail.as_ref()
    } else {
        tokens.microsoft.as_ref()
    }
    .ok_or_else(|| "No se encontró la cuenta conectada".to_string())?;

    let attachment_base64 = BASE64.encode(&pdf);
    let safe_reference: String = reference_code
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-')
        .collect();
    let file_name = format!(
        "invoice-{}.pdf",
        if safe_reference.is_empty() {
            "invoice"
        } else {
            &safe_reference
        }
    );
    let subject = format!("Invoice {reference_code}");
    let body = format!(
        "Hola {recipient_name}, adjuntamos la factura {reference_code}.\n\nHello {recipient_name}, please find invoice {reference_code} attached."
    );
    let provider_message_id = if input.provider == "gmail" {
        let boundary = format!("HandySystem-{}", uuid::Uuid::new_v4().simple());
        let mime = format!(
            "From: {}\r\nTo: {}\r\nSubject: {}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"{}\"\r\n\r\n--{}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n{}\r\n--{}\r\nContent-Type: application/pdf; name=\"{}\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"{}\"\r\n\r\n{}\r\n--{}--\r\n",
            token.account_email,
            recipient_email,
            subject,
            boundary,
            boundary,
            BASE64.encode(body.as_bytes()),
            boundary,
            file_name,
            file_name,
            attachment_base64,
            boundary,
        );
        let response = reqwest::Client::new()
            .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
            .bearer_auth(&token.access_token)
            .json(&serde_json::json!({ "raw": BASE64URL.encode(mime.as_bytes()) }))
            .send()
            .await
            .map_err(|error| format!("No se pudo conectar con Gmail: {error}"))?;
        if !response.status().is_success() {
            let status = response.status();
            let detail = provider_api_error_detail(response).await;
            return Err(format!("Gmail rechazó el envío ({status}): {detail}"));
        }
        response
            .json::<serde_json::Value>()
            .await
            .ok()
            .and_then(|value| {
                value
                    .get("id")
                    .and_then(|id| id.as_str())
                    .map(str::to_owned)
            })
    } else {
        let response = reqwest::Client::new()
            .post("https://graph.microsoft.com/v1.0/me/sendMail")
            .bearer_auth(&token.access_token)
            .json(&serde_json::json!({
                "message": {
                    "subject": subject,
                    "body": { "contentType": "Text", "content": body },
                    "toRecipients": [{ "emailAddress": { "address": recipient_email } }],
                    "attachments": [{
                        "@odata.type": "#microsoft.graph.fileAttachment",
                        "name": file_name,
                        "contentType": "application/pdf",
                        "contentBytes": attachment_base64
                    }]
                },
                "saveToSentItems": true
            }))
            .send()
            .await
            .map_err(|error| format!("No se pudo conectar con Microsoft: {error}"))?;
        if !response.status().is_success() {
            let status = response.status();
            let detail = provider_api_error_detail(response).await;
            return Err(format!("Microsoft rechazó el envío ({status}): {detail}"));
        }
        None
    };

    let pool = open_database_pool(&app).await?;
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let updated = sqlx::query(
        "UPDATE invoices SET recipient_email = ?, sent_at = COALESCE(sent_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND workspace_id = ? AND status = 'issued'",
    )
    .bind(recipient_email)
    .bind(&input.invoice_id)
    .bind(WORKSPACE_ID)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    if updated.rows_affected() != 1 {
        return Err("El email se envió, pero la factura ya no está emitida; revisa el historial de enviados".into());
    }
    sqlx::query(
        "INSERT INTO invoice_email_sends (id, workspace_id, invoice_id, provider, recipient_email, sent_at, provider_message_id)
         VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(WORKSPACE_ID)
    .bind(&input.invoice_id)
    .bind(&input.provider)
    .bind(recipient_email)
    .bind(provider_message_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

fn cache_backup_credentials(credentials: StoredBackupCredentials) -> Result<(), String> {
    *BACKUP_CREDENTIALS_CACHE
        .get_or_init(|| Mutex::new(BackupCredentialsCache::Unchecked))
        .lock()
        .map_err(|_| "No se pudo acceder a la caché de credenciales de respaldo".to_string())? =
        BackupCredentialsCache::Present(credentials);
    Ok(())
}

fn cache_backup_credentials_missing() -> Result<(), String> {
    *BACKUP_CREDENTIALS_CACHE
        .get_or_init(|| Mutex::new(BackupCredentialsCache::Unchecked))
        .lock()
        .map_err(|_| "No se pudo acceder a la caché de credenciales de respaldo".to_string())? =
        BackupCredentialsCache::Missing;
    Ok(())
}

fn cache_backup_credentials_error(error: String) -> Result<(), String> {
    *BACKUP_CREDENTIALS_CACHE
        .get_or_init(|| Mutex::new(BackupCredentialsCache::Unchecked))
        .lock()
        .map_err(|_| "No se pudo acceder a la caché de credenciales de respaldo".to_string())? =
        BackupCredentialsCache::Unavailable(error);
    Ok(())
}

fn retry_backup_credentials_on_explicit_action() -> Result<(), String> {
    let mut cache = BACKUP_CREDENTIALS_CACHE
        .get_or_init(|| Mutex::new(BackupCredentialsCache::Unchecked))
        .lock()
        .map_err(|_| "No se pudo acceder a la caché de credenciales de respaldo".to_string())?;
    if matches!(*cache, BackupCredentialsCache::Unavailable(_)) {
        *cache = BackupCredentialsCache::Unchecked;
    }
    Ok(())
}

fn backup_credentials_migration_marker(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join(BACKUP_CREDENTIALS_MIGRATION_MARKER))
}

fn backup_configuration_marker(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join(BACKUP_CONFIGURATION_MARKER))
}

fn read_backup_configuration_marker_path(path: &Path) -> Result<Option<bool>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let value = fs::read_to_string(path).map_err(|error| error.to_string())?;
    match value.trim() {
        "configured" => Ok(Some(true)),
        "unconfigured" => Ok(Some(false)),
        // A damaged optimization marker falls back to checking the secure store.
        _ => Ok(None),
    }
}

fn write_backup_configuration_marker_path(path: &Path, configured: bool) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "No se pudo determinar la carpeta de configuración".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    fs::write(
        path,
        if configured {
            "configured"
        } else {
            "unconfigured"
        },
    )
    .map_err(|error| error.to_string())
}

fn read_backup_configuration_marker(app: &AppHandle) -> Result<Option<bool>, String> {
    read_backup_configuration_marker_path(&backup_configuration_marker(app)?)
}

fn write_backup_configuration_marker(app: &AppHandle, configured: bool) -> Result<(), String> {
    write_backup_configuration_marker_path(&backup_configuration_marker(app)?, configured)
}

fn mark_backup_credentials_migration_done(app: &AppHandle) -> Result<(), String> {
    let marker = backup_credentials_migration_marker(app)?;
    if let Some(parent) = marker.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(marker, b"checked").map_err(|error| error.to_string())
}

fn read_stored_backup_credentials(
    app: &AppHandle,
) -> Result<Option<StoredBackupCredentials>, String> {
    let cached = BACKUP_CREDENTIALS_CACHE
        .get_or_init(|| Mutex::new(BackupCredentialsCache::Unchecked))
        .lock()
        .map_err(|_| "No se pudo acceder a la caché de credenciales de respaldo".to_string())?
        .clone();
    match cached {
        BackupCredentialsCache::Present(credentials) => return Ok(Some(credentials)),
        BackupCredentialsCache::Missing => return Ok(None),
        BackupCredentialsCache::Unavailable(error) => return Err(error),
        BackupCredentialsCache::Unchecked => {}
    }

    let serialized = match read_keyring_secret(BACKUP_CREDENTIALS_ACCOUNT) {
        Ok(serialized) => serialized,
        Err(error) => {
            cache_backup_credentials_error(error.clone())?;
            return Err(error);
        }
    };
    if let Some(serialized) = serialized {
        let credentials: StoredBackupCredentials = match serde_json::from_str(&serialized) {
            Ok(credentials) => credentials,
            Err(error) => {
                let message =
                    format!("Las credenciales de respaldo guardadas no son válidas: {error}");
                cache_backup_credentials_error(message.clone())?;
                return Err(message);
            }
        };
        let _ = write_backup_configuration_marker(app, true);
        cache_backup_credentials(credentials.clone())?;
        return Ok(Some(credentials));
    }

    // Don't probe three legacy Keychain items every time status is queried.
    // The marker makes the compatibility scan a one-time operation per app data dir.
    let migration_marker = backup_credentials_migration_marker(app)?;
    if migration_marker.exists() {
        cache_backup_credentials_missing()?;
        return Ok(None);
    }

    // Migrate credentials written by earlier builds, which stored three
    // separate keychain entries. This scan is performed only once. Keep those
    // old Keychain items intact: deleting them causes extra authorization
    // prompts and could affect files created by older app versions.
    let legacy = (|| {
        Ok::<_, String>((
            read_keyring_secret("password")?,
            read_keyring_secret("recovery")?,
            read_keyring_secret("master")?,
        ))
    })();
    let (legacy_password, legacy_recovery, legacy_master) = match legacy {
        Ok(legacy) => legacy,
        Err(error) => {
            cache_backup_credentials_error(error.clone())?;
            return Err(error);
        }
    };
    match (legacy_password, legacy_recovery, legacy_master) {
        (Some(password), Some(recovery_code), Some(master_key)) => {
            let credentials = StoredBackupCredentials {
                password,
                recovery_code,
                master_key,
            };
            if let Err(error) = write_stored_backup_credentials(&credentials) {
                cache_backup_credentials_error(error.clone())?;
                return Err(error);
            }
            mark_backup_credentials_migration_done(app)?;
            let _ = write_backup_configuration_marker(app, true);
            cache_backup_credentials(credentials.clone())?;
            Ok(Some(credentials))
        }
        (None, None, None) => {
            cache_backup_credentials_missing()?;
            mark_backup_credentials_migration_done(app)?;
            Ok(None)
        }
        _ => {
            let error =
                "Las credenciales anteriores del respaldo están incompletas; no se modificaron"
                    .to_string();
            cache_backup_credentials_error(error.clone())?;
            Err(error)
        }
    }
}

fn write_stored_backup_credentials(credentials: &StoredBackupCredentials) -> Result<(), String> {
    let serialized = serde_json::to_string(credentials).map_err(|error| error.to_string())?;
    store_keyring_secret(BACKUP_CREDENTIALS_ACCOUNT, &serialized)?;
    let persisted = read_keyring_secret(BACKUP_CREDENTIALS_ACCOUNT)?
        .ok_or_else(|| "El llavero no conservó las credenciales del respaldo".to_string())?;
    let verified: StoredBackupCredentials = serde_json::from_str(&persisted).map_err(|error| {
        format!("No se pudieron verificar las credenciales del respaldo: {error}")
    })?;
    if verified.password != credentials.password
        || verified.recovery_code != credentials.recovery_code
        || verified.master_key != credentials.master_key
    {
        return Err("El llavero devolvió credenciales distintas a las guardadas".into());
    }
    Ok(())
}

fn backup_credentials(app: &AppHandle) -> Result<(String, String, [u8; 32]), String> {
    let Some(credentials) = read_stored_backup_credentials(app)? else {
        write_backup_configuration_marker(app, false)?;
        return Err("Configura una contraseña de respaldo primero".into());
    };
    let master_vec = BASE64
        .decode(credentials.master_key)
        .map_err(|_| "La clave maestra guardada está dañada".to_string())?;
    let master: [u8; 32] = master_vec
        .try_into()
        .map_err(|_| "La clave maestra guardada no es válida".to_string())?;
    Ok((credentials.password, credentials.recovery_code, master))
}

fn derive_backup_key(secret: &str, salt: &[u8; 16]) -> Result<[u8; 32], String> {
    let params = Params::new(19 * 1024, 2, 1, Some(32)).map_err(|error| error.to_string())?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0_u8; 32];
    argon
        .hash_password_into(secret.as_bytes(), salt, &mut key)
        .map_err(|error| error.to_string())?;
    Ok(key)
}

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0_u8; N];
    OsRng.fill_bytes(&mut bytes);
    bytes
}

fn encrypt_backup_payload(
    key: &[u8; 32],
    nonce: &[u8; 24],
    bytes: &[u8],
) -> Result<Vec<u8>, String> {
    XChaCha20Poly1305::new_from_slice(key)
        .map_err(|error| error.to_string())?
        .encrypt(XNonce::from_slice(nonce), bytes)
        .map_err(|_| "No se pudo cifrar el respaldo".to_string())
}

fn decrypt_backup_payload(
    key: &[u8; 32],
    nonce: &[u8; 24],
    bytes: &[u8],
) -> Result<Vec<u8>, String> {
    XChaCha20Poly1305::new_from_slice(key)
        .map_err(|error| error.to_string())?
        .decrypt(XNonce::from_slice(nonce), bytes)
        .map_err(|_| {
            "La contraseña/clave de recuperación es incorrecta o el respaldo está dañado"
                .to_string()
        })
}

fn encrypted_backup_archive(
    database_bytes: &[u8],
    password: &str,
    recovery: &str,
    master: &[u8; 32],
) -> Result<Vec<u8>, String> {
    let password_salt = random_bytes::<16>();
    let password_nonce = random_bytes::<24>();
    let recovery_salt = random_bytes::<16>();
    let recovery_nonce = random_bytes::<24>();
    let payload_nonce = random_bytes::<24>();
    let password_key = derive_backup_key(password, &password_salt)?;
    let recovery_key = derive_backup_key(recovery, &recovery_salt)?;
    let wrapped_password = encrypt_backup_payload(&password_key, &password_nonce, master)?;
    let wrapped_recovery = encrypt_backup_payload(&recovery_key, &recovery_nonce, master)?;
    let encrypted_database = encrypt_backup_payload(master, &payload_nonce, database_bytes)?;
    let mut archive = Vec::with_capacity(206 + encrypted_database.len());
    archive.extend_from_slice(BACKUP_MAGIC);
    archive.extend_from_slice(&password_salt);
    archive.extend_from_slice(&password_nonce);
    archive.extend_from_slice(&wrapped_password);
    archive.extend_from_slice(&recovery_salt);
    archive.extend_from_slice(&recovery_nonce);
    archive.extend_from_slice(&wrapped_recovery);
    archive.extend_from_slice(&payload_nonce);
    archive.extend_from_slice(&encrypted_database);
    Ok(archive)
}

fn decrypt_backup_archive(
    archive: &[u8],
    unlock_secret: &str,
) -> Result<(Vec<u8>, [u8; 32]), String> {
    const HEADER: usize = 206;
    if archive.len() <= HEADER || archive.get(..6) != Some(BACKUP_MAGIC) {
        return Err("El archivo no es un respaldo HandySystem válido".into());
    }
    let password_salt: &[u8; 16] = archive[6..22]
        .try_into()
        .map_err(|_| "Encabezado inválido".to_string())?;
    let password_nonce: &[u8; 24] = archive[22..46]
        .try_into()
        .map_err(|_| "Encabezado inválido".to_string())?;
    let recovery_salt: &[u8; 16] = archive[94..110]
        .try_into()
        .map_err(|_| "Encabezado inválido".to_string())?;
    let recovery_nonce: &[u8; 24] = archive[110..134]
        .try_into()
        .map_err(|_| "Encabezado inválido".to_string())?;
    let payload_nonce: &[u8; 24] = archive[182..206]
        .try_into()
        .map_err(|_| "Encabezado inválido".to_string())?;
    let password_key = derive_backup_key(unlock_secret, password_salt)?;
    let recovery_key = derive_backup_key(unlock_secret, recovery_salt)?;
    let master_bytes = decrypt_backup_payload(&password_key, password_nonce, &archive[46..94])
        .or_else(|_| decrypt_backup_payload(&recovery_key, recovery_nonce, &archive[134..182]))?;
    let master: [u8; 32] = master_bytes
        .try_into()
        .map_err(|_| "La clave del respaldo está dañada".to_string())?;
    let database_bytes = decrypt_backup_payload(&master, payload_nonce, &archive[HEADER..])?;
    Ok((database_bytes, master))
}

fn backup_directory(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("backups"))
}

async fn sqlite_snapshot(app: &AppHandle) -> Result<Vec<u8>, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let snapshot_path = dir.join(format!("snapshot-{}.db", uuid::Uuid::new_v4()));
    let pool = open_database_pool(app).await?;
    let result = backup_sqlite_to_file(&pool, &snapshot_path).await;
    pool.close().await;
    if let Err(error) = result {
        let _ = fs::remove_file(&snapshot_path);
        return Err(error);
    }
    let bytes = fs::read(&snapshot_path).map_err(|error| error.to_string());
    let _ = fs::remove_file(&snapshot_path);
    bytes
}

async fn backup_sqlite_to_file(pool: &SqlitePool, destination: &Path) -> Result<(), String> {
    use std::{ffi::CString, ptr};

    let encoded_path = CString::new(destination.to_string_lossy().as_bytes())
        .map_err(|_| "La ruta del respaldo contiene caracteres inválidos".to_string())?;
    let mut connection = pool.acquire().await.map_err(|error| error.to_string())?;
    let mut source = connection
        .lock_handle()
        .await
        .map_err(|error| error.to_string())?;
    let mut destination_db: *mut libsqlite3_sys::sqlite3 = ptr::null_mut();
    let open_result = unsafe {
        libsqlite3_sys::sqlite3_open_v2(
            encoded_path.as_ptr(),
            &mut destination_db,
            libsqlite3_sys::SQLITE_OPEN_READWRITE
                | libsqlite3_sys::SQLITE_OPEN_CREATE
                | libsqlite3_sys::SQLITE_OPEN_FULLMUTEX,
            ptr::null(),
        )
    };
    if open_result != libsqlite3_sys::SQLITE_OK {
        let message = if destination_db.is_null() {
            "No se pudo crear el archivo de respaldo".to_string()
        } else {
            unsafe { std::ffi::CStr::from_ptr(libsqlite3_sys::sqlite3_errmsg(destination_db)) }
                .to_string_lossy()
                .into_owned()
        };
        if !destination_db.is_null() {
            unsafe { libsqlite3_sys::sqlite3_close(destination_db) };
        }
        return Err(message);
    }

    let main_db = b"main\0".as_ptr() as *const std::os::raw::c_char;
    let backup = unsafe {
        libsqlite3_sys::sqlite3_backup_init(
            destination_db,
            main_db,
            source.as_raw_handle().as_ptr(),
            main_db,
        )
    };
    if backup.is_null() {
        let message =
            unsafe { std::ffi::CStr::from_ptr(libsqlite3_sys::sqlite3_errmsg(destination_db)) }
                .to_string_lossy()
                .into_owned();
        unsafe { libsqlite3_sys::sqlite3_close(destination_db) };
        return Err(message);
    }

    let mut attempts = 0;
    let step_result = loop {
        let result = unsafe { libsqlite3_sys::sqlite3_backup_step(backup, -1) };
        if result == libsqlite3_sys::SQLITE_DONE {
            break Ok(());
        }
        if result == libsqlite3_sys::SQLITE_OK {
            continue;
        }
        if (result == libsqlite3_sys::SQLITE_BUSY || result == libsqlite3_sys::SQLITE_LOCKED)
            && attempts < 100
        {
            attempts += 1;
            std::thread::sleep(Duration::from_millis(10));
            continue;
        }
        let message =
            unsafe { std::ffi::CStr::from_ptr(libsqlite3_sys::sqlite3_errmsg(destination_db)) }
                .to_string_lossy()
                .into_owned();
        break Err(message);
    };
    let finish_result = unsafe { libsqlite3_sys::sqlite3_backup_finish(backup) };
    let close_result = unsafe { libsqlite3_sys::sqlite3_close(destination_db) };
    step_result?;
    if finish_result != libsqlite3_sys::SQLITE_OK || close_result != libsqlite3_sys::SQLITE_OK {
        return Err("No se pudo finalizar el respaldo de SQLite".into());
    }
    Ok(())
}

async fn write_auto_backup(app: &AppHandle, force: bool) -> Result<Option<u64>, String> {
    if !backup_status_for_app(app)?.configured {
        return Ok(None);
    }
    let dir = backup_directory(app)?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let now = SystemTime::now();
    let now_seconds = now
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let managed_backups: Vec<_> = fs::read_dir(&dir)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            (name.starts_with("auto-") || name.starts_with("pre-restore-"))
                && entry
                    .path()
                    .extension()
                    .is_some_and(|extension| extension == "hsbak")
        })
        .collect();
    if !force
        && managed_backups.iter().any(|entry| {
            entry
                .metadata()
                .ok()
                .and_then(|metadata| metadata.modified().ok())
                .is_some_and(|modified| is_recent_daily_backup(&entry.path(), modified, now))
        })
    {
        return Ok(None);
    }
    // Only access the Keychain when an actual snapshot is due, not on every
    // startup/status poll.
    let (password, recovery, master) = backup_credentials(app)?;
    let database_bytes = sqlite_snapshot(app).await?;
    let archive = encrypted_backup_archive(&database_bytes, &password, &recovery, &master)?;
    let prefix = if force { "pre-restore" } else { "auto" };
    let backup_token = format!("{now_seconds}-{}", uuid::Uuid::new_v4());
    let final_path = dir.join(format!("{prefix}-{backup_token}.hsbak"));
    let temporary_path = dir.join(format!("{prefix}-{backup_token}.tmp"));
    fs::write(&temporary_path, archive).map_err(|error| error.to_string())?;
    if let Err(error) = fs::rename(&temporary_path, &final_path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error.to_string());
    }
    for entry in managed_backups {
        if let Ok(metadata) = entry.metadata() {
            if let Ok(modified) = metadata.modified() {
                if now.duration_since(modified).unwrap_or(Duration::ZERO)
                    > Duration::from_secs(30 * 24 * 60 * 60)
                {
                    fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
                }
            }
        }
    }
    Ok(Some(now_seconds))
}

fn backup_status_for_app(app: &AppHandle) -> Result<BackupStatus, String> {
    let configured = match read_backup_configuration_marker(app)? {
        Some(configured) => configured,
        None => {
            let configured = read_stored_backup_credentials(app)?.is_some();
            write_backup_configuration_marker(app, configured)?;
            configured
        }
    };
    let dir = backup_directory(app)?;
    let last_automatic_backup_unix = if dir.exists() {
        fs::read_dir(&dir)
            .map_err(|error| error.to_string())?
            .filter_map(Result::ok)
            .filter(|entry| {
                entry.file_name().to_string_lossy().starts_with("auto-")
                    && entry
                        .path()
                        .extension()
                        .is_some_and(|extension| extension == "hsbak")
            })
            .filter_map(|entry| {
                entry
                    .metadata()
                    .ok()?
                    .modified()
                    .ok()?
                    .duration_since(UNIX_EPOCH)
                    .ok()
                    .map(|duration| duration.as_secs())
            })
            .max()
    } else {
        None
    };
    Ok(BackupStatus {
        configured,
        last_automatic_backup_unix,
    })
}

fn recovery_code_from_random() -> String {
    random_bytes::<32>()
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect()
}

fn save_backup_credentials(
    password: &str,
    recovery: &str,
    master: &[u8; 32],
) -> Result<(), String> {
    let credentials = StoredBackupCredentials {
        password: password.to_owned(),
        recovery_code: recovery.to_owned(),
        master_key: BASE64.encode(master),
    };
    write_stored_backup_credentials(&credentials)?;
    cache_backup_credentials(credentials)
}

fn validate_backup_password(password: &str) -> Result<(), String> {
    if password.chars().count() < 12 {
        return Err("La contraseña del respaldo debe tener al menos 12 caracteres".into());
    }
    Ok(())
}

async fn export_encrypted_backup(app: &AppHandle) -> Result<String, String> {
    retry_backup_credentials_on_explicit_action()?;
    let (password, recovery, master) = backup_credentials(app)?;
    let snapshot = sqlite_snapshot(app).await?;
    let archive = encrypted_backup_archive(&snapshot, &password, &recovery, &master)?;
    Ok(BASE64.encode(archive))
}

async fn validate_restore_database(path: &Path) -> Result<(), String> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(false)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| format!("No se pudo abrir la copia restaurada: {error}"))?;
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&pool)
        .await
        .map_err(|error| error.to_string())?;
    if integrity != "ok" {
        pool.close().await;
        return Err("El archivo de respaldo no pasó la verificación de integridad".into());
    }
    let workspace_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workspaces WHERE id = ?")
        .bind(WORKSPACE_ID)
        .fetch_one(&pool)
        .await
        .map_err(|error| error.to_string())?;
    if workspace_exists != 1 {
        pool.close().await;
        return Err("El respaldo no contiene el negocio local esperado".into());
    }
    let max_version: Option<i64> = sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
        .fetch_one(&pool)
        .await
        .map_err(|error| error.to_string())?;
    if max_version.unwrap_or(0) > LATEST_SCHEMA_VERSION {
        pool.close().await;
        return Err("El respaldo fue creado por una versión más nueva de HandySystem".into());
    }
    pool.close().await;
    Ok(())
}

fn database_sidecar(path: &Path, suffix: &str) -> PathBuf {
    PathBuf::from(format!("{}{}", path.to_string_lossy(), suffix))
}

fn is_recent_daily_backup(path: &Path, modified: SystemTime, now: SystemTime) -> bool {
    path.file_name()
        .is_some_and(|name| name.to_string_lossy().starts_with("auto-"))
        && path
            .extension()
            .is_some_and(|extension| extension == "hsbak")
        && now.duration_since(modified).unwrap_or(Duration::ZERO)
            < Duration::from_secs(24 * 60 * 60)
}

fn rollback_database_replacement(
    database_path: &Path,
    rollback_path: &Path,
    moved_sidecars: &[(PathBuf, PathBuf)],
) -> Result<(), String> {
    if database_path.exists() {
        fs::remove_file(database_path).map_err(|error| error.to_string())?;
    }
    if rollback_path.exists() {
        fs::rename(rollback_path, database_path).map_err(|error| error.to_string())?;
    }
    for (current_sidecar, rollback_sidecar) in moved_sidecars {
        if rollback_sidecar.exists() {
            if current_sidecar.exists() {
                fs::remove_file(current_sidecar).map_err(|error| error.to_string())?;
            }
            fs::rename(rollback_sidecar, current_sidecar).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

async fn restore_encrypted_backup(
    app: &AppHandle,
    input: RestoreBackupInput,
) -> Result<String, String> {
    retry_backup_credentials_on_explicit_action()?;
    validate_backup_password(&input.new_password)?;
    if input.unlock_secret.trim().is_empty() {
        return Err("Ingresa la contraseña o clave de recuperación del respaldo".into());
    }
    let backup_path = PathBuf::from(&input.backup_path);
    if backup_path
        .extension()
        .is_none_or(|extension| extension != "hsbak")
    {
        return Err("Selecciona un archivo de respaldo .hsbak".into());
    }
    let metadata = fs::metadata(&backup_path)
        .map_err(|error| format!("No se pudo acceder al archivo de respaldo: {error}"))?;
    if !metadata.is_file() {
        return Err("La ruta seleccionada no es un archivo".into());
    }
    if metadata.len() > 1024 * 1024 * 1024 {
        return Err("El respaldo supera el límite de tamaño de 1 GiB".into());
    }
    let archive = fs::read(&backup_path)
        .map_err(|error| format!("No se pudo leer el archivo de respaldo: {error}"))?;
    let (database_bytes, master) = decrypt_backup_archive(&archive, input.unlock_secret.trim())?;
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
    let restore_path = config_dir.join(format!("restore-{}.db", uuid::Uuid::new_v4()));
    if let Err(error) = fs::write(&restore_path, database_bytes) {
        let _ = fs::remove_file(&restore_path);
        return Err(error.to_string());
    }
    if let Err(error) = validate_restore_database(&restore_path).await {
        let _ = fs::remove_file(&restore_path);
        return Err(error);
    }
    let previous_credentials = match read_stored_backup_credentials(app) {
        Ok(credentials) => credentials,
        Err(error) => {
            let _ = fs::remove_file(&restore_path);
            return Err(error);
        }
    };
    if previous_credentials.is_some() {
        // Preserve the current database as an encrypted automatic restore point before replacing it.
        if let Err(error) = write_auto_backup(app, true).await {
            let _ = fs::remove_file(&restore_path);
            return Err(error);
        }
    }
    let recovery_code = recovery_code_from_random();

    let database_path = config_dir.join("handyman.db");
    let rollback_path =
        config_dir.join(format!("handyman-pre-restore-{}.db", uuid::Uuid::new_v4()));
    let mut moved_sidecars = Vec::new();
    if database_path.exists() {
        if let Err(error) = fs::rename(&database_path, &rollback_path) {
            let _ = fs::remove_file(&restore_path);
            return Err(error.to_string());
        }
    }
    for suffix in ["-wal", "-shm"] {
        let sidecar = database_sidecar(&database_path, suffix);
        if sidecar.exists() {
            let rollback_sidecar = database_sidecar(&rollback_path, suffix);
            if let Err(error) = fs::rename(&sidecar, &rollback_sidecar) {
                let _ =
                    rollback_database_replacement(&database_path, &rollback_path, &moved_sidecars);
                let _ = fs::remove_file(&restore_path);
                return Err(error.to_string());
            }
            moved_sidecars.push((sidecar, rollback_sidecar));
        }
    }
    if let Err(error) = fs::rename(&restore_path, &database_path) {
        let _ = rollback_database_replacement(&database_path, &rollback_path, &moved_sidecars);
        let _ = fs::remove_file(&restore_path);
        return Err(error.to_string());
    }
    if let Err(error) = save_backup_credentials(&input.new_password, &recovery_code, &master) {
        let _ = rollback_database_replacement(&database_path, &rollback_path, &moved_sidecars);
        let credential_restore = if let Some(previous) = previous_credentials {
            let restored = write_stored_backup_credentials(&previous)
                .and_then(|()| cache_backup_credentials(previous));
            if restored.is_err() {
                delete_backup_secret(BACKUP_CREDENTIALS_ACCOUNT);
                let _ = cache_backup_credentials_missing();
            }
            restored
        } else {
            delete_backup_secret(BACKUP_CREDENTIALS_ACCOUNT);
            cache_backup_credentials_missing()
        };
        return Err(match credential_restore {
            Ok(()) => error,
            Err(restore_error) => format!(
                "{error}. Además, no se pudieron restaurar las credenciales anteriores del Llavero: {restore_error}"
            ),
        });
    }
    // The marker is an optimization only; if writing it fails, discard the stale
    // marker so the next status check can re-derive configuration from Keychain.
    if write_backup_configuration_marker(app, true).is_err() {
        if let Ok(marker) = backup_configuration_marker(app) {
            let _ = fs::remove_file(marker);
        }
    }
    if rollback_path.exists() {
        let _ = fs::remove_file(rollback_path);
    }
    for (_, rollback_sidecar) in moved_sidecars {
        if rollback_sidecar.exists() {
            let _ = fs::remove_file(rollback_sidecar);
        }
    }
    Ok(recovery_code)
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

    let new_client_id = optional_text(input.new_client_id);
    let old_assignment: Option<(String, String, String)> = sqlx::query_as(
        "SELECT client_id, relationship_type, valid_from FROM property_client_history
         WHERE property_id = ? AND workspace_id = ? AND valid_to IS NULL LIMIT 1",
    )
    .bind(&input.property_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    let reassignment = if let Some(new_client_id) = new_client_id.as_deref() {
        let new_client_type: Option<String> =
            sqlx::query_scalar("SELECT type FROM clients WHERE id = ? AND workspace_id = ?")
                .bind(new_client_id)
                .bind(WORKSPACE_ID)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?;
        let new_client_type = new_client_type
            .ok_or_else(|| "El nuevo cliente no existe en este negocio".to_string())?;
        let changes_assignment = old_assignment
            .as_ref()
            .is_none_or(|(old_client_id, _, _)| old_client_id != new_client_id);
        changes_assignment.then_some((new_client_id.to_owned(), new_client_type))
    } else {
        None
    };
    let new_assignment_for_audit = reassignment
        .as_ref()
        .map(|(client_id, relationship_type)| (client_id, relationship_type))
        .or_else(|| {
            old_assignment
                .as_ref()
                .map(|(client_id, relationship_type, _)| (client_id, relationship_type))
        });

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
        || changed_country
        || reassignment.is_some())
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
        "clientId": old_assignment.as_ref().map(|assignment| &assignment.0),
        "relationshipType": old_assignment.as_ref().map(|assignment| &assignment.1),
    });
    let new_json = serde_json::json!({
        "addressLine1": new_line1,
        "addressLine2": new_line2,
        "city": new_city,
        "subdivision": new_subdivision,
        "postalCode": new_postal_code,
        "countryCode": new_country_code,
        "clientId": new_assignment_for_audit.map(|assignment| assignment.0),
        "relationshipType": new_assignment_for_audit.map(|assignment| assignment.1),
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

    if let Some((new_client_id, new_client_type)) = reassignment {
        let now: String = sqlx::query_scalar("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
            .fetch_one(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
        let reassigned_at = if let Some((_, _, old_valid_from)) = old_assignment.as_ref() {
            if now > *old_valid_from {
                now
            } else {
                sqlx::query_scalar::<_, String>(
                    "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+0.001 seconds')",
                )
                .bind(old_valid_from)
                .fetch_one(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?
            }
        } else {
            now
        };
        sqlx::query(
            "UPDATE property_client_history SET valid_to = ?
             WHERE property_id = ? AND workspace_id = ? AND valid_to IS NULL",
        )
        .bind(&reassigned_at)
        .bind(&input.property_id)
        .bind(WORKSPACE_ID)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        let relationship_type = if new_client_type == "property_manager" {
            "manager"
        } else {
            "owner"
        };
        sqlx::query(
            "INSERT INTO property_client_history (id, workspace_id, property_id, client_id, relationship_type, valid_from)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(WORKSPACE_ID)
        .bind(&input.property_id)
        .bind(new_client_id)
        .bind(relationship_type)
        .bind(&reassigned_at)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
    }

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

async fn persist_estimate(pool: &SqlitePool, input: CreateEstimateInput) -> Result<String, String> {
    if !matches!(input.billing_mode.as_str(), "fixed" | "time_materials") {
        return Err("Modalidad de cobro inválida".into());
    }
    let items = if let Some(order_id) = input.order_id.as_deref() {
        if input.items.is_empty() {
            let stored_items: Vec<String> = sqlx::query_scalar(
                "SELECT description FROM work_order_items WHERE work_order_id = ? AND workspace_id = ? ORDER BY position",
            )
            .bind(order_id)
            .bind(WORKSPACE_ID)
            .fetch_all(pool)
            .await
            .map_err(|error| error.to_string())?;
            normalize_work_items(stored_items, Some(input.description.clone()))?
        } else {
            normalize_work_items(input.items.clone(), Some(input.description.clone()))?
        }
    } else {
        normalize_work_items(input.items.clone(), Some(input.description.clone()))?
    };
    let description = items.join("\n");
    let pricing_complete = input.amount_minor.is_some();
    if !pricing_complete && input.discount_value != 0 {
        return Err("No ingreses un descuento hasta definir el importe del presupuesto".into());
    }
    if input.currency_code.trim().is_empty() {
        return Err(
            "Configura la moneda principal del negocio antes de crear un presupuesto".into(),
        );
    }
    let (amount_minor, discount_minor, total_minor) = if let Some(amount_minor) = input.amount_minor
    {
        let (discount_minor, total_minor) =
            calculate_estimate_amounts(amount_minor, &input.discount_kind, input.discount_value)?;
        (amount_minor, discount_minor, total_minor)
    } else {
        (0, 0, 0)
    };
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
        Option<String>,
        String,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
    ) = if let Some(order_id) = input.order_id.as_deref() {
        sqlx::query_as(
            "SELECT w.client_id, w.property_id, w.client_type, w.recipient_name, w.contact_name,
                    w.contact_phone, w.tenant_name, w.tenant_phone, w.address_line1, w.address_line2,
                    w.city, w.subdivision, w.postal_code
             FROM work_orders w WHERE w.id = ? AND w.workspace_id = ?",
        )
        .bind(order_id)
        .bind(WORKSPACE_ID)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No se encontró la orden para crear el presupuesto".to_string())?
    } else {
        let client_type = input.client_type.as_deref().unwrap_or("direct");
        if !matches!(client_type, "direct" | "property_manager") {
            return Err("Tipo de cliente inválido".into());
        }
        let recipient_name = optional_text(input.recipient_name)
            .ok_or_else(|| "El nombre del cliente o administradora es obligatorio".to_string())?;
        let contact_name = optional_text(input.contact_name)
            .ok_or_else(|| "El nombre del contacto es obligatorio".to_string())?;
        let contact_phone = optional_text(input.contact_phone)
            .ok_or_else(|| "El teléfono del contacto es obligatorio".to_string())?;
        let address_line1 = optional_text(input.address_line1)
            .ok_or_else(|| "La dirección del trabajo es obligatoria".to_string())?;
        let city =
            optional_text(input.city).ok_or_else(|| "La ciudad es obligatoria".to_string())?;
        if let Some(client_id) = input.client_id.as_deref() {
            let stored_type: Option<String> =
                sqlx::query_scalar("SELECT type FROM clients WHERE id = ? AND workspace_id = ?")
                    .bind(client_id)
                    .bind(WORKSPACE_ID)
                    .fetch_optional(&mut *transaction)
                    .await
                    .map_err(|error| error.to_string())?;
            if stored_type.as_deref() != Some(client_type) {
                return Err(
                    "El cliente seleccionado no existe o no coincide con el tipo elegido".into(),
                );
            }
        }
        if let Some(property_id) = input.property_id.as_deref() {
            let exists: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM properties WHERE id = ? AND workspace_id = ?",
            )
            .bind(property_id)
            .bind(WORKSPACE_ID)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
            if exists == 0 {
                return Err("La propiedad seleccionada no existe en este negocio".into());
            }
        }
        (
            input.client_id,
            input.property_id,
            client_type.to_owned(),
            recipient_name,
            contact_name,
            contact_phone,
            optional_text(input.tenant_name),
            optional_text(input.tenant_phone),
            address_line1,
            optional_text(input.address_line2),
            city,
            optional_text(input.subdivision),
            optional_text(input.postal_code),
        )
    };

    let estimate_id = uuid::Uuid::new_v4().to_string();
    let version_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO estimates (id, workspace_id, work_order_id, client_id, property_id, client_type, tenant_name, tenant_phone, current_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&estimate_id)
    .bind(WORKSPACE_ID)
    .bind(&input.order_id)
    .bind(&order.0)
    .bind(&order.1)
    .bind(&order.2)
    .bind(&order.6)
    .bind(&order.7)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;

    sqlx::query(
        "INSERT INTO estimate_versions
         (id, workspace_id, estimate_id, version_number, status, pricing_complete, billing_mode, description,
          amount_minor, discount_kind, discount_value, discount_minor, total_minor, currency_code,
          recipient_name, contact_name, contact_phone, address_line1, address_line2, city, subdivision, postal_code, created_at)
         VALUES (?, ?, ?, 1, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&version_id)
    .bind(WORKSPACE_ID)
    .bind(&estimate_id)
    .bind(i64::from(pricing_complete))
    .bind(&input.billing_mode)
    .bind(&description)
    .bind(amount_minor)
    .bind(&input.discount_kind)
    .bind(input.discount_value)
    .bind(discount_minor)
    .bind(total_minor)
    .bind(&input.currency_code)
    .bind(&order.3)
    .bind(&order.4)
    .bind(&order.5)
    .bind(&order.8)
    .bind(&order.9)
    .bind(&order.10)
    .bind(&order.11)
    .bind(&order.12)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;

    replace_estimate_version_items(&mut transaction, &version_id, &items).await?;

    if let Some(order_id) = input.order_id.as_deref() {
        sqlx::query("UPDATE work_orders SET estimate_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ? AND estimate_id IS NULL")
            .bind(&estimate_id)
            .bind(order_id)
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
    if !matches!(input.billing_mode.as_str(), "fixed" | "time_materials") {
        return Err("Modalidad de cobro inválida".into());
    }
    let pricing_complete = input.amount_minor.is_some();
    if !pricing_complete && input.discount_value != 0 {
        return Err("No ingreses un descuento hasta definir el importe del presupuesto".into());
    }
    let (amount_minor, discount_minor, total_minor) = if let Some(amount) = input.amount_minor {
        let (discount, total) =
            calculate_estimate_amounts(amount, &input.discount_kind, input.discount_value)?;
        (amount, discount, total)
    } else {
        (0, 0, 0)
    };
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

    let version_id = uuid::Uuid::new_v4().to_string();
    let items = normalize_work_items(
        input.items.clone().unwrap_or_default(),
        Some(input.description.clone()),
    )?;
    let description = items.join("\n");
    sqlx::query(
        "INSERT INTO estimate_versions
         (id, workspace_id, estimate_id, version_number, status, pricing_complete, billing_mode, description,
          amount_minor, discount_kind, discount_value, discount_minor, total_minor, currency_code,
          recipient_name, contact_name, contact_phone, address_line1, address_line2, city, subdivision, postal_code, created_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&version_id)
    .bind(WORKSPACE_ID)
    .bind(&input.estimate_id)
    .bind(next_version)
    .bind(i64::from(pricing_complete))
    .bind(&input.billing_mode)
    .bind(&description)
    .bind(amount_minor)
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
    replace_estimate_version_items(&mut transaction, &version_id, &items).await?;
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
    let pricing_complete: i64 = sqlx::query_scalar(
        "SELECT pricing_complete FROM estimate_versions WHERE estimate_id = ? AND version_number = ? AND workspace_id = ?",
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
    if matches!(input.status.as_str(), "sent" | "accepted") && pricing_complete != 1 {
        return Err("Ingresa el importe del presupuesto antes de enviarlo o aprobarlo".into());
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
        let snapshot: EstimateToOrderSnapshot = sqlx::query_as(
            "SELECT e.client_id, e.property_id, e.client_type, e.tenant_name, e.tenant_phone,
                    v.id AS version_id, v.recipient_name, v.contact_name, v.contact_phone,
                    v.address_line1, v.address_line2, v.city, v.subdivision, v.postal_code,
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
        let generated_order_id = uuid::Uuid::new_v4().to_string();
        let order_status = match input.status.as_str() {
            "sent" => "pending_approval",
            "accepted" => "accepted",
            "cancelled" => "cancelled",
            _ => unreachable!(),
        };
        let agreed_amount = if input.status == "accepted" {
            snapshot.total_minor
        } else {
            0
        };
        sqlx::query(
            "INSERT INTO work_orders
             (id, workspace_id, estimate_id, estimate_version_id, client_id, property_id, client_type,
              recipient_name, contact_name, contact_phone, tenant_name, tenant_phone, address_line1,
              address_line2, city, subdivision, postal_code, description, billing_mode, agreed_amount_minor, price_confirmed,
              currency_code, status, priority, cancelled_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'normal',
                     CASE WHEN ? = 'cancelled' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END,
                     strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(&generated_order_id)
        .bind(WORKSPACE_ID)
        .bind(&input.estimate_id)
        .bind(&snapshot.version_id)
        .bind(&snapshot.client_id)
        .bind(&snapshot.property_id)
        .bind(&snapshot.client_type)
        .bind(&snapshot.recipient_name)
        .bind(&snapshot.contact_name)
        .bind(&snapshot.contact_phone)
        .bind(&snapshot.tenant_name)
        .bind(&snapshot.tenant_phone)
        .bind(&snapshot.address_line1)
        .bind(&snapshot.address_line2)
        .bind(&snapshot.city)
        .bind(&snapshot.subdivision)
        .bind(&snapshot.postal_code)
        .bind(&snapshot.description)
        .bind(&snapshot.billing_mode)
        .bind(agreed_amount)
        .bind(i64::from(input.status == "accepted"))
        .bind(&snapshot.currency_code)
        .bind(order_status)
        .bind(&input.status)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        sqlx::query("INSERT INTO work_order_items (id, workspace_id, work_order_id, position, description, created_at) SELECT lower(hex(randomblob(16))), workspace_id, ?, position, description, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM estimate_version_items WHERE estimate_version_id = ? AND workspace_id = ? ORDER BY position")
            .bind(&generated_order_id)
            .bind(&snapshot.version_id)
            .bind(WORKSPACE_ID)
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
                sqlx::query("UPDATE work_orders SET status = 'accepted', agreed_amount_minor = ?, price_confirmed = 1, estimate_id = ?, estimate_version_id = (SELECT id FROM estimate_versions WHERE estimate_id = ? AND version_number = ?), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ? AND status IN ('pending', 'pending_approval')")
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
    let items = normalize_work_items(input.items, input.description.clone())?;
    let description_summary = items.join("\n");
    for value in [
        &input.contact_name,
        &input.contact_phone,
        &input.address_line1,
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
        price_confirmed,
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
        let description = description_summary.trim();
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
        let price_confirmed = input
            .price_confirmed
            .unwrap_or(input.amount_minor.is_some() && amount_minor > 0);
        if price_confirmed && (input.amount_minor.is_none() || amount_minor <= 0) {
            return Err("Confirma un importe mayor que cero antes de guardar".into());
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
            price_confirmed,
            currency_code.to_owned(),
        )
    };

    let order_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO work_orders
         (id, workspace_id, client_id, property_id, client_type,
          recipient_name, contact_name, contact_phone, tenant_name, tenant_phone, address_line1, address_line2,
           city, subdivision, postal_code, description, billing_mode, agreed_amount_minor, price_confirmed, currency_code, status,
           priority, access_instructions, lockbox_code, gate_code, scheduled_at, scheduled_end_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
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
    .bind(i64::from(price_confirmed))
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
    replace_work_order_items(&mut transaction, &order_id, &items).await?;
    replace_work_order_assignments(&mut transaction, &order_id, &input.employee_ids).await?;
    persist_work_order_task_drafts(&mut transaction, &order_id, &input.task_drafts).await?;
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
    ] {
        if value.as_deref().is_some_and(|text| text.trim().is_empty()) {
            return Err("Nombre, teléfono, dirección y descripción son obligatorios".into());
        }
    }
    let scheduled_at = optional_text(input.scheduled_at);
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let (current_status, current_schedule, current_end, estimate_id, estimate_status, current_amount, current_price_confirmed): (
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        i64,
        i64,
    ) = sqlx::query_as(
        "SELECT w.status, w.scheduled_at, w.scheduled_end_at, e.id, v.status, w.agreed_amount_minor, w.price_confirmed
         FROM work_orders w
         LEFT JOIN estimates e ON e.id = w.estimate_id AND e.workspace_id = w.workspace_id
         LEFT JOIN estimate_versions v ON v.estimate_id = e.id AND v.version_number = e.current_version
         WHERE w.id = ? AND w.workspace_id = ?",
    )
    .bind(&input.work_order_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "No se encontró la orden de trabajo".to_string())?;

    let current_items: Vec<String> = sqlx::query_scalar(
        "SELECT description FROM work_order_items WHERE work_order_id = ? AND workspace_id = ? ORDER BY position",
    )
    .bind(&input.work_order_id)
    .bind(WORKSPACE_ID)
    .fetch_all(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    let updated_items = if let Some(items) = input.items.clone() {
        Some(normalize_work_items(items, input.description.clone())?)
    } else if input.description.is_some() {
        Some(normalize_work_items(Vec::new(), input.description.clone())?)
    } else {
        None
    };
    if estimate_id.is_some()
        && updated_items
            .as_ref()
            .is_some_and(|items| *items != current_items)
    {
        return Err("Para cambiar los trabajos de una orden con presupuesto, crea una nueva versión del presupuesto".into());
    }
    let updated_description = updated_items.as_ref().map(|items| items.join("\n"));
    if input.amount_minor.is_some_and(|amount| amount < 0) {
        return Err("El importe no puede ser negativo".into());
    }
    let next_price_confirmed = input
        .price_confirmed
        .unwrap_or(current_price_confirmed != 0);
    let effective_amount = input.amount_minor.unwrap_or(current_amount);
    if next_price_confirmed
        && effective_amount <= 0
        && estimate_status.as_deref() != Some("accepted")
    {
        return Err("Confirma un importe mayor que cero antes de guardar".into());
    }
    if input.status == "completed"
        && estimate_status.as_deref() != Some("accepted")
        && (!next_price_confirmed || effective_amount <= 0)
    {
        return Err("Ingresa y confirma el importe del trabajo antes de finalizar la orden".into());
    }
    let cancellation_reason = optional_text(input.cancellation_reason.clone());
    if cancellation_reason
        .as_ref()
        .is_some_and(|reason| reason.chars().count() > 500)
    {
        return Err("El motivo de cancelación no puede superar 500 caracteres".into());
    }
    if input.status == "cancelled" && current_status != "cancelled" {
        if input.confirm_cancellation != Some(true) {
            return Err("Confirma explícitamente la cancelación de la orden".into());
        }
        if cancellation_reason.is_none() {
            return Err("Ingresa el motivo de cancelación de la orden".into());
        }
    }
    let cancellation_reason = optional_text(input.cancellation_reason.clone());
    if cancellation_reason
        .as_ref()
        .is_some_and(|reason| reason.chars().count() > 500)
    {
        return Err("El motivo de cancelación no puede superar 500 caracteres".into());
    }
    if input.status == "cancelled" && current_status != "cancelled" {
        if input.confirm_cancellation != Some(true) {
            return Err("Confirma explícitamente la cancelación de la orden".into());
        }
        if cancellation_reason.is_none() {
            return Err("Ingresa el motivo de cancelación de la orden".into());
        }
    }

    let same_status = current_status == input.status;
    if !same_status
        && matches!(input.status.as_str(), "scheduled" | "completed")
        && estimate_id.is_some()
        && estimate_status.as_deref() != Some("accepted")
    {
        return Err(
            "El presupuesto asociado debe aprobarse antes de programar o finalizar la orden".into(),
        );
    }
    let allowed = same_status
        || match current_status.as_str() {
            "pending" | "accepted" => matches!(
                input.status.as_str(),
                "scheduled" | "completed" | "cancelled"
            ),
            "pending_approval" => input.status == "cancelled",
            "scheduled" => matches!(
                input.status.as_str(),
                "in_progress" | "completed" | "cancelled"
            ),
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
    let completion_items: Option<Vec<String>> = if input.status == "completed" {
        input.completed_items.map(|items| {
            items
                .into_iter()
                .map(|item| item.trim().to_owned())
                .filter(|item| !item.is_empty())
                .collect()
        })
    } else {
        None
    };

    sqlx::query(
        "UPDATE work_orders
         SET status = ?, priority = ?, scheduled_at = ?, scheduled_end_at = ?, access_instructions = ?, lockbox_code = ?, gate_code = ?,
             client_type = COALESCE(?, client_type), recipient_name = COALESCE(?, recipient_name),
             contact_name = COALESCE(?, contact_name), contact_phone = COALESCE(?, contact_phone),
             tenant_name = COALESCE(?, tenant_name), tenant_phone = COALESCE(?, tenant_phone),
             address_line1 = COALESCE(?, address_line1), address_line2 = COALESCE(?, address_line2),
             city = COALESCE(?, city), description = COALESCE(?, description),
              agreed_amount_minor = COALESCE(?, agreed_amount_minor), price_confirmed = COALESCE(?, price_confirmed),
              started_at = CASE WHEN ? = 'in_progress' AND started_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE started_at END,
             completed_at = CASE WHEN ? = 'completed' AND completed_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE completed_at END,
              cancelled_at = CASE WHEN ? = 'cancelled' AND cancelled_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE cancelled_at END,
              cancellation_reason = COALESCE(?, cancellation_reason),
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
    .bind(updated_description)
    .bind(input.amount_minor)
    .bind(input.price_confirmed.map(i64::from))
    .bind(&input.status)
    .bind(&input.status)
    .bind(&input.status)
    .bind(cancellation_reason)
    .bind(&input.work_order_id)
    .bind(WORKSPACE_ID)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    if let Some(items) = updated_items {
        replace_work_order_items(&mut transaction, &input.work_order_id, &items).await?;
    }
    if let Some(employee_ids) = input.employee_ids.as_ref() {
        replace_work_order_assignments(&mut transaction, &input.work_order_id, employee_ids)
            .await?;
    }
    if let Some(tasks) = input.task_drafts.as_ref() {
        persist_work_order_task_drafts(&mut transaction, &input.work_order_id, tasks).await?;
    }
    if let Some(completion_items) = completion_items {
        sqlx::query(
            "DELETE FROM work_order_completion_items WHERE workspace_id = ? AND work_order_id = ?",
        )
        .bind(WORKSPACE_ID)
        .bind(&input.work_order_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        for (index, description) in completion_items.iter().enumerate() {
            sqlx::query("INSERT INTO work_order_completion_items (id, workspace_id, work_order_id, position, description, created_at) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
                .bind(uuid::Uuid::new_v4().to_string())
                .bind(WORKSPACE_ID)
                .bind(&input.work_order_id)
                .bind((index + 1) as i64)
                .bind(description)
                .execute(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?;
        }
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn persist_work_time_entry(
    pool: &SqlitePool,
    input: CreateWorkTimeEntryInput,
) -> Result<String, String> {
    let note = optional_text(input.note);
    if note
        .as_ref()
        .is_some_and(|value| value.chars().count() > 500)
    {
        return Err("La nota no puede superar 500 caracteres".into());
    }
    if !input.work_occurred_at.ends_with('Z') {
        return Err("La fecha del registro debe estar expresada en UTC".into());
    }
    let valid_occurred_at: i64 =
        sqlx::query_scalar("SELECT CASE WHEN julianday(?) IS NOT NULL THEN 1 ELSE 0 END")
            .bind(&input.work_occurred_at)
            .fetch_one(pool)
            .await
            .map_err(|error| error.to_string())?;
    if valid_occurred_at != 1 {
        return Err("Ingresa una fecha válida".into());
    }
    let (started_at, ended_at, duration_minutes, amount_minor): (
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<i64>,
    ) = match input.entry_type.as_str() {
        "hourly" => {
            let start = input
                .started_at
                .filter(|value| value.ends_with('Z'))
                .ok_or_else(|| "Ingresa una hora de inicio UTC válida".to_string())?;
            let end = input
                .ended_at
                .filter(|value| value.ends_with('Z'))
                .ok_or_else(|| "Ingresa una hora de fin UTC válida".to_string())?;
            if start != input.work_occurred_at || input.amount_minor.is_some() {
                return Err("Datos incompatibles para un registro por hora".into());
            }
            let duration: Option<i64> = sqlx::query_scalar(
                "SELECT CASE WHEN julianday(?) IS NOT NULL AND julianday(?) IS NOT NULL
                                 THEN CAST(ROUND((julianday(?) - julianday(?)) * 1440) AS INTEGER)
                                 ELSE NULL END",
            )
            .bind(&end)
            .bind(&start)
            .bind(&end)
            .bind(&start)
            .fetch_one(pool)
            .await
            .map_err(|error| error.to_string())?;
            let duration = duration
                .filter(|minutes| (1..=1440).contains(minutes))
                .ok_or_else(|| {
                    "El fin debe ser posterior al inicio y el turno no puede superar 24 horas"
                        .to_string()
                })?;
            (Some(start), Some(end), Some(duration), None)
        }
        "per_job" => {
            if input.started_at.is_some() || input.ended_at.is_some() {
                return Err("El registro por trabajo no debe incluir horas de inicio/fin".into());
            }
            let amount = input
                .amount_minor
                .filter(|value| *value > 0)
                .ok_or_else(|| "Ingresa un costo mayor que cero para el trabajo".to_string())?;
            (None, None, None, Some(amount))
        }
        _ => return Err("Tipo de registro de tiempo inválido".into()),
    };

    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let order_exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM work_orders WHERE id = ? AND workspace_id = ?")
            .bind(&input.work_order_id)
            .bind(WORKSPACE_ID)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    if order_exists != 1 {
        return Err("No se encontró la orden de trabajo en este negocio".into());
    }
    let employee_exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM employees WHERE id = ? AND workspace_id = ?")
            .bind(&input.employee_id)
            .bind(WORKSPACE_ID)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    if employee_exists != 1 {
        return Err("No se encontró el empleado en este negocio".into());
    }
    let currency_code = if input.entry_type == "per_job" {
        let workspace_currency: Option<String> =
            sqlx::query_scalar("SELECT currency_code FROM workspaces WHERE id = ?")
                .bind(WORKSPACE_ID)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?
                .flatten();
        Some(workspace_currency.ok_or_else(|| {
            "Configura la moneda principal del negocio antes de registrar el costo".to_string()
        })?)
    } else {
        None
    };
    if input.entry_type == "hourly" {
        let overlaps: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM work_time_entries
             WHERE workspace_id = ? AND employee_id = ? AND entry_type = 'hourly'
               AND julianday(started_at) < julianday(?) AND julianday(ended_at) > julianday(?)",
        )
        .bind(WORKSPACE_ID)
        .bind(&input.employee_id)
        .bind(ended_at.as_deref())
        .bind(started_at.as_deref())
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        if overlaps > 0 {
            return Err(
                "Este horario se traslapa con otro registro por hora de este empleado".into(),
            );
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO work_time_entries
         (id, workspace_id, work_order_id, employee_id, entry_type, started_at, ended_at, work_occurred_at,
          duration_minutes, amount_minor, currency_code, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&id)
    .bind(WORKSPACE_ID)
    .bind(&input.work_order_id)
    .bind(&input.employee_id)
    .bind(&input.entry_type)
    .bind(started_at)
    .bind(ended_at)
    .bind(&input.work_occurred_at)
    .bind(duration_minutes)
    .bind(amount_minor)
    .bind(currency_code)
    .bind(note)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(id)
}

async fn persist_follow_up_task(
    pool: &SqlitePool,
    input: SaveFollowUpTaskInput,
) -> Result<(), String> {
    if !matches!(
        input.task_type.as_str(),
        "estimate_follow_up" | "appointment_confirmation" | "invoice_payment_follow_up"
    ) {
        return Err("Tipo de seguimiento inválido".into());
    }
    if !matches!(input.status.as_str(), "open" | "completed" | "dismissed") {
        return Err("Estado de seguimiento inválido".into());
    }
    if !input.due_at.ends_with('Z') {
        return Err("El vencimiento debe estar expresado en UTC".into());
    }
    let valid_due: i64 =
        sqlx::query_scalar("SELECT CASE WHEN julianday(?) IS NOT NULL THEN 1 ELSE 0 END")
            .bind(&input.due_at)
            .fetch_one(pool)
            .await
            .map_err(|error| error.to_string())?;
    if valid_due != 1 {
        return Err("Ingresa una fecha de vencimiento válida".into());
    }

    let entity_exists: i64 = match input.task_type.as_str() {
        "estimate_follow_up" => sqlx::query_scalar(
            "SELECT COUNT(*) FROM estimates e
             JOIN estimate_versions v ON v.estimate_id = e.id AND v.version_number = e.current_version AND v.workspace_id = e.workspace_id
             WHERE e.id = ? AND e.workspace_id = ? AND v.status = 'sent' AND v.sent_at IS NOT NULL",
        )
        .bind(&input.entity_id)
        .bind(WORKSPACE_ID)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?,
        "appointment_confirmation" => sqlx::query_scalar(
            "SELECT COUNT(*) FROM work_orders WHERE id = ? AND workspace_id = ? AND status = 'scheduled' AND scheduled_at IS NOT NULL",
        )
        .bind(&input.entity_id)
        .bind(WORKSPACE_ID)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?,
        "invoice_payment_follow_up" => sqlx::query_scalar(
            "SELECT COUNT(*) FROM invoices i
             WHERE i.id = ? AND i.workspace_id = ? AND i.status = 'issued' AND i.sent_at IS NOT NULL
               AND i.total_minor - COALESCE((
                 SELECT SUM(a.amount_minor) FROM invoice_payment_allocations a
                 WHERE a.workspace_id = i.workspace_id AND a.invoice_id = i.id AND a.status = 'active'
               ), 0) > 0",
        )
        .bind(&input.entity_id)
        .bind(WORKSPACE_ID)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?,
        _ => 0,
    };
    if entity_exists != 1 {
        return Err(
            "El registro ya no requiere este seguimiento o no pertenece a este negocio".into(),
        );
    }

    sqlx::query(
        "INSERT INTO follow_up_task_overrides (id, workspace_id, task_type, entity_id, due_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(workspace_id, task_type, entity_id) DO UPDATE SET
           due_at = excluded.due_at, status = excluded.status, updated_at = excluded.updated_at",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(WORKSPACE_ID)
    .bind(&input.task_type)
    .bind(&input.entity_id)
    .bind(&input.due_at)
    .bind(&input.status)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

async fn persist_work_order_material(
    pool: &SqlitePool,
    input: CreateWorkOrderMaterialInput,
) -> Result<String, String> {
    let material_name = input.material_name.trim();
    if material_name.is_empty() || material_name.chars().count() > 150 {
        return Err("Ingresa el material (máximo 150 caracteres)".into());
    }
    if !input.quantity.is_finite() || input.quantity <= 0.0 {
        return Err("La cantidad utilizada debe ser mayor que cero".into());
    }
    if input.total_cost_minor < 0 || input.unit_price_minor < 0 {
        return Err("El costo y el precio unitario no pueden ser negativos".into());
    }
    let legacy_unit_cost = (input.total_cost_minor as f64 / input.quantity).round();
    if !legacy_unit_cost.is_finite() || legacy_unit_cost > i64::MAX as f64 {
        return Err("La cantidad o el costo exceden el límite permitido".into());
    }

    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let order_exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM work_orders WHERE id = ? AND workspace_id = ?")
            .bind(&input.work_order_id)
            .bind(WORKSPACE_ID)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    if order_exists != 1 {
        return Err("No se encontró la orden de trabajo en este negocio".into());
    }
    let currency_code: Option<String> =
        sqlx::query_scalar("SELECT currency_code FROM workspaces WHERE id = ?")
            .bind(WORKSPACE_ID)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?
            .flatten();
    let currency_code = currency_code.ok_or_else(|| {
        "Configura la moneda principal del negocio antes de registrar materiales".to_string()
    })?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO work_order_materials
         (id, workspace_id, work_order_id, material_name, usage_type, quantity, unit_label,
          leftover_quantity, unit_cost_minor, customer_unit_price_minor, currency_code,
          total_cost_minor, unit_price_minor, created_at)
         VALUES (?, ?, ?, ?, 'used', ?, 'unit', 0, ?, 0, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&id)
    .bind(WORKSPACE_ID)
    .bind(&input.work_order_id)
    .bind(material_name)
    .bind(input.quantity)
    .bind(legacy_unit_cost as i64)
    .bind(currency_code)
    .bind(input.total_cost_minor)
    .bind(input.unit_price_minor)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(id)
}

async fn persist_work_order_extra(
    pool: &SqlitePool,
    input: CreateWorkOrderExtraInput,
) -> Result<String, String> {
    let description = input.description.trim();
    let reason = input.reason.trim();
    if description.is_empty() || description.chars().count() > 500 {
        return Err("Describe el trabajo adicional (máximo 500 caracteres)".into());
    }
    if reason.is_empty() || reason.chars().count() > 500 {
        return Err("Ingresa el motivo del trabajo adicional (máximo 500 caracteres)".into());
    }
    if input.amount_minor <= 0 {
        return Err("El importe adicional debe ser mayor que cero".into());
    }
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let order: Option<(String, String)> = sqlx::query_as(
        "SELECT status, currency_code FROM work_orders WHERE id = ? AND workspace_id = ?",
    )
    .bind(&input.work_order_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    let Some((status, currency_code)) = order else {
        return Err("No se encontró la orden de trabajo en este negocio".into());
    };
    if status == "cancelled" {
        return Err("No se pueden agregar trabajos a una orden cancelada".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO work_order_extras (id, workspace_id, work_order_id, description, reason, amount_minor, currency_code, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_approval', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&id)
    .bind(WORKSPACE_ID)
    .bind(&input.work_order_id)
    .bind(description)
    .bind(reason)
    .bind(input.amount_minor)
    .bind(currency_code)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(id)
}

async fn persist_work_order_extra_review(
    pool: &SqlitePool,
    input: ReviewWorkOrderExtraInput,
) -> Result<(), String> {
    if !matches!(input.action.as_str(), "approve" | "cancel") {
        return Err("Acción de aprobación inválida".into());
    }
    let approval_method = optional_text(input.approval_method);
    let approval_note = optional_text(input.approval_note);
    if input.action == "approve"
        && !approval_method
            .as_deref()
            .is_some_and(|method| matches!(method, "verbal" | "message" | "written" | "other"))
    {
        return Err("Selecciona cómo aprobó el cliente el trabajo adicional".into());
    }
    if approval_note
        .as_ref()
        .is_some_and(|note| note.chars().count() > 500)
    {
        return Err("La nota de aprobación no puede superar 500 caracteres".into());
    }

    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let extra: Option<(String, String, i64, String)> = sqlx::query_as(
        "SELECT x.work_order_id, x.status, x.amount_minor, x.description
         FROM work_order_extras x WHERE x.id = ? AND x.workspace_id = ?",
    )
    .bind(&input.extra_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    let Some((work_order_id, current_status, amount_minor, description)) = extra else {
        return Err("No se encontró el trabajo adicional".into());
    };
    if current_status != "pending_approval" {
        return Err("Solo se puede revisar un trabajo adicional pendiente".into());
    }
    if input.action == "approve" {
        let issued_invoice: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM invoices WHERE workspace_id = ? AND work_order_id = ? AND status = 'issued'",
        )
        .bind(WORKSPACE_ID)
        .bind(&work_order_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        if issued_invoice > 0 {
            return Err(
                "Anula la factura emitida antes de aprobar y facturar un trabajo adicional".into(),
            );
        }
        let draft_invoice: Option<(String, i64, i64)> = sqlx::query_as(
            "SELECT id, subtotal_minor, total_minor FROM invoices WHERE workspace_id = ? AND work_order_id = ? AND status = 'draft'",
        )
        .bind(WORKSPACE_ID)
        .bind(&work_order_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        if let Some((invoice_id, subtotal, total)) = draft_invoice {
            let new_subtotal = subtotal
                .checked_add(amount_minor)
                .ok_or_else(|| "El subtotal excede el límite permitido".to_string())?;
            let new_total = total
                .checked_add(amount_minor)
                .ok_or_else(|| "El total excede el límite permitido".to_string())?;
            sqlx::query("UPDATE invoices SET subtotal_minor = ?, total_minor = ?, description = description || char(10) || ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ? AND status = 'draft'")
                .bind(new_subtotal)
                .bind(new_total)
                .bind(&description)
                .bind(invoice_id)
                .bind(WORKSPACE_ID)
                .execute(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?;
        }
        sqlx::query("UPDATE work_order_extras SET status = 'approved', approved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), approval_method = ?, approval_note = ? WHERE id = ? AND workspace_id = ? AND status = 'pending_approval'")
            .bind(approval_method)
            .bind(approval_note)
            .bind(&input.extra_id)
            .bind(WORKSPACE_ID)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    } else {
        sqlx::query("UPDATE work_order_extras SET status = 'cancelled', cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ? AND status = 'pending_approval'")
            .bind(&input.extra_id)
            .bind(WORKSPACE_ID)
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

async fn persist_expense(pool: &SqlitePool, input: CreateExpenseInput) -> Result<String, String> {
    let description = input.description.trim();
    let vendor = optional_text(input.vendor);
    let note = optional_text(input.note);
    let work_order_id = optional_text(input.work_order_id);
    if description.is_empty() || description.chars().count() > 150 {
        return Err("Ingresa el concepto del gasto (máximo 150 caracteres)".into());
    }
    if !matches!(
        input.category.as_str(),
        "fixed" | "recurring" | "variable" | "travel" | "toll" | "fuel" | "parts" | "other"
    ) {
        return Err("Selecciona una categoría de gasto válida".into());
    }
    if input.amount_minor <= 0 {
        return Err("El importe del gasto debe ser mayor que cero".into());
    }
    if vendor
        .as_ref()
        .is_some_and(|value| value.chars().count() > 150)
        || note
            .as_ref()
            .is_some_and(|value| value.chars().count() > 500)
    {
        return Err("El proveedor o la nota exceden el límite permitido".into());
    }
    if !input.occurred_at.ends_with('Z') {
        return Err("La fecha del gasto debe estar expresada en UTC".into());
    }
    let valid_date: i64 =
        sqlx::query_scalar("SELECT CASE WHEN julianday(?) IS NOT NULL THEN 1 ELSE 0 END")
            .bind(&input.occurred_at)
            .fetch_one(pool)
            .await
            .map_err(|error| error.to_string())?;
    if valid_date != 1 {
        return Err("Ingresa una fecha válida para el gasto".into());
    }

    let receipt = match (
        input.receipt_file_name,
        input.receipt_mime_type,
        input.receipt_size_bytes,
        input.receipt_data_url,
    ) {
        (None, None, None, None) => (None, None, None, None),
        (Some(file_name), Some(mime_type), Some(size), Some(data_url)) => {
            if file_name.trim().is_empty()
                || file_name.chars().count() > 255
                || file_name.contains('/')
                || file_name.contains('\\')
            {
                return Err("El nombre del comprobante no es válido".into());
            }
            if !matches!(
                mime_type.as_str(),
                "application/pdf" | "image/jpeg" | "image/png" | "image/webp"
            ) {
                return Err("El comprobante debe ser PDF, JPEG, PNG o WebP".into());
            }
            if !(1..=5 * 1024 * 1024).contains(&size) {
                return Err("El comprobante debe ocupar como máximo 5 MiB".into());
            }
            let prefix = format!("data:{mime_type};base64,");
            let payload = data_url.strip_prefix(&prefix).ok_or_else(|| {
                "El contenido del comprobante no coincide con su formato".to_string()
            })?;
            if payload.len() != 4 * ((size as usize + 2) / 3)
                || !payload
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/' | b'='))
            {
                return Err("No se pudo validar el contenido del comprobante".into());
            }
            (Some(file_name), Some(mime_type), Some(size), Some(data_url))
        }
        _ => return Err("Faltan datos del comprobante".into()),
    };

    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let currency_code: Option<String> =
        sqlx::query_scalar("SELECT currency_code FROM workspaces WHERE id = ?")
            .bind(WORKSPACE_ID)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?
            .flatten();
    let currency_code = currency_code.ok_or_else(|| {
        "Configura la moneda principal del negocio antes de registrar gastos".to_string()
    })?;
    if let Some(order_id) = work_order_id.as_deref() {
        let exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM work_orders WHERE id = ? AND workspace_id = ?",
        )
        .bind(order_id)
        .bind(WORKSPACE_ID)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        if exists != 1 {
            return Err("La orden seleccionada no existe en este negocio".into());
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO expenses
         (id, workspace_id, work_order_id, description, category, occurred_at, amount_minor,
          currency_code, vendor, note, receipt_file_name, receipt_mime_type, receipt_size_bytes, receipt_data_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&id)
    .bind(WORKSPACE_ID)
    .bind(work_order_id)
    .bind(description)
    .bind(&input.category)
    .bind(&input.occurred_at)
    .bind(input.amount_minor)
    .bind(currency_code)
    .bind(vendor)
    .bind(note)
    .bind(receipt.0)
    .bind(receipt.1)
    .bind(receipt.2)
    .bind(receipt.3)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(id)
}

async fn persist_employee_payment(
    pool: &SqlitePool,
    input: CreateEmployeePaymentInput,
) -> Result<String, String> {
    if input.amount_minor <= 0 {
        return Err("El importe del pago debe ser mayor que cero".into());
    }
    if !input.paid_at.ends_with('Z') {
        return Err("La fecha del pago debe estar expresada en UTC".into());
    }
    if optional_text(input.note.clone())
        .as_ref()
        .is_some_and(|note| note.chars().count() > 500)
    {
        return Err("La nota no puede superar 500 caracteres".into());
    }
    let valid_date: i64 =
        sqlx::query_scalar("SELECT CASE WHEN julianday(?) IS NOT NULL THEN 1 ELSE 0 END")
            .bind(&input.paid_at)
            .fetch_one(pool)
            .await
            .map_err(|error| error.to_string())?;
    if valid_date != 1 {
        return Err("Ingresa una fecha válida para el pago".into());
    }

    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let employee_exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM employees WHERE id = ? AND workspace_id = ?")
            .bind(&input.employee_id)
            .bind(WORKSPACE_ID)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    if employee_exists != 1 {
        return Err("No se encontró el empleado en este negocio".into());
    }

    let (work_order_id, currency_code) =
        if let Some(work_time_entry_id) = input.work_time_entry_id.as_deref() {
            let cost: Option<(String, String, i64, String)> = sqlx::query_as(
                "SELECT work_order_id, employee_id, amount_minor, currency_code
             FROM work_time_entries WHERE id = ? AND workspace_id = ? AND entry_type = 'per_job'",
            )
            .bind(work_time_entry_id)
            .bind(WORKSPACE_ID)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
            let (cost_order_id, cost_employee_id, cost_amount, cost_currency) =
                cost.ok_or_else(|| "No se encontró el costo por trabajo seleccionado".to_string())?;
            if cost_employee_id != input.employee_id {
                return Err("El costo seleccionado pertenece a otro empleado".into());
            }
            if input
                .work_order_id
                .as_deref()
                .is_some_and(|id| id != cost_order_id)
            {
                return Err("La orden no coincide con el costo por trabajo seleccionado".into());
            }
            let already_paid: i64 = sqlx::query_scalar(
                "SELECT COALESCE(SUM(amount_minor), 0) FROM employee_payments
             WHERE workspace_id = ? AND work_time_entry_id = ?",
            )
            .bind(WORKSPACE_ID)
            .bind(work_time_entry_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
            if already_paid.saturating_add(input.amount_minor) > cost_amount {
                return Err("El pago supera el saldo pendiente de este costo".into());
            }
            (Some(cost_order_id), cost_currency)
        } else {
            let currency: Option<String> =
                sqlx::query_scalar("SELECT currency_code FROM workspaces WHERE id = ?")
                    .bind(WORKSPACE_ID)
                    .fetch_optional(&mut *transaction)
                    .await
                    .map_err(|error| error.to_string())?
                    .flatten();
            let currency = currency.ok_or_else(|| {
                "Configura la moneda principal antes de registrar pagos al personal".to_string()
            })?;
            if let Some(order_id) = input.work_order_id.as_deref() {
                let exists: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM work_orders WHERE id = ? AND workspace_id = ?",
                )
                .bind(order_id)
                .bind(WORKSPACE_ID)
                .fetch_one(&mut *transaction)
                .await
                .map_err(|error| error.to_string())?;
                if exists != 1 {
                    return Err("La orden seleccionada no existe en este negocio".into());
                }
            }
            (input.work_order_id.clone(), currency)
        };

    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO employee_payments
         (id, workspace_id, employee_id, work_order_id, work_time_entry_id, paid_at,
          amount_minor, currency_code, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&id)
    .bind(WORKSPACE_ID)
    .bind(&input.employee_id)
    .bind(work_order_id)
    .bind(&input.work_time_entry_id)
    .bind(&input.paid_at)
    .bind(input.amount_minor)
    .bind(currency_code)
    .bind(optional_text(input.note))
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(id)
}

async fn persist_invoice_creation(
    pool: &SqlitePool,
    input: CreateInvoiceInput,
) -> Result<String, String> {
    let source: Option<(String, String, String, String, Option<String>, String, String, i64, i64, Option<String>, String, String, Option<String>)> = sqlx::query_as(
        "SELECT w.recipient_name, w.contact_name, w.contact_phone, w.address_line1, w.address_line2,
                w.city, COALESCE((SELECT group_concat(description, char(10)) FROM work_order_completion_items ci
                    WHERE ci.workspace_id = w.workspace_id AND ci.work_order_id = w.id), w.description),
                w.agreed_amount_minor + COALESCE((SELECT SUM(amount_minor) FROM work_order_extras x
                    WHERE x.workspace_id = w.workspace_id AND x.work_order_id = w.id AND x.status = 'approved'), 0),
                w.price_confirmed, v.status,
                COALESCE((SELECT group_concat(description, char(10)) FROM work_order_extras x
                 WHERE x.workspace_id = w.workspace_id AND x.work_order_id = w.id AND x.status = 'approved'), '')
                ,w.client_type,
                (SELECT c.email FROM clients c WHERE c.id = w.client_id AND c.workspace_id = w.workspace_id)
         FROM work_orders w
         LEFT JOIN estimates e ON e.id = w.estimate_id AND e.workspace_id = w.workspace_id
         LEFT JOIN estimate_versions v ON v.estimate_id = e.id AND v.version_number = e.current_version AND v.workspace_id = e.workspace_id
         WHERE w.id = ? AND w.workspace_id = ? AND w.status = 'completed'",
    )
    .bind(&input.work_order_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(pool)
    .await
    .map_err(|error| error.to_string())?;
    let Some((
        recipient,
        contact,
        phone,
        address,
        address2,
        city,
        description,
        subtotal,
        confirmed,
        estimate_status,
        approved_extra_descriptions,
        client_type,
        recipient_email,
    )) = source
    else {
        return Err("Solo se puede facturar una orden realizada de este negocio".into());
    };
    let description = if approved_extra_descriptions.is_empty() {
        description
    } else {
        format!("{description}\n\n{approved_extra_descriptions}")
    };
    if confirmed != 1 || subtotal <= 0 {
        return Err(
            "La orden necesita un importe acordado positivo y confirmado antes de facturar".into(),
        );
    }
    let has_estimate: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM work_orders WHERE id = ? AND workspace_id = ? AND estimate_id IS NOT NULL")
        .bind(&input.work_order_id)
        .bind(WORKSPACE_ID)
        .fetch_one(pool)
        .await
        .map_err(|error| error.to_string())?;
    if has_estimate == 1 && estimate_status.as_deref() != Some("accepted") {
        return Err("El presupuesto vigente debe estar aprobado antes de facturar".into());
    }
    let currency: Option<String> = sqlx::query_scalar(
        "SELECT currency_code FROM work_orders WHERE id = ? AND workspace_id = ?",
    )
    .bind(&input.work_order_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(pool)
    .await
    .map_err(|error| error.to_string())?
    .flatten();
    let currency = currency.ok_or_else(|| "La orden no tiene moneda registrada".to_string())?;
    let tax_rate_basis_points: i64 =
        sqlx::query_scalar("SELECT invoice_tax_rate_basis_points FROM workspaces WHERE id = ?")
            .bind(WORKSPACE_ID)
            .fetch_one(pool)
            .await
            .map_err(|error| error.to_string())?;
    if !(0..=10_000).contains(&tax_rate_basis_points) {
        return Err("El porcentaje de impuesto configurado no es válido".into());
    }
    let tax_minor = ((i128::from(subtotal) * i128::from(tax_rate_basis_points) + 5_000) / 10_000)
        .try_into()
        .map_err(|_| "El impuesto supera el importe máximo permitido".to_string())?;
    let total_minor = subtotal
        .checked_add(tax_minor)
        .ok_or_else(|| "El total de la factura supera el importe máximo permitido".to_string())?;
    let existing: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM invoices WHERE workspace_id = ? AND work_order_id = ? AND status IN ('draft', 'issued')",
    )
    .bind(WORKSPACE_ID)
    .bind(&input.work_order_id)
    .fetch_one(pool)
    .await
    .map_err(|error| error.to_string())?;
    if existing > 0 {
        return Err("La orden ya tiene una factura borrador o emitida".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let reference = format!(
        "INV-{}",
        id.replace('-', "")
            .chars()
            .take(8)
            .collect::<String>()
            .to_uppercase()
    );
    sqlx::query(
        "INSERT INTO invoices
         (id, workspace_id, work_order_id, reference_code, status, recipient_name, contact_name,
          contact_phone, address_line1, address_line2, city, description, subtotal_minor,
          tax_minor, total_minor, currency_code, tax_rate_basis_points, client_type, recipient_email, created_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(&id)
    .bind(WORKSPACE_ID)
    .bind(&input.work_order_id)
    .bind(&reference)
    .bind(recipient)
    .bind(contact)
    .bind(phone)
    .bind(address)
    .bind(address2)
    .bind(city)
    .bind(description)
    .bind(subtotal)
    .bind(tax_minor)
    .bind(total_minor)
    .bind(currency)
    .bind(tax_rate_basis_points)
    .bind(client_type)
    .bind(recipient_email)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    Ok(id)
}

async fn persist_invoice_issue(pool: &SqlitePool, invoice_id: &str) -> Result<(), String> {
    let updated = sqlx::query(
        "UPDATE invoices SET status = 'issued', issued_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND workspace_id = ? AND status = 'draft'",
    )
    .bind(invoice_id)
    .bind(WORKSPACE_ID)
    .execute(pool)
    .await
    .map_err(|error| error.to_string())?;
    if updated.rows_affected() != 1 {
        return Err("Solo se puede emitir una factura borrador".into());
    }
    Ok(())
}

async fn persist_invoice_void(pool: &SqlitePool, input: VoidInvoiceInput) -> Result<(), String> {
    let reason = input.reason.trim();
    if reason.is_empty() || reason.chars().count() > 500 {
        return Err("Ingresa el motivo de anulación (máximo 500 caracteres)".into());
    }
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let updated = sqlx::query(
        "UPDATE invoices SET status = 'voided', voided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             void_reason = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND workspace_id = ? AND status = 'issued'",
    )
    .bind(reason)
    .bind(&input.invoice_id)
    .bind(WORKSPACE_ID)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    if updated.rows_affected() != 1 {
        return Err("Solo se puede anular una factura emitida".into());
    }
    sqlx::query(
        "UPDATE invoice_payment_allocations SET status = 'reversed', reversed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             reversal_reason = ? WHERE workspace_id = ? AND invoice_id = ? AND status = 'active'",
    )
    .bind(format!("Factura anulada: {reason}"))
    .bind(WORKSPACE_ID)
    .bind(&input.invoice_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn persist_customer_payment(
    pool: &SqlitePool,
    input: CreateCustomerPaymentInput,
) -> Result<String, String> {
    if input.amount_minor <= 0
        || input.currency_code.len() != 3
        || !input.currency_code.bytes().all(|b| b.is_ascii_uppercase())
    {
        return Err("Ingresa un importe positivo y un código de moneda válido".into());
    }
    if !input.paid_at.ends_with('Z') {
        return Err("La fecha del cobro debe estar expresada en UTC".into());
    }
    if optional_text(input.note.clone())
        .as_ref()
        .is_some_and(|note| note.chars().count() > 500)
    {
        return Err("La nota no puede superar 500 caracteres".into());
    }
    let valid_date: i64 =
        sqlx::query_scalar("SELECT CASE WHEN julianday(?) IS NOT NULL THEN 1 ELSE 0 END")
            .bind(&input.paid_at)
            .fetch_one(pool)
            .await
            .map_err(|error| error.to_string())?;
    if valid_date != 1 {
        return Err("Ingresa una fecha válida para el cobro".into());
    }
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let allocation_total = input
        .allocations
        .iter()
        .try_fold(0_i64, |sum, allocation| {
            if allocation.amount_minor <= 0 || sum.checked_add(allocation.amount_minor).is_none() {
                return None;
            }
            Some(sum + allocation.amount_minor)
        })
        .ok_or_else(|| "Las asignaciones deben tener importes positivos válidos".to_string())?;
    if allocation_total > input.amount_minor {
        return Err("No puedes asignar más que el importe del cobro".into());
    }
    let mut seen = std::collections::HashSet::new();
    for allocation in &input.allocations {
        if !seen.insert(&allocation.invoice_id) {
            return Err("Cada factura solo puede aparecer una vez en la distribución".into());
        }
        let invoice: Option<(String, i64)> = sqlx::query_as(
            "SELECT currency_code, total_minor FROM invoices WHERE id = ? AND workspace_id = ? AND status = 'issued'",
        )
        .bind(&allocation.invoice_id)
        .bind(WORKSPACE_ID)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        let (invoice_currency, invoice_total) = invoice
            .ok_or_else(|| "Solo se puede pagar una factura emitida de este negocio".to_string())?;
        if invoice_currency != input.currency_code {
            return Err("El cobro y la factura deben usar la misma moneda; no se hace conversión automática".into());
        }
        let paid: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(amount_minor), 0) FROM invoice_payment_allocations WHERE workspace_id = ? AND invoice_id = ? AND status = 'active'",
        )
        .bind(WORKSPACE_ID)
        .bind(&allocation.invoice_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        if paid.saturating_add(allocation.amount_minor) > invoice_total {
            return Err("La distribución supera el saldo pendiente de una factura".into());
        }
    }
    let payment_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO customer_payments (id, workspace_id, paid_at, amount_minor, currency_code, note, created_at) VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
        .bind(&payment_id)
        .bind(WORKSPACE_ID)
        .bind(&input.paid_at)
        .bind(input.amount_minor)
        .bind(&input.currency_code)
        .bind(optional_text(input.note))
        .execute(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
    for allocation in input.allocations {
        sqlx::query("INSERT INTO invoice_payment_allocations (id, workspace_id, payment_id, invoice_id, amount_minor, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(WORKSPACE_ID)
            .bind(&payment_id)
            .bind(allocation.invoice_id)
            .bind(allocation.amount_minor)
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(payment_id)
}

async fn persist_payment_allocations(
    pool: &SqlitePool,
    input: ApplyCustomerPaymentInput,
) -> Result<(), String> {
    if input.allocations.is_empty() {
        return Err("Selecciona al menos una factura para aplicar el saldo".into());
    }
    let mut transaction = pool.begin().await.map_err(|error| error.to_string())?;
    let payment: Option<(i64, String)> = sqlx::query_as(
        "SELECT amount_minor, currency_code FROM customer_payments WHERE id = ? AND workspace_id = ?",
    )
    .bind(&input.payment_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    let (payment_amount, payment_currency) =
        payment.ok_or_else(|| "No se encontró el pago en este negocio".to_string())?;
    let already_allocated: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount_minor), 0) FROM invoice_payment_allocations
         WHERE workspace_id = ? AND payment_id = ? AND status = 'active'",
    )
    .bind(WORKSPACE_ID)
    .bind(&input.payment_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| error.to_string())?;
    let unallocated = payment_amount.saturating_sub(already_allocated);
    let allocation_total = input
        .allocations
        .iter()
        .try_fold(0_i64, |sum, allocation| {
            if allocation.amount_minor <= 0 || sum.checked_add(allocation.amount_minor).is_none() {
                return None;
            }
            Some(sum + allocation.amount_minor)
        })
        .ok_or_else(|| "Las asignaciones deben tener importes positivos válidos".to_string())?;
    if allocation_total > unallocated {
        return Err("La distribución supera el saldo no aplicado del pago".into());
    }
    let mut seen = std::collections::HashSet::new();
    for allocation in &input.allocations {
        if !seen.insert(&allocation.invoice_id) {
            return Err("Cada factura solo puede aparecer una vez en la distribución".into());
        }
        let invoice: Option<(String, i64)> = sqlx::query_as(
            "SELECT currency_code, total_minor FROM invoices WHERE id = ? AND workspace_id = ? AND status = 'issued'",
        )
        .bind(&allocation.invoice_id)
        .bind(WORKSPACE_ID)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        let (invoice_currency, invoice_total) = invoice.ok_or_else(|| {
            "Solo se puede asignar a una factura emitida de este negocio".to_string()
        })?;
        if invoice_currency != payment_currency {
            return Err("El cobro y la factura deben usar la misma moneda".into());
        }
        let paid: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(amount_minor), 0) FROM invoice_payment_allocations
             WHERE workspace_id = ? AND invoice_id = ? AND status = 'active'",
        )
        .bind(WORKSPACE_ID)
        .bind(&allocation.invoice_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| error.to_string())?;
        if paid.saturating_add(allocation.amount_minor) > invoice_total {
            return Err("La asignación supera el saldo pendiente de una factura".into());
        }
    }
    for allocation in input.allocations {
        sqlx::query("INSERT INTO invoice_payment_allocations (id, workspace_id, payment_id, invoice_id, amount_minor, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(WORKSPACE_ID)
            .bind(&input.payment_id)
            .bind(allocation.invoice_id)
            .bind(allocation.amount_minor)
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
async fn create_estimate(
    app: AppHandle,
    session_token: String,
    input: CreateEstimateInput,
) -> Result<String, String> {
    let pool = open_database_pool(&app).await?;
    require_local_admin(&pool, &session_token).await?;
    let result = persist_estimate(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn revise_estimate(
    app: AppHandle,
    session_token: String,
    input: ReviseEstimateInput,
) -> Result<i64, String> {
    let pool = open_database_pool(&app).await?;
    require_local_admin(&pool, &session_token).await?;
    let result = persist_estimate_revision(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn change_estimate_status(
    app: AppHandle,
    session_token: String,
    input: ChangeEstimateStatusInput,
) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    require_local_admin(&pool, &session_token).await?;
    let result = persist_estimate_status(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn create_work_order(
    app: AppHandle,
    session_token: String,
    input: CreateWorkOrderInput,
) -> Result<String, String> {
    let pool = open_database_pool(&app).await?;
    let (_, role, can_view, _) = local_session_user(&pool, &session_token).await?;
    if role != "admin" {
        pool.close().await;
        return Err("Solo el admin puede crear órdenes".into());
    }
    if !can_view && (input.lockbox_code.is_some() || input.gate_code.is_some()) {
        pool.close().await;
        return Err("Tu cuenta no tiene permiso para guardar códigos de acceso".into());
    }
    let result = persist_work_order(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn update_work_order(
    app: AppHandle,
    session_token: String,
    input: UpdateWorkOrderInput,
) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    let (_, role, _, _) = local_session_user(&pool, &session_token).await?;
    if role != "admin" {
        pool.close().await;
        return Err("Los usuarios solo pueden completar o cancelar órdenes asignadas".into());
    }
    let result = persist_work_order_update(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn create_work_time_entry(
    app: AppHandle,
    input: CreateWorkTimeEntryInput,
) -> Result<String, String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_work_time_entry(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn save_follow_up_task(app: AppHandle, input: SaveFollowUpTaskInput) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_follow_up_task(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn create_work_order_material(
    app: AppHandle,
    input: CreateWorkOrderMaterialInput,
) -> Result<String, String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_work_order_material(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn create_expense(app: AppHandle, input: CreateExpenseInput) -> Result<String, String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_expense(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn create_work_order_extra(
    app: AppHandle,
    input: CreateWorkOrderExtraInput,
) -> Result<String, String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_work_order_extra(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn review_work_order_extra(
    app: AppHandle,
    input: ReviewWorkOrderExtraInput,
) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_work_order_extra_review(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn create_employee_payment(
    app: AppHandle,
    input: CreateEmployeePaymentInput,
) -> Result<String, String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_employee_payment(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn create_invoice(app: AppHandle, input: CreateInvoiceInput) -> Result<String, String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_invoice_creation(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn issue_invoice(app: AppHandle, invoice_id: String) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_invoice_issue(&pool, &invoice_id).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn void_invoice(app: AppHandle, input: VoidInvoiceInput) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_invoice_void(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn create_customer_payment(
    app: AppHandle,
    input: CreateCustomerPaymentInput,
) -> Result<String, String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_customer_payment(&pool, input).await;
    pool.close().await;
    result
}

#[tauri::command]
async fn configure_backups(app: AppHandle, input: ConfigureBackupInput) -> Result<String, String> {
    retry_backup_credentials_on_explicit_action()?;
    validate_backup_password(&input.password)?;
    if read_stored_backup_credentials(&app)?.is_some() {
        let (existing_password, recovery_code, _) = backup_credentials(&app)?;
        if existing_password == input.password {
            let _ = write_backup_configuration_marker(&app, true);
            return Ok(recovery_code);
        }
        return Err(
            "Los respaldos ya están configurados. Ingresa la contraseña vigente para continuar."
                .into(),
        );
    }
    let master = random_bytes::<32>();
    let recovery_code = recovery_code_from_random();
    if let Err(error) = save_backup_credentials(&input.password, &recovery_code, &master) {
        delete_backup_secret(BACKUP_CREDENTIALS_ACCOUNT);
        let _ = cache_backup_credentials_missing();
        return Err(error);
    }
    if let Err(error) = backup_credentials(&app) {
        delete_backup_secret(BACKUP_CREDENTIALS_ACCOUNT);
        let _ = cache_backup_credentials_missing();
        return Err(format!(
            "No se pudieron verificar las credenciales del respaldo en el almacén seguro: {error}"
        ));
    }
    if write_backup_configuration_marker(&app, true).is_err() {
        if let Ok(marker) = backup_configuration_marker(&app) {
            let _ = fs::remove_file(marker);
        }
    }
    Ok(recovery_code)
}

#[tauri::command]
async fn reveal_backup_recovery_code(
    app: AppHandle,
    input: RevealBackupRecoveryInput,
) -> Result<String, String> {
    retry_backup_credentials_on_explicit_action()?;
    let (stored_password, recovery_code, _) = backup_credentials(&app)?;
    if stored_password != input.password {
        return Err("La contraseña de respaldo es incorrecta".into());
    }
    Ok(recovery_code)
}

#[tauri::command]
async fn get_backup_status(app: AppHandle) -> Result<BackupStatus, String> {
    backup_status_for_app(&app)
}

#[tauri::command]
async fn create_daily_backup_if_due(app: AppHandle) -> Result<Option<u64>, String> {
    write_auto_backup(&app, false).await
}

async fn wait_for_native_file_dialog(
    receiver: mpsc::Receiver<Option<FilePath>>,
) -> Result<Option<FilePath>, String> {
    tauri::async_runtime::spawn_blocking(move || receiver.recv())
        .await
        .map_err(|error| format!("Falló el selector de archivos: {error}"))?
        .map_err(|error| format!("Se cerró el selector de archivos inesperadamente: {error}"))
}

#[tauri::command]
async fn export_encrypted_backup_command(app: AppHandle) -> Result<Option<String>, String> {
    let (sender, receiver) = mpsc::channel();
    app.dialog()
        .file()
        .add_filter("HandySystem backup", &["hsbak"])
        .set_file_name("handysystem-backup.hsbak")
        .save_file(move |path| {
            let _ = sender.send(path);
        });
    let Some(file_path) = wait_for_native_file_dialog(receiver).await? else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|error| format!("No se pudo acceder a la ubicación elegida: {error}"))?;
    let encoded = export_encrypted_backup(&app).await?;
    let archive = BASE64
        .decode(encoded)
        .map_err(|error| format!("No se pudo preparar el archivo cifrado: {error}"))?;
    fs::write(&path, archive)
        .map_err(|error| format!("No se pudo escribir el respaldo: {error}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn select_encrypted_backup_file(app: AppHandle) -> Result<Option<String>, String> {
    let (sender, receiver) = mpsc::channel();
    app.dialog()
        .file()
        .add_filter("HandySystem backup", &["hsbak"])
        .pick_file(move |path| {
            let _ = sender.send(path);
        });
    let Some(file_path) = wait_for_native_file_dialog(receiver).await? else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|error| format!("No se pudo acceder al archivo seleccionado: {error}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn restore_encrypted_backup_command(
    app: AppHandle,
    input: RestoreBackupInput,
) -> Result<String, String> {
    restore_encrypted_backup(&app, input).await
}

#[tauri::command]
async fn apply_customer_payment(
    app: AppHandle,
    input: ApplyCustomerPaymentInput,
) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    let result = persist_payment_allocations(&pool, input).await;
    pool.close().await;
    result
}

fn hash_local_password(password: &str) -> Result<String, String> {
    if password.chars().count() < 12 {
        return Err("La contraseña debe tener al menos 12 caracteres".into());
    }
    let salt = SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_local_auth_status(app: AppHandle) -> Result<LocalAuthStatus, String> {
    let pool = open_database_pool(&app).await?;
    let users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM local_users WHERE workspace_id = ?")
        .bind(WORKSPACE_ID)
        .fetch_one(&pool)
        .await
        .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(LocalAuthStatus {
        setup_required: users == 0,
    })
}

#[tauri::command]
async fn setup_local_admin(app: AppHandle, input: LocalAuthInput) -> Result<LocalSession, String> {
    let username = input.username.trim();
    if username.chars().count() < 3 || username.chars().count() > 64 {
        return Err("El nombre de usuario debe tener entre 3 y 64 caracteres".into());
    }
    let password_hash = hash_local_password(&input.password)?;
    let pool = open_database_pool(&app).await?;
    let mut tx = pool.begin().await.map_err(|error| error.to_string())?;
    let users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM local_users WHERE workspace_id = ?")
        .bind(WORKSPACE_ID)
        .fetch_one(&mut *tx)
        .await
        .map_err(|error| error.to_string())?;
    if users != 0 {
        tx.rollback().await.map_err(|error| error.to_string())?;
        pool.close().await;
        return Err("La cuenta admin ya fue configurada. Inicia sesión.".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO local_users (id, workspace_id, username, password_hash, role, can_view_access_codes, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
        .bind(&id).bind(WORKSPACE_ID).bind(username).bind(password_hash)
        .execute(&mut *tx).await.map_err(|error| error.to_string())?;
    tx.commit().await.map_err(|error| error.to_string())?;
    pool.close().await;
    create_local_session(id, username.to_owned(), "admin".into(), true, None)
}

fn create_local_session(
    id: String,
    username: String,
    role: String,
    can_view_access_codes: bool,
    employee_id: Option<String>,
) -> Result<LocalSession, String> {
    let token = BASE64URL.encode(random_bytes::<32>());
    let sessions = LOCAL_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()));
    sessions
        .lock()
        .map_err(|_| "No se pudo iniciar la sesión local".to_string())?
        .insert(token.clone(), id);
    Ok(LocalSession {
        token,
        username,
        role,
        can_view_access_codes,
        employee_id,
    })
}

async fn local_session_user(
    pool: &SqlitePool,
    token: &str,
) -> Result<(String, String, bool, Option<String>), String> {
    let user_id = LOCAL_SESSIONS
        .get()
        .and_then(|sessions| sessions.lock().ok()?.get(token).cloned())
        .ok_or_else(|| "Inicia sesión para continuar".to_string())?;
    let user = sqlx::query_as::<_, (String, String, i64, i64, Option<String>)>(
        "SELECT username, role, can_view_access_codes, active, employee_id FROM local_users WHERE id = ? AND workspace_id = ?",
    )
    .bind(user_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(pool)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "La sesión ya no es válida".to_string())?;
    if user.3 != 1 {
        return Err("La cuenta está desactivada".into());
    }
    Ok((user.0, user.1, user.2 == 1, user.4))
}

async fn require_local_admin(pool: &SqlitePool, token: &str) -> Result<(), String> {
    let (_, role, _, _) = local_session_user(pool, token).await?;
    if role != "admin" {
        return Err("Solo el admin puede gestionar usuarios".into());
    }
    Ok(())
}

#[tauri::command]
async fn login_local_user(app: AppHandle, input: LocalAuthInput) -> Result<LocalSession, String> {
    let pool = open_database_pool(&app).await?;
    let user = sqlx::query_as::<_, (String, String, String, String, i64, i64, Option<String>)>("SELECT id, username, password_hash, role, can_view_access_codes, active, employee_id FROM local_users WHERE workspace_id = ? AND username = ? COLLATE NOCASE")
        .bind(WORKSPACE_ID).bind(input.username.trim()).fetch_optional(&pool).await.map_err(|error| error.to_string())?;
    pool.close().await;
    let Some((id, username, hash, role, can_view_access_codes, active, employee_id)) = user else {
        return Err("Usuario o contraseña incorrectos".into());
    };
    if active != 1 {
        return Err("Esta cuenta está desactivada. Contacta al admin.".into());
    }
    let parsed =
        PasswordHash::new(&hash).map_err(|_| "No se pudo validar la cuenta local".to_string())?;
    Argon2::default()
        .verify_password(input.password.as_bytes(), &parsed)
        .map_err(|_| "Usuario o contraseña incorrectos".to_string())?;
    create_local_session(id, username, role, can_view_access_codes == 1, employee_id)
}

#[tauri::command]
fn logout_local_user(token: String) -> Result<(), String> {
    if let Some(sessions) = LOCAL_SESSIONS.get() {
        sessions
            .lock()
            .map_err(|_| "No se pudo cerrar la sesión".to_string())?
            .remove(&token);
    }
    Ok(())
}

#[tauri::command]
async fn list_local_users(
    app: AppHandle,
    session_token: String,
) -> Result<Vec<LocalUserSummary>, String> {
    let pool = open_database_pool(&app).await?;
    require_local_admin(&pool, &session_token).await?;
    let rows = sqlx::query_as::<_, (String, String, i64, i64, Option<String>, Option<String>)>(
        "SELECT u.id, u.username, u.can_view_access_codes, u.active, u.employee_id, e.name FROM local_users u LEFT JOIN employees e ON e.id = u.employee_id AND e.workspace_id = u.workspace_id WHERE u.workspace_id = ? AND u.role = 'user' ORDER BY u.username COLLATE NOCASE",
    )
    .bind(WORKSPACE_ID)
    .fetch_all(&pool)
    .await
    .map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(rows
        .into_iter()
        .map(
            |(id, username, can_view_access_codes, active, employee_id, employee_name)| {
                LocalUserSummary {
                    id,
                    username,
                    can_view_access_codes: can_view_access_codes == 1,
                    active: active == 1,
                    employee_id,
                    employee_name,
                }
            },
        )
        .collect())
}

#[tauri::command]
async fn create_local_user(app: AppHandle, input: CreateLocalUserInput) -> Result<(), String> {
    let username = input.username.trim();
    if username.chars().count() < 3 || username.chars().count() > 64 {
        return Err("El nombre de usuario debe tener entre 3 y 64 caracteres".into());
    }
    let password_hash = hash_local_password(&input.password)?;
    let pool = open_database_pool(&app).await?;
    require_local_admin(&pool, &input.session_token).await?;
    let employee_exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM employees WHERE id = ? AND workspace_id = ?")
            .bind(&input.employee_id)
            .bind(WORKSPACE_ID)
            .fetch_one(&pool)
            .await
            .map_err(|error| error.to_string())?;
    if employee_exists != 1 {
        pool.close().await;
        return Err("Selecciona un empleado válido para vincular la cuenta".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO local_users (id, workspace_id, username, password_hash, role, can_view_access_codes, active, employee_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'user', 0, 1, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
        .bind(id).bind(WORKSPACE_ID).bind(username).bind(password_hash).bind(input.employee_id)
        .execute(&pool).await.map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
async fn set_local_user_employee(
    app: AppHandle,
    input: SetLocalUserEmployeeInput,
) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    require_local_admin(&pool, &input.session_token).await?;
    let employee_exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM employees WHERE id = ? AND workspace_id = ?")
            .bind(&input.employee_id)
            .bind(WORKSPACE_ID)
            .fetch_one(&pool)
            .await
            .map_err(|error| error.to_string())?;
    if employee_exists != 1 {
        pool.close().await;
        return Err("Selecciona un empleado válido".into());
    }
    let result = sqlx::query("UPDATE local_users SET employee_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ? AND role = 'user'")
        .bind(input.employee_id).bind(input.user_id).bind(WORKSPACE_ID).execute(&pool).await.map_err(|error| error.to_string())?;
    pool.close().await;
    if result.rows_affected() != 1 {
        return Err("No se encontró la cuenta de usuario".into());
    }
    Ok(())
}

#[tauri::command]
async fn set_local_user_access_permission(
    app: AppHandle,
    input: SetLocalUserPermissionInput,
) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    require_local_admin(&pool, &input.session_token).await?;
    let result = sqlx::query("UPDATE local_users SET can_view_access_codes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ? AND role = 'user'")
        .bind(input.can_view_access_codes).bind(input.user_id).bind(WORKSPACE_ID)
        .execute(&pool).await.map_err(|error| error.to_string())?;
    if result.rows_affected() != 1 {
        pool.close().await;
        return Err("No se encontró la cuenta de usuario".into());
    }
    pool.close().await;
    Ok(())
}

#[tauri::command]
async fn get_work_order_access_codes(
    app: AppHandle,
    input: GetWorkOrderAccessCodesInput,
) -> Result<WorkOrderAccessCodes, String> {
    let pool = open_database_pool(&app).await?;
    let (_, role, can_view, employee_id) = local_session_user(&pool, &input.session_token).await?;
    if role != "admin" {
        if !can_view {
            pool.close().await;
            return Err("Tu cuenta no tiene permiso para ver los códigos de acceso".into());
        }
        let employee_id =
            employee_id.ok_or_else(|| "La cuenta no está vinculada a un empleado".to_string())?;
        let assigned: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM work_order_tasks t JOIN work_order_task_assignments a ON a.workspace_id = t.workspace_id AND a.task_id = t.id WHERE t.workspace_id = ? AND t.work_order_id = ? AND t.active = 1 AND a.employee_id = ? AND a.status = 'assigned'")
            .bind(WORKSPACE_ID).bind(&input.work_order_id).bind(employee_id).fetch_one(&pool).await.map_err(|error| error.to_string())?;
        if assigned != 1 {
            pool.close().await;
            return Err(
                "Solo puedes ver códigos de órdenes con tareas activas asignadas a ti".into(),
            );
        }
    }
    let result = sqlx::query_as::<_, (Option<String>, Option<String>)>(
        "SELECT lockbox_code, gate_code FROM work_orders WHERE id = ? AND workspace_id = ?",
    )
    .bind(input.work_order_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&pool)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "No se encontró la orden".to_string());
    pool.close().await;
    let (lockbox_code, gate_code) = result?;
    Ok(WorkOrderAccessCodes {
        lockbox_code,
        gate_code,
    })
}

#[tauri::command]
async fn transition_assigned_work_order(
    app: AppHandle,
    input: EmployeeWorkOrderTransitionInput,
) -> Result<(), String> {
    let reason = if input.status == "cancelled" {
        Some(
            input
                .cancellation_reason
                .as_deref()
                .unwrap_or_default()
                .trim()
                .to_owned(),
        )
    } else {
        None
    };
    let status = input.status.clone();
    if !matches!(status.as_str(), "completed" | "cancelled") {
        return Err("Solo se permite completar o cancelar tu asignación de tarea".into());
    }
    let pool = open_database_pool(&app).await?;
    let (_, role, _, employee_id) = local_session_user(&pool, &input.session_token).await?;
    if role != "user" {
        pool.close().await;
        return Err("Esta acción operativa solo está disponible para usuarios asignados".into());
    }
    let employee_id =
        employee_id.ok_or_else(|| "La cuenta no está vinculada a un empleado".to_string())?;
    let result = persist_task_assignment_transition(
        &pool,
        &input.assignment_id,
        &employee_id,
        &status,
        reason.as_deref(),
    )
    .await;
    pool.close().await;
    result
}

async fn persist_task_assignment_transition(
    pool: &SqlitePool,
    assignment_id: &str,
    employee_id: &str,
    status: &str,
    cancellation_reason: Option<&str>,
) -> Result<(), String> {
    if !matches!(status, "completed" | "cancelled") {
        return Err("Solo se permite completar o cancelar tu asignación de tarea".into());
    }
    let reason = if status == "cancelled" {
        let reason = cancellation_reason.unwrap_or_default().trim();
        if reason.is_empty() || reason.chars().count() > 500 {
            return Err("Indica el motivo de cancelación (máximo 500 caracteres)".into());
        }
        Some(reason)
    } else {
        None
    };
    let result = sqlx::query("UPDATE work_order_task_assignments SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE completed_at END, cancelled_at = CASE WHEN ? = 'cancelled' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE cancelled_at END, cancellation_reason = ?, ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND workspace_id = ? AND employee_id = ? AND status = 'assigned' AND EXISTS (SELECT 1 FROM work_order_tasks t JOIN work_orders w ON w.id = t.work_order_id AND w.workspace_id = t.workspace_id WHERE t.id = work_order_task_assignments.task_id AND t.workspace_id = work_order_task_assignments.workspace_id AND t.active = 1 AND w.status NOT IN ('completed', 'cancelled'))")
        .bind(status).bind(status).bind(status).bind(reason).bind(assignment_id).bind(WORKSPACE_ID).bind(employee_id)
        .execute(pool).await.map_err(|error| error.to_string())?;
    if result.rows_affected() != 1 {
        return Err(
            "No se pudo actualizar la tarea; verifica que siga asignada a tu cuenta".into(),
        );
    }
    Ok(())
}

#[tauri::command]
async fn list_my_assigned_tasks(
    app: AppHandle,
    session_token: String,
) -> Result<Vec<AssignedWorkTask>, String> {
    let pool = open_database_pool(&app).await?;
    let (_, role, _, employee_id) = local_session_user(&pool, &session_token).await?;
    if role != "user" {
        pool.close().await;
        return Err("Este listado es solo para cuentas de usuario".into());
    }
    let employee_id =
        employee_id.ok_or_else(|| "La cuenta no está vinculada a un empleado".to_string())?;
    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, String, String, String, String, String, String, String, Option<String>)>("SELECT a.id, a.status, a.assigned_at, a.completed_at, a.cancelled_at, a.cancellation_reason, t.id, t.description, w.id, w.status, w.address_line1, w.city, w.contact_name, w.scheduled_at FROM work_order_task_assignments a JOIN work_order_tasks t ON t.id = a.task_id AND t.workspace_id = a.workspace_id JOIN work_orders w ON w.id = t.work_order_id AND w.workspace_id = t.workspace_id WHERE a.workspace_id = ? AND a.employee_id = ? AND a.status != 'reassigned' ORDER BY COALESCE(w.scheduled_at, w.created_at) DESC, t.position, a.assigned_at")
        .bind(WORKSPACE_ID).bind(employee_id).fetch_all(&pool).await.map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(rows
        .into_iter()
        .map(|row| AssignedWorkTask {
            assignment_id: row.0,
            assignment_status: row.1,
            assigned_at: row.2,
            completed_at: row.3,
            cancelled_at: row.4,
            cancellation_reason: row.5,
            task_id: row.6,
            task_description: row.7,
            work_order_id: row.8,
            work_order_status: row.9,
            address_line1: row.10,
            city: row.11,
            contact_name: row.12,
            scheduled_at: row.13,
        })
        .collect())
}

#[tauri::command]
async fn list_work_order_tasks(
    app: AppHandle,
    input: ListWorkOrderTasksInput,
) -> Result<Vec<WorkOrderTaskDraft>, String> {
    let pool = open_database_pool(&app).await?;
    require_local_admin(&pool, &input.session_token).await?;
    let tasks = sqlx::query_as::<_, (String, String)>("SELECT id, description FROM work_order_tasks WHERE workspace_id = ? AND work_order_id = ? AND active = 1 ORDER BY position, created_at")
        .bind(WORKSPACE_ID).bind(&input.work_order_id).fetch_all(&pool).await.map_err(|error| error.to_string())?;
    let assignments = sqlx::query_as::<_, (String, String, String, String, String, Option<String>, Option<String>, Option<String>)>("SELECT a.task_id, a.employee_id, e.name, a.status, a.assigned_at, a.completed_at, a.cancelled_at, a.cancellation_reason FROM work_order_task_assignments a JOIN employees e ON e.id = a.employee_id AND e.workspace_id = a.workspace_id WHERE a.workspace_id = ? AND a.task_id IN (SELECT id FROM work_order_tasks WHERE workspace_id = ? AND work_order_id = ? AND active = 1) ORDER BY a.assigned_at")
        .bind(WORKSPACE_ID).bind(WORKSPACE_ID).bind(&input.work_order_id).fetch_all(&pool).await.map_err(|error| error.to_string())?;
    pool.close().await;
    let mut employees_by_task: HashMap<String, Vec<String>> = HashMap::new();
    let mut history_by_task: HashMap<String, Vec<WorkOrderTaskAssignmentSummary>> = HashMap::new();
    for (
        task_id,
        employee_id,
        employee_name,
        status,
        assigned_at,
        completed_at,
        cancelled_at,
        cancellation_reason,
    ) in assignments
    {
        if status == "assigned" {
            employees_by_task
                .entry(task_id.clone())
                .or_default()
                .push(employee_id.clone());
        }
        history_by_task
            .entry(task_id)
            .or_default()
            .push(WorkOrderTaskAssignmentSummary {
                employee_id,
                employee_name,
                status,
                assigned_at,
                completed_at,
                cancelled_at,
                cancellation_reason,
            });
    }
    Ok(tasks
        .into_iter()
        .map(|(id, description)| WorkOrderTaskDraft {
            employee_ids: employees_by_task.remove(&id).unwrap_or_default(),
            assignment_history: history_by_task.remove(&id).unwrap_or_default(),
            id: Some(id),
            description,
        })
        .collect())
}

#[tauri::command]
async fn save_work_order_tasks(
    app: AppHandle,
    input: SaveWorkOrderTasksInput,
) -> Result<(), String> {
    let pool = open_database_pool(&app).await?;
    require_local_admin(&pool, &input.session_token).await?;
    let order_exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM work_orders WHERE id = ? AND workspace_id = ?")
            .bind(&input.work_order_id)
            .bind(WORKSPACE_ID)
            .fetch_one(&pool)
            .await
            .map_err(|error| error.to_string())?;
    if order_exists != 1 {
        pool.close().await;
        return Err("No se encontró la orden".into());
    }
    let mut tx = pool.begin().await.map_err(|error| error.to_string())?;
    persist_work_order_task_drafts(&mut tx, &input.work_order_id, &input.tasks).await?;
    tx.commit().await.map_err(|error| error.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
async fn save_assigned_estimate_draft(
    app: AppHandle,
    input: SaveEmployeeEstimateDraftInput,
) -> Result<(), String> {
    let items = normalize_work_items(input.items, None)?;
    if items.is_empty() {
        return Err("Agrega al menos un trabajo al borrador".into());
    }
    let pool = open_database_pool(&app).await?;
    let (_, role, _, employee_id) = local_session_user(&pool, &input.session_token).await?;
    if role != "user" {
        pool.close().await;
        return Err("Esta acción es solo para cuentas de usuario".into());
    }
    let employee_id =
        employee_id.ok_or_else(|| "La cuenta no está vinculada a un empleado".to_string())?;
    let assigned: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM work_order_tasks t JOIN work_order_task_assignments a ON a.workspace_id = t.workspace_id AND a.task_id = t.id WHERE t.workspace_id = ? AND t.work_order_id = ? AND t.active = 1 AND a.employee_id = ? AND a.status = 'assigned'")
        .bind(WORKSPACE_ID).bind(&input.work_order_id).bind(&employee_id).fetch_one(&pool).await.map_err(|error| error.to_string())?;
    if assigned != 1 {
        pool.close().await;
        return Err(
            "Solo puedes preparar presupuestos para órdenes con tareas activas asignadas a ti"
                .into(),
        );
    }
    let order = sqlx::query_as::<_, (Option<String>, String, String)>(
        "SELECT estimate_id, billing_mode, status FROM work_orders WHERE id = ? AND workspace_id = ?",
    )
    .bind(&input.work_order_id)
    .bind(WORKSPACE_ID)
    .fetch_optional(&pool)
    .await
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "No se encontró la orden".to_string())?;
    if matches!(order.2.as_str(), "completed" | "cancelled") {
        pool.close().await;
        return Err(
            "No puedes preparar un presupuesto para una orden finalizada o cancelada".into(),
        );
    }
    let currency: Option<String> =
        sqlx::query_scalar("SELECT currency_code FROM workspaces WHERE id = ?")
            .bind(WORKSPACE_ID)
            .fetch_optional(&pool)
            .await
            .map_err(|error| error.to_string())?
            .flatten();
    let currency =
        currency.ok_or_else(|| "El admin debe configurar la moneda del negocio".to_string())?;
    let description = items.join("\n");
    let result = if let Some(estimate_id) = order.0 {
        let current = sqlx::query_as::<_, (String, i64)>("SELECT status, pricing_complete FROM estimate_versions WHERE estimate_id = ? AND workspace_id = ? AND version_number = (SELECT current_version FROM estimates WHERE id = ? AND workspace_id = ?)")
            .bind(&estimate_id).bind(WORKSPACE_ID).bind(&estimate_id).bind(WORKSPACE_ID)
            .fetch_optional(&pool).await.map_err(|error| error.to_string())?
            .ok_or_else(|| "No se encontró el borrador vigente".to_string())?;
        if current.0 != "draft" || current.1 != 0 {
            pool.close().await;
            return Err("Solo puedes agregar trabajos a un borrador sin precio; pide al admin que prepare otra versión".into());
        }
        persist_estimate_revision(
            &pool,
            ReviseEstimateInput {
                estimate_id,
                description,
                items: Some(items),
                billing_mode: order.1,
                amount_minor: None,
                discount_kind: "amount".into(),
                discount_value: 0,
            },
        )
        .await
        .map(|_| ())
    } else {
        persist_estimate(
            &pool,
            CreateEstimateInput {
                order_id: Some(input.work_order_id),
                description,
                items,
                billing_mode: order.1,
                amount_minor: None,
                discount_kind: "amount".into(),
                discount_value: 0,
                currency_code: currency,
                ..Default::default()
            },
        )
        .await
        .map(|_| ())
    };
    pool.close().await;
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
                        Migration {
                            version: 9,
                            description: "workspace_city",
                            sql: include_str!("../migrations/0009_workspace_city.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 10,
                            description: "standalone_estimates",
                            sql: include_str!("../migrations/0010_standalone_estimates.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 11,
                            description: "workspace_view_preferences",
                            sql: include_str!("../migrations/0011_workspace_view_preferences.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 12,
                            description: "work_items_and_price_requirements",
                            sql: include_str!(
                                "../migrations/0012_work_items_and_price_requirements.sql"
                            ),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 13,
                            description: "work_order_media_and_notes",
                            sql: include_str!("../migrations/0013_work_order_media_and_notes.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 14,
                            description: "employees_and_work_order_assignments",
                            sql: include_str!(
                                "../migrations/0014_employees_and_work_order_assignments.sql"
                            ),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 15,
                            description: "correct_work_order_assignments",
                            sql: include_str!(
                                "../migrations/0015_correct_work_order_assignments.sql"
                            ),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 16,
                            description: "work_time_entries",
                            sql: include_str!("../migrations/0016_work_time_entries.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 17,
                            description: "follow_up_tasks",
                            sql: include_str!("../migrations/0017_follow_up_tasks.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 18,
                            description: "work_time_entry_modes",
                            sql: include_str!("../migrations/0018_work_time_entry_modes.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 19,
                            description: "completion_items_and_followup_defaults",
                            sql: include_str!(
                                "../migrations/0019_completion_items_and_followup_defaults.sql"
                            ),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 20,
                            description: "work_order_materials",
                            sql: include_str!("../migrations/0020_work_order_materials.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 21,
                            description: "material_total_cost",
                            sql: include_str!("../migrations/0021_material_total_cost.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 22,
                            description: "expenses",
                            sql: include_str!("../migrations/0022_expenses.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 23,
                            description: "expense_parts_category",
                            sql: include_str!("../migrations/0023_expense_parts_category.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 24,
                            description: "employee_payments",
                            sql: include_str!("../migrations/0024_employee_payments.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 25,
                            description: "invoices_and_customer_payments",
                            sql: include_str!(
                                "../migrations/0025_invoices_and_customer_payments.sql"
                            ),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 26,
                            description: "employee_worker_types",
                            sql: include_str!("../migrations/0026_employee_worker_types.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 27,
                            description: "work_order_extras",
                            sql: include_str!("../migrations/0027_work_order_extras.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 28,
                            description: "work_order_cancellation_reason",
                            sql: include_str!(
                                "../migrations/0028_work_order_cancellation_reason.sql"
                            ),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 29,
                            description: "invoice_payment_followups",
                            sql: include_str!("../migrations/0029_invoice_payment_followups.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 30,
                            description: "invoice_tax_and_delivery_snapshots",
                            sql: include_str!(
                                "../migrations/0030_invoice_tax_and_delivery_snapshots.sql"
                            ),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 31,
                            description: "invoice_recipient_type_backfill",
                            sql: include_str!(
                                "../migrations/0031_invoice_recipient_type_backfill.sql"
                            ),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 32,
                            description: "email_oauth_and_invoice_delivery",
                            sql: include_str!(
                                "../migrations/0032_email_oauth_and_invoice_delivery.sql"
                            ),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 33,
                            description: "local_auth_users",
                            sql: include_str!("../migrations/0033_local_auth.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 34,
                            description: "link_local_users_to_employees",
                            sql: include_str!("../migrations/0034_local_user_employee.sql"),
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 35,
                            description: "work_order_tasks_and_assignment_history",
                            sql: include_str!("../migrations/0035_work_order_tasks.sql"),
                            kind: MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            correct_client_profile,
            correct_property_profile,
            create_estimate,
            revise_estimate,
            change_estimate_status,
            create_work_order,
            update_work_order,
            create_work_time_entry,
            save_follow_up_task,
            create_work_order_material,
            create_expense,
            create_employee_payment,
            create_work_order_extra,
            review_work_order_extra,
            create_invoice,
            issue_invoice,
            void_invoice,
            create_customer_payment,
            apply_customer_payment,
            get_local_auth_status,
            setup_local_admin,
            login_local_user,
            logout_local_user,
            list_local_users,
            create_local_user,
            set_local_user_access_permission,
            set_local_user_employee,
            get_work_order_access_codes,
            transition_assigned_work_order,
            list_my_assigned_tasks,
            list_work_order_tasks,
            save_work_order_tasks,
            save_assigned_estimate_draft,
            connect_email_provider,
            disconnect_email_provider,
            send_invoice_email_command,
            configure_backups,
            reveal_backup_recovery_code,
            get_backup_status,
            create_daily_backup_if_due,
            export_encrypted_backup_command,
            select_encrypted_backup_file,
            restore_encrypted_backup_command
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
        sqlx::raw_sql(include_str!("../migrations/0009_workspace_city.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0010_standalone_estimates.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/0011_workspace_view_preferences.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/0012_work_items_and_price_requirements.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/0013_work_order_media_and_notes.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/0014_employees_and_work_order_assignments.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/0015_correct_work_order_assignments.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0016_work_time_entries.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0017_follow_up_tasks.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0018_work_time_entry_modes.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/0019_completion_items_and_followup_defaults.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0020_work_order_materials.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0021_material_total_cost.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0022_expenses.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/0023_expense_parts_category.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0024_employee_payments.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/0025_invoices_and_customer_payments.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0026_employee_worker_types.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0027_work_order_extras.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/0028_work_order_cancellation_reason.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/0029_invoice_payment_followups.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/0030_invoice_tax_and_delivery_snapshots.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/0031_invoice_recipient_type_backfill.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!(
            "../migrations/0032_email_oauth_and_invoice_delivery.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0033_local_auth.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0034_local_user_employee.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0035_work_order_tasks.sql"))
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    #[test]
    fn local_passwords_are_argon2_hashes_and_require_minimum_length() {
        assert!(hash_local_password("short").is_err());
        let encoded = hash_local_password("a-long-local-password").unwrap();
        assert!(!encoded.contains("a-long-local-password"));
        let parsed = PasswordHash::new(&encoded).unwrap();
        assert!(
            Argon2::default()
                .verify_password("a-long-local-password".as_bytes(), &parsed)
                .is_ok()
        );
        assert!(
            Argon2::default()
                .verify_password("wrong-password".as_bytes(), &parsed)
                .is_err()
        );
    }

    #[test]
    fn local_auth_migration_has_workspace_scoped_unique_users_and_default_deny() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let hash = hash_local_password("another-long-password").unwrap();
            sqlx::query("INSERT INTO local_users (id, workspace_id, username, password_hash, role, created_at, updated_at) VALUES ('u1', ?, 'worker', ?, 'user', 'now', 'now')")
                .bind(WORKSPACE_ID).bind(&hash).execute(&pool).await.unwrap();
            let permission: i64 =
                sqlx::query_scalar("SELECT can_view_access_codes FROM local_users WHERE id = 'u1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(permission, 0);
            assert!(sqlx::query("INSERT INTO local_users (id, workspace_id, username, password_hash, role, created_at, updated_at) VALUES ('u2', ?, 'WORKER', ?, 'user', 'now', 'now')")
                .bind(WORKSPACE_ID).bind(hash).execute(&pool).await.is_err());
            pool.close().await;
        });
    }

    #[test]
    fn task_completion_and_cancellation_only_change_the_assigned_employee_record() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            for employee_id in ["task-worker-1", "task-worker-2"] {
                sqlx::query("INSERT INTO employees (id, workspace_id, name, color, worker_type, created_at, updated_at) VALUES (?, ?, ?, '#4f46e5', 'employee', 'now', 'now')")
                    .bind(employee_id).bind(WORKSPACE_ID).bind(employee_id).execute(&pool).await.unwrap();
            }
            sqlx::query("INSERT INTO work_orders (id, workspace_id, client_type, recipient_name, contact_name, contact_phone, address_line1, city, description, billing_mode, agreed_amount_minor, currency_code, status, priority, created_at, updated_at) VALUES ('task-order', ?, 'direct', 'Customer', 'Contact', '555', '1 Main St', 'Town', 'Whole order', 'fixed', 10000, 'USD', 'scheduled', 'normal', 'now', 'now')")
                .bind(WORKSPACE_ID).execute(&pool).await.unwrap();
            sqlx::query("INSERT INTO work_order_tasks (id, workspace_id, work_order_id, description, position, created_at, updated_at) VALUES ('task-one', ?, 'task-order', 'Repair sink', 1, 'now', 'now')")
                .bind(WORKSPACE_ID).execute(&pool).await.unwrap();
            for (assignment_id, employee_id) in [
                ("assignment-one", "task-worker-1"),
                ("assignment-two", "task-worker-2"),
            ] {
                sqlx::query("INSERT INTO work_order_task_assignments (id, workspace_id, task_id, employee_id, status, assigned_at) VALUES (?, ?, 'task-one', ?, 'assigned', 'now')")
                    .bind(assignment_id).bind(WORKSPACE_ID).bind(employee_id).execute(&pool).await.unwrap();
            }

            persist_task_assignment_transition(
                &pool,
                "assignment-one",
                "task-worker-1",
                "completed",
                None,
            )
            .await
            .unwrap();
            let first: (String, Option<String>, Option<String>) = sqlx::query_as("SELECT status, completed_at, cancellation_reason FROM work_order_task_assignments WHERE id = 'assignment-one'")
                .fetch_one(&pool).await.unwrap();
            let second: String = sqlx::query_scalar(
                "SELECT status FROM work_order_task_assignments WHERE id = 'assignment-two'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            let order_status: String =
                sqlx::query_scalar("SELECT status FROM work_orders WHERE id = 'task-order'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(first.0, "completed");
            assert!(first.1.is_some());
            assert_eq!(first.2, None);
            assert_eq!(second, "assigned");
            assert_eq!(order_status, "scheduled");

            assert!(
                persist_task_assignment_transition(
                    &pool,
                    "assignment-two",
                    "task-worker-1",
                    "cancelled",
                    Some("Wrong employee")
                )
                .await
                .is_err()
            );
            persist_task_assignment_transition(
                &pool,
                "assignment-two",
                "task-worker-2",
                "cancelled",
                Some("No access today"),
            )
            .await
            .unwrap();
            let cancelled: (String, Option<String>, Option<String>) = sqlx::query_as("SELECT status, cancelled_at, cancellation_reason FROM work_order_task_assignments WHERE id = 'assignment-two'")
                .fetch_one(&pool).await.unwrap();
            let order_status: String =
                sqlx::query_scalar("SELECT status FROM work_orders WHERE id = 'task-order'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(cancelled.0, "cancelled");
            assert!(cancelled.1.is_some());
            assert_eq!(cancelled.2.as_deref(), Some("No access today"));
            assert_eq!(order_status, "scheduled");
            assert!(
                persist_task_assignment_transition(
                    &pool,
                    "assignment-two",
                    "task-worker-2",
                    "cancelled",
                    Some("")
                )
                .await
                .is_err()
            );
            pool.close().await;
        });
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
    fn work_order_assignments_are_workspace_scoped_and_atomic() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query("UPDATE workspaces SET currency_code = 'USD' WHERE id = ?")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO employees (id, workspace_id, name, color, created_at, updated_at) VALUES ('employee-1', ?, 'Alex', '#4f46e5', 'now', 'now')")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();

            let order_id = persist_work_order(
                &pool,
                CreateWorkOrderInput {
                    contact_name: Some("Casey".into()),
                    contact_phone: Some("555-0112".into()),
                    address_line1: Some("5 Oak Street".into()),
                    description: Some("Repair a door".into()),
                    currency_code: Some("USD".into()),
                    employee_ids: vec!["employee-1".into()],
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let assigned: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM work_order_assignments WHERE workspace_id = ? AND work_order_id = ? AND employee_id = 'employee-1'")
                .bind(WORKSPACE_ID)
                .bind(&order_id)
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(assigned, 1);

            let result = persist_work_order(
                &pool,
                CreateWorkOrderInput {
                    contact_name: Some("Riley".into()),
                    contact_phone: Some("555-0113".into()),
                    address_line1: Some("6 Oak Street".into()),
                    description: Some("Fix a latch".into()),
                    currency_code: Some("USD".into()),
                    employee_ids: vec!["not-in-this-workspace".into()],
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await;
            assert!(result.is_err());
            let orders: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM work_orders WHERE workspace_id = ?")
                    .bind(WORKSPACE_ID)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(orders, 1);
        });
    }

    #[test]
    fn work_time_entries_validate_duration_overlap_and_keep_order_financials() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query("UPDATE workspaces SET currency_code = 'USD' WHERE id = ?")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO employees (id, workspace_id, name, color, created_at, updated_at) VALUES ('staff-hours-1', ?, 'Jordan', '#059669', 'now', 'now')")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();
            let order_id = persist_work_order(
                &pool,
                CreateWorkOrderInput {
                    contact_name: Some("Sam".into()),
                    contact_phone: Some("555-0188".into()),
                    address_line1: Some("17 Maple Avenue".into()),
                    description: Some("Repair a cabinet".into()),
                    currency_code: Some("USD".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

            let entry_id = persist_work_time_entry(
                &pool,
                CreateWorkTimeEntryInput {
                    work_order_id: order_id.clone(),
                    employee_id: "staff-hours-1".into(),
                    entry_type: "hourly".into(),
                    started_at: Some("2026-10-24T14:00:00.000Z".into()),
                    ended_at: Some("2026-10-24T15:30:00.000Z".into()),
                    work_occurred_at: "2026-10-24T14:00:00.000Z".into(),
                    amount_minor: None,
                    note: Some("Repaired cabinet hinge".into()),
                },
            )
            .await
            .unwrap();
            let recorded: (i64, Option<String>) =
                sqlx::query_as("SELECT duration_minutes, note FROM work_time_entries WHERE id = ?")
                    .bind(&entry_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(recorded, (90, Some("Repaired cabinet hinge".into())));

            let overlap = persist_work_time_entry(
                &pool,
                CreateWorkTimeEntryInput {
                    work_order_id: order_id.clone(),
                    employee_id: "staff-hours-1".into(),
                    entry_type: "hourly".into(),
                    started_at: Some("2026-10-24T15:00:00.000Z".into()),
                    ended_at: Some("2026-10-24T16:00:00.000Z".into()),
                    work_occurred_at: "2026-10-24T15:00:00.000Z".into(),
                    amount_minor: None,
                    note: None,
                },
            )
            .await;
            assert!(overlap.is_err());

            let too_long = persist_work_time_entry(
                &pool,
                CreateWorkTimeEntryInput {
                    work_order_id: order_id.clone(),
                    employee_id: "staff-hours-1".into(),
                    entry_type: "hourly".into(),
                    started_at: Some("2026-10-25T00:00:00.000Z".into()),
                    ended_at: Some("2026-10-26T00:01:00.000Z".into()),
                    work_occurred_at: "2026-10-25T00:00:00.000Z".into(),
                    amount_minor: None,
                    note: None,
                },
            )
            .await;
            assert!(too_long.is_err());

            let per_job_id = persist_work_time_entry(
                &pool,
                CreateWorkTimeEntryInput {
                    work_order_id: order_id.clone(),
                    employee_id: "staff-hours-1".into(),
                    entry_type: "per_job".into(),
                    started_at: None,
                    ended_at: None,
                    work_occurred_at: "2026-10-24T12:00:00.000Z".into(),
                    amount_minor: Some(20_000),
                    note: Some("Employee charged for the cabinet repair".into()),
                },
            )
            .await
            .unwrap();
            let per_job: (String, Option<i64>, Option<String>, Option<String>, Option<String>) =
                sqlx::query_as("SELECT entry_type, amount_minor, currency_code, started_at, ended_at FROM work_time_entries WHERE id = ?")
                    .bind(per_job_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(
                per_job,
                (
                    "per_job".into(),
                    Some(20_000),
                    Some("USD".into()),
                    None,
                    None
                )
            );

            let unchanged: (String, i64, i64) = sqlx::query_as(
                "SELECT status, agreed_amount_minor, price_confirmed FROM work_orders WHERE id = ?",
            )
            .bind(&order_id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(unchanged, ("pending".into(), 0, 0));
        });
    }

    #[test]
    fn work_order_materials_validate_receipts_and_do_not_change_order_price() {
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
                    contact_name: Some("Taylor".into()),
                    contact_phone: Some("555-0124".into()),
                    address_line1: Some("18 Willow Street".into()),
                    description: Some("Repair a sink".into()),
                    currency_code: Some("USD".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

            let material_id = persist_work_order_material(
                &pool,
                CreateWorkOrderMaterialInput {
                    work_order_id: order_id.clone(),
                    material_name: "PVC pipe".into(),
                    quantity: 2.0,
                    total_cost_minor: 500,
                    unit_price_minor: 400,
                },
            )
            .await
            .unwrap();
            let material: (f64, i64, i64, String) = sqlx::query_as(
                "SELECT quantity, total_cost_minor, unit_price_minor, currency_code FROM work_order_materials WHERE id = ?",
            )
            .bind(material_id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(material, (2.0, 500, 400, "USD".into()));

            let invalid_quantity = persist_work_order_material(
                &pool,
                CreateWorkOrderMaterialInput {
                    work_order_id: order_id.clone(),
                    material_name: "Copper fitting".into(),
                    quantity: 0.0,
                    total_cost_minor: 0,
                    unit_price_minor: 0,
                },
            )
            .await;
            assert!(invalid_quantity.is_err());

            let order_amount: i64 =
                sqlx::query_scalar("SELECT agreed_amount_minor FROM work_orders WHERE id = ?")
                    .bind(order_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(order_amount, 0);
        });
    }

    #[test]
    fn expenses_keep_currency_scope_and_do_not_change_order_financials() {
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
                    contact_name: Some("Jamie".into()),
                    contact_phone: Some("555-0171".into()),
                    address_line1: Some("7 Pine Street".into()),
                    description: Some("Repair the sink".into()),
                    currency_code: Some("USD".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let expense_id = persist_expense(
                &pool,
                CreateExpenseInput {
                    work_order_id: Some(order_id.clone()),
                    description: "Replacement drain fitting".into(),
                    category: "variable".into(),
                    occurred_at: "2026-10-24T18:00:00.000Z".into(),
                    amount_minor: 875,
                    vendor: Some("Hardware Store".into()),
                    note: Some("Purchased during repair".into()),
                    receipt_file_name: Some("receipt.png".into()),
                    receipt_mime_type: Some("image/png".into()),
                    receipt_size_bytes: Some(3),
                    receipt_data_url: Some("data:image/png;base64,AAAA".into()),
                },
            )
            .await
            .unwrap();
            let expense: (String, String, i64, String, Option<String>) = sqlx::query_as(
                "SELECT category, currency_code, amount_minor, description, receipt_file_name FROM expenses WHERE id = ?",
            )
            .bind(expense_id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(
                expense,
                (
                    "variable".into(),
                    "USD".into(),
                    875,
                    "Replacement drain fitting".into(),
                    Some("receipt.png".into())
                )
            );

            let invalid = persist_expense(
                &pool,
                CreateExpenseInput {
                    work_order_id: Some("not-in-this-workspace".into()),
                    description: "Invalid expense".into(),
                    category: "fuel".into(),
                    occurred_at: "2026-10-24T18:00:00.000Z".into(),
                    amount_minor: 100,
                    vendor: None,
                    note: None,
                    receipt_file_name: None,
                    receipt_mime_type: None,
                    receipt_size_bytes: None,
                    receipt_data_url: None,
                },
            )
            .await;
            assert!(invalid.is_err());

            let unchanged: (String, i64) =
                sqlx::query_as("SELECT status, agreed_amount_minor FROM work_orders WHERE id = ?")
                    .bind(order_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(unchanged, ("pending".into(), 0));
        });
    }

    #[test]
    fn external_staff_payments_allow_partials_but_not_overpayment() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query("UPDATE workspaces SET currency_code = 'USD' WHERE id = ?")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO employees (id, workspace_id, name, color, created_at, updated_at) VALUES ('payee-1', ?, 'Cameron', '#0891b2', 'now', 'now')")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();
            let order_id = persist_work_order(
                &pool,
                CreateWorkOrderInput {
                    contact_name: Some("Taylor".into()),
                    contact_phone: Some("555-0131".into()),
                    address_line1: Some("12 Cedar Lane".into()),
                    description: Some("Replace a valve".into()),
                    currency_code: Some("USD".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let cost_id = persist_work_time_entry(
                &pool,
                CreateWorkTimeEntryInput {
                    work_order_id: order_id.clone(),
                    employee_id: "payee-1".into(),
                    entry_type: "per_job".into(),
                    started_at: None,
                    ended_at: None,
                    work_occurred_at: "2026-10-24T12:00:00.000Z".into(),
                    amount_minor: Some(10_000),
                    note: None,
                },
            )
            .await
            .unwrap();

            for amount in [4_000, 6_000] {
                persist_employee_payment(
                    &pool,
                    CreateEmployeePaymentInput {
                        employee_id: "payee-1".into(),
                        work_order_id: Some(order_id.clone()),
                        work_time_entry_id: Some(cost_id.clone()),
                        paid_at: "2026-10-25T15:00:00.000Z".into(),
                        amount_minor: amount,
                        note: Some("Paid externally".into()),
                    },
                )
                .await
                .unwrap();
            }
            let overpayment = persist_employee_payment(
                &pool,
                CreateEmployeePaymentInput {
                    employee_id: "payee-1".into(),
                    work_order_id: Some(order_id.clone()),
                    work_time_entry_id: Some(cost_id.clone()),
                    paid_at: "2026-10-25T15:00:00.000Z".into(),
                    amount_minor: 1,
                    note: None,
                },
            )
            .await;
            assert!(overpayment.is_err());
            let paid: i64 = sqlx::query_scalar(
                "SELECT SUM(amount_minor) FROM employee_payments WHERE work_time_entry_id = ?",
            )
            .bind(&cost_id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(paid, 10_000);
        });
    }

    #[test]
    fn invoice_tax_partial_payment_and_void_preserve_financial_history() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query("UPDATE workspaces SET currency_code = 'USD', invoice_tax_rate_basis_points = 1000 WHERE id = ?")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();
            let order_id = persist_work_order(
                &pool,
                CreateWorkOrderInput {
                    contact_name: Some("Alex Customer".into()),
                    contact_phone: Some("555-0151".into()),
                    address_line1: Some("41 Oak Avenue".into()),
                    description: Some("Replace a kitchen faucet".into()),
                    currency_code: Some("USD".into()),
                    amount_minor: Some(25_000),
                    price_confirmed: Some(true),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: order_id.clone(),
                    status: "completed".into(),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

            let invoice_id = persist_invoice_creation(
                &pool,
                CreateInvoiceInput {
                    work_order_id: order_id.clone(),
                },
            )
            .await
            .unwrap();
            persist_invoice_issue(&pool, &invoice_id).await.unwrap();

            let payment_id = persist_customer_payment(
                &pool,
                CreateCustomerPaymentInput {
                    paid_at: "2026-10-24T19:00:00.000Z".into(),
                    amount_minor: 10_000,
                    currency_code: "USD".into(),
                    note: Some("Partial external payment".into()),
                    allocations: vec![InvoicePaymentAllocationInput {
                        invoice_id: invoice_id.clone(),
                        amount_minor: 8_000,
                    }],
                },
            )
            .await
            .unwrap();
            let invoice_totals: (String, i64, i64, i64, i64, i64) = sqlx::query_as(
                "SELECT status, subtotal_minor, tax_rate_basis_points, tax_minor, total_minor,
                        (SELECT SUM(amount_minor) FROM invoice_payment_allocations WHERE invoice_id = invoices.id AND status = 'active')
                 FROM invoices WHERE id = ?",
            )
            .bind(&invoice_id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(
                invoice_totals,
                ("issued".into(), 25_000, 1_000, 2_500, 27_500, 8_000)
            );

            let overpayment = persist_customer_payment(
                &pool,
                CreateCustomerPaymentInput {
                    paid_at: "2026-10-24T20:00:00.000Z".into(),
                    amount_minor: 20_000,
                    currency_code: "USD".into(),
                    note: None,
                    allocations: vec![InvoicePaymentAllocationInput {
                        invoice_id: invoice_id.clone(),
                        amount_minor: 20_000,
                    }],
                },
            )
            .await;
            assert!(overpayment.is_err());

            persist_invoice_void(
                &pool,
                VoidInvoiceInput {
                    invoice_id: invoice_id.clone(),
                    reason: "Incorrect customer address".into(),
                },
            )
            .await
            .unwrap();
            let payment_unapplied: i64 = sqlx::query_scalar(
                "SELECT customer_payments.amount_minor - COALESCE(SUM(CASE WHEN invoice_payment_allocations.status = 'active' THEN invoice_payment_allocations.amount_minor ELSE 0 END), 0)
                 FROM customer_payments LEFT JOIN invoice_payment_allocations ON invoice_payment_allocations.payment_id = customer_payments.id
                 WHERE customer_payments.id = ? GROUP BY customer_payments.id",
            )
            .bind(&payment_id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(payment_unapplied, 10_000);
            let replacement_invoice = persist_invoice_creation(
                &pool,
                CreateInvoiceInput {
                    work_order_id: order_id,
                },
            )
            .await
            .unwrap();
            persist_invoice_issue(&pool, &replacement_invoice)
                .await
                .unwrap();
            persist_payment_allocations(
                &pool,
                ApplyCustomerPaymentInput {
                    payment_id: payment_id.clone(),
                    allocations: vec![InvoicePaymentAllocationInput {
                        invoice_id: replacement_invoice.clone(),
                        amount_minor: 8_000,
                    }],
                },
            )
            .await
            .unwrap();
            let payment_applied_after_reissue: i64 = sqlx::query_scalar(
                "SELECT COALESCE(SUM(amount_minor), 0) FROM invoice_payment_allocations WHERE payment_id = ? AND status = 'active'",
            )
            .bind(payment_id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(payment_applied_after_reissue, 8_000);
        });
    }

    #[test]
    fn additional_work_requires_approval_and_only_changes_invoice_subtotal() {
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
                    contact_name: Some("Jordan".into()),
                    contact_phone: Some("555-0144".into()),
                    address_line1: Some("31 Birch Drive".into()),
                    description: Some("Repair a door".into()),
                    currency_code: Some("USD".into()),
                    amount_minor: Some(20_000),
                    price_confirmed: Some(true),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: order_id.clone(),
                    status: "completed".into(),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let draft_invoice = persist_invoice_creation(
                &pool,
                CreateInvoiceInput {
                    work_order_id: order_id.clone(),
                },
            )
            .await
            .unwrap();
            let first_extra = persist_work_order_extra(
                &pool,
                CreateWorkOrderExtraInput {
                    work_order_id: order_id.clone(),
                    description: "Replace damaged trim".into(),
                    reason: "Damage found after removing the door".into(),
                    amount_minor: 5_000,
                },
            )
            .await
            .unwrap();
            let before_approval: i64 =
                sqlx::query_scalar("SELECT subtotal_minor FROM invoices WHERE id = ?")
                    .bind(&draft_invoice)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(before_approval, 20_000);
            persist_work_order_extra_review(
                &pool,
                ReviewWorkOrderExtraInput {
                    extra_id: first_extra,
                    action: "approve".into(),
                    approval_method: Some("verbal".into()),
                    approval_note: Some("Customer approved by phone".into()),
                },
            )
            .await
            .unwrap();
            let after_approval: i64 =
                sqlx::query_scalar("SELECT subtotal_minor FROM invoices WHERE id = ?")
                    .bind(&draft_invoice)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(after_approval, 25_000);
            persist_invoice_issue(&pool, &draft_invoice).await.unwrap();

            let second_extra = persist_work_order_extra(
                &pool,
                CreateWorkOrderExtraInput {
                    work_order_id: order_id.clone(),
                    description: "Replace the hinge".into(),
                    reason: "The existing hinge was cracked".into(),
                    amount_minor: 2_000,
                },
            )
            .await
            .unwrap();
            let blocked = persist_work_order_extra_review(
                &pool,
                ReviewWorkOrderExtraInput {
                    extra_id: second_extra.clone(),
                    action: "approve".into(),
                    approval_method: Some("message".into()),
                    approval_note: None,
                },
            )
            .await;
            assert!(blocked.is_err());
            persist_invoice_void(
                &pool,
                VoidInvoiceInput {
                    invoice_id: draft_invoice,
                    reason: "Add approved extra work".into(),
                },
            )
            .await
            .unwrap();
            persist_work_order_extra_review(
                &pool,
                ReviewWorkOrderExtraInput {
                    extra_id: second_extra,
                    action: "approve".into(),
                    approval_method: Some("message".into()),
                    approval_note: None,
                },
            )
            .await
            .unwrap();
            let replacement_invoice = persist_invoice_creation(
                &pool,
                CreateInvoiceInput {
                    work_order_id: order_id.clone(),
                },
            )
            .await
            .unwrap();
            let final_subtotal: i64 =
                sqlx::query_scalar("SELECT subtotal_minor FROM invoices WHERE id = ?")
                    .bind(replacement_invoice)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(final_subtotal, 27_000);
            let agreed: i64 =
                sqlx::query_scalar("SELECT agreed_amount_minor FROM work_orders WHERE id = ?")
                    .bind(order_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(agreed, 20_000);
        });
    }

    #[test]
    fn follow_up_override_only_saves_for_current_scheduled_order() {
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
                    contact_name: Some("Morgan".into()),
                    contact_phone: Some("555-0191".into()),
                    address_line1: Some("22 Birch Road".into()),
                    description: Some("Repair a window".into()),
                    currency_code: Some("USD".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: order_id.clone(),
                    status: "scheduled".into(),
                    priority: "normal".into(),
                    scheduled_at: Some("2026-11-03T16:00:00Z".into()),
                    scheduled_end_at: Some("2026-11-03T18:00:00Z".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

            persist_follow_up_task(
                &pool,
                SaveFollowUpTaskInput {
                    task_type: "appointment_confirmation".into(),
                    entity_id: order_id.clone(),
                    due_at: "2026-11-02T15:00:00.000Z".into(),
                    status: "open".into(),
                },
            )
            .await
            .unwrap();
            let saved: (String, String) = sqlx::query_as(
                "SELECT due_at, status FROM follow_up_task_overrides WHERE entity_id = ?",
            )
            .bind(&order_id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(saved, ("2026-11-02T15:00:00.000Z".into(), "open".into()));

            persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: order_id.clone(),
                    status: "cancelled".into(),
                    priority: "normal".into(),
                    cancellation_reason: Some("Customer rescheduled".into()),
                    confirm_cancellation: Some(true),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let stale = persist_follow_up_task(
                &pool,
                SaveFollowUpTaskInput {
                    task_type: "appointment_confirmation".into(),
                    entity_id: order_id,
                    due_at: "2026-11-02T15:00:00.000Z".into(),
                    status: "completed".into(),
                },
            )
            .await;
            assert!(stale.is_err());
        });
    }

    #[test]
    fn invoice_payment_follow_up_requires_issued_invoice_with_positive_balance() {
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
                    contact_name: Some("Morgan".into()),
                    contact_phone: Some("555-0191".into()),
                    address_line1: Some("22 Birch Road".into()),
                    description: Some("Repair a window".into()),
                    currency_code: Some("USD".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO invoices
                 (id, workspace_id, work_order_id, reference_code, status, recipient_name, contact_name,
                  contact_phone, address_line1, city, description, subtotal_minor, tax_minor, total_minor,
                  currency_code, created_at, issued_at)
                 VALUES ('invoice-follow-up', ?, ?, 'INV-FOLLOWUP', 'issued', 'Morgan', 'Morgan',
                         '555-0191', '22 Birch Road', 'Town', 'Repair', 5000, 0, 5000, 'USD',
                         '2026-10-20T12:00:00Z', '2026-10-20T12:00:00Z')",
            )
            .bind(WORKSPACE_ID)
            .bind(&order_id)
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query("UPDATE invoices SET sent_at = '2026-10-20T12:00:00Z' WHERE id = 'invoice-follow-up'")
                .execute(&pool)
                .await
                .unwrap();
            persist_follow_up_task(
                &pool,
                SaveFollowUpTaskInput {
                    task_type: "invoice_payment_follow_up".into(),
                    entity_id: "invoice-follow-up".into(),
                    due_at: "2026-11-04T12:00:00Z".into(),
                    status: "open".into(),
                },
            )
            .await
            .unwrap();

            sqlx::query(
                "INSERT INTO customer_payments (id, workspace_id, paid_at, amount_minor, currency_code, created_at)
                 VALUES ('payment-follow-up', ?, '2026-10-21T12:00:00Z', 5000, 'USD', '2026-10-21T12:00:00Z')",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO invoice_payment_allocations
                 (id, workspace_id, payment_id, invoice_id, amount_minor, status, created_at)
                 VALUES ('allocation-follow-up', ?, 'payment-follow-up', 'invoice-follow-up', 5000,
                         'active', '2026-10-21T12:00:00Z')",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();

            let stale = persist_follow_up_task(
                &pool,
                SaveFollowUpTaskInput {
                    task_type: "invoice_payment_follow_up".into(),
                    entity_id: "invoice-follow-up".into(),
                    due_at: "2026-11-04T12:00:00Z".into(),
                    status: "completed".into(),
                },
            )
            .await;
            assert!(
                stale.is_err(),
                "paid invoices must no longer accept follow-up changes"
            );

            let voided = persist_follow_up_task(
                &pool,
                SaveFollowUpTaskInput {
                    task_type: "invoice_payment_follow_up".into(),
                    entity_id: "missing-invoice".into(),
                    due_at: "2026-11-04T12:00:00Z".into(),
                    status: "open".into(),
                },
            )
            .await;
            assert!(voided.is_err());
            pool.close().await;
        });
    }

    #[test]
    fn encrypted_backup_requires_password_or_recovery_code() {
        let master = random_bytes::<32>();
        let original = b"HandySystem local database snapshot";
        let archive = encrypted_backup_archive(
            original,
            "correct horse battery staple",
            "AA11BB22CC33",
            &master,
        )
        .expect("archive encrypts");

        let (password_restore, _) =
            decrypt_backup_archive(&archive, "correct horse battery staple")
                .expect("password opens backup");
        assert_eq!(password_restore, original);
        let (recovery_restore, _) =
            decrypt_backup_archive(&archive, "AA11BB22CC33").expect("recovery code opens backup");
        assert_eq!(recovery_restore, original);
        assert!(decrypt_backup_archive(&archive, "wrong password").is_err());
    }

    #[test]
    fn backup_configuration_marker_persists_both_states_and_recovers_if_invalid() {
        let dir = std::env::temp_dir().join(format!(
            "handysystem-backup-marker-{}",
            uuid::Uuid::new_v4()
        ));
        let marker = dir.join(BACKUP_CONFIGURATION_MARKER);
        assert_eq!(
            read_backup_configuration_marker_path(&marker).unwrap(),
            None
        );
        write_backup_configuration_marker_path(&marker, false).unwrap();
        assert_eq!(
            read_backup_configuration_marker_path(&marker).unwrap(),
            Some(false)
        );
        write_backup_configuration_marker_path(&marker, true).unwrap();
        assert_eq!(
            read_backup_configuration_marker_path(&marker).unwrap(),
            Some(true)
        );
        fs::write(&marker, "corrupted").unwrap();
        assert_eq!(
            read_backup_configuration_marker_path(&marker).unwrap(),
            None
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn invoice_follow_up_migration_preserves_existing_task_overrides() {
        tauri::async_runtime::block_on(async {
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(
                    SqliteConnectOptions::new()
                        .in_memory(true)
                        .foreign_keys(true),
                )
                .await
                .unwrap();
            sqlx::query("CREATE TABLE workspaces (id TEXT PRIMARY KEY NOT NULL)")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO workspaces (id) VALUES (?)")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query(
                "CREATE TABLE follow_up_task_overrides (
                   id TEXT PRIMARY KEY NOT NULL,
                   workspace_id TEXT NOT NULL REFERENCES workspaces(id),
                   task_type TEXT NOT NULL CHECK (task_type IN ('estimate_follow_up', 'appointment_confirmation')),
                   entity_id TEXT NOT NULL,
                   due_at TEXT NOT NULL,
                   status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'dismissed')),
                   created_at TEXT NOT NULL,
                   updated_at TEXT NOT NULL,
                   UNIQUE (workspace_id, task_type, entity_id)
                 )",
            )
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO follow_up_task_overrides
                 VALUES ('legacy-task', ?, 'estimate_follow_up', 'estimate-1', '2026-11-01T12:00:00Z', 'open', 'created', 'updated')",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();

            sqlx::raw_sql(include_str!(
                "../migrations/0029_invoice_payment_followups.sql"
            ))
            .execute(&pool)
            .await
            .unwrap();
            let saved: (String, String, String) = sqlx::query_as(
                "SELECT task_type, entity_id, status FROM follow_up_task_overrides WHERE id = 'legacy-task'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            let payment_days: i64 =
                sqlx::query_scalar("SELECT payment_followup_days FROM workspaces WHERE id = ?")
                    .bind(WORKSPACE_ID)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(
                saved,
                (
                    "estimate_follow_up".into(),
                    "estimate-1".into(),
                    "open".into()
                )
            );
            assert_eq!(payment_days, 15);
            pool.close().await;
        });
    }

    #[test]
    fn restore_rollback_preserves_original_database_and_sqlite_sidecars() {
        let dir = std::env::temp_dir().join(format!(
            "handysystem-restore-rollback-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        let database = dir.join("handyman.db");
        let rollback = dir.join("handyman-pre-restore.db");
        let database_wal = database_sidecar(&database, "-wal");
        let rollback_wal = database_sidecar(&rollback, "-wal");
        fs::write(&database, b"restored database").unwrap();
        fs::write(&rollback, b"original database").unwrap();
        fs::write(&database_wal, b"new wal").unwrap();
        fs::write(&rollback_wal, b"original wal").unwrap();

        rollback_database_replacement(
            &database,
            &rollback,
            &[(database_wal.clone(), rollback_wal.clone())],
        )
        .unwrap();

        assert_eq!(fs::read(&database).unwrap(), b"original database");
        assert_eq!(fs::read(&database_wal).unwrap(), b"original wal");
        assert!(!rollback.exists());
        assert!(!rollback_wal.exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn restore_point_does_not_suppress_daily_backup() {
        let now = SystemTime::now();
        assert!(is_recent_daily_backup(
            Path::new("auto-123.hsbak"),
            now,
            now
        ));
        assert!(!is_recent_daily_backup(
            Path::new("pre-restore-123.hsbak"),
            now,
            now
        ));
        assert!(!is_recent_daily_backup(Path::new("auto-123.tmp"), now, now));
    }

    #[test]
    fn sqlite_online_backup_creates_integrity_checked_database_copy() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query("CREATE TABLE _sqlx_migrations (version INTEGER NOT NULL)")
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO _sqlx_migrations (version) VALUES (?)")
                .bind(LATEST_SCHEMA_VERSION)
                .execute(&pool)
                .await
                .unwrap();
            let snapshot =
                std::env::temp_dir().join(format!("handysystem-test-{}.db", uuid::Uuid::new_v4()));
            backup_sqlite_to_file(&pool, &snapshot).await.unwrap();
            assert!(
                snapshot.exists(),
                "SQLite online backup did not create {snapshot:?}"
            );
            let copy = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(
                    SqliteConnectOptions::new()
                        .filename(&snapshot)
                        .foreign_keys(true),
                )
                .await
                .unwrap();
            let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
                .fetch_one(&copy)
                .await
                .unwrap();
            assert_eq!(integrity, "ok");
            copy.close().await;
            validate_restore_database(&snapshot).await.unwrap();
            sqlx::query("UPDATE _sqlx_migrations SET version = ?")
                .bind(LATEST_SCHEMA_VERSION + 1)
                .execute(&pool)
                .await
                .unwrap();
            std::fs::remove_file(&snapshot).unwrap();
            backup_sqlite_to_file(&pool, &snapshot).await.unwrap();
            let error = validate_restore_database(&snapshot).await.unwrap_err();
            assert!(error.contains("versión más nueva"));
            pool.close().await;
            std::fs::remove_file(snapshot).unwrap();
        });
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
                    new_client_id: None,
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
    fn property_reassignment_closes_old_link_and_keeps_order_snapshot() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query("UPDATE workspaces SET currency_code = 'USD' WHERE id = ?")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();
            for (id, client_type, name) in [
                ("owner-1", "direct", "Previous Owner"),
                ("manager-1", "property_manager", "New Manager"),
            ] {
                sqlx::query(
                    "INSERT INTO clients (id, workspace_id, type, name, phone, created_at, updated_at)
                     VALUES (?, ?, ?, ?, '555-0100', 'now', 'now')",
                )
                .bind(id)
                .bind(WORKSPACE_ID)
                .bind(client_type)
                .bind(name)
                .execute(&pool)
                .await
                .unwrap();
            }
            sqlx::query(
                "INSERT INTO properties (id, workspace_id, address_line1, city, created_at, updated_at)
                 VALUES ('property-reassign', ?, '25 Oak', 'Austin', 'now', 'now')",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO property_client_history
                 (id, workspace_id, property_id, client_id, relationship_type, valid_from)
                  VALUES ('history-old', ?, 'property-reassign', 'owner-1', 'owner', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 day'))",
            )
            .bind(WORKSPACE_ID)
            .execute(&pool)
            .await
            .unwrap();
            let order_id = persist_work_order(
                &pool,
                CreateWorkOrderInput {
                    client_id: Some("owner-1".into()),
                    property_id: Some("property-reassign".into()),
                    client_type: Some("direct".into()),
                    recipient_name: Some("Previous Owner".into()),
                    contact_name: Some("Previous Owner".into()),
                    contact_phone: Some("555-0100".into()),
                    address_line1: Some("25 Oak".into()),
                    city: Some("Austin".into()),
                    description: Some("Historical repair".into()),
                    currency_code: Some("USD".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

            persist_property_profile_correction(
                &pool,
                CorrectPropertyProfileInput {
                    property_id: "property-reassign".into(),
                    address_line1: "25 Oak".into(),
                    address_line2: None,
                    city: "Austin".into(),
                    subdivision: None,
                    postal_code: None,
                    country_code: None,
                    new_client_id: Some("manager-1".into()),
                    related_work_order_ids: vec![],
                },
            )
            .await
            .unwrap();

            let history: Vec<(String, String, String, Option<String>)> = sqlx::query_as(
                "SELECT client_id, relationship_type, valid_from, valid_to FROM property_client_history
                 WHERE property_id = 'property-reassign' ORDER BY valid_from",
            )
            .fetch_all(&pool)
            .await
            .unwrap();
            assert_eq!(history.len(), 2);
            assert_eq!(history[0].0, "owner-1");
            assert_eq!(history[0].1, "owner");
            assert!(history[0].3.as_ref().is_some_and(|end| end > &history[0].2));
            assert_eq!(history[1].0, "manager-1");
            assert_eq!(history[1].1, "manager");
            assert_eq!(history[1].2, history[0].3.clone().unwrap());
            assert_eq!(history[1].3, None);
            let order_client_id: String =
                sqlx::query_scalar("SELECT client_id FROM work_orders WHERE id = ?")
                    .bind(order_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(order_client_id, "owner-1");

            let invalid = persist_property_profile_correction(
                &pool,
                CorrectPropertyProfileInput {
                    property_id: "property-reassign".into(),
                    address_line1: "25 Oak".into(),
                    address_line2: None,
                    city: "Austin".into(),
                    subdivision: None,
                    postal_code: None,
                    country_code: None,
                    new_client_id: Some("missing-client".into()),
                    related_work_order_ids: vec![],
                },
            )
            .await;
            assert!(invalid.is_err());
            let current_client: String = sqlx::query_scalar(
                "SELECT client_id FROM property_client_history WHERE property_id = 'property-reassign' AND valid_to IS NULL",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(current_client, "manager-1");
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

            let estimate_id = persist_estimate(
                &pool,
                CreateEstimateInput {
                    order_id: Some("order-q1".into()),
                    description: "Repair and align entry door".into(),
                    billing_mode: "fixed".into(),
                    amount_minor: Some(10_000),
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
                        items: None,
                        billing_mode: "fixed".into(),
                        amount_minor: Some(12_000),
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
            let draft_quote_blocks_completion = persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: "order-q1".into(),
                    status: "completed".into(),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await;
            assert!(draft_quote_blocks_completion.is_err());
            let draft_quote_blocks_schedule = persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: "order-q1".into(),
                    status: "scheduled".into(),
                    priority: "normal".into(),
                    scheduled_at: Some("2026-11-02T14:00:00Z".into()),
                    scheduled_end_at: Some("2026-11-02T18:00:00Z".into()),
                    ..Default::default()
                },
            )
            .await;
            assert!(draft_quote_blocks_schedule.is_err());
            persist_estimate_status(
                &pool,
                ChangeEstimateStatusInput {
                    estimate_id: estimate_id.clone(),
                    status: "sent".into(),
                },
            )
            .await
            .unwrap();
            let sent_quote_blocks_completion = persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: "order-q1".into(),
                    status: "completed".into(),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await;
            assert!(sent_quote_blocks_completion.is_err());
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
            persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: "order-q1".into(),
                    status: "completed".into(),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let completed: String =
                sqlx::query_scalar("SELECT status FROM work_orders WHERE id = 'order-q1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(completed, "completed");
            pool.close().await;
        });
    }

    #[test]
    fn standalone_estimate_can_create_order_after_approval() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query("UPDATE workspaces SET currency_code = 'USD' WHERE id = ?")
                .bind(WORKSPACE_ID)
                .execute(&pool)
                .await
                .unwrap();
            let estimate_id = persist_estimate(
                &pool,
                CreateEstimateInput {
                    order_id: None,
                    client_type: Some("property_manager".into()),
                    recipient_name: Some("Oak Property Group".into()),
                    contact_name: Some("Office Contact".into()),
                    contact_phone: Some("555-0210".into()),
                    tenant_name: Some("Tenant".into()),
                    tenant_phone: Some("555-0211".into()),
                    address_line1: Some("11 Oak Street".into()),
                    city: Some("Austin".into()),
                    description: "Repair a disposal".into(),
                    billing_mode: "fixed".into(),
                    amount_minor: Some(12_500),
                    discount_kind: "amount".into(),
                    discount_value: 0,
                    currency_code: "USD".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let standalone_order: Option<String> =
                sqlx::query_scalar("SELECT work_order_id FROM estimates WHERE id = ?")
                    .bind(&estimate_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(standalone_order, None);

            persist_estimate_status(
                &pool,
                ChangeEstimateStatusInput {
                    estimate_id: estimate_id.clone(),
                    status: "accepted".into(),
                },
            )
            .await
            .unwrap();
            let generated_order: (String, String, String, Option<String>, Option<String>, String, i64) = sqlx::query_as(
                "SELECT id, status, client_type, tenant_name, tenant_phone, recipient_name, agreed_amount_minor
                 FROM work_orders WHERE estimate_id = ?",
            )
            .bind(&estimate_id)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(generated_order.1, "accepted");
            assert_eq!(generated_order.2, "property_manager");
            assert_eq!(generated_order.3.as_deref(), Some("Tenant"));
            assert_eq!(generated_order.4.as_deref(), Some("555-0211"));
            assert_eq!(generated_order.5, "Oak Property Group");
            assert_eq!(generated_order.6, 12_500);
            pool.close().await;
        });
    }

    #[test]
    fn estimate_requires_workspace_currency() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let result = persist_estimate(
                &pool,
                CreateEstimateInput {
                    order_id: Some("missing-order".into()),
                    description: "Repair".into(),
                    billing_mode: "fixed".into(),
                    amount_minor: Some(10_000),
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
                    amount_minor: Some(20_000),
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

            let quick_completion_order = persist_work_order(
                &pool,
                CreateWorkOrderInput {
                    client_type: Some("direct".into()),
                    contact_name: Some("Morgan Customer".into()),
                    contact_phone: Some("555-0153".into()),
                    address_line1: Some("8 Elm Street".into()),
                    description: Some("Tighten a loose handle".into()),
                    currency_code: Some("USD".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let missing_price_result = persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: quick_completion_order.clone(),
                    status: "completed".into(),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await;
            assert!(missing_price_result.is_err());
            let zero_price_result = persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: quick_completion_order.clone(),
                    status: "completed".into(),
                    priority: "normal".into(),
                    amount_minor: Some(0),
                    price_confirmed: Some(true),
                    ..Default::default()
                },
            )
            .await;
            assert!(zero_price_result.is_err());
            persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: quick_completion_order.clone(),
                    status: "completed".into(),
                    priority: "normal".into(),
                    amount_minor: Some(20_000),
                    price_confirmed: Some(true),
                    completed_items: Some(vec![
                        "Replaced the loose handle".into(),
                        "Tested the door".into(),
                    ]),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let quick_status: (String, Option<String>, Option<String>) = sqlx::query_as(
                "SELECT status, started_at, completed_at FROM work_orders WHERE id = ?",
            )
            .bind(&quick_completion_order)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(quick_status.0, "completed");
            assert_eq!(quick_status.1, None);
            assert!(quick_status.2.is_some());
            let confirmed_price: (i64, i64) = sqlx::query_as(
                "SELECT agreed_amount_minor, price_confirmed FROM work_orders WHERE id = ?",
            )
            .bind(&quick_completion_order)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(confirmed_price, (20_000, 1));
            let performed_items: Vec<String> = sqlx::query_scalar(
                "SELECT description FROM work_order_completion_items WHERE work_order_id = ? ORDER BY position",
            )
            .bind(&quick_completion_order)
            .fetch_all(&pool)
            .await
            .unwrap();
            let requested_items: Vec<String> = sqlx::query_scalar(
                "SELECT description FROM work_order_items WHERE work_order_id = ? ORDER BY position",
            )
            .bind(&quick_completion_order)
            .fetch_all(&pool)
            .await
            .unwrap();
            assert_eq!(
                performed_items,
                ["Replaced the loose handle", "Tested the door"]
            );
            assert_eq!(requested_items, ["Tighten a loose handle"]);

            persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: quick_completion_order.clone(),
                    status: "completed".into(),
                    priority: "normal".into(),
                    completed_items: Some(vec!["Adjusted and tested the handle".into()]),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let edited_performed_items: Vec<String> = sqlx::query_scalar(
                "SELECT description FROM work_order_completion_items WHERE work_order_id = ? ORDER BY position",
            )
            .bind(&quick_completion_order)
            .fetch_all(&pool)
            .await
            .unwrap();
            assert_eq!(edited_performed_items, ["Adjusted and tested the handle"]);
            let retained_requested_description: String =
                sqlx::query_scalar("SELECT description FROM work_orders WHERE id = ?")
                    .bind(&quick_completion_order)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(retained_requested_description, "Tighten a loose handle");

            let active_order = persist_work_order(
                &pool,
                CreateWorkOrderInput {
                    client_type: Some("direct".into()),
                    contact_name: Some("Riley Customer".into()),
                    contact_phone: Some("555-0154".into()),
                    address_line1: Some("9 Elm Street".into()),
                    description: Some("Replace a hinge".into()),
                    amount_minor: Some(700),
                    price_confirmed: Some(true),
                    currency_code: Some("USD".into()),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            for next_status in ["scheduled", "in_progress", "completed"] {
                persist_work_order_update(
                    &pool,
                    UpdateWorkOrderInput {
                        work_order_id: active_order.clone(),
                        status: next_status.into(),
                        priority: "normal".into(),
                        scheduled_at: Some("2026-11-02T14:00:00Z".into()),
                        scheduled_end_at: Some("2026-11-02T18:00:00Z".into()),
                        ..Default::default()
                    },
                )
                .await
                .unwrap();
            }

            let estimate_id = persist_estimate(
                &pool,
                CreateEstimateInput {
                    order_id: Some(order_id.clone()),
                    description: "Replace faucet cartridge".into(),
                    billing_mode: "fixed".into(),
                    amount_minor: Some(24_000),
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
            persist_work_order_update(
                &pool,
                UpdateWorkOrderInput {
                    work_order_id: order_id.clone(),
                    status: "completed".into(),
                    priority: "normal".into(),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
            let (completed_at, started_at): (Option<String>, Option<String>) =
                sqlx::query_as("SELECT completed_at, started_at FROM work_orders WHERE id = ?")
                    .bind(&order_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert!(completed_at.is_some());
            assert_eq!(started_at, None);

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
            let another_estimate_id = persist_estimate(
                &pool,
                CreateEstimateInput {
                    order_id: Some(another_order_id.clone()),
                    description: "Replace the latch".into(),
                    billing_mode: "fixed".into(),
                    amount_minor: Some(6_000),
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
            let verbal_estimate_id = persist_estimate(
                &pool,
                CreateEstimateInput {
                    order_id: Some(verbal_order_id.clone()),
                    description: "Adjust the door".into(),
                    billing_mode: "fixed".into(),
                    amount_minor: Some(3_500),
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
