import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronLeft,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  DollarSign,
  FilePlus,
  FileText,
  History,
  Home,
  Languages,
  MapPin,
  Pencil,
  Percent,
  Printer,
  Plus,
  Search,
  Settings2,
  Wrench,
  Users,
  X,
  TriangleAlert,
} from "lucide-react";
import {
  createClient,
  createProperty,
  createEstimateFromOrder,
  createStandaloneEstimate,
  changeEstimateStatus,
  createWorkOrder,
  getWorkspaceCurrency,
  getWorkspaceInvoiceTaxRate,
  getWorkspaceLanguage,
  getWorkspaceName,
  getWorkspaceRegionalSettings,
  getWorkspaceViewPreferences,
  getWorkspaceEmailSettings,
  getLocalAuthStatus,
  setLocalSessionToken,
  getWorkOrderAccessCodes,
  transitionAssignedWorkOrder,
  saveAssignedEstimateDraft,
  listMyAssignedTasks,
  listWorkOrderTasks,
  listLocalUsers,
  createLocalUser,
  setLocalUserAccessPermission,
  setLocalUserEmployee,
  initializeLocalDatabase,
  setupLocalAdmin,
  loginLocalUser,
  logoutLocalUser,
  connectEmailProvider,
  disconnectEmailProvider,
  sendInvoiceEmail,
  isDesktopRuntime,
  listClients,
  listEstimates,
  listEstimateVersions,
  listProperties,
  listPropertyAssignmentHistory,
  listWorkOrders,
  listWorkOrderPhotos,
  listWorkOrderNotes,
  addWorkOrderNote,
  addWorkOrderPhoto,
  addWorkTimeEntry,
  listWorkTimeEntries,
  listWorkOrderCompletionItems,
  addWorkOrderMaterial,
  listWorkOrderMaterials,
  listWorkOrderExtras,
  createWorkOrderExtra,
  reviewWorkOrderExtra,
  createExpense,
  listExpenses,
  listEmployeePayments,
  listPayableWorkCosts,
  createEmployeePayment,
  listInvoices,
  listCustomerPayments,
  createInvoice,
  issueInvoice,
  voidInvoice,
  createCustomerPayment,
  applyCustomerPayment,
  getBackupStatus,
  createDailyBackupIfDue,
  configureBackups,
  revealBackupRecoveryCode,
  exportEncryptedBackup,
  selectEncryptedBackupFile,
  closeDatabaseForRestore,
  restoreEncryptedBackup,
  listEmployees,
  saveEmployee,
  getFollowUpSettings,
  listFollowUpTaskOverrides,
  saveFollowUpTask,
  setFollowUpSettings,
  reviseEstimate,
  setWorkspaceCurrency,
  setWorkspaceInvoiceTaxRate,
  setWorkspaceLanguage,
  setWorkspaceRegionalSettings,
  setWorkspaceViewPreferences,
  setWorkspaceEmailClientIds,
  updateClient,
  updateProperty,
  updateWorkOrder,
} from "./lib/database";
import type { AssignedWorkTask, LocalAuthStatus, LocalSession, LocalUserSummary, WorkOrderTaskDraft } from "./lib/database";
import type {
  Client,
  ClientInput,
  ClientType,
  Estimate,
  EstimateDraftInput,
  EstimateVersion,
  CreateWorkOrderInput,
  Property,
  PropertyAssignmentHistory,
  PropertyInput,
  View,
  WorkOrder,
  WorkOrderPhoto,
  WorkOrderNote,
  WorkTimeEntry,
  Employee,
  FollowUpSettings,
  FollowUpSuggestion,
  FollowUpTaskOverride,
  WorkOrderMaterial,
  WorkOrderExtra,
  Expense,
  ExpenseCategory,
  EmployeePayment,
  PayableWorkCost,
  Invoice,
  CustomerPayment,
  InvoicePaymentAllocationDraft,
  BackupStatus,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderUpdateInput,
  WorkspaceRegionalSettings,
  WorkspaceEmailSettings,
  EmailProvider,
  StandaloneEstimateDetails,
  WorkspaceViewPreferences,
  ViewMode,
} from "./lib/types";
import { translate, type Locale } from "./i18n";
import { SearchablePicker } from "./components/SearchablePicker";
import { currencyFractionDigits, decimalToMinorUnits, formatMinorUnits, minorUnitsToDecimal, percentToBasisPoints, supportedCurrencyCodes } from "./lib/money";
import { dateTimeLocalToUtc, formatWorkspaceDateTime, utcToDateTimeLocal } from "./lib/time";
import { activeScheduledOrders, scheduleConflicts, workspaceDateKey } from "./lib/schedule";
import { buildFollowUpSuggestions } from "./lib/followups";
import { getInvoicePaymentStatus } from "./lib/invoicePaymentStatus";
import { createInvoicePdfBase64 } from "./lib/invoicePdf";
import { withinWorkspaceDateRange, workOrderReportDate } from "./lib/reports";
import "./App.css";

type IconType = typeof Home;
type ModalKind = "client" | "property" | "estimate" | "estimate-history" | "work-order" | null;
const INLINE_NEW_CLIENT_ID = "__inline_new_client__";
const INLINE_NEW_PROPERTY_ID = "__inline_new_property__";
const EMPLOYEE_COLORS = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#e11d48", "#7c3aed", "#475569", "#65a30d"];

const navItems: { id: View; icon: IconType; label: "dashboard" | "clients" | "properties" | "estimates" | "work_orders" | "schedule" | "follow_ups" | "expenses" | "staff_payments" | "billing" | "reports" }[] = [
  { id: "dashboard", icon: Home, label: "dashboard" },
  { id: "schedule", icon: CalendarDays, label: "schedule" },
  { id: "follow_ups", icon: Bell, label: "follow_ups" },
  { id: "expenses", icon: DollarSign, label: "expenses" },
  { id: "staff_payments", icon: Users, label: "staff_payments" },
  { id: "billing", icon: FileText, label: "billing" },
  { id: "reports", icon: Printer, label: "reports" },
  { id: "clients", icon: Users, label: "clients" },
  { id: "properties", icon: Building2, label: "properties" },
  { id: "estimates", icon: FileText, label: "estimates" },
  { id: "work_orders", icon: Wrench, label: "work_orders" },
];

function App() {
  const [locale, setLocale] = useState<Locale>("es");
  const [view, setView] = useState<View>("dashboard");
  const [modal, setModal] = useState<ModalKind>(null);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
  const [propertyToEdit, setPropertyToEdit] = useState<Property | null>(null);
  const [estimateWorkOrder, setEstimateWorkOrder] = useState<WorkOrder | null>(null);
  const [estimateToRevise, setEstimateToRevise] = useState<Estimate | null>(null);
  const [estimateHistoryTarget, setEstimateHistoryTarget] = useState<Estimate | null>(null);
  const [estimateVersions, setEstimateVersions] = useState<EstimateVersion[]>([]);
  const [printEstimate, setPrintEstimate] = useState<Estimate | null>(null);
  const [orderToEdit, setOrderToEdit] = useState<WorkOrder | null>(null);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<"all" | ClientType>("all");
  const [propertyClientFilter, setPropertyClientFilter] = useState<"all" | ClientType>("all");
  const [workOrderClientFilter, setWorkOrderClientFilter] = useState<"all" | ClientType>("all");
  const [estimateClientFilter, setEstimateClientFilter] = useState<"all" | ClientType>("all");
  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [assignedWorkTasks, setAssignedWorkTasks] = useState<AssignedWorkTask[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employeePayments, setEmployeePayments] = useState<EmployeePayment[]>([]);
  const [payableWorkCosts, setPayableWorkCosts] = useState<PayableWorkCost[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [invoiceToPrint, setInvoiceToPrint] = useState<Invoice | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({ configured: false, lastAutomaticBackupUnix: null });
  const [backupError, setBackupError] = useState("");
  const [followUpSettings, setFollowUpSettingsState] = useState<FollowUpSettings>({ estimate_followup_days: 15, appointment_confirmation_days: 15, payment_followup_days: 15 });
  const [followUpOverrides, setFollowUpOverrides] = useState<FollowUpTaskOverride[]>([]);
  const [workspaceCurrency, setWorkspaceCurrencyState] = useState<string | null>(null);
  const [workspaceInvoiceTaxRateBasisPoints, setWorkspaceInvoiceTaxRateBasisPoints] = useState(0);
  const [workspaceName, setWorkspaceName] = useState("Mi negocio");
  const [workspaceRegion, setWorkspaceRegion] = useState<WorkspaceRegionalSettings>({ country_code: null, subdivision: null, city: null, timezone: "UTC" });
  const [workspaceEmailSettings, setWorkspaceEmailSettings] = useState<WorkspaceEmailSettings>({ gmail_oauth_client_id: null, microsoft_oauth_client_id: null, gmail_connected_email: null, microsoft_connected_email: null });
  const [viewPreferences, setViewPreferences] = useState<WorkspaceViewPreferences>({ clients_view: "list", properties_view: "cards", work_orders_view: "cards", estimates_view: "list" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(isDesktopRuntime());
  const [authStatus, setAuthStatus] = useState<LocalAuthStatus | null>(null);
  const [localSession, setLocalSession] = useState<LocalSession | null>(null);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [dbError, setDbError] = useState("");
  const [toast, setToast] = useState("");

  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  async function refreshData() {
    if (localSession?.role === "user") {
      if (!localSession.employeeId) {
        setClients([]); setProperties([]); setEmployees([]); setExpenses([]);
        setEmployeePayments([]); setPayableWorkCosts([]); setInvoices([]); setCustomerPayments([]);
        setEstimates([]); setWorkOrders([]); setAssignedWorkTasks([]);
        return;
      }
      const [nextEstimates, nextWorkOrders, nextAssignedTasks, nextLanguage, nextRegion] = await Promise.all([
        listEstimates(localSession.employeeId),
        listWorkOrders(localSession.employeeId),
        listMyAssignedTasks(localSession.token),
        getWorkspaceLanguage(),
        getWorkspaceRegionalSettings(),
      ]);
      setClients([]); setProperties([]); setEmployees([]); setExpenses([]);
      setEmployeePayments([]); setPayableWorkCosts([]); setInvoices([]); setCustomerPayments([]);
      setEstimates(nextEstimates); setWorkOrders(nextWorkOrders);
      setAssignedWorkTasks(nextAssignedTasks);
      setLocale(nextLanguage); setWorkspaceRegion(nextRegion);
      return;
    }
    const [nextClients, nextProperties, nextEstimates, nextWorkOrders, nextEmployees, nextExpenses, nextEmployeePayments, nextPayableWorkCosts, nextInvoices, nextCustomerPayments, nextFollowUpSettings, nextFollowUpOverrides, nextCurrency, nextWorkspaceName, nextLanguage, nextRegion, nextViews, nextInvoiceTaxRate, nextEmailSettings] = await Promise.all([
      listClients(),
      listProperties(),
      listEstimates(),
      listWorkOrders(),
      listEmployees(),
      listExpenses(),
      listEmployeePayments(),
      listPayableWorkCosts(),
      listInvoices(),
      listCustomerPayments(),
      getFollowUpSettings(),
      listFollowUpTaskOverrides(),
      getWorkspaceCurrency(),
      getWorkspaceName(),
      getWorkspaceLanguage(),
      getWorkspaceRegionalSettings(),
      getWorkspaceViewPreferences(),
      getWorkspaceInvoiceTaxRate(),
      getWorkspaceEmailSettings(),
    ]);
    setClients(nextClients);
    setProperties(nextProperties);
    setEstimates(nextEstimates);
    setWorkOrders(nextWorkOrders);
    setEmployees(nextEmployees);
    setExpenses(nextExpenses);
    setEmployeePayments(nextEmployeePayments);
    setPayableWorkCosts(nextPayableWorkCosts);
    setInvoices(nextInvoices);
    setCustomerPayments(nextCustomerPayments);
    setFollowUpSettingsState(nextFollowUpSettings);
    setFollowUpOverrides(nextFollowUpOverrides);
    setWorkspaceCurrencyState(nextCurrency);
    setWorkspaceName(nextWorkspaceName);
    setLocale(nextLanguage);
    setWorkspaceRegion(nextRegion);
    setViewPreferences(nextViews);
    setWorkspaceInvoiceTaxRateBasisPoints(nextInvoiceTaxRate);
    setWorkspaceEmailSettings(nextEmailSettings);
  }

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    void initializeLocalDatabase()
      .then(() => getLocalAuthStatus())
      .then(setAuthStatus)
      .catch((error: unknown) => setDbError(error instanceof Error ? error.message : "No se pudo consultar el login local."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime() || !localSession) return;
    setLoading(true);
    void refreshData()
      .then(async () => {
        // Read configuration independently: a failed daily snapshot must not
        // make an already-configured backup appear unconfigured in Settings.
        try {
          setBackupStatus(await getBackupStatus());
          setBackupError("");
        } catch (error) {
          setBackupError(error instanceof Error ? error.message : "No se pudo consultar el estado del respaldo.");
        }
        try {
          await createDailyBackupIfDue();
          setBackupStatus(await getBackupStatus());
          setBackupError("");
        } catch (error) {
          setBackupError(error instanceof Error ? error.message : "No se pudo crear el respaldo local.");
        }
      })
      .catch((error: unknown) => {
        setDbError(error instanceof Error ? error.message : "No se pudo abrir la base de datos local.");
      })
      .finally(() => setLoading(false));
  }, [localSession?.token]);

  useEffect(() => {
    if (!isDesktopRuntime() || !localSession) return;
    const interval = window.setInterval(() => {
      void getBackupStatus()
        .then((status) => setBackupStatus(status))
        .catch((error: unknown) => setBackupError(error instanceof Error ? error.message : "No se pudo consultar el estado del respaldo."));
      void createDailyBackupIfDue()
        .then(() => getBackupStatus())
        .then((status) => { setBackupStatus(status); setBackupError(""); })
        .catch((error: unknown) => setBackupError(error instanceof Error ? error.message : "No se pudo crear el respaldo local."));
    }, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [localSession?.token]);

  async function submitLocalAuth(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const session = authStatus?.setupRequired
        ? await setupLocalAdmin(authUsername, authPassword)
        : await loginLocalUser(authUsername, authPassword);
      setLocalSessionToken(session.token);
      setLocalSession(session);
      setView(session.role === "admin" ? "dashboard" : "work_orders");
      setSettingsOpen(false); setModal(null);
      setAuthPassword("");
      setAuthStatus({ setupRequired: false });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "No se pudo iniciar sesión.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function endLocalSession() {
    if (localSession) await logoutLocalUser(localSession.token);
    setLocalSessionToken(null);
    setLocalSession(null);
    setSettingsOpen(false); setModal(null); setView("dashboard");
    setClients([]); setProperties([]); setEstimates([]); setWorkOrders([]);
    setInvoices([]); setCustomerPayments([]); setExpenses([]);
    setAssignedWorkTasks([]);
    setAuthPassword("");
  }

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!printEstimate) return;
    const timeout = window.setTimeout(() => window.print(), 250);
    const clearAfterPrint = () => setPrintEstimate(null);
    window.addEventListener("afterprint", clearAfterPrint);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("afterprint", clearAfterPrint);
    };
  }, [printEstimate]);

  useEffect(() => {
    if (!invoiceToPrint) return;
    const timeout = window.setTimeout(() => window.print(), 250);
    const clearAfterPrint = () => setInvoiceToPrint(null);
    window.addEventListener("afterprint", clearAfterPrint);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("afterprint", clearAfterPrint);
    };
  }, [invoiceToPrint]);

  const filteredClients = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return clients.filter((client) => {
      const matchesType = clientFilter === "all" || client.type === clientFilter;
      const matchesSearch =
        !normalized ||
        [client.name, client.company_name, client.phone, client.email]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(normalized));
      return matchesType && matchesSearch;
    });
  }, [clients, clientFilter, search]);

  const filteredProperties = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return properties.filter((property) => {
      const propertyType = property.relationship_type === "manager" ? "property_manager" : property.relationship_type === "owner" ? "direct" : null;
      const matchesType = propertyClientFilter === "all" || propertyType === propertyClientFilter;
      const matchesSearch = !normalized || [property.address_line1, property.city, property.client_name]
        .filter(Boolean).some((value) => value!.toLocaleLowerCase().includes(normalized));
      return matchesType && matchesSearch;
    });
  }, [properties, propertyClientFilter, search]);

  const filteredWorkOrders = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return workOrders.filter((order) => {
      const matchesType = workOrderClientFilter === "all" || order.client_type === workOrderClientFilter;
      const matchesSearch = !normalized || [order.recipient_name, order.contact_name, order.contact_phone, order.address_line1, order.description]
        .some((value) => value.toLocaleLowerCase().includes(normalized));
      return matchesType && matchesSearch;
    });
  }, [workOrders, workOrderClientFilter, search]);

  const filteredEstimates = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return estimates.filter((estimate) => {
      const matchesType = estimateClientFilter === "all" || estimate.client_type === estimateClientFilter;
      const matchesSearch = !normalized || [estimate.recipient_name, estimate.contact_name, estimate.contact_phone, estimate.address_line1, estimate.description]
        .some((value) => value.toLocaleLowerCase().includes(normalized));
      return matchesType && matchesSearch;
    });
  }, [estimates, estimateClientFilter, search]);

  const followUpSuggestions = useMemo(
    () => buildFollowUpSuggestions(estimates, workOrders, followUpSettings, followUpOverrides, new Date().toISOString(), invoices),
    [estimates, workOrders, followUpSettings, followUpOverrides, invoices],
  );

  function openForm(kind: ModalKind) {
    setClientToEdit(null);
    setPropertyToEdit(null);
    setEstimateWorkOrder(null);
    setEstimateToRevise(null);
    setEstimateHistoryTarget(null);
    setOrderToEdit(null);
    setModal(kind);
  }

  function closeForm() {
    setModal(null);
    setClientToEdit(null);
    setPropertyToEdit(null);
    setEstimateWorkOrder(null);
    setEstimateToRevise(null);
    setEstimateHistoryTarget(null);
    setOrderToEdit(null);
  }

  function editClient(client: Client) {
    setPropertyToEdit(null);
    setClientToEdit(client);
    setModal("client");
  }

  function editProperty(property: Property) {
    setClientToEdit(null);
    setPropertyToEdit(property);
    setModal("property");
  }

  function startEstimateFromWorkOrder(order: WorkOrder) {
    setEstimateWorkOrder(order);
    setEstimateToRevise(null);
    setEstimateHistoryTarget(null);
    setModal("estimate");
  }

  function startStandaloneEstimate() {
    setEstimateWorkOrder(null);
    setEstimateToRevise(null);
    setEstimateHistoryTarget(null);
    setModal("estimate");
  }

  function startRevision(estimate: Estimate) {
    setEstimateWorkOrder(null);
    setEstimateToRevise(estimate);
    setEstimateHistoryTarget(null);
    setModal("estimate");
  }

  async function showEstimateHistory(estimate: Estimate) {
    const versions = await listEstimateVersions(estimate.id);
    setEstimateVersions(versions);
    setEstimateHistoryTarget(estimate);
    setModal("estimate-history");
  }

  async function editWorkOrder(order: WorkOrder) {
    let orderWithCodes = order;
    if (localSession?.role === "admin" || localSession?.canViewAccessCodes) {
      try {
        const codes = await getWorkOrderAccessCodes(localSession.token, order.id);
        orderWithCodes = { ...order, lockbox_code: codes.lockboxCode, gate_code: codes.gateCode };
      } catch (cause) {
        setToast(cause instanceof Error ? cause.message : (locale === "es" ? "No se pudieron cargar los códigos." : "Could not load access codes."));
        return;
      }
    }
    setOrderToEdit(orderWithCodes);
    setModal("work-order");
  }

  async function handleSaveClient(input: ClientInput, existingId?: string, relatedWorkOrderIds: string[] = []) {
    if (existingId) await updateClient(existingId, input, relatedWorkOrderIds);
    else await createClient(input);
    await refreshData();
    closeForm();
    setToast(t("created"));
  }

  async function handleSaveProperty(input: PropertyInput, existingId?: string, relatedWorkOrderIds: string[] = [], newClientId?: string) {
    if (existingId) {
      await updateProperty(existingId, input, relatedWorkOrderIds, newClientId);
      await refreshData();
      closeForm();
      setToast(t("created"));
      return;
    }
    const linkedClient = clients.find((client) => client.id === input.clientId);
    if (!linkedClient) throw new Error(t("selectClient"));
    await createProperty(input, linkedClient.type);
    await refreshData();
    closeForm();
    setToast(t("created"));
  }

  async function handleSetWorkspaceCurrency(currencyCode: string) {
    await setWorkspaceCurrency(currencyCode);
    setWorkspaceCurrencyState(currencyCode);
  }

  async function handleSetWorkspaceInvoiceTaxRate(rateBasisPoints: number) {
    await setWorkspaceInvoiceTaxRate(rateBasisPoints);
    setWorkspaceInvoiceTaxRateBasisPoints(rateBasisPoints);
  }

  async function handleSaveWorkspaceEmailClientIds(input: Pick<WorkspaceEmailSettings, "gmail_oauth_client_id" | "microsoft_oauth_client_id">) {
    await setWorkspaceEmailClientIds(input);
    setWorkspaceEmailSettings((current) => ({ ...current, ...input }));
  }

  async function handleConnectEmailProvider(provider: EmailProvider, googleClientSecret?: string) {
    const accountEmail = await connectEmailProvider(provider, googleClientSecret);
    setWorkspaceEmailSettings(await getWorkspaceEmailSettings());
    return accountEmail;
  }

  async function handleDisconnectEmailProvider(provider: EmailProvider) {
    await disconnectEmailProvider(provider);
    setWorkspaceEmailSettings(await getWorkspaceEmailSettings());
  }

  async function handleSendInvoiceEmail(invoiceId: string, recipientEmail: string, provider: EmailProvider, pdfBase64: string) {
    await sendInvoiceEmail({ invoiceId, recipientEmail, provider, pdfBase64 });
    await refreshData();
    setToast(t("invoiceEmailSent"));
  }

  async function handleSetWorkspaceLanguage(language: Locale) {
    await setWorkspaceLanguage(language);
    setLocale(language);
  }

  async function handleSetWorkspaceRegion(settings: WorkspaceRegionalSettings) {
    await setWorkspaceRegionalSettings(settings);
    setWorkspaceRegion(settings);
  }

  async function handleSetViewPreferences(preferences: WorkspaceViewPreferences) {
    await setWorkspaceViewPreferences(preferences);
    setViewPreferences(preferences);
  }

  async function handleSaveEstimate(input: EstimateDraftInput, standaloneDetails?: StandaloneEstimateDetails) {
    if (estimateToRevise) {
      await reviseEstimate(estimateToRevise.id, input);
      setToast(t("estimateRevised"));
    } else if (estimateWorkOrder) {
      await createEstimateFromOrder(estimateWorkOrder.id, input);
      setToast(t("estimateSaved"));
    } else if (standaloneDetails) {
      await createStandaloneEstimate(input, standaloneDetails);
      setToast(t("estimateSaved"));
    }
    await refreshData();
    closeForm();
  }

  async function handleEstimateStatus(estimate: Estimate, status: Estimate["status"]) {
    try {
      await changeEstimateStatus(estimate.id, status);
      await refreshData();
      if (status === "accepted") {
        const linkedOrder = (await listWorkOrders()).find((order) => order.estimate_id === estimate.id);
        if (linkedOrder) {
          setOrderToEdit(linkedOrder);
          setModal("work-order");
          setToast(t("acceptedScheduleHint"));
          return;
        }
      }
      setToast(t("estimateStatusChanged"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("required"));
    }
  }

  async function handleCreateWorkOrder(input: CreateWorkOrderInput, tasks: WorkOrderTaskDraft[]) {
    await createWorkOrder(input, tasks);
    await refreshData();
    closeForm();
    setToast(t("orderCreated"));
  }

  async function handleUpdateWorkOrder(orderId: string, input: WorkOrderUpdateInput, tasks: WorkOrderTaskDraft[]) {
    await updateWorkOrder(orderId, input, tasks);
    await refreshData();
    closeForm();
    setToast(t("created"));
  }

  async function handleEmployeeOrderTransition(task: AssignedWorkTask, status: "completed" | "cancelled") {
    if (!localSession || localSession.role !== "user") return;
    const english = locale === "en";
    const cancellationReason = status === "cancelled"
      ? window.prompt(english ? "Why are you cancelling your task assignment?" : "¿Por qué cancelas tu asignación de esta tarea?")
      : undefined;
    if (status === "cancelled" && cancellationReason === null) return;
    if (status === "completed" && !window.confirm(english ? "Mark your assigned task as completed now?" : "¿Marcar ahora tu tarea asignada como realizada?")) return;
    try {
      await transitionAssignedWorkOrder(localSession.token, task.assignmentId, status, cancellationReason ?? undefined);
      await refreshData();
      setToast(status === "completed" ? (english ? "Your task was marked completed." : "Tu tarea se marcó como realizada.") : (english ? "Your task assignment was cancelled." : "Se canceló tu asignación de la tarea."));
    } catch (cause) {
      setToast(cause instanceof Error ? cause.message : (english ? "Could not update work order." : "No se pudo actualizar la orden."));
    }
  }

  async function handleEmployeeEstimateDraft(order: WorkOrder, existing?: Estimate) {
    if (!localSession || localSession.role !== "user") return;
    const initial = existing?.items ?? order.items;
    const value = window.prompt(locale === "en" ? "Enter the required work items, one per line. Do not enter prices." : "Ingresa los trabajos necesarios, uno por renglón. No escribas precios.", initial.join("\n"));
    if (value === null) return;
    try {
      const items = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      await saveAssignedEstimateDraft(localSession.token, order.id, items);
      await refreshData();
      setToast(locale === "en" ? "Unpriced draft saved for admin review." : "Borrador sin precio guardado para revisión del admin.");
    } catch (cause) {
      setToast(cause instanceof Error ? cause.message : (locale === "en" ? "Could not save the draft." : "No se pudo guardar el borrador."));
    }
  }

  async function handleSaveEmployee(employee: Pick<Employee, "id" | "name" | "color" | "worker_type">) {
    await saveEmployee(employee);
    await refreshData();
  }

  async function handleSaveFollowUpSettings(settings: FollowUpSettings) {
    await setFollowUpSettings(settings);
    await refreshData();
  }

  async function handleSaveFollowUpTask(input: { taskType: FollowUpSuggestion["task_type"]; entityId: string; dueAt: string; status: FollowUpTaskOverride["status"] }) {
    await saveFollowUpTask(input);
    await refreshData();
  }

  async function handleCreateExpense(input: Parameters<typeof createExpense>[0]) {
    await createExpense(input);
    await refreshData();
    setToast(t("expenseSaved"));
  }

  async function handleCreateEmployeePayment(input: Parameters<typeof createEmployeePayment>[0]) {
    await createEmployeePayment(input);
    await refreshData();
    setToast(t("employeePaymentSaved"));
  }

  async function handleCreateInvoice(workOrderId: string) {
    await createInvoice(workOrderId);
    await refreshData();
    setToast(t("invoiceDraftCreated"));
  }

  async function handleIssueInvoice(invoiceId: string) {
    if (!window.confirm(t("issueInvoiceConfirm"))) return;
    await issueInvoice(invoiceId);
    await refreshData();
    setToast(t("invoiceIssued"));
  }

  async function handleVoidInvoice(invoiceId: string) {
    const reason = window.prompt(t("voidInvoiceReasonPrompt"));
    if (!reason?.trim()) return;
    await voidInvoice(invoiceId, reason);
    await refreshData();
    setToast(t("invoiceVoided"));
  }

  async function handleCreateCustomerPayment(input: Parameters<typeof createCustomerPayment>[0]) {
    await createCustomerPayment(input);
    await refreshData();
    setToast(t("customerPaymentRecorded"));
  }

  async function handleConfigureBackups(password: string) {
    let recoveryCode: string;
    try {
      recoveryCode = await configureBackups(password);
      const status = await getBackupStatus();
      if (!status.configured) {
        throw new Error("No se pudo verificar la contraseña y la clave de recuperación en el llavero del sistema.");
      }
      setBackupStatus(status);
    } catch (error) {
      try { setBackupStatus(await getBackupStatus()); } catch { /* Preserve the original setup error. */ }
      throw error;
    }
    try {
      await createDailyBackupIfDue();
      setBackupStatus(await getBackupStatus());
      setBackupError("");
    } catch (cause) {
      setBackupError(cause instanceof Error ? cause.message : t("backupFailed"));
    }
    return recoveryCode;
  }

  async function handleRevealBackupCode(password: string) {
    try {
      return await revealBackupRecoveryCode(password);
    } catch (error) {
      try { setBackupStatus(await getBackupStatus()); } catch { /* Preserve the original keychain error. */ }
      throw error;
    }
  }

  async function handleExportBackup(): Promise<string | null> {
    try {
      const path = await exportEncryptedBackup();
      if (path) setBackupError("");
      return path;
    } catch (error) {
      try { setBackupStatus(await getBackupStatus()); } catch { /* Preserve the original export error. */ }
      throw error;
    }
  }

  async function handleRestoreBackup(backupPath: string, unlockSecret: string, newPassword: string) {
    let recoveryCode: string;
    try {
      await closeDatabaseForRestore();
      recoveryCode = await restoreEncryptedBackup(backupPath, unlockSecret, newPassword);
    } catch (cause) {
      try { await refreshData(); } catch { /* Keep the original pre-commit restore error. */ }
      throw cause;
    }
    // Once this command resolves, the database replacement has committed. Do
    // not report a post-commit UI refresh/backup error as a failed restore.
    try {
      await refreshData();
    } catch (refreshCause) {
      setDbError(refreshCause instanceof Error ? refreshCause.message : "No se pudieron actualizar los datos tras restaurar.");
    }
    try {
      setBackupStatus(await getBackupStatus());
    } catch (statusCause) {
      setBackupError(statusCause instanceof Error ? statusCause.message : t("backupFailed"));
    }
    try {
      await createDailyBackupIfDue();
      setBackupStatus(await getBackupStatus());
      setBackupError("");
    } catch (backupCause) {
      setBackupError(backupCause instanceof Error ? backupCause.message : t("backupFailed"));
    }
    return recoveryCode;
  }

  async function handleApplyCustomerPayment(paymentId: string, allocations: InvoicePaymentAllocationDraft[]) {
    await applyCustomerPayment(paymentId, allocations);
    await refreshData();
    setToast(t("paymentAllocationSaved"));
  }

  const titles: Record<View, string> = {
    dashboard: t("overview"),
    clients: t("clients"),
    properties: t("properties"),
    estimates: t("estimates"),
    work_orders: t("workOrders"),
    schedule: t("schedule"),
    follow_ups: t("follow_ups"),
    expenses: t("expenses"),
    staff_payments: t("staff_payments"),
    billing: t("billing"),
    reports: t("reports"),
  };
  const visibleNavItems = localSession?.role === "user"
    ? navItems.filter(({ id }) => id === "work_orders" || id === "estimates")
    : navItems;

  if (isDesktopRuntime() && !localSession) {
    const english = locale === "en";
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-800">
        <form onSubmit={(event) => void submitLocalAuth(event)} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white"><Wrench size={20} /></div><div><h1 className="text-lg font-bold text-slate-900">HandySystem</h1><p className="text-xs text-slate-500">{authStatus?.setupRequired ? (english ? "Set up the local admin account" : "Configura la cuenta admin local") : (english ? "Local sign in" : "Inicio de sesión local")}</p></div></div>
          {loading ? <p className="text-sm text-slate-500">{english ? "Loading…" : "Cargando…"}</p> : <>
            <label className="field-group mb-4 block"><span className="field-label">{english ? "Username" : "Usuario"}</span><input autoComplete="username" required minLength={3} maxLength={64} className="form-input" value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} /></label>
            <label className="field-group mb-4 block"><span className="field-label">{english ? "Password" : "Contraseña"}</span><input type="password" autoComplete={authStatus?.setupRequired ? "new-password" : "current-password"} required minLength={authStatus?.setupRequired ? 12 : undefined} className="form-input" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} />{authStatus?.setupRequired && <span className="mt-1 block text-[11px] text-slate-500">{english ? "At least 12 characters. It is stored as a secure hash." : "Mínimo 12 caracteres. Se guarda como hash seguro."}</span>}</label>
            {authError && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{authError}</p>}
            {dbError && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{dbError}</p>}
            <button type="submit" disabled={authBusy || !authStatus} className="primary-button w-full disabled:opacity-50">{authBusy ? (english ? "Please wait…" : "Un momento…") : authStatus?.setupRequired ? (english ? "Create admin account" : "Crear cuenta admin") : (english ? "Sign in" : "Iniciar sesión")}</button>
          </>}
        </form>
      </main>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-slate-50 text-slate-800">
      <aside className="sidebar fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-6">
          <div className="brand-mark flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Wrench size={20} strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-[16px] font-bold tracking-tight text-slate-900">HandySystem</div>
            <div className="text-[10px] font-semibold tracking-[0.14em] text-slate-400">{t("workspace")}</div>
          </div>
        </div>

        <div className="px-4 pt-7">
          <div className="mb-3 px-3 text-[10px] font-bold tracking-[0.16em] text-slate-400">{t("nav")}</div>
          <nav className="space-y-1" aria-label={t("nav")}>
            {visibleNavItems.map(({ id, icon: Icon, label }) => {
              const active = view === id;
              return (
                <button
                  key={id}
                  className={`nav-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition ${
                    active ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                  onClick={() => {
                    setView(id);
                    setSearch("");
                  }}
                >
                  <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                  <span>{t(label)}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-slate-100 p-4">
          <div className="mb-3 rounded-xl bg-slate-50 p-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 rounded-lg bg-white p-2 text-indigo-600 shadow-sm"><CircleHelp size={15} /></div>
              <div>
                <div className="text-xs font-semibold text-slate-700">{locale === "es" ? "¿Necesitas ayuda?" : "Need help?"}</div>
                <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  {locale === "es" ? "Organiza tu trabajo, clientes y propiedades." : "Keep jobs, clients and properties organized."}
                </div>
              </div>
            </div>
          </div>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={15} /><span>{t("settings")}</span>
          </button>
        </div>
      </aside>

      <div className="main-column min-h-screen lg:pl-[248px]">
        <header className="topbar sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white lg:hidden"><Wrench size={18} /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
                <span>{t("workspace")}</span><ChevronRight size={12} /><span className="truncate text-slate-500">{titles[view]}</span>
              </div>
              <h1 className="mt-0.5 truncate text-[16px] font-semibold tracking-tight text-slate-900">{titles[view]}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <label className="search-box hidden h-9 w-[230px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 md:flex xl:w-[280px]">
              <Search size={15} className="shrink-0 text-slate-400" />
              <input className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("search")} />
              <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-400">⌘ K</span>
            </label>
            <button onClick={() => setToast(locale === "es" ? "No tienes notificaciones nuevas" : "You have no new notifications")} className="icon-button relative flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label={locale === "es" ? "Notificaciones" : "Notifications"}>
              <Bell size={16} /><span className="absolute right-[7px] top-[7px] size-1.5 rounded-full bg-indigo-500 ring-2 ring-white" />
            </button>
            {localSession?.role !== "user" && <button onClick={() => setSettingsOpen(true)} className="icon-button flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label={t("settings")} title={t("settings")}><Settings2 size={16} /></button>}
            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
              <div className="flex size-8 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">{(localSession?.username ?? "DM").slice(0, 2).toUpperCase()}</div>
              <div className="hidden xl:block">
                <div className="text-xs font-semibold text-slate-700">{localSession?.username ?? "Demo Manager"}</div>
                <div className="text-[10px] text-slate-400">{localSession?.role ?? "Admin"}</div>
              </div>
              {localSession && <button type="button" onClick={() => void endLocalSession()} className="ml-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">{locale === "es" ? "Salir" : "Sign out"}</button>}
            </div>
          </div>
        </header>

        <main className="content mx-auto max-w-[1440px] px-5 py-7 md:px-8 md:py-9">
          <label className="search-box mb-5 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 md:hidden">
            <Search size={15} className="shrink-0 text-slate-400" />
            <input className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("search")} />
          </label>
          {!isDesktopRuntime() && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <CircleHelp size={17} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">{locale === "es" ? "Vista previa" : "Preview mode"}</div>
                <div className="mt-0.5 text-xs leading-relaxed">{t("databaseUnavailable")} {locale === "es" ? "Ejecuta `npm run tauri dev` después de instalar Rust para habilitar el guardado." : "Run `npm run tauri dev` after installing Rust to enable saving."}</div>
              </div>
            </div>
          )}
          {dbError && <div role="alert" className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{dbError}</div>}

          {view === "dashboard" && (
            <Dashboard
              locale={locale}
              t={t}
              clients={clients}
              properties={properties}
              workOrders={workOrders}
              loading={loading}
              onNavigate={setView}
              onCreate={openForm}
              onCreateWorkOrder={() => { setOrderToEdit(null); setModal("work-order"); }}
            />
          )}
          {view === "clients" && (
            <ClientsView clients={filteredClients} filter={clientFilter} search={search} viewMode={viewPreferences.clients_view} locale={locale} t={t} onFilter={setClientFilter} onAdd={() => openForm("client")} onEdit={editClient} />
          )}
          {view === "properties" && (
            <PropertiesView properties={filteredProperties} clients={clients} search={search} typeFilter={propertyClientFilter} onTypeFilter={setPropertyClientFilter} viewMode={viewPreferences.properties_view} locale={locale} t={t} onAdd={() => openForm("property")} onEdit={editProperty} />
          )}
          {view === "estimates" && (localSession?.role === "user"
            ? <EmployeeEstimatesView orders={workOrders} estimates={estimates} locale={locale} onEditDraft={handleEmployeeEstimateDraft} />
            : <EstimatesView estimates={filteredEstimates} typeFilter={estimateClientFilter} onTypeFilter={setEstimateClientFilter} viewMode={viewPreferences.estimates_view} locale={locale} t={t} onAdd={startStandaloneEstimate} onRevise={startRevision} onHistory={showEstimateHistory} onStatusChange={handleEstimateStatus} onPrint={setPrintEstimate} />)}
          {view === "work_orders" && (localSession?.role === "user"
            ? <MyAssignedTasksView tasks={assignedWorkTasks} locale={locale} timeZone={workspaceRegion.timezone} onTransition={handleEmployeeOrderTransition} />
            : <WorkOrdersView workOrders={filteredWorkOrders} estimates={estimates} typeFilter={workOrderClientFilter} onTypeFilter={setWorkOrderClientFilter} viewMode={viewPreferences.work_orders_view} locale={locale} timeZone={workspaceRegion.timezone} t={t} onEdit={editWorkOrder} onAdd={() => { setOrderToEdit(null); setModal("work-order"); }} onCreateEstimate={startEstimateFromWorkOrder} onReviseEstimate={startRevision} />)}
          {view === "schedule" && <ScheduleView orders={workOrders} employees={employees} timeZone={workspaceRegion.timezone} locale={locale} t={t} onEdit={editWorkOrder} />}
          {view === "follow_ups" && <FollowUpsView suggestions={followUpSuggestions} settings={followUpSettings} timeZone={workspaceRegion.timezone} locale={locale} t={t} onSaveTask={handleSaveFollowUpTask} onOpen={(suggestion) => {
             if (suggestion.task_type === "appointment_confirmation") {
               const order = workOrders.find((item) => item.id === suggestion.entity_id);
               if (order) editWorkOrder(order);
             } else if (suggestion.task_type === "invoice_payment_follow_up") {
               setView("billing");
             } else {
              setSearch(suggestion.recipient_name);
              setView("estimates");
            }
          }} onOpenSettings={() => setSettingsOpen(true)} />}
          {view === "expenses" && <ExpensesView expenses={expenses} workOrders={workOrders} workspaceCurrency={workspaceCurrency} timeZone={workspaceRegion.timezone} locale={locale} t={t} onCreate={handleCreateExpense} onOpenSettings={() => setSettingsOpen(true)} />}
          {view === "staff_payments" && <EmployeePaymentsView payments={employeePayments} payableCosts={payableWorkCosts} employees={employees} workOrders={workOrders} workspaceCurrency={workspaceCurrency} timeZone={workspaceRegion.timezone} locale={locale} t={t} onCreate={handleCreateEmployeePayment} onOpenSettings={() => setSettingsOpen(true)} />}
           {view === "billing" && <BillingView invoices={invoices} payments={customerPayments} workOrders={workOrders} workspaceCurrency={workspaceCurrency} workspaceName={workspaceName} emailSettings={workspaceEmailSettings} timeZone={workspaceRegion.timezone} locale={locale} t={t} onCreateInvoice={handleCreateInvoice} onIssueInvoice={handleIssueInvoice} onVoidInvoice={handleVoidInvoice} onCreatePayment={handleCreateCustomerPayment} onApplyPayment={handleApplyCustomerPayment} onPrint={setInvoiceToPrint} onSendInvoice={handleSendInvoiceEmail} onOpenSettings={() => setSettingsOpen(true)} />}
          {view === "reports" && <ReportsView workOrders={workOrders} estimates={estimates} invoices={invoices} customerPayments={customerPayments} expenses={expenses} staffPayments={employeePayments} timeZone={workspaceRegion.timezone} locale={locale} t={t} />}
        </main>
      </div>

      <div className="mobile-nav fixed inset-x-0 bottom-0 z-20 flex gap-1 overflow-x-auto border-t border-slate-200 bg-white px-1 py-2 lg:hidden">
        {visibleNavItems.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setView(id)} className={`flex min-w-[58px] shrink-0 flex-col items-center gap-1 rounded-lg py-1.5 text-[9px] font-medium ${view === id ? "text-indigo-700" : "text-slate-400"}`}>
            <Icon size={18} /><span>{t(label)}</span>
          </button>
        ))}
      </div>

      {modal === "client" && <ClientForm key={clientToEdit?.id ?? "new-client"} client={clientToEdit ?? undefined} relatedOrders={clientToEdit ? workOrders.filter((order) => order.client_id === clientToEdit.id) : []} locale={locale} t={t} onClose={closeForm} onSave={handleSaveClient} />}
      {modal === "property" && <PropertyForm key={propertyToEdit?.id ?? "new-property"} clients={clients} property={propertyToEdit ?? undefined} relatedOrders={propertyToEdit ? workOrders.filter((order) => order.property_id === propertyToEdit.id) : []} locale={locale} timeZone={workspaceRegion.timezone} t={t} onClose={closeForm} onSave={handleSaveProperty} />}
      {modal === "estimate" && <EstimateForm key={estimateToRevise?.id ?? estimateWorkOrder?.id ?? "new-estimate"} clients={clients} properties={properties} workOrder={estimateWorkOrder ?? undefined} estimate={estimateToRevise ?? undefined} workspaceCurrency={workspaceCurrency} locale={locale} t={t} onClose={closeForm} onOpenSettings={() => setSettingsOpen(true)} onSave={handleSaveEstimate} />}
      {modal === "estimate-history" && estimateHistoryTarget && <EstimateHistoryModal estimate={estimateHistoryTarget} versions={estimateVersions} locale={locale} timeZone={workspaceRegion.timezone} t={t} onClose={closeForm} onPrint={(version) => setPrintEstimate(estimateVersionForPrint(estimateHistoryTarget, version))} />}
      {modal === "work-order" && <WorkOrderForm key={orderToEdit?.id ?? "new-work-order"} clients={clients} properties={properties} employees={employees} workOrder={orderToEdit ?? undefined} sessionToken={localSession?.token ?? ""} canViewAccessCodes={Boolean(localSession?.canViewAccessCodes || localSession?.role === "admin")} workspaceCurrency={workspaceCurrency} timeZone={workspaceRegion.timezone} locale={locale} t={t} onClose={closeForm} onCreate={handleCreateWorkOrder} onUpdate={handleUpdateWorkOrder} onOpenSettings={() => setSettingsOpen(true)} />}
      {settingsOpen && localSession?.role === "admin" && <SettingsModal locale={locale} t={t} sessionToken={localSession.token} isAdmin={true} currencyCode={workspaceCurrency} workspaceInvoiceTaxRateBasisPoints={workspaceInvoiceTaxRateBasisPoints} emailSettings={workspaceEmailSettings} regionalSettings={workspaceRegion} viewPreferences={viewPreferences} employees={employees} followUpSettings={followUpSettings} backupStatus={backupStatus} backupError={backupError} onBackupConfigure={handleConfigureBackups} onBackupRecoveryReveal={handleRevealBackupCode} onBackupExport={handleExportBackup} onBackupSelectFile={selectEncryptedBackupFile} onBackupRestore={handleRestoreBackup} onFollowUpSettingsSave={handleSaveFollowUpSettings} onEmployeeSave={handleSaveEmployee} onCurrencyChange={handleSetWorkspaceCurrency} onInvoiceTaxRateSave={handleSetWorkspaceInvoiceTaxRate} onEmailClientIdsSave={handleSaveWorkspaceEmailClientIds} onEmailConnect={handleConnectEmailProvider} onEmailDisconnect={handleDisconnectEmailProvider} onLocaleChange={handleSetWorkspaceLanguage} onRegionalSave={handleSetWorkspaceRegion} onViewPreferencesSave={handleSetViewPreferences} onClose={() => setSettingsOpen(false)} />}
      {printEstimate && <EstimatePrintView estimate={printEstimate} workspaceName={workspaceName} locale={locale} timeZone={workspaceRegion.timezone} t={t} />}
      {invoiceToPrint && <InvoicePrintView invoice={invoiceToPrint} workspaceName={workspaceName} locale={locale} timeZone={workspaceRegion.timezone} t={t} />}
      {toast && <div role="status" className="toast fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl"><Check size={16} className="text-emerald-300" />{toast}</div>}
    </div>
  );
}

function Dashboard({
  locale,
  t,
  clients,
  properties,
  workOrders,
  loading,
  onNavigate,
  onCreate,
  onCreateWorkOrder,
}: {
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  clients: Client[];
  properties: Property[];
  workOrders: WorkOrder[];
  loading: boolean;
  onNavigate: (view: View) => void;
  onCreate: (kind: ModalKind) => void;
  onCreateWorkOrder: () => void;
}) {
  const pending = workOrders.filter((order) => order.status === "pending" || order.status === "pending_approval").length;
  const cards = [
    { label: t("workOrders"), value: workOrders.length, change: `${pending} ${t("open").toLocaleLowerCase()}`, icon: Wrench, iconClass: "bg-indigo-50 text-indigo-600", trend: "up" },
    { label: t("totalClients"), value: clients.length, change: `${clients.filter((client) => client.type === "direct").length} ${t("direct").toLocaleLowerCase()}`, icon: Users, iconClass: "bg-emerald-50 text-emerald-600", trend: "up" },
    { label: t("totalProperties"), value: properties.length, change: locale === "es" ? "Registradas" : "On file", icon: Building2, iconClass: "bg-violet-50 text-violet-600", trend: "up" },
    { label: t("needsAttention"), value: pending, change: locale === "es" ? "Órdenes por atender" : "Orders to review", icon: Clock3, iconClass: "bg-amber-50 text-amber-600", trend: "down" },
  ];

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400"><span className="size-1.5 rounded-full bg-emerald-500" />{t("today")}</div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{t("overview")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("overviewSubtitle")}</p>
        </div>
        <button onClick={onCreateWorkOrder} className="primary-button inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 active:bg-indigo-800"><Plus size={16} />{t("createWorkOrder")}</button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("overview")}>
        {cards.map(({ label, value, change, icon: Icon, iconClass, trend }) => (
          <article key={label} className="stat-card rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02]">
            <div className="flex items-start justify-between">
              <div className={`flex size-9 items-center justify-center rounded-lg ${iconClass}`}><Icon size={17} /></div>
              {trend === "up" ? <ArrowUpRight size={16} className="text-slate-300" /> : <ArrowDownRight size={16} className="text-amber-400" />}
            </div>
            <div className="mt-4 text-[26px] font-semibold leading-none tracking-tight text-slate-900">{loading ? "—" : value}</div>
            <div className="mt-2 text-xs font-medium text-slate-500">{label}</div>
            <div className="mt-3 text-[10px] text-slate-400">{change}</div>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(290px,0.85fr)]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02]">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{t("workOrders")}</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">{locale === "es" ? "Últimos trabajos registrados" : "Latest jobs logged"}</p>
            </div>
            <button onClick={() => onNavigate("work_orders")} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">{t("seeAll")}<ChevronRight size={14} /></button>
          </div>
          {workOrders.length === 0 ? (
            <EmptyState icon={Wrench} title={t("noWorkOrders")} detail={t("workOrdersSubtitle")} action={t("createWorkOrder")} onAction={onCreateWorkOrder} />
          ) : (
            <div className="divide-y divide-slate-100">
              {workOrders.slice(0, 5).map((order) => <div key={order.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><div className="truncate text-xs font-semibold text-slate-800">{order.recipient_name} · {order.address_line1}</div><div className="mt-1 truncate text-[11px] text-slate-500">{order.description}</div></div><Badge tone={order.status === "completed" ? "green" : order.status === "cancelled" ? "rose" : order.status === "in_progress" ? "blue" : "amber"}>{t(order.status)}</Badge></div>)}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{t("quickActions")}</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">{locale === "es" ? "Empieza por algo sencillo" : "Get something started"}</p>
            </div>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600"><BriefcaseBusiness size={16} /></div>
          </div>
          <div className="mt-4 space-y-2.5">
            <QuickAction icon={Wrench} title={t("createWorkOrder")} detail={locale === "es" ? "Registra un trabajo recibido por teléfono o mensaje" : "Log work received by phone or message"} onClick={onCreateWorkOrder} />
            <QuickAction icon={Users} title={t("newClient")} detail={t("clientHint")} onClick={() => onCreate("client")} />
            <QuickAction icon={MapPin} title={t("newProperty")} detail={t("propertyHint")} onClick={() => onCreate("property")} />
          </div>
          <div className="mt-5 rounded-lg bg-indigo-50/70 px-3.5 py-3 text-[11px] leading-relaxed text-indigo-900/70">
            {locale === "es" ? "Tus datos se guardan localmente en este dispositivo." : "Your data is stored locally on this device."}
          </div>
        </div>
      </section>
    </div>
  );
}

function ClientsView({
  clients,
  filter,
  search,
  viewMode,
  locale,
  t,
  onFilter,
  onAdd,
  onEdit,
}: {
  clients: Client[];
  filter: "all" | ClientType;
  search: string;
  viewMode: ViewMode;
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  onFilter: (filter: "all" | ClientType) => void;
  onAdd: () => void;
  onEdit: (client: Client) => void;
}) {
  return (
    <div className="space-y-6">
      <PageHeading title={t("clients")} subtitle={t("clientsSubtitle")} button={t("newClient")} onAdd={onAdd} />
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center">
        <ClientTypeFilters value={filter} onChange={onFilter} t={t} />
        <div className="text-xs text-slate-400">{clients.length} {locale === "es" ? "contactos" : "contacts"}</div>
      </div>
      {clients.length === 0 ? (
        <EmptyState icon={Users} title={search ? t("noMatches") : t("noClients")} detail={search ? "" : t("clientHint")} action={search ? undefined : t("newClient")} onAction={onAdd} />
      ) : viewMode === "list" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02]">
          <div className="hidden grid-cols-[minmax(200px,1.4fr)_minmax(120px,0.7fr)_minmax(150px,0.9fr)_minmax(180px,1fr)_40px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400 md:grid">
            <span>{t("contact")}</span><span>{t("type")}</span><span>{t("phone")}</span><span>{t("email")}</span><span aria-hidden="true" />
          </div>
          {clients.map((client) => <ClientRow key={client.id} client={client} locale={locale} t={t} onEdit={() => onEdit(client)} />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((client) => <article key={client.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02]">
            <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className={`flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${client.type === "direct" ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700"}`}>{initials(client.name)}</div><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900">{client.name}</h3><p className="truncate text-xs text-slate-500">{client.company_name || "—"}</p></div></div><button type="button" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" aria-label={t("editRecord")} title={t("editRecord")} onClick={() => onEdit(client)}><Pencil size={15} /></button></div>
            <div className="mt-4 flex items-center justify-between"><Badge tone={client.type === "direct" ? "green" : "purple"}>{t(client.type === "direct" ? "directClient" : "propertyManager")}</Badge><span className="text-xs text-slate-500">{client.phone}</span></div>
            {client.email && <p className="mt-3 truncate border-t border-slate-100 pt-3 text-xs text-slate-500">{client.email}</p>}
          </article>)}
        </div>
      )}
    </div>
  );
}

function ClientTypeFilters({ value, onChange, t }: { value: "all" | ClientType; onChange: (value: "all" | ClientType) => void; t: (key: Parameters<typeof translate>[1]) => string }) {
  const filters = [
    { id: "all" as const, label: t("allClients") },
    { id: "direct" as const, label: t("directClient") },
    { id: "property_manager" as const, label: t("propertyManager") },
  ];
  return <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("filterByType")}>
    {filters.map((item) => <button key={item.id} type="button" aria-pressed={value === item.id} onClick={() => onChange(item.id)} className={`min-h-10 rounded-md px-3 py-2 text-xs font-medium transition ${value === item.id ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>{item.label}</button>)}
  </div>;
}

function ClientRow({ client, locale, t, onEdit }: { client: Client; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; onEdit: () => void }) {
  const direct = client.type === "direct";
  return (
    <article className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-0 hover:bg-slate-50/50 sm:px-5 md:grid-cols-[minmax(200px,1.4fr)_minmax(120px,0.7fr)_minmax(150px,0.9fr)_minmax(180px,1fr)_40px] md:items-center md:gap-4 md:py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${direct ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700"}`}>{initials(client.name)}</div>
        <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{client.name}</div><div className="truncate text-[11px] text-slate-400">{client.company_name || (direct ? t("directClient") : t("propertyManager"))}</div></div>
      </div>
      <div><Badge tone={direct ? "green" : "purple"}>{direct ? t("directClient") : t("propertyManager")}</Badge></div>
      <div className="text-xs text-slate-600"><span className="mr-2 text-[10px] text-slate-400 md:hidden">{t("phone")}</span>{client.phone}</div>
      <div className="truncate text-xs text-slate-500"><span className="mr-2 text-[10px] text-slate-400 md:hidden">{t("email")}</span>{client.email || <span className="text-slate-300">—</span>}</div>
      <div className="flex justify-end md:justify-center"><button type="button" className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" aria-label={t("editRecord")} title={t("editRecord")} onClick={onEdit}><Pencil size={14} /></button></div>
      <span className="sr-only">{locale}</span>
    </article>
  );
}

function PropertiesView({ properties, clients, search, typeFilter, onTypeFilter, viewMode, locale, t, onAdd, onEdit }: { properties: Property[]; clients: Client[]; search: string; typeFilter: "all" | ClientType; onTypeFilter: (value: "all" | ClientType) => void; viewMode: ViewMode; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; onAdd: () => void; onEdit: (property: Property) => void }) {
  return (
    <div className="space-y-6">
      <PageHeading title={t("properties")} subtitle={t("propertiesSubtitle")} button={t("newProperty")} onAdd={onAdd} />
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><ClientTypeFilters value={typeFilter} onChange={onTypeFilter} t={t} /><div className="mt-2 text-xs text-slate-400">{properties.length} {locale === "es" ? "propiedades" : "properties"}</div></div>
      {clients.length === 0 && <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs text-indigo-800">{t("emptyClientsHint")}</div>}
      {properties.length === 0 ? (
        <EmptyState icon={Building2} title={search ? t("noMatches") : t("noProperties")} detail={search ? "" : t("propertyHint")} action={clients.length ? t("newProperty") : undefined} onAction={onAdd} />
      ) : viewMode === "list" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02]">
          <div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(120px,0.8fr)_minmax(160px,1fr)_44px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400 md:grid"><span>{t("address")}</span><span>{t("type")}</span><span>{t("associatedClient")}</span><span /></div>
          {properties.map((property) => <article key={property.id} className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-0 hover:bg-slate-50/50 sm:px-5 md:grid-cols-[minmax(180px,1.2fr)_minmax(120px,0.8fr)_minmax(160px,1fr)_44px] md:items-center md:gap-4">
            <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{property.address_line1}</div><div className="mt-1 truncate text-xs text-slate-500">{[property.address_line2, property.city, property.subdivision, property.postal_code].filter(Boolean).join(", ")}</div></div>
            <div><Badge tone={property.relationship_type === "manager" ? "purple" : "blue"}>{property.relationship_type === "manager" ? t("managerRole") : t("owner")}</Badge></div>
            <div className="truncate text-xs text-slate-600">{property.client_name || "—"}</div>
            <button type="button" className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" aria-label={t("editRecord")} title={t("editRecord")} onClick={() => onEdit(property)}><Pencil size={14} /></button>
          </article>)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {properties.map((property) => (
            <article key={property.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02] transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Building2 size={18} /></div>
                <div className="flex items-center gap-2"><Badge tone={property.relationship_type === "manager" ? "purple" : "blue"}>{property.relationship_type === "manager" ? t("managerRole") : t("owner")}</Badge><button type="button" className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" aria-label={t("editRecord")} title={t("editRecord")} onClick={() => onEdit(property)}><Pencil size={14} /></button></div>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">{property.address_line1}</h3>
              {property.address_line2 && <div className="text-xs text-slate-500">{property.address_line2}</div>}
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} />{[property.city, property.subdivision, property.postal_code].filter(Boolean).join(", ")}</div>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{t("linkedTo")}</div>
                <div className="mt-1 text-xs font-medium text-slate-700">{property.client_name || "—"}</div>
              </div>
            </article>
          ))}
        </div>
      )}
      <span className="sr-only">{locale}</span>
    </div>
  );
}

function EstimatesView({ estimates, typeFilter, onTypeFilter, viewMode, locale, t, onAdd, onRevise, onHistory, onStatusChange, onPrint }: {
  estimates: Estimate[];
  typeFilter: "all" | ClientType;
  onTypeFilter: (value: "all" | ClientType) => void;
  viewMode: ViewMode;
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  onAdd: () => void;
  onRevise: (estimate: Estimate) => void;
  onHistory: (estimate: Estimate) => void;
  onStatusChange: (estimate: Estimate, status: Estimate["status"]) => void;
  onPrint: (estimate: Estimate) => void;
}) {
  return <div className="space-y-6">
    <PageHeading title={t("estimates")} subtitle={t("estimatesSubtitle")} button={t("createEstimate")} onAdd={onAdd} />
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><ClientTypeFilters value={typeFilter} onChange={onTypeFilter} t={t} /><div className="mt-2 text-xs text-slate-400">{estimates.length} {t("estimates").toLocaleLowerCase()}</div></div>
    {estimates.length === 0 ? <EmptyState icon={FileText} title={t("noEstimates")} detail={t("createQuoteFirst")} action={t("createEstimate")} onAction={onAdd} /> : viewMode === "cards" ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {estimates.map((estimate) => <article key={estimate.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02]">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900">{estimate.recipient_name}</h3><p className="mt-1 truncate text-xs text-slate-500">{estimate.address_line1}</p></div><span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">v{estimate.version_number}</span></div>
        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-600">{estimate.description}</p>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3"><label className="sr-only" htmlFor={`estimate-status-card-${estimate.id}`}>{t("estimateStatus")}</label><select id={`estimate-status-card-${estimate.id}`} className="form-input h-11 min-w-0 flex-1 text-sm" value={estimate.status} disabled={estimate.status === "accepted" || estimate.status === "expired" || estimate.status === "cancelled"} onChange={(event) => onStatusChange(estimate, event.target.value as Estimate["status"])}>{(estimate.status === "draft" ? ["draft", "sent", "accepted", "cancelled"] : ["sent", "accepted", "cancelled"]).map((status) => <option key={status} value={status}>{status === "accepted" ? t("approved") : status === "cancelled" ? t("estimateCancelled") : t(status as Estimate["status"])}</option>)}</select><span className="shrink-0 text-sm font-bold text-slate-900">{formatMinorUnits(estimate.total_minor, estimate.currency_code, locale === "es" ? "es" : "en")}</span></div>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => onHistory(estimate)}><History size={14} />{t("versionHistory")}</button><button type="button" className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => onRevise(estimate)}><Pencil size={14} />{t("editEstimate")}</button><button type="button" className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => onPrint(estimate)}><Printer size={14} />{t("printEstimate")}</button></div>
      </article>)}
    </div> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02]">
      <div className="hidden grid-cols-[minmax(160px,1fr)_minmax(150px,1.2fr)_150px_100px_140px_230px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400 md:grid">
        <span>{t("contact")}</span><span>{t("description")}</span><span>{t("estimateStatus")}</span><span>{t("quoteVersion")}</span><span>{t("total")}</span><span />
      </div>
      {estimates.map((estimate) => <article key={estimate.id} className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-0 hover:bg-slate-50/50 sm:px-5 md:grid-cols-[minmax(160px,1fr)_minmax(150px,1.2fr)_150px_100px_140px_230px] md:items-center md:gap-4 md:py-3.5">
        <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{estimate.recipient_name}</div><div className="mt-0.5 truncate text-[11px] text-slate-400">{estimate.address_line1}</div></div>
        <div className="line-clamp-2 text-xs leading-relaxed text-slate-600">{estimate.description}</div>
        <div><select className="form-input h-9 text-xs" aria-label={t("estimateStatus")} value={estimate.status} disabled={estimate.status === "accepted" || estimate.status === "expired" || estimate.status === "cancelled"} onChange={(event) => onStatusChange(estimate, event.target.value as Estimate["status"])}>{(estimate.status === "draft" ? ["draft", "sent", "accepted", "cancelled"] : ["sent", "accepted", "cancelled"]).map((status) => <option key={status} value={status}>{status === "accepted" ? t("approved") : status === "cancelled" ? t("estimateCancelled") : t(status as Estimate["status"])}</option>)}</select></div>
        <div className="text-xs text-slate-600">v{estimate.version_number}</div>
        <div className="text-sm font-semibold text-slate-800">{formatMinorUnits(estimate.total_minor, estimate.currency_code, locale === "es" ? "es" : "en")}</div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className="flex h-8 items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={() => onHistory(estimate)}><History size={13} />{t("versionHistory")}</button>
          <button type="button" className="flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" aria-label={t("editEstimate")} title={t("editEstimate")} onClick={() => onRevise(estimate)}><Pencil size={14} /></button>
          <button type="button" className="flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" aria-label={t("printEstimate")} title={t("printEstimate")} onClick={() => onPrint(estimate)}><Printer size={14} /></button>
        </div>
      </article>)}
    </div>}
  </div>;
}

function EstimateForm({ clients, properties, workOrder, estimate, workspaceCurrency, locale, t, onClose, onOpenSettings, onSave }: {
  clients: Client[];
  properties: Property[];
  workOrder?: WorkOrder;
  estimate?: Estimate;
  workspaceCurrency: string | null;
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  onClose: () => void;
  onOpenSettings: () => void;
  onSave: (input: EstimateDraftInput, standaloneDetails?: StandaloneEstimateDetails) => Promise<void>;
}) {
  const standalone = !workOrder && (!estimate || !estimate.work_order_id);
  const [currencyCode, setCurrencyCode] = useState(estimate?.currency_code ?? workspaceCurrency ?? "");
  const [items, setItems] = useState<string[]>(estimate?.items ?? workOrder?.items ?? [estimate?.description ?? workOrder?.description ?? ""]);
  const [billingMode, setBillingMode] = useState<"fixed" | "time_materials">(estimate?.billing_mode ?? "fixed");
  const [amount, setAmount] = useState(estimate ? minorUnitsToDecimal(estimate.amount_minor, estimate.currency_code) : "");
  const [discountKind, setDiscountKind] = useState<"amount" | "percent">(estimate?.discount_kind ?? "amount");
  const [discountValue, setDiscountValue] = useState(() => {
    if (!estimate) return "";
    return estimate.discount_kind === "amount"
      ? minorUnitsToDecimal(estimate.discount_value, estimate.currency_code)
      : (estimate.discount_value / 100).toFixed(2);
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState(estimate?.client_id ?? workOrder?.client_id ?? "");
  const [propertyId, setPropertyId] = useState(estimate?.property_id ?? workOrder?.property_id ?? "");
  const [clientType, setClientType] = useState<ClientType>(estimate?.client_type ?? workOrder?.client_type ?? "direct");
  const [recipientName, setRecipientName] = useState(estimate?.recipient_name ?? workOrder?.recipient_name ?? "");
  const [contactName, setContactName] = useState(estimate?.contact_name ?? workOrder?.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(estimate?.contact_phone ?? workOrder?.contact_phone ?? "");
  const [tenantName, setTenantName] = useState(estimate?.tenant_name ?? workOrder?.tenant_name ?? "");
  const [tenantPhone, setTenantPhone] = useState(estimate?.tenant_phone ?? workOrder?.tenant_phone ?? "");
  const [addressLine1, setAddressLine1] = useState(estimate?.address_line1 ?? workOrder?.address_line1 ?? "");
  const [addressLine2, setAddressLine2] = useState(estimate?.address_line2 ?? workOrder?.address_line2 ?? "");
  const [city, setCity] = useState(estimate?.city ?? workOrder?.city ?? "");
  const [subdivision, setSubdivision] = useState(estimate?.subdivision ?? workOrder?.subdivision ?? "");
  const [postalCode, setPostalCode] = useState(estimate?.postal_code ?? workOrder?.postal_code ?? "");
  const fractionDigits = currencyCode ? currencyFractionDigits(currencyCode) : 2;

  useEffect(() => {
    if (!estimate && workspaceCurrency) setCurrencyCode(workspaceCurrency);
  }, [estimate, workspaceCurrency]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!currencyCode) return setError(t("currencyRequired"));
    if (!items.some((item) => item.trim()) || !amount.trim()) return setError(t("required"));
    if (standalone && !estimate && (!recipientName.trim() || !contactName.trim() || !contactPhone.trim() || !addressLine1.trim() || !city.trim())) return setError(t("required"));
    const amountMinor = decimalToMinorUnits(amount, currencyCode);
    const discount = discountKind === "amount"
      ? decimalToMinorUnits(discountValue || "0", currencyCode)
      : percentToBasisPoints(discountValue || "0");
    if (amountMinor === null || discount === null) return setError(t("required"));
    if (discountKind === "amount" && discount > amountMinor) return setError(t("required"));
    if (discountKind === "percent" && discount > 10_000) return setError(t("required"));
    setSaving(true);
    setError("");
    try {
      const standaloneDetails: StandaloneEstimateDetails | undefined = standalone && !estimate ? {
        clientId: clientId || null,
        propertyId: propertyId || null,
        clientType,
        recipientName: recipientName.trim(),
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        tenantName: clientType === "property_manager" ? tenantName.trim() : "",
        tenantPhone: clientType === "property_manager" ? tenantPhone.trim() : "",
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim(),
        city: city.trim(),
        subdivision: subdivision.trim(),
        postalCode: postalCode.trim(),
      } : undefined;
      await onSave({
        description: items.filter((item) => item.trim()).join("\n"),
        items: items.filter((item) => item.trim()),
        billingMode,
        amountMinor,
        discountKind,
        discountValue: discount,
        currencyCode,
      }, standaloneDetails);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  const amountMinor = currencyCode ? decimalToMinorUnits(amount, currencyCode) : null;
  const discountMinor = amountMinor === null ? null : discountKind === "amount"
    ? decimalToMinorUnits(discountValue || "0", currencyCode)
    : (() => {
      const bps = percentToBasisPoints(discountValue || "0");
      return bps === null ? null : Math.round((amountMinor * bps) / 10_000);
    })();
  const totalMinor = amountMinor !== null && discountMinor !== null && discountMinor <= amountMinor ? amountMinor - discountMinor : null;
  const standaloneClientOptions = clients
    .filter((client) => client.type === clientType)
    .map((client) => ({ value: client.id, label: client.name, detail: [client.company_name, client.phone].filter(Boolean).join(" · ") }));
  const standalonePropertyOptions = properties
    .filter((property) => {
      if (clientId) return !property.client_id || property.client_id === clientId;
      const linkedClient = clients.find((client) => client.id === property.client_id);
      return !linkedClient || linkedClient.type === clientType;
    })
    .map((property) => ({ value: property.id, label: property.address_line1, detail: [property.city, property.subdivision, property.client_name].filter(Boolean).join(" · ") }));

  return <Modal title={estimate ? t("editEstimate") : t("newEstimate")} subtitle={workOrder ? `${t("workOrders")} · ${workOrder.contact_name}` : standalone ? t("contactInfo") : t("versionHistory")} onClose={onClose} wide>
    <form onSubmit={submit} className="space-y-5">
      {estimate && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{locale === "es" ? `Se guardará como versión ${estimate.current_version + 1}; la versión anterior se conservará.` : `This will be saved as version ${estimate.current_version + 1}; the previous version will be preserved.`}</div>}
      <div className="field-group"><div className="field-label">{t("currency")}</div><div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">{currencyCode || workspaceCurrency || "—"}</div>{!workspaceCurrency && !estimate && <div className="mt-2 flex items-center justify-between gap-3 text-xs text-amber-800"><span>{t("currencyRequired")}</span><button type="button" className="shrink-0 font-semibold text-indigo-700 hover:text-indigo-900" onClick={onOpenSettings}>{t("openSettings")}</button></div>}</div>
      {workOrder && <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600"><strong>{workOrder.recipient_name}</strong> · {workOrder.address_line1}, {workOrder.city}</div>}
      {standalone && estimate && <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600"><strong>{recipientName}</strong> · {contactName} · {contactPhone}<br />{addressLine1}, {city}</div>}
      {standalone && !estimate && <section className="space-y-4 rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold text-slate-800">{t("standaloneEstimateContact")}</h3>
        <div className="grid gap-4 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="standalone-client-type">{t("type")}</label><select id="standalone-client-type" className="form-input h-12 text-sm" value={clientType} onChange={(event) => { const nextType = event.target.value as ClientType; setClientType(nextType); const selected = clients.find((client) => client.id === clientId); if (selected && selected.type !== nextType) { setClientId(""); setRecipientName(""); setContactName(""); setContactPhone(""); } const selectedProperty = properties.find((property) => property.id === propertyId); const propertyClient = clients.find((client) => client.id === selectedProperty?.client_id); if (propertyClient && propertyClient.type !== nextType) { setPropertyId(""); setAddressLine1(""); setAddressLine2(""); setCity(""); setSubdivision(""); setPostalCode(""); } }}><option value="direct">{t("directClient")}</option><option value="property_manager">{t("propertyManager")}</option></select></div><SearchablePicker label={t("associatedClient")} value={clientId} options={standaloneClientOptions} placeholder={t("searchClient")} noResults={t("noMatches")} onChange={(id) => { setClientId(id); const selected = clients.find((client) => client.id === id); if (selected) { setClientType(selected.type); setRecipientName(selected.company_name || selected.name); setContactName(selected.name); setContactPhone(selected.phone); const selectedProperty = properties.find((property) => property.id === propertyId); if (selectedProperty?.client_id && selectedProperty.client_id !== selected.id) { setPropertyId(""); setAddressLine1(""); setAddressLine2(""); setCity(""); setSubdivision(""); setPostalCode(""); } } }} /></div>
        <SearchablePicker label={t("linkedProperty")} value={propertyId} options={standalonePropertyOptions} placeholder={t("searchProperty")} noResults={t("noMatches")} onChange={(id) => { setPropertyId(id); const selected = properties.find((property) => property.id === id); if (selected) { setAddressLine1(selected.address_line1); setAddressLine2(selected.address_line2 || ""); setCity(selected.city); setSubdivision(selected.subdivision || ""); setPostalCode(selected.postal_code || ""); if (selected.client_id) { const client = clients.find((item) => item.id === selected.client_id); if (client) { setClientId(client.id); setClientType(client.type); setRecipientName(client.company_name || client.name); } } } }} />
        <div className="grid gap-4 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="standalone-recipient">{t("billTo")} <Required /></label><input id="standalone-recipient" className="form-input" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} required /></div><div className="field-group"><label className="field-label" htmlFor="standalone-contact">{t("contactName")} <Required /></label><input id="standalone-contact" className="form-input" value={contactName} onChange={(event) => setContactName(event.target.value)} required /></div><div className="field-group"><label className="field-label" htmlFor="standalone-phone">{t("phone")} <Required /></label><input id="standalone-phone" className="form-input" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} required /></div>{clientType === "property_manager" && <><div className="field-group"><label className="field-label" htmlFor="standalone-tenant">{t("tenantName")}</label><input id="standalone-tenant" className="form-input" value={tenantName} onChange={(event) => setTenantName(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="standalone-tenant-phone">{t("tenantPhone")}</label><input id="standalone-tenant-phone" className="form-input" value={tenantPhone} onChange={(event) => setTenantPhone(event.target.value)} /></div></>}</div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="field-group sm:col-span-2"><label className="field-label" htmlFor="standalone-address">{t("address")} <Required /></label><input id="standalone-address" className="form-input" value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} required /></div><div className="field-group"><label className="field-label" htmlFor="standalone-address2">{t("addressLine2")}</label><input id="standalone-address2" className="form-input" value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="standalone-city">{t("city")} <Required /></label><input id="standalone-city" className="form-input" value={city} onChange={(event) => setCity(event.target.value)} required /></div><div className="field-group"><label className="field-label" htmlFor="standalone-subdivision">{t("subdivision")}</label><input id="standalone-subdivision" className="form-input" value={subdivision} onChange={(event) => setSubdivision(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="standalone-postal">{t("postalCode")}</label><input id="standalone-postal" className="form-input" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} /></div></div>
      </section>}
      {workOrder && (workOrder.lockbox_code || workOrder.gate_code) && <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3"><div className="grid gap-3 sm:grid-cols-2">{workOrder.lockbox_code && <div className="field-group"><label className="field-label">Lockbox</label><input className="form-input" type="password" value={workOrder.lockbox_code} readOnly /></div>}{workOrder.gate_code && <div className="field-group"><label className="field-label">Gate code</label><input className="form-input" type="password" value={workOrder.gate_code} readOnly /></div>}</div><p className="mt-2 text-[11px] text-amber-900">{t("accessCodesOnOrder")}</p></div>}
      <div className="field-group"><label className="field-label">{t("billingMode")}</label><div className="grid grid-cols-2 gap-2">
        <ChoiceButton active={billingMode === "fixed"} onClick={() => setBillingMode("fixed")} icon={FileText}>{t("fixedPrice")}</ChoiceButton>
        <ChoiceButton active={billingMode === "time_materials"} onClick={() => setBillingMode("time_materials")} icon={Clock3}>{t("timeMaterials")}</ChoiceButton>
      </div></div>
      <div className="field-group"><label className="field-label">{t("description")} <Required /></label><div className="space-y-2">{items.map((item, index) => <div className="flex gap-2" key={index}><input className="form-input" value={item} onChange={(event) => setItems(items.map((value, row) => row === index ? event.target.value : value))} required={index === 0} /><button type="button" className="button-secondary" aria-label={t("removeWorkItem")} onClick={() => setItems(items.filter((_, row) => row !== index))} disabled={items.length === 1}>−</button></div>)}<button type="button" className="button-secondary" onClick={() => setItems([...items, ""])}>+ {t("addWorkItem")}</button></div></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field-group"><label className="field-label" htmlFor="estimate-amount">{t("baseAmount")} <Required /></label><input id="estimate-amount" className="form-input" type="number" min="0" step={1 / 10 ** fractionDigits} value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
        <div className="field-group"><div className="field-label">{t("discount")}</div><div className="mb-2 grid grid-cols-2 gap-2"><ChoiceButton large active={discountKind === "amount"} onClick={() => { setDiscountKind("amount"); setDiscountValue(""); }} icon={DollarSign}>{t("discountAmount")}</ChoiceButton><ChoiceButton large active={discountKind === "percent"} onClick={() => { setDiscountKind("percent"); setDiscountValue(""); }} icon={Percent}>{t("discountPercent")}</ChoiceButton></div><label className="sr-only" htmlFor="estimate-discount-value">{t("discount")}</label><input id="estimate-discount-value" className="form-input" type="number" min="0" max={discountKind === "percent" ? 100 : undefined} step={discountKind === "percent" ? "0.01" : 1 / 10 ** fractionDigits} value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} /></div>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"><span className="text-xs font-semibold text-slate-500">{t("total")}</span><span className="text-lg font-bold text-slate-900">{currencyCode && totalMinor !== null ? formatMinorUnits(totalMinor, currencyCode, locale === "es" ? "es" : "en") : "—"}</span></div>
      {error && <FormError>{error}</FormError>}
      <FormActions locale={locale} t={t} saving={saving} onCancel={onClose} disabled={!currencyCode} />
    </form>
  </Modal>;
}

function SettingsModal({ locale, t, sessionToken, isAdmin, currencyCode, workspaceInvoiceTaxRateBasisPoints, emailSettings, regionalSettings, viewPreferences, employees, followUpSettings, backupStatus, backupError, onBackupConfigure, onBackupRecoveryReveal, onBackupExport, onBackupSelectFile, onBackupRestore, onFollowUpSettingsSave, onEmployeeSave, onCurrencyChange, onInvoiceTaxRateSave, onEmailClientIdsSave, onEmailConnect, onEmailDisconnect, onLocaleChange, onRegionalSave, onViewPreferencesSave, onClose }: {
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  sessionToken: string;
  isAdmin: boolean;
  currencyCode: string | null;
  workspaceInvoiceTaxRateBasisPoints: number;
  emailSettings: WorkspaceEmailSettings;
  regionalSettings: WorkspaceRegionalSettings;
  viewPreferences: WorkspaceViewPreferences;
  employees: Employee[];
  followUpSettings: FollowUpSettings;
  backupStatus: BackupStatus;
  backupError: string;
  onBackupConfigure: (password: string) => Promise<string>;
  onBackupRecoveryReveal: (password: string) => Promise<string>;
  onBackupExport: () => Promise<string | null>;
  onBackupSelectFile: () => Promise<string | null>;
  onBackupRestore: (backupPath: string, unlockSecret: string, newPassword: string) => Promise<string>;
  onFollowUpSettingsSave: (settings: FollowUpSettings) => Promise<void>;
  onEmployeeSave: (employee: Pick<Employee, "id" | "name" | "color" | "worker_type">) => Promise<void>;
  onCurrencyChange: (currency: string) => Promise<void>;
  onInvoiceTaxRateSave: (rateBasisPoints: number) => Promise<void>;
  onEmailClientIdsSave: (input: Pick<WorkspaceEmailSettings, "gmail_oauth_client_id" | "microsoft_oauth_client_id">) => Promise<void>;
  onEmailConnect: (provider: EmailProvider, googleClientSecret?: string) => Promise<string>;
  onEmailDisconnect: (provider: EmailProvider) => Promise<void>;
  onLocaleChange: (locale: Locale) => Promise<void>;
  onRegionalSave: (settings: WorkspaceRegionalSettings) => Promise<void>;
  onViewPreferencesSave: (preferences: WorkspaceViewPreferences) => Promise<void>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [taxRateSaved, setTaxRateSaved] = useState(false);
  const [countryCode, setCountryCode] = useState(regionalSettings.country_code ?? "");
  const [subdivision, setSubdivision] = useState(regionalSettings.subdivision ?? "");
  const [city, setCity] = useState(regionalSettings.city ?? "");
  const [timeZone, setTimeZone] = useState(regionalSettings.timezone || "UTC");
  const [invoiceTaxPercent, setInvoiceTaxPercent] = useState((workspaceInvoiceTaxRateBasisPoints / 100).toString());
  const [gmailOAuthClientId, setGmailOAuthClientId] = useState(emailSettings.gmail_oauth_client_id ?? "");
  const [gmailOAuthClientSecret, setGmailOAuthClientSecret] = useState("");
  const [microsoftOAuthClientId, setMicrosoftOAuthClientId] = useState(emailSettings.microsoft_oauth_client_id ?? "");
  const [emailSettingsSaved, setEmailSettingsSaved] = useState(false);
  const [emailOperation, setEmailOperation] = useState<EmailProvider | "">("");
  const [emailActionError, setEmailActionError] = useState("");
  const [emailActionSuccess, setEmailActionSuccess] = useState("");
  const [views, setViews] = useState<WorkspaceViewPreferences>(viewPreferences);
  const [employeeId, setEmployeeId] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeColor, setEmployeeColor] = useState(EMPLOYEE_COLORS[0]);
  const [employeeType, setEmployeeType] = useState<Employee["worker_type"]>("employee");
  const [localUsers, setLocalUsers] = useState<LocalUserSummary[]>([]);
  const [newLocalUsername, setNewLocalUsername] = useState("");
  const [newLocalPassword, setNewLocalPassword] = useState("");
  const [newLocalEmployeeId, setNewLocalEmployeeId] = useState("");
  const [localUserError, setLocalUserError] = useState("");
  const [localUserSaved, setLocalUserSaved] = useState(false);
  const [estimateFollowUpDays, setEstimateFollowUpDays] = useState(followUpSettings.estimate_followup_days?.toString() ?? "15");
  const [appointmentConfirmationDays, setAppointmentConfirmationDays] = useState(followUpSettings.appointment_confirmation_days?.toString() ?? "15");
  const [paymentFollowUpDays, setPaymentFollowUpDays] = useState(followUpSettings.payment_followup_days?.toString() ?? "15");
  const [backupPassword, setBackupPassword] = useState("");
  const [backupPasswordConfirm, setBackupPasswordConfirm] = useState("");
  const [backupConfigured, setBackupConfigured] = useState(backupStatus.configured);
  const [backupActionError, setBackupActionError] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [exportedBackupPath, setExportedBackupPath] = useState("");
  const [restoreSucceeded, setRestoreSucceeded] = useState(false);
  const [revealPassword, setRevealPassword] = useState("");
  const [restoreFilePath, setRestoreFilePath] = useState("");
  const [restoreSecret, setRestoreSecret] = useState("");
  const [restoreNewPassword, setRestoreNewPassword] = useState("");
  const [restoreNewPasswordConfirm, setRestoreNewPasswordConfirm] = useState("");
  const currencies = supportedCurrencyCodes().map((code) => ({
    value: code,
    label: `${code} · ${new Intl.NumberFormat(locale === "es" ? "es" : "en", { style: "currency", currency: code }).format(1)}`,
  }));

  useEffect(() => {
    setCountryCode(regionalSettings.country_code ?? "");
    setSubdivision(regionalSettings.subdivision ?? "");
    setCity(regionalSettings.city ?? "");
    setTimeZone(regionalSettings.timezone || "UTC");
  }, [regionalSettings]);

  useEffect(() => {
    setInvoiceTaxPercent((workspaceInvoiceTaxRateBasisPoints / 100).toString());
  }, [workspaceInvoiceTaxRateBasisPoints]);

  useEffect(() => {
    setGmailOAuthClientId(emailSettings.gmail_oauth_client_id ?? "");
    setMicrosoftOAuthClientId(emailSettings.microsoft_oauth_client_id ?? "");
  }, [emailSettings.gmail_oauth_client_id, emailSettings.microsoft_oauth_client_id]);

  useEffect(() => setViews(viewPreferences), [viewPreferences]);
  useEffect(() => {
    setEstimateFollowUpDays(followUpSettings.estimate_followup_days?.toString() ?? "15");
    setAppointmentConfirmationDays(followUpSettings.appointment_confirmation_days?.toString() ?? "15");
    setPaymentFollowUpDays(followUpSettings.payment_followup_days?.toString() ?? "15");
  }, [followUpSettings]);

  useEffect(() => setBackupConfigured(backupStatus.configured), [backupStatus.configured]);

  useEffect(() => {
    if (!isAdmin) return;
    void listLocalUsers(sessionToken).then(setLocalUsers).catch((cause: unknown) => {
      setLocalUserError(cause instanceof Error ? cause.message : (locale === "es" ? "No se pudieron cargar los usuarios." : "Could not load users."));
    });
  }, [sessionToken, locale, isAdmin]);

  async function handleCreateLocalUser(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setLocalUserError(""); setLocalUserSaved(false);
    try {
      await createLocalUser(sessionToken, newLocalUsername, newLocalPassword, newLocalEmployeeId);
      setNewLocalUsername(""); setNewLocalPassword(""); setNewLocalEmployeeId("");
      setLocalUsers(await listLocalUsers(sessionToken)); setLocalUserSaved(true);
    } catch (cause) {
      setLocalUserError(cause instanceof Error ? cause.message : (locale === "es" ? "No se pudo crear la cuenta." : "Could not create the account."));
    } finally { setSaving(false); }
  }

  async function handleAccessPermission(user: LocalUserSummary, allowed: boolean) {
    setSaving(true); setLocalUserError(""); setLocalUserSaved(false);
    try {
      await setLocalUserAccessPermission(sessionToken, user.id, allowed);
      setLocalUsers(await listLocalUsers(sessionToken)); setLocalUserSaved(true);
    } catch (cause) {
      setLocalUserError(cause instanceof Error ? cause.message : (locale === "es" ? "No se pudo actualizar el permiso." : "Could not update permission."));
    } finally { setSaving(false); }
  }

  async function handleUserEmployee(user: LocalUserSummary, employeeId: string) {
    setSaving(true); setLocalUserError(""); setLocalUserSaved(false);
    try {
      await setLocalUserEmployee(sessionToken, user.id, employeeId);
      setLocalUsers(await listLocalUsers(sessionToken)); setLocalUserSaved(true);
    } catch (cause) {
      setLocalUserError(cause instanceof Error ? cause.message : (locale === "es" ? "No se pudo vincular el empleado." : "Could not link employee."));
    } finally { setSaving(false); }
  }

  async function changeLanguage(language: Locale) {
    setSaving(true);
    setError("");
    try {
      await onLocaleChange(language);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  async function changeCurrency(code: string) {
    if (!code || code === currencyCode) return;
    setSaving(true);
    setError("");
    try {
      await onCurrencyChange(code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  async function saveInvoiceTaxRate() {
    const rateBasisPoints = percentToBasisPoints(invoiceTaxPercent);
    if (rateBasisPoints === null || rateBasisPoints > 10_000) {
      setError(t("invoiceTaxRateRange"));
      setTaxRateSaved(false);
      return;
    }
    setSaving(true);
    setError("");
    setTaxRateSaved(false);
    try {
      await onInvoiceTaxRateSave(rateBasisPoints);
      setTaxRateSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("invoiceTaxRateRange"));
    } finally {
      setSaving(false);
    }
  }

  async function saveEmailClientIds() {
    setSaving(true);
    setError("");
    setEmailSettingsSaved(false);
    try {
      await onEmailClientIdsSave({
        gmail_oauth_client_id: gmailOAuthClientId.trim() || null,
        microsoft_oauth_client_id: microsoftOAuthClientId.trim() || null,
      });
      setEmailSettingsSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  async function connectEmailAccount(provider: EmailProvider) {
    setEmailOperation(provider);
    setEmailActionError("");
    setEmailActionSuccess("");
    try {
      const accountEmail = await onEmailConnect(provider, provider === "gmail" ? gmailOAuthClientSecret : undefined);
      setEmailActionSuccess(`${t(provider === "gmail" ? "gmailConnected" : "microsoftConnected")}: ${accountEmail}`);
      if (provider === "gmail") setGmailOAuthClientSecret("");
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
      setEmailActionError(detail || t("emailConnectionFailed"));
    } finally {
      setEmailOperation("");
    }
  }

  async function disconnectEmailAccount(provider: EmailProvider) {
    setEmailOperation(provider);
    setEmailActionError("");
    setEmailActionSuccess("");
    try {
      await onEmailDisconnect(provider);
      setEmailActionSuccess(t("emailDisconnected"));
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
      setEmailActionError(detail || t("emailConnectionFailed"));
    } finally {
      setEmailOperation("");
    }
  }

  async function saveRegionalSettings() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await onRegionalSave({
        country_code: countryCode.trim().toUpperCase() || null,
        subdivision: subdivision.trim() || null,
        city: city.trim() || null,
        timezone: timeZone.trim(),
      });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  async function saveViews() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await onViewPreferencesSave(views);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  async function saveFollowUpPreferences() {
    const parseDays = (value: string): number | null => {
      if (!value.trim()) return 15;
      const days = Number(value);
      if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error(t("followUpDaysRange"));
      return days;
    };
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await onFollowUpSettingsSave({
        estimate_followup_days: parseDays(estimateFollowUpDays),
        appointment_confirmation_days: parseDays(appointmentConfirmationDays),
        payment_followup_days: parseDays(paymentFollowUpDays),
      });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  async function configureEncryptedBackups() {
    if (backupPassword.length < 12 || backupPassword !== backupPasswordConfirm) {
      setBackupActionError(t("backupPasswordRequirements"));
      return;
    }
    setSaving(true);
    setBackupActionError("");
    try {
      const code = await onBackupConfigure(backupPassword);
      setBackupConfigured(true);
      setRecoveryCode(code);
      setBackupPassword("");
      setBackupPasswordConfirm("");
      setSaved(true);
    } catch (cause) {
      const detail = cause instanceof Error
        ? cause.message
        : typeof cause === "string"
          ? cause
          : cause && typeof cause === "object" && "message" in cause
            ? String(cause.message)
            : "";
      setBackupActionError(detail || t("backupSetupFailed"));
    } finally { setSaving(false); }
  }

  async function showRecoveryCode() {
    setSaving(true);
    setBackupActionError("");
    try {
      setRecoveryCode(await onBackupRecoveryReveal(revealPassword));
      setRevealPassword("");
    } catch (cause) { setBackupActionError(cause instanceof Error ? cause.message : t("backupUnlockFailed")); }
    finally { setSaving(false); }
  }

  async function exportLocalBackup() {
    setSaving(true);
    setBackupActionError("");
    setExportedBackupPath("");
    try {
      const savedPath = await onBackupExport();
      if (savedPath) setExportedBackupPath(savedPath);
    } catch (cause) {
      const detail = cause instanceof Error
        ? cause.message
        : typeof cause === "string"
          ? cause
          : cause && typeof cause === "object" && "message" in cause
            ? String(cause.message)
            : "";
      setBackupActionError(detail || t("backupExportFailed"));
    }
    finally { setSaving(false); }
  }

  async function chooseRestoreBackupFile() {
    setSaving(true);
    setBackupActionError("");
    try {
      const path = await onBackupSelectFile();
      if (path) {
        setRestoreFilePath(path);
        setRestoreSucceeded(false);
      }
    } catch (cause) {
      const detail = cause instanceof Error
        ? cause.message
        : typeof cause === "string"
          ? cause
          : cause && typeof cause === "object" && "message" in cause
            ? String(cause.message)
            : "";
      setBackupActionError(detail || t("backupRestoreFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function restoreLocalBackup() {
    if (!restoreFilePath || !restoreSecret.trim() || restoreNewPassword.length < 12 || restoreNewPassword !== restoreNewPasswordConfirm) {
      setBackupActionError(t("backupRestoreRequirements"));
      return;
    }
    if (!window.confirm(t("restoreBackupConfirm"))) return;
    setSaving(true);
    setBackupActionError("");
    setRestoreSucceeded(false);
    try {
      const code = await onBackupRestore(restoreFilePath, restoreSecret, restoreNewPassword);
      setBackupConfigured(true);
      setRecoveryCode(code);
      setRestoreSucceeded(true);
      setRestoreFilePath("");
      setRestoreSecret("");
      setRestoreNewPassword("");
      setRestoreNewPasswordConfirm("");
      setSaved(true);
    } catch (cause) {
      const detail = cause instanceof Error
        ? cause.message
        : typeof cause === "string"
          ? cause
          : cause && typeof cause === "object" && "message" in cause
            ? String(cause.message)
            : "";
      setBackupActionError(detail || t("backupRestoreFailed"));
    }
    finally { setSaving(false); }
  }

  function setView(screen: keyof WorkspaceViewPreferences, mode: ViewMode) {
    setViews((current) => ({ ...current, [screen]: mode }));
    setSaved(false);
  }

  async function saveEmployeeForm(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await onEmployeeSave({ id: employeeId || crypto.randomUUID(), name: employeeName, color: employeeColor, worker_type: employeeType });
      setEmployeeId("");
      setEmployeeName("");
      setEmployeeColor(EMPLOYEE_COLORS[0]);
      setEmployeeType("employee");
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="modal-panel max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4"><div><h2 id="settings-title" className="text-base font-semibold text-slate-900">{t("settings")}</h2><p className="mt-1 text-xs text-slate-500">{locale === "es" ? "Preferencias de este negocio" : "Business preferences"}</p></div><button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={t("close")}><X size={17} /></button></header>
      <div className="space-y-5 px-5 py-5">
        <div className="field-group"><label className="field-label" htmlFor="settings-language"><span className="inline-flex items-center gap-1.5"><Languages size={13} />{t("language")}</span></label><select id="settings-language" className="form-input h-12 text-sm" value={locale} onChange={(event) => void changeLanguage(event.target.value as Locale)} disabled={saving}><option value="es">Español</option><option value="en">English</option></select></div>
        <SearchablePicker label={t("currency")} value={currencyCode ?? ""} options={currencies} placeholder={t("searchCurrency")} noResults={t("noMatches")} onChange={(code) => void changeCurrency(code)} />
        <div className="rounded-lg bg-indigo-50/70 px-3.5 py-3 text-[11px] leading-relaxed text-indigo-900/80">{t("currencyChangeNote")}</div>
        <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <div><h3 className="text-sm font-semibold text-slate-800">{t("invoiceTaxSettings")}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t("invoiceTaxSettingsHint")}</p></div>
          <div className="flex flex-wrap items-end gap-3"><label className="field-group"><span className="field-label">{t("invoiceTaxRate")}</span><div className="flex items-center gap-2"><input className="form-input h-10 w-32" type="number" min="0" max="100" step="0.01" value={invoiceTaxPercent} onChange={(event) => { setInvoiceTaxPercent(event.target.value); setTaxRateSaved(false); }} /><span className="text-sm font-semibold text-slate-500">%</span></div></label><button type="button" disabled={saving} onClick={() => void saveInvoiceTaxRate()} className="secondary-button h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{saving ? t("loading") : t("saveInvoiceTaxRate")}</button></div>
         {taxRateSaved && <p role="status" className="text-xs font-medium text-emerald-700">{t("invoiceTaxRateSaved")}</p>}
         </section>
         {isAdmin && <section className="space-y-3 border-t border-slate-100 pt-5">
           <div><h3 className="text-sm font-semibold text-slate-800">{locale === "es" ? "Usuarios y códigos de acceso" : "Users and access codes"}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{locale === "es" ? "Crea cuentas locales. El permiso para ver lockbox y gate code está desactivado por defecto." : "Create local accounts. Permission to view lockbox and gate codes is off by default."}</p></div>
           {localUserError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{localUserError}</div>}
           {localUserSaved && <p role="status" className="text-xs font-medium text-emerald-700">{locale === "es" ? "Cambios guardados." : "Changes saved."}</p>}
            <div className="space-y-2">{localUsers.map((user) => <div key={user.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{user.username}{user.active ? "" : ` · ${locale === "es" ? "desactivado" : "disabled"}`}</span><label className="field-group min-w-40"><span className="field-label">{locale === "es" ? "Empleado vinculado" : "Linked employee"}</span><select className="form-input h-9 text-xs" value={user.employeeId ?? ""} disabled={saving} onChange={(event) => void handleUserEmployee(user, event.target.value)}><option value="" disabled>{locale === "es" ? "Seleccionar…" : "Select…"}</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={user.canViewAccessCodes} disabled={saving || !user.active} onChange={(event) => void handleAccessPermission(user, event.target.checked)} />{locale === "es" ? "Puede ver códigos" : "Can view codes"}</label></div>)}{localUsers.length === 0 && !localUserError && <p className="text-xs text-slate-500">{locale === "es" ? "Cargando usuarios…" : "Loading users…"}</p>}</div>
            <form onSubmit={(event) => void handleCreateLocalUser(event)} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"><label className="field-group"><span className="field-label">{locale === "es" ? "Nuevo usuario" : "New username"}</span><input className="form-input h-10" autoComplete="off" minLength={3} maxLength={64} required value={newLocalUsername} onChange={(event) => setNewLocalUsername(event.target.value)} /></label><label className="field-group"><span className="field-label">{locale === "es" ? "Empleado vinculado" : "Linked employee"}</span><select className="form-input h-10" required value={newLocalEmployeeId} onChange={(event) => setNewLocalEmployeeId(event.target.value)}><option value="">{locale === "es" ? "Seleccionar empleado…" : "Select employee…"}</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label className="field-group sm:col-span-2"><span className="field-label">{locale === "es" ? "Contraseña temporal" : "Temporary password"}</span><input className="form-input h-10" type="password" autoComplete="new-password" minLength={12} required value={newLocalPassword} onChange={(event) => setNewLocalPassword(event.target.value)} /></label><p className="text-[10px] leading-relaxed text-slate-500 sm:col-span-2">{locale === "es" ? "Comparte la contraseña inicial de forma segura. Mínimo 12 caracteres. Sin permiso para ver códigos por defecto." : "Share the initial password securely. At least 12 characters. Code access is off by default."}</p><button type="submit" disabled={saving || !newLocalUsername.trim() || newLocalPassword.length < 12 || !newLocalEmployeeId} className="primary-button h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:col-span-2">{saving ? t("loading") : (locale === "es" ? "Crear usuario" : "Create user")}</button></form>
         </section>}
         <section className="space-y-3 rounded-xl border border-slate-200 p-4">
          <div><h3 className="text-sm font-semibold text-slate-800">{t("outgoingEmailSettings")}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t("emailOAuthClientIdsHint")}</p></div>
           <div className="grid gap-3 sm:grid-cols-2"><label className="field-group"><span className="field-label">{t("gmailOAuthClientId")}</span><input className="form-input h-10" maxLength={500} value={gmailOAuthClientId} onChange={(event) => { setGmailOAuthClientId(event.target.value); setEmailSettingsSaved(false); }} /></label><label className="field-group"><span className="field-label">{t("microsoftOAuthClientId")}</span><input className="form-input h-10" maxLength={500} value={microsoftOAuthClientId} onChange={(event) => { setMicrosoftOAuthClientId(event.target.value); setEmailSettingsSaved(false); }} /></label><label className="field-group"><span className="field-label">{t("gmailOAuthClientSecret")}</span><input type="password" autoComplete="off" className="form-input h-10" maxLength={500} value={gmailOAuthClientSecret} onChange={(event) => setGmailOAuthClientSecret(event.target.value)} /></label></div>
           <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-[10px] text-slate-500">{t("emailOAuthClientIdsHint")}</span><button type="button" disabled={saving} onClick={() => void saveEmailClientIds()} className="secondary-button h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{saving ? t("loading") : t("saveEmailSettings")}</button></div>
           <div className="grid gap-3 sm:grid-cols-2">
             <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><div className="text-xs font-semibold text-slate-800">Gmail</div><p className="mt-1 text-[10px] text-slate-500">{emailSettings.gmail_connected_email ? `${t("connectedAs")}: ${emailSettings.gmail_connected_email}` : t("gmailNotConnected")}</p>{emailSettings.gmail_connected_email ? <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={emailOperation !== ""} onClick={() => void connectEmailAccount("gmail")} className="rounded-md bg-indigo-600 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{emailOperation === "gmail" ? t("connectingEmail") : t("reauthorizeEmail")}</button><button type="button" disabled={emailOperation !== ""} onClick={() => void disconnectEmailAccount("gmail")} className="rounded-md border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-white disabled:opacity-50">{t("disconnectEmail")}</button></div> : <button type="button" disabled={emailOperation !== "" || !gmailOAuthClientId.trim() || gmailOAuthClientId.trim() !== (emailSettings.gmail_oauth_client_id ?? "")} onClick={() => void connectEmailAccount("gmail")} className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{emailOperation === "gmail" ? t("connectingEmail") : t("connectGmail")}</button>}</div>
             <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><div className="text-xs font-semibold text-slate-800">Outlook / Hotmail</div><p className="mt-1 text-[10px] text-slate-500">{emailSettings.microsoft_connected_email ? `${t("connectedAs")}: ${emailSettings.microsoft_connected_email}` : t("microsoftNotConnected")}</p>{emailSettings.microsoft_connected_email ? <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={emailOperation !== ""} onClick={() => void connectEmailAccount("microsoft")} className="rounded-md bg-indigo-600 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{emailOperation === "microsoft" ? t("connectingEmail") : t("reauthorizeEmail")}</button><button type="button" disabled={emailOperation !== ""} onClick={() => void disconnectEmailAccount("microsoft")} className="rounded-md border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-white disabled:opacity-50">{t("disconnectEmail")}</button></div> : <button type="button" disabled={emailOperation !== "" || !microsoftOAuthClientId.trim() || microsoftOAuthClientId.trim() !== (emailSettings.microsoft_oauth_client_id ?? "")} onClick={() => void connectEmailAccount("microsoft")} className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{emailOperation === "microsoft" ? t("connectingEmail") : t("connectMicrosoft")}</button>}</div>
           </div>
           {emailActionError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{emailActionError}</div>}
           {emailActionSuccess && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{emailActionSuccess}</div>}
           {emailSettingsSaved && <p role="status" className="text-xs font-medium text-emerald-700">{t("emailSettingsSaved")}</p>}
        </section>
        <section className="space-y-4 border-t border-slate-100 pt-5">
          <div><h3 className="text-sm font-semibold text-slate-800">{t("localBackups")}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t("localBackupsPolicy")}</p><p className="mt-1 text-[10px] text-slate-400">{backupStatus.lastAutomaticBackupUnix ? `${t("lastAutomaticBackup")}: ${new Intl.DateTimeFormat(locale === "es" ? "es" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(backupStatus.lastAutomaticBackupUnix * 1000))}` : t("noAutomaticBackupYet")}</p></div>
          {backupError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{t("backupFailed")}: {backupError}</div>}
          {exportedBackupPath && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{t("backupExportedAt")}: <span className="break-all font-medium">{exportedBackupPath}</span></p>}
          {restoreSucceeded && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{t("backupRestoreSucceeded")}</p>}
          {backupActionError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{backupActionError}</div>}
          {!backupConfigured ? <div className="space-y-3 rounded-lg bg-slate-50 p-3"><p className="text-xs font-medium text-slate-700">{t("backupSetupHint")}</p><div className="grid gap-3 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="backup-password">{t("backupPassword")}</label><input id="backup-password" type="password" autoComplete="new-password" className="form-input h-10" minLength={12} value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="backup-password-confirm">{t("confirmBackupPassword")}</label><input id="backup-password-confirm" type="password" autoComplete="new-password" className="form-input h-10" minLength={12} value={backupPasswordConfirm} onChange={(event) => setBackupPasswordConfirm(event.target.value)} /></div></div><button type="button" disabled={saving} onClick={() => void configureEncryptedBackups()} className="primary-button h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? t("loading") : t("enableBackups")}</button></div> : <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2"><span className="text-xs font-medium text-emerald-800">{t("automaticBackupEnabled")}</span><button type="button" disabled={saving} onClick={() => void exportLocalBackup()} className="rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">{saving ? t("loading") : t("exportBackup")}</button></div>
           <div className="space-y-2 rounded-lg border border-slate-200 p-3"><div className="text-xs font-semibold text-slate-700">{t("showRecoveryCode")}</div><div className="flex flex-wrap gap-2"><input type="password" autoComplete="current-password" className="form-input h-9 min-w-48 flex-1" value={revealPassword} onChange={(event) => setRevealPassword(event.target.value)} placeholder={t("backupPassword")} /><button type="button" disabled={saving || !revealPassword} onClick={() => void showRecoveryCode()} className="rounded-lg border border-slate-200 px-3 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{saving ? t("loading") : t("revealRecoveryCode")}</button></div></div>
          </div>}
          {recoveryCode && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3"><div className="text-xs font-semibold text-amber-900">{t("saveRecoveryCodeNow")}</div><code className="mt-2 block break-all rounded bg-white p-2 text-xs font-bold tracking-wider text-slate-800">{recoveryCode}</code></div>}
           <div className="space-y-3 rounded-lg border border-slate-200 p-3">
             <div><h4 className="text-xs font-semibold text-slate-800">{t("restoreBackup")}</h4><p className="mt-1 text-[10px] leading-relaxed text-slate-500">{t("restoreBackupHint")}</p></div>
             <div className="grid gap-3 sm:grid-cols-2">
               <div className="field-group sm:col-span-2"><span className="field-label">{t("backupFile")}</span><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={saving} onClick={() => void chooseRestoreBackupFile()} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{saving ? t("loading") : t("selectBackupFile")}</button>{restoreFilePath ? <span className="min-w-0 break-all text-[10px] text-slate-500">{restoreFilePath}</span> : <span className="text-[10px] text-slate-400">{t("noBackupFileSelected")}</span>}</div></div>
                <div className="field-group sm:col-span-2"><label className="field-label" htmlFor="restore-backup-secret">{t("backupPasswordOrRecovery")}</label><input id="restore-backup-secret" type="password" autoComplete="off" className="form-input h-10" value={restoreSecret} onChange={(event) => setRestoreSecret(event.target.value)} /></div>
                <div className="field-group sm:col-span-2"><label className="field-label" htmlFor="restore-new-password">{t("newBackupPassword")}</label><input id="restore-new-password" type="password" autoComplete="new-password" minLength={12} className="form-input h-10" value={restoreNewPassword} onChange={(event) => setRestoreNewPassword(event.target.value)} /></div>
                <div className="field-group sm:col-span-2"><label className="field-label" htmlFor="restore-new-password-confirm">{t("confirmNewBackupPassword")}</label><input id="restore-new-password-confirm" type="password" autoComplete="new-password" minLength={12} className="form-input h-10" value={restoreNewPasswordConfirm} onChange={(event) => setRestoreNewPasswordConfirm(event.target.value)} /></div>
             </div>
             <div className="flex justify-end"><button type="button" disabled={saving || !restoreFilePath} onClick={() => void restoreLocalBackup()} className="h-10 rounded-lg border border-rose-200 px-4 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">{saving ? t("loading") : t("restoreBackup")}</button></div>
           </div>
        </section>
        <section className="space-y-4 border-t border-slate-100 pt-5">
          <div><h3 className="text-sm font-semibold text-slate-800">{t("regionalSettings")}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t("regionalSettingsHint")}</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field-group"><label className="field-label" htmlFor="workspace-country">{t("countryCodeSetting")}</label><input id="workspace-country" className="form-input h-12 text-sm uppercase" maxLength={2} autoCapitalize="characters" value={countryCode} onChange={(event) => setCountryCode(event.target.value.replace(/[^a-z]/gi, "").toUpperCase())} placeholder="US" /></div>
            <div className="field-group"><label className="field-label" htmlFor="workspace-subdivision">{t("subdivisionSetting")}</label><input id="workspace-subdivision" className="form-input h-12 text-sm" value={subdivision} onChange={(event) => setSubdivision(event.target.value)} placeholder={locale === "es" ? "Estado o provincia" : "State or province"} /></div>
            <div className="field-group"><label className="field-label" htmlFor="workspace-city">{t("citySetting")}</label><input id="workspace-city" className="form-input h-12 text-sm" value={city} onChange={(event) => setCity(event.target.value)} /></div>
            <div className="field-group"><label className="field-label" htmlFor="workspace-timezone">{t("timezoneSetting")}</label><input id="workspace-timezone" list="workspace-timezone-examples" className="form-input h-12 text-sm" autoComplete="off" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} /><datalist id="workspace-timezone-examples"><option value="UTC" /><option value="America/Argentina/Buenos_Aires" /><option value="America/Mexico_City" /><option value="America/Chicago" /><option value="America/Denver" /><option value="America/Los_Angeles" /><option value="America/New_York" /><option value="America/Toronto" /><option value="Europe/London" /><option value="Europe/Madrid" /><option value="Europe/Paris" /><option value="Asia/Dubai" /><option value="Asia/Kolkata" /><option value="Asia/Singapore" /><option value="Asia/Tokyo" /><option value="Australia/Sydney" /></datalist></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] text-slate-400">{t("timezoneStoredUtcHint")}</p><button type="button" disabled={saving} onClick={() => void saveRegionalSettings()} className="primary-button h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{t("saveRegionalSettings")}</button></div>
          {saved && <p role="status" className="text-xs font-medium text-emerald-700">{t("regionalSettingsSaved")}</p>}
        </section>
        <section className="space-y-4 border-t border-slate-100 pt-5">
          <div><h3 className="text-sm font-semibold text-slate-800">{t("displayPreferences")}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t("displayPreferencesHint")}</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["clients_view", "clients"],
              ["properties_view", "properties"],
              ["work_orders_view", "workOrders"],
              ["estimates_view", "estimates"],
            ] as const).map(([key, label]) => <div className="field-group" key={key}><label className="field-label" htmlFor={`view-${key}`}>{t(label)}</label><select id={`view-${key}`} className="form-input h-12 text-sm" value={views[key]} onChange={(event) => setView(key, event.target.value as ViewMode)} disabled={saving}><option value="cards">{t("cardsView")}</option><option value="list">{t("listView")}</option></select></div>)}
          </div>
          <div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void saveViews()} className="secondary-button h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{t("saveViewPreferences")}</button></div>
        </section>
        <section className="space-y-4 border-t border-slate-100 pt-5">
          <div><h3 className="text-sm font-semibold text-slate-800">{t("followUpSettings")}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t("followUpSettingsHint")} {t("defaultFollowUpDays")}</p></div>
          <div className="grid gap-3 sm:grid-cols-3"><div className="field-group"><label className="field-label" htmlFor="estimate-followup-days">{t("estimateFollowUpDays")}</label><input id="estimate-followup-days" className="form-input h-10" type="number" min="1" max="365" step="1" value={estimateFollowUpDays} onChange={(event) => setEstimateFollowUpDays(event.target.value)} placeholder="15" /></div><div className="field-group"><label className="field-label" htmlFor="appointment-confirm-days">{t("appointmentConfirmationDays")}</label><input id="appointment-confirm-days" className="form-input h-10" type="number" min="1" max="365" step="1" value={appointmentConfirmationDays} onChange={(event) => setAppointmentConfirmationDays(event.target.value)} placeholder="15" /></div><div className="field-group"><label className="field-label" htmlFor="payment-followup-days">{t("paymentFollowUpDays")}</label><input id="payment-followup-days" className="form-input h-10" type="number" min="1" max="365" step="1" value={paymentFollowUpDays} onChange={(event) => setPaymentFollowUpDays(event.target.value)} placeholder="15" /></div></div>
          <div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void saveFollowUpPreferences()} className="secondary-button h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{t("saveFollowUpSettings")}</button></div>
        </section>

        <section className="space-y-4 border-t border-slate-100 pt-5">
          <div><h3 className="text-sm font-semibold text-slate-800">{t("employeeDirectory")}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t("employeeDirectoryHint")}</p></div>
          <div className="space-y-2">{employees.map((employee) => <div key={employee.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"><span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: employee.color }} /><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{employee.name}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-500">{t(`workerType_${employee.worker_type}`)}</span><button type="button" className="text-xs font-semibold text-indigo-700 hover:text-indigo-900" onClick={() => { setEmployeeId(employee.id); setEmployeeName(employee.name); setEmployeeColor(employee.color); setEmployeeType(employee.worker_type); setSaved(false); }}>{t("editEmployee")}</button></div>)}{employees.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">{t("noEmployees")}</p>}</div>
          <form onSubmit={(event) => void saveEmployeeForm(event)} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"><div className="field-group min-w-0"><label className="field-label" htmlFor="employee-name">{t("employeeName")}</label><input id="employee-name" className="form-input h-10 w-full" required maxLength={100} value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} /></div><div className="field-group min-w-0"><label className="field-label" htmlFor="employee-type">{t("workerType")}</label><select id="employee-type" className="form-input h-10 w-full" value={employeeType} onChange={(event) => setEmployeeType(event.target.value as Employee["worker_type"])}><option value="employee">{t("workerType_employee")}</option><option value="helper">{t("workerType_helper")}</option><option value="subcontractor">{t("workerType_subcontractor")}</option></select></div><div className="field-group"><label className="field-label">{t("employeeColor")}</label><div className="flex min-h-10 flex-wrap items-center gap-2">{EMPLOYEE_COLORS.map((color) => <button key={color} type="button" aria-label={color} aria-pressed={employeeColor === color} className={`size-6 shrink-0 rounded-full ring-offset-2 ${employeeColor === color ? "ring-2 ring-slate-700" : "hover:ring-2 hover:ring-slate-300"}`} style={{ backgroundColor: color }} onClick={() => setEmployeeColor(color)} />)}</div></div><div className="flex items-end"><button type="submit" disabled={saving || !employeeName.trim()} className="primary-button h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{employeeId ? t("saveEmployee") : t("addEmployee")}</button></div>{employeeId && <button type="button" className="text-left text-xs text-slate-500 hover:text-slate-800 sm:col-span-2" onClick={() => { setEmployeeId(""); setEmployeeName(""); setEmployeeColor(EMPLOYEE_COLORS[0]); setEmployeeType("employee"); }}>{t("cancelEmployeeEdit")}</button>}</form>
        </section>
        {error && <FormError>{error}</FormError>}
        <div className="flex justify-end border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className="primary-button h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700">{t("close")}</button></div>
      </div>
    </section>
  </div>;
}

function estimateVersionForPrint(estimate: Estimate, version: EstimateVersion): Estimate {
  return {
    ...estimate,
    version_id: version.id,
    version_number: version.version_number,
    status: version.status,
    billing_mode: version.billing_mode,
    description: version.description,
    amount_minor: version.amount_minor,
    discount_kind: version.discount_kind,
    discount_value: version.discount_value,
    discount_minor: version.discount_minor,
    total_minor: version.total_minor,
    currency_code: version.currency_code,
    recipient_name: version.recipient_name,
    contact_name: version.contact_name,
    contact_phone: version.contact_phone,
    address_line1: version.address_line1,
    address_line2: version.address_line2,
    city: version.city,
    subdivision: version.subdivision,
    postal_code: version.postal_code,
    created_at: version.created_at,
    sent_at: version.sent_at,
    accepted_at: version.accepted_at,
  };
}

function EstimateHistoryModal({ estimate, versions, locale, timeZone, t, onClose, onPrint }: { estimate: Estimate; versions: EstimateVersion[]; locale: Locale; timeZone: string; t: (key: Parameters<typeof translate>[1]) => string; onClose: () => void; onPrint: (version: EstimateVersion) => void }) {
  return <Modal title={t("versionHistory")} subtitle={`${estimate.recipient_name} · ${estimate.address_line1}`} onClose={onClose} wide>
    <div className="space-y-3">
      {versions.map((version) => <article key={version.id} className="rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-800">{t("quoteVersion")} {version.version_number}</span><Badge tone={version.status === "accepted" ? "green" : version.status === "cancelled" ? "rose" : "amber"}>{version.status === "accepted" ? t("approved") : version.status === "cancelled" ? t("estimateCancelled") : t(version.status)}</Badge></div><span className="text-sm font-bold text-slate-900">{formatMinorUnits(version.total_minor, version.currency_code, locale === "es" ? "es" : "en")}</span></div>
        <p className="mt-2 text-xs text-slate-600">{version.description}</p>
         <div className="mt-2 flex items-center justify-between"><div className="text-[10px] text-slate-400">{formatWorkspaceDateTime(version.created_at, locale === "es" ? "es" : "en", timeZone)}</div><button type="button" className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100" onClick={() => onPrint(version)}><Printer size={12} />{t("printEstimate")}</button></div>
      </article>)}
    </div>
  </Modal>;
}

function EstimatePrintView({ estimate, workspaceName, locale, timeZone, t }: { estimate: Estimate; workspaceName: string; locale: Locale; timeZone: string; t: (key: Parameters<typeof translate>[1]) => string }) {
  return <article className="print-document">
     <header className="flex items-start justify-between border-b border-slate-300 pb-5"><div><h1 className="text-2xl font-bold">{workspaceName}</h1><p className="mt-1 text-sm">{t("estimates")}</p></div><div className="text-right"><div className="text-lg font-semibold">{t("quoteVersion")} {estimate.version_number}</div><div className="text-sm">{estimate.status === "accepted" ? t("approved") : estimate.status === "cancelled" ? t("estimateCancelled") : t(estimate.status)}</div><div className="text-xs text-slate-500">{formatWorkspaceDateTime(estimate.created_at, locale === "es" ? "es" : "en", timeZone)}</div></div></header>
    <section className="grid grid-cols-2 gap-8 py-6"><div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("contact")}</div><div className="mt-1 font-semibold">{estimate.recipient_name}</div><div className="text-sm">{estimate.contact_name}</div><div className="text-sm">{estimate.contact_phone}</div></div><div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("property")}</div><div className="mt-1 font-semibold">{estimate.address_line1}</div><div className="text-sm">{[estimate.address_line2, estimate.city, estimate.subdivision, estimate.postal_code].filter(Boolean).join(", ")}</div></div></section>
    <section className="border-y border-slate-200 py-5"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("description")}</div><p className="mt-2 whitespace-pre-wrap text-sm">{estimate.description}</p><p className="mt-3 text-xs text-slate-500">{t("billingMode")}: {t(estimate.billing_mode === "fixed" ? "fixedPrice" : "timeMaterials")}</p></section>
    <section className="ml-auto mt-6 max-w-xs space-y-2 text-sm"><div className="flex justify-between"><span>{t("baseAmount")}</span><span>{formatMinorUnits(estimate.amount_minor, estimate.currency_code, locale === "es" ? "es" : "en")}</span></div><div className="flex justify-between"><span>{t("discount")}{estimate.discount_kind === "percent" ? ` (${(estimate.discount_value / 100).toFixed(2)}%)` : ""}</span><span>−{formatMinorUnits(estimate.discount_minor, estimate.currency_code, locale === "es" ? "es" : "en")}</span></div><div className="flex justify-between border-t border-slate-300 pt-2 text-base font-bold"><span>{t("total")}</span><span>{formatMinorUnits(estimate.total_minor, estimate.currency_code, locale === "es" ? "es" : "en")}</span></div></section>
  </article>;
}

function InvoicePrintView({ invoice, workspaceName, locale, timeZone, t }: { invoice: Invoice; workspaceName: string; locale: Locale; timeZone: string; t: (key: Parameters<typeof translate>[1]) => string }) {
  return <article className="print-document">
    <header className="flex items-start justify-between border-b border-slate-300 pb-5"><div><h1 className="text-2xl font-bold">{workspaceName}</h1><p className="mt-1 text-sm">{t("invoices")}</p></div><div className="text-right"><div className="text-lg font-semibold">{invoice.reference_code}</div><div className="text-sm">{t(`invoiceStatus_${invoice.status}`)}</div><div className="text-xs text-slate-500">{formatWorkspaceDateTime(invoice.issued_at ?? invoice.created_at, locale === "es" ? "es" : "en", timeZone)}</div><div className="mt-1 text-[9px] text-slate-400">{t("internalReferenceNotTaxNumber")}</div></div></header>
    <section className="grid grid-cols-2 gap-8 py-6"><div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("billTo")}</div><div className="mt-1 font-semibold">{invoice.recipient_name}</div><div className="text-sm">{invoice.contact_name}</div><div className="text-sm">{invoice.contact_phone}</div></div><div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("property")}</div><div className="mt-1 font-semibold">{invoice.address_line1}</div><div className="text-sm">{[invoice.address_line2, invoice.city].filter(Boolean).join(", ")}</div></div></section>
    <section className="border-y border-slate-200 py-5"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("description")}</div><p className="mt-2 whitespace-pre-wrap text-sm">{invoice.description}</p></section>
     <section className="ml-auto mt-6 max-w-xs space-y-2 text-sm"><div className="flex justify-between"><span>{t("invoiceSubtotal")}</span><span>{formatMinorUnits(invoice.subtotal_minor, invoice.currency_code, locale === "es" ? "es" : "en")}</span></div><div className="flex justify-between"><span>{invoiceTaxLabel(invoice, locale, t)}</span><span>{formatMinorUnits(invoice.tax_minor, invoice.currency_code, locale === "es" ? "es" : "en")}</span></div><div className="flex justify-between border-t border-slate-300 pt-2 text-base font-bold"><span>{t("total")}</span><span>{formatMinorUnits(invoice.total_minor, invoice.currency_code, locale === "es" ? "es" : "en")}</span></div></section>
    {invoice.status === "voided" && <div className="mt-8 border-2 border-rose-700 p-3 text-center text-lg font-bold uppercase text-rose-700">{t("invoiceStatus_voided")} · {invoice.void_reason}</div>}
  </article>;
}

function WorkOrdersView({ workOrders, estimates, typeFilter, onTypeFilter, viewMode, locale, timeZone, t, onEdit, onAdd, onCreateEstimate, onReviseEstimate }: { workOrders: WorkOrder[]; estimates: Estimate[]; typeFilter: "all" | ClientType; onTypeFilter: (value: "all" | ClientType) => void; viewMode: ViewMode; locale: Locale; timeZone: string; t: (key: Parameters<typeof translate>[1]) => string; onEdit: (order: WorkOrder) => void; onAdd: () => void; onCreateEstimate: (order: WorkOrder) => void; onReviseEstimate: (estimate: Estimate) => void }) {
  return <div className="space-y-6">
    <PageHeading title={t("workOrders")} subtitle={t("workOrdersSubtitle")} button={t("createWorkOrder")} onAdd={onAdd} />
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><ClientTypeFilters value={typeFilter} onChange={onTypeFilter} t={t} /><div className="mt-2 text-xs text-slate-400">{workOrders.length} {t("workOrders").toLocaleLowerCase()}</div></div>
    {workOrders.length === 0 ? <EmptyState icon={Wrench} title={t("noWorkOrders")} detail={t("workOrdersSubtitle")} action={t("createWorkOrder")} onAction={onAdd} /> : viewMode === "cards" ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {workOrders.map((order) => <article key={order.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02]">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-900">{order.recipient_name}</div><div className="mt-0.5 truncate text-[11px] text-slate-400">{order.address_line1} · {order.city}</div></div><Badge tone={order.status === "completed" ? "green" : order.status === "cancelled" ? "rose" : order.status === "in_progress" ? "blue" : "amber"}>{t(order.status)}</Badge></div>
         <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-600">{order.description}</p>
          {(() => { const quote = estimates.find((item) => item.id === order.estimate_id); return quote?.status === "expired" ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><div className="font-semibold">{t("quoteExpiredDecision")}</div><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => onReviseEstimate(quote)} className="rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-amber-100">{t("editEstimate")}</button><button type="button" onClick={() => onEdit(order)} className="rounded-md border border-rose-200 bg-white px-2.5 py-1.5 font-semibold text-rose-700 hover:bg-rose-50">{t("cancelWorkOrder")}</button></div></div> : null; })()}
        <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
          <div className="flex justify-between"><span>{t("priority")}</span><span className="font-medium text-slate-700">{t(order.priority)}</span></div>
          <div className="flex justify-between"><span>{t("billingMode")}</span><span className="font-medium text-slate-700">{t(order.billing_mode === "fixed" ? "fixedPrice" : "timeMaterials")}</span></div>
           <div className="flex justify-between"><span>{t("agreedAmount")}</span><span className="font-semibold text-slate-800">{formatMinorUnits(order.agreed_amount_minor, order.currency_code, locale === "es" ? "es" : "en")}</span></div>
          {order.scheduled_at && <div className="flex justify-between"><span>{t("scheduledAt")}</span><span className="font-medium text-slate-700">{formatWorkspaceDateTime(order.scheduled_at, locale === "es" ? "es" : "en", timeZone)}{order.scheduled_end_at ? ` – ${formatWorkspaceDateTime(order.scheduled_end_at, locale === "es" ? "es" : "en", timeZone)}` : ""}</span></div>}
        </div>
          {(order.status === "pending" || order.status === "pending_approval") && !order.estimate_id && <button type="button" onClick={() => onCreateEstimate(order)} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"><FilePlus size={13} />{t("createEstimate")}</button>}
          <button type="button" onClick={() => onEdit(order)} className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Pencil size={13} />{t("editWorkOrder")}</button>
      </article>)}
    </div> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02]">
      <div className="hidden grid-cols-[minmax(140px,1.2fr)_minmax(150px,1.2fr)_130px_140px_140px_140px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400 md:grid"><span>{t("contact")}</span><span>{t("description")}</span><span>{t("workOrderStatus")}</span><span>{t("priority")}</span><span>{t("scheduledAt")}</span><span /></div>
      {workOrders.map((order) => {
        const quote = estimates.find((item) => item.id === order.estimate_id);
        return <article key={order.id} className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-0 hover:bg-slate-50/50 sm:px-5 md:grid-cols-[minmax(140px,1.2fr)_minmax(150px,1.2fr)_130px_140px_140px_140px] md:items-center md:gap-4">
          <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{order.recipient_name}</div><div className="mt-1 truncate text-[11px] text-slate-500">{order.address_line1} · {order.city}</div></div>
          <div className="line-clamp-2 text-xs leading-relaxed text-slate-600">{order.description}</div>
          <div><Badge tone={order.status === "completed" ? "green" : order.status === "cancelled" ? "rose" : order.status === "in_progress" ? "blue" : "amber"}>{t(order.status)}</Badge>{quote?.status === "expired" && <div className="mt-1 text-[10px] font-semibold text-amber-700">{t("expired")}</div>}</div>
          <div className="text-xs text-slate-600">{t(order.priority)}</div>
          <div className="text-xs text-slate-600">{order.scheduled_at ? `${formatWorkspaceDateTime(order.scheduled_at, locale === "es" ? "es" : "en", timeZone)}${order.scheduled_end_at ? ` – ${formatWorkspaceDateTime(order.scheduled_end_at, locale === "es" ? "es" : "en", timeZone)}` : ""}` : "—"}</div>
          <div className="flex flex-wrap gap-1.5">{quote?.status === "expired" && <><button type="button" className="rounded-md border border-amber-200 px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-50" onClick={() => onReviseEstimate(quote)}>{t("editEstimate")}</button><button type="button" className="rounded-md border border-rose-200 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-50" onClick={() => onEdit(order)}>{t("cancelWorkOrder")}</button></>}{(order.status === "pending" || order.status === "pending_approval") && !order.estimate_id && <button type="button" className="rounded-md border border-indigo-200 px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50" onClick={() => onCreateEstimate(order)}>{t("createEstimate")}</button>}<button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50" onClick={() => onEdit(order)}>{t("editWorkOrder")}</button></div>
        </article>;
      })}
    </div>}
  </div>;
}

function MyAssignedTasksView({ tasks, locale, timeZone, onTransition }: { tasks: AssignedWorkTask[]; locale: Locale; timeZone: string; onTransition: (task: AssignedWorkTask, status: "completed" | "cancelled") => void }) {
  const en = locale === "en";
  const orders = new Map<string, AssignedWorkTask[]>();
  for (const task of tasks) orders.set(task.workOrderId, [...(orders.get(task.workOrderId) ?? []), task]);
  return <div className="space-y-5">
    <PageHeading title={en ? "My assigned work" : "Mis trabajos asignados"} subtitle={en ? "Complete or cancel only your own task assignment. The admin controls the work order status." : "Completa o cancela solo tus tareas asignadas. El admin controla el estado de la orden."} />
    {orders.size === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{en ? "No tasks are assigned to you." : "No tienes tareas asignadas."}</div> : <div className="space-y-4">{[...orders.entries()].map(([orderId, orderTasks]) => {
      const order = orderTasks[0];
      return <section key={orderId} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900">{order.addressLine1} · {order.city}</h2><p className="mt-1 text-[11px] text-slate-500">{order.contactName}</p>{order.scheduledAt && <p className="mt-1 text-[11px] text-slate-500">{en ? "Scheduled" : "Programada"}: {formatWorkspaceDateTime(order.scheduledAt, en ? "en" : "es", timeZone)}</p>}</div><Badge tone={order.workOrderStatus === "completed" ? "green" : order.workOrderStatus === "cancelled" ? "rose" : "blue"}>{translate(locale, order.workOrderStatus as Parameters<typeof translate>[1])}</Badge></div>
        <div className="mt-4 space-y-2">{orderTasks.map((task) => <article key={task.assignmentId} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-medium text-slate-800">{task.taskDescription}</p><Badge tone={task.assignmentStatus === "completed" ? "green" : task.assignmentStatus === "cancelled" ? "rose" : "amber"}>{task.assignmentStatus === "assigned" ? (en ? "To do" : "Pendiente") : task.assignmentStatus === "completed" ? (en ? "Completed" : "Realizada") : (en ? "Cancelled" : "Cancelada")}</Badge></div>
          {task.completedAt && <p className="mt-1 text-[10px] text-emerald-700">{en ? "Completed" : "Realizada"}: {formatWorkspaceDateTime(task.completedAt, en ? "en" : "es", timeZone)}</p>}
          {task.cancelledAt && <div className="mt-1 text-[10px] text-rose-700"><div>{en ? "Cancelled" : "Cancelada"}: {formatWorkspaceDateTime(task.cancelledAt, en ? "en" : "es", timeZone)}</div><div>{en ? "Reason" : "Motivo"}: {task.cancellationReason || "—"}</div></div>}
          {task.assignmentStatus === "assigned" && task.workOrderStatus !== "completed" && task.workOrderStatus !== "cancelled" && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => onTransition(task, "completed")} className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700">{en ? "Complete my task" : "Completar mi tarea"}</button><button type="button" onClick={() => onTransition(task, "cancelled")} className="h-9 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50">{en ? "Cancel my task" : "Cancelar mi tarea"}</button></div>}
        </article>)}</div>
      </section>;
    })}</div>}
  </div>;
}

function EmployeeEstimatesView({ orders, estimates, locale, onEditDraft }: { orders: WorkOrder[]; estimates: Estimate[]; locale: Locale; onEditDraft: (order: WorkOrder, estimate?: Estimate) => void }) {
  const en = locale === "en";
  return <div className="space-y-5">
    <PageHeading title={en ? "Work needed" : "Trabajos necesarios"} subtitle={en ? "Enter descriptions for draft estimates assigned to your work orders. Prices and sending are handled by the admin." : "Ingresa descripciones para borradores vinculados a tus órdenes. El admin se encarga de precios y envío."} />
    {orders.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{en ? "No assigned work orders." : "No tienes órdenes asignadas."}</div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{orders.map((order) => {
      const estimate = estimates.find((item) => item.work_order_id === order.id);
      const quoteManagedByAdmin = Boolean(order.estimate_id && !estimate);
      return <article key={order.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-slate-900">{order.address_line1}</h2><p className="mt-1 truncate text-[11px] text-slate-500">{order.city} · {order.contact_name}</p></div><Badge tone="blue">{en ? "Assigned" : "Asignada"}</Badge></div>
        {estimate ? <div className="mt-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{en ? "Draft work items" : "Trabajos del borrador"}</p><ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">{estimate.items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div> : <p className="mt-4 text-xs text-slate-500">{quoteManagedByAdmin ? (en ? "An estimate is already being managed by the admin." : "El admin ya está gestionando un presupuesto para esta orden.") : (en ? "No estimate draft yet." : "Aún no hay un borrador de presupuesto.")}</p>}
        {!quoteManagedByAdmin && <button type="button" onClick={() => onEditDraft(order, estimate)} className="mt-4 h-9 w-full rounded-lg border border-indigo-200 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">{estimate ? (en ? "Update work descriptions" : "Actualizar descripciones") : (en ? "Enter required work" : "Ingresar trabajos necesarios")}</button>}
      </article>;
    })}</div>}
  </div>;
}

function ScheduleView({ orders, employees, timeZone, locale, t, onEdit }: { orders: WorkOrder[]; employees: Employee[]; timeZone: string; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; onEdit: (order: WorkOrder) => void }) {
  const todayKey = workspaceDateKey(new Date().toISOString(), timeZone);
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [mode, setMode] = useState<"month" | "day">("month");
  const [year, month] = selectedDay.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const monthLength = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  const days = Array.from({ length: Math.ceil((mondayOffset + monthLength) / 7) * 7 }, (_, index) => index - mondayOffset + 1);
  const scheduled = activeScheduledOrders(orders);
  const conflicts = scheduleConflicts(scheduled);
  const dayOrders = scheduled.filter((order) => workspaceDateKey(order.scheduled_at!, timeZone) === selectedDay)
    .sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!));
  const monthOrders = scheduled.filter((order) => workspaceDateKey(order.scheduled_at!, timeZone).startsWith(`${year}-${String(month).padStart(2, "0")}`))
    .sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!));
  const dateForKey = (key: string) => new Date(`${key}T12:00:00Z`);
  const moveMonth = (amount: number) => {
    const next = new Date(Date.UTC(year, month - 1 + amount, 1));
    setSelectedDay(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`);
  };
  const weekdayFormatter = new Intl.DateTimeFormat(locale === "es" ? "es" : "en", { weekday: "short", timeZone: "UTC" });
  const weekdayHeaders = Array.from({ length: 7 }, (_, index) => weekdayFormatter.format(new Date(Date.UTC(2024, 0, 1 + index))));
  const monthLabel = new Intl.DateTimeFormat(locale === "es" ? "es" : "en", { month: "long", year: "numeric", timeZone: "UTC" }).format(firstDay);
  const selectedLabel = new Intl.DateTimeFormat(locale === "es" ? "es" : "en", { dateStyle: "full", timeZone: "UTC" }).format(dateForKey(selectedDay));
  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold tracking-tight text-slate-900">{t("schedule")}</h2><p className="mt-1 text-sm text-slate-500">{t("scheduleSubtitle")}</p></div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2"><button type="button" className="icon-button rounded-lg border border-slate-200 p-2 hover:bg-slate-50" aria-label={t("previousMonth")} onClick={() => moveMonth(-1)}><ChevronLeft size={16} /></button><h2 className="min-w-36 text-center text-sm font-semibold capitalize text-slate-800">{monthLabel}</h2><button type="button" className="icon-button rounded-lg border border-slate-200 p-2 hover:bg-slate-50" aria-label={t("nextMonth")} onClick={() => moveMonth(1)}><ChevronRight size={16} /></button><button type="button" className="ml-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setSelectedDay(todayKey)}>{t("calendarToday")}</button></div>
      <div className="flex rounded-lg bg-slate-100 p-1"><button type="button" className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === "month" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("month")}>{t("monthView")}</button><button type="button" className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === "day" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("day")}>{t("dayView")}</button></div>
    </div>
    {mode === "month" && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">{weekdayHeaders.map((day, index) => <div key={index} className="px-1 py-2 text-center text-[10px] font-bold uppercase text-slate-400 sm:py-3">{day}</div>)}</div>
      <div className="grid grid-cols-7">{days.map((day, index) => {
        const valid = day >= 1 && day <= monthLength;
        const key = valid ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
        const events = valid ? scheduled.filter((order) => workspaceDateKey(order.scheduled_at!, timeZone) === key) : [];
        return <button key={`${index}-${day}`} type="button" disabled={!valid} onClick={() => { setSelectedDay(key); setMode("day"); }} className={`min-h-16 border-b border-r border-slate-100 p-1 text-left last:border-r-0 hover:bg-indigo-50/50 sm:min-h-24 sm:p-2 ${!valid ? "bg-slate-50/60" : ""} ${key === selectedDay ? "bg-indigo-50/60" : ""}`}>
          {valid && <><span className={`inline-flex size-6 items-center justify-center rounded-full text-[11px] ${key === todayKey ? "bg-indigo-600 font-bold text-white" : "text-slate-600"}`}>{day}</span><div className="mt-1 space-y-1">{events.slice(0, 2).map((order) => { const employee = employees.find((item) => order.employee_ids?.includes(item.id)); return <div key={order.id} className={`truncate rounded border-l-2 px-1 py-0.5 text-[9px] font-medium ${conflicts.has(order.id) ? "bg-amber-100 text-amber-900" : "bg-slate-50 text-slate-700"}`} style={{ borderLeftColor: conflicts.has(order.id) ? "#d97706" : employee?.color ?? "#94a3b8" }}>{formatWorkspaceDateTime(order.scheduled_at!, locale === "es" ? "es" : "en", timeZone).split(",").pop()?.trim()} · {order.recipient_name}</div>; })}{events.length > 2 && <div className="text-[9px] text-slate-400">+{events.length - 2}</div>}</div></>}
        </button>;
      })}</div>
    </div>}
    <section className="space-y-3">
      <div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold capitalize text-slate-800">{mode === "day" ? selectedLabel : t("scheduledForDay")}</h3><p className="mt-0.5 text-[11px] text-slate-400">{t("workspaceTimeZone")}: {timeZone}</p></div>{dayOrders.length > 0 && <span className="text-xs text-slate-400">{dayOrders.length} {t("scheduledJobs")}</span>}</div>
      {mode === "month" ? monthOrders.map((order) => <ScheduleOrderCard key={order.id} order={order} employees={employees} locale={locale} timeZone={timeZone} t={t} conflict={conflicts.has(order.id)} onEdit={onEdit} />) : dayOrders.map((order) => <ScheduleOrderCard key={order.id} order={order} employees={employees} locale={locale} timeZone={timeZone} t={t} conflict={conflicts.has(order.id)} onEdit={onEdit} />)}
      {(mode === "day" ? dayOrders.length : monthOrders.length) === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">{t("noScheduledJobs")}</div>}
    </section>
  </div>;
}

function ScheduleOrderCard({ order, employees, locale, timeZone, t, conflict, onEdit }: { order: WorkOrder; employees: Employee[]; locale: Locale; timeZone: string; t: (key: Parameters<typeof translate>[1]) => string; conflict: boolean; onEdit: (order: WorkOrder) => void }) {
  const assigned = employees.filter((employee) => order.employee_ids?.includes(employee.id));
  return <button type="button" onClick={() => onEdit(order)} className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-indigo-200 hover:bg-indigo-50/20">
    <div className="min-w-28 rounded-lg bg-indigo-50 px-3 py-2 text-center text-xs font-semibold text-indigo-800"><div>{formatWorkspaceDateTime(order.scheduled_at!, locale === "es" ? "es" : "en", timeZone)}</div><div className="mt-1 text-[10px] font-normal text-slate-500">{formatWorkspaceDateTime(order.scheduled_end_at!, locale === "es" ? "es" : "en", timeZone)}</div></div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold text-slate-800">{order.recipient_name}</span><Badge tone={order.status === "in_progress" ? "blue" : "amber"}>{t(order.status)}</Badge></div><div className="mt-1 text-xs text-slate-500">{order.address_line1}{order.city ? ` · ${order.city}` : ""} · {order.contact_name}</div>{assigned.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{assigned.map((employee) => <span key={employee.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600"><span className="size-2 rounded-full" style={{ backgroundColor: employee.color }} />{employee.name}</span>)}</div>}<p className="mt-1 line-clamp-2 text-xs text-slate-600">{order.description}</p>{conflict && <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-amber-800"><TriangleAlert size={13} />{t("scheduleConflictWarning")}</div>}</div><Pencil size={14} className="mt-1 shrink-0 text-slate-400" />
  </button>;
}

function FollowUpsView({ suggestions, settings, timeZone, locale, t, onSaveTask, onOpen, onOpenSettings }: {
  suggestions: FollowUpSuggestion[];
  settings: FollowUpSettings;
  timeZone: string;
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  onSaveTask: (input: { taskType: FollowUpSuggestion["task_type"]; entityId: string; dueAt: string; status: FollowUpTaskOverride["status"] }) => Promise<void>;
  onOpen: (suggestion: FollowUpSuggestion) => void;
  onOpenSettings: () => void;
}) {
  const [dueDrafts, setDueDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [savingTaskId, setSavingTaskId] = useState("");
  useEffect(() => {
    setDueDrafts((current) => {
      const next = { ...current };
      for (const suggestion of suggestions) {
        next[suggestion.id] ??= utcToDateTimeLocal(suggestion.due_at, timeZone).slice(0, 10);
      }
      return next;
    });
  }, [suggestions, timeZone]);

  async function updateTask(suggestion: FollowUpSuggestion, status: FollowUpTaskOverride["status"]) {
    setSavingTaskId(suggestion.id);
    setError("");
    try {
      const day = dueDrafts[suggestion.id];
      const dueAt = status === "open" && day
        ? dateTimeLocalToUtc(`${day}T09:00`, timeZone)
        : suggestion.due_at;
      await onSaveTask({ taskType: suggestion.task_type, entityId: suggestion.entity_id, dueAt, status });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSavingTaskId("");
    }
  }

  const configured = settings.estimate_followup_days !== null || settings.appointment_confirmation_days !== null || settings.payment_followup_days !== null;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight text-slate-900">{t("follow_ups")}</h2><p className="mt-1 text-sm text-slate-500">{t("upcomingFollowUps")}</p></div><button type="button" onClick={onOpenSettings} className="secondary-button h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50">{t("followUpSettings")}</button></div>
    {!configured && <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs leading-relaxed text-indigo-900">{t("followUpSettingsHint")}</div>}
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div>}
    {suggestions.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500">{t("noFollowUps")}</div> : <div className="space-y-3">{suggestions.map((suggestion) => <article key={suggestion.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
       <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-800">{t(suggestion.title)}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${suggestion.overdue ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{suggestion.overdue ? t("followUpOverdue") : t("followUpDue")}</span></div><p className="mt-1 text-xs font-medium text-slate-700">{suggestion.recipient_name} · {suggestion.address_line1}</p><p className="mt-1 text-[10px] text-slate-400">{suggestion.task_type === "estimate_follow_up" ? t("sent") : suggestion.task_type === "invoice_payment_follow_up" ? t("invoiceSentAt") : t("scheduledAt")}: {formatWorkspaceDateTime(suggestion.source_at, locale === "es" ? "es" : "en", timeZone)}</p>{suggestion.task_type === "invoice_payment_follow_up" && suggestion.reference_code && suggestion.balance_minor !== undefined && suggestion.currency_code && <p className="mt-1 text-xs font-semibold text-slate-700">{suggestion.reference_code} · {t("balanceDue")}: {formatMinorUnits(suggestion.balance_minor, suggestion.currency_code, locale === "es" ? "es" : "en")}</p>}</div><button type="button" onClick={() => onOpen(suggestion)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">{t(suggestion.task_type === "invoice_payment_follow_up" ? "openInvoice" : "openRelatedRecord")}</button></div>
      <div className="mt-4 flex flex-wrap items-end gap-2"><label className="field-group"><span className="field-label">{t("followUpDueDate")}</span><input type="date" className="form-input h-10 min-w-40" value={dueDrafts[suggestion.id] ?? ""} onChange={(event) => setDueDrafts((current) => ({ ...current, [suggestion.id]: event.target.value }))} /></label><button type="button" disabled={savingTaskId === suggestion.id || !dueDrafts[suggestion.id]} onClick={() => void updateTask(suggestion, "open")} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{t("saveFollowUpDate")}</button><button type="button" disabled={savingTaskId === suggestion.id} onClick={() => void updateTask(suggestion, "completed")} className="h-10 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{t("completeFollowUp")}</button><button type="button" disabled={savingTaskId === suggestion.id} onClick={() => void updateTask(suggestion, "dismissed")} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50">{t("dismissFollowUp")}</button></div>
    </article>)}</div>}
  </div>;
}

function ExpensesView({ expenses, workOrders, workspaceCurrency, timeZone, locale, t, onCreate, onOpenSettings }: {
  expenses: Expense[];
  workOrders: WorkOrder[];
  workspaceCurrency: string | null;
  timeZone: string;
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  onCreate: (input: Parameters<typeof createExpense>[0]) => Promise<void>;
  onOpenSettings: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("variable");
  const [occurredAt, setOccurredAt] = useState(() => utcToDateTimeLocal(new Date().toISOString(), timeZone));
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [note, setNote] = useState("");
  const [workOrderId, setWorkOrderId] = useState("");
  const [receipt, setReceipt] = useState<File>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const categories: ExpenseCategory[] = ["fixed", "recurring", "variable", "travel", "toll", "fuel", "parts", "other"];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!workspaceCurrency) return setError(t("currencyRequired"));
    const amountMinor = decimalToMinorUnits(amount, workspaceCurrency);
    if (!description.trim() || !occurredAt || amountMinor === null || amountMinor <= 0) return setError(t("expenseRequired"));
    setSaving(true);
    setError("");
    try {
      await onCreate({
        workOrderId: workOrderId || undefined,
        description,
        category,
        occurredAt: dateTimeLocalToUtc(occurredAt, timeZone),
        amountMinor,
        vendor,
        note,
        receipt,
      });
      setDescription("");
      setCategory("variable");
      setOccurredAt(utcToDateTimeLocal(new Date().toISOString(), timeZone));
      setAmount("");
      setVendor("");
      setNote("");
      setWorkOrderId("");
      setReceipt(undefined);
      setFormOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("expenseRequired"));
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight text-slate-900">{t("expenses")}</h2><p className="mt-1 text-sm text-slate-500">{t("expensesSubtitle")}</p></div><button type="button" disabled={!workspaceCurrency} onClick={() => setFormOpen((open) => !open)} className="primary-button h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{formOpen ? t("cancel") : t("addExpense")}</button></div>
    {!workspaceCurrency && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"><button type="button" onClick={onOpenSettings} className="font-semibold underline">{t("currencyRequired")}</button></div>}
    {formOpen && <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="expense-description">{t("expenseConcept")}</label><input id="expense-description" className="form-input h-10" maxLength={150} required value={description} onChange={(event) => setDescription(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="expense-category">{t("expenseCategory")}</label><select id="expense-category" className="form-input h-10" value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>{categories.map((value) => <option key={value} value={value}>{t(`expenseCategory_${value}`)}</option>)}</select></div><div className="field-group"><label className="field-label" htmlFor="expense-date">{t("expenseDate")}</label><input id="expense-date" className="form-input h-10" type="datetime-local" required value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="expense-amount">{t("expenseAmount")} ({workspaceCurrency})</label><input id="expense-amount" className="form-input h-10" type="number" min="0" step={workspaceCurrency ? 1 / 10 ** currencyFractionDigits(workspaceCurrency) : 0.01} required value={amount} onChange={(event) => setAmount(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="expense-vendor">{t("expenseVendor")}</label><input id="expense-vendor" className="form-input h-10" maxLength={150} value={vendor} onChange={(event) => setVendor(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="expense-order">{t("expenseWorkOrder")}</label><select id="expense-order" className="form-input h-10" value={workOrderId} onChange={(event) => setWorkOrderId(event.target.value)}><option value="">{t("generalExpense")}</option>{workOrders.map((order) => <option key={order.id} value={order.id}>{order.recipient_name} · {order.address_line1}</option>)}</select></div></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="expense-note">{t("expenseNote")}</label><textarea id="expense-note" className="form-input min-h-16 resize-y" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="expense-receipt">{t("expenseReceipt")}</label><input id="expense-receipt" className="form-input h-10 py-2 text-xs" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setReceipt(event.target.files?.[0])} /><span className="text-[10px] text-slate-400">{t("expenseReceiptHint")}</span></div></div>
      {error && <FormError>{error}</FormError>}<div className="flex justify-end"><button type="submit" disabled={saving || !workspaceCurrency} className="primary-button h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? t("loading") : t("saveExpense")}</button></div>
    </form>}
    {expenses.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500">{t("noExpenses")}</div> : <div className="space-y-3">{expenses.map((expense) => <article key={expense.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-800">{expense.description}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{t(`expenseCategory_${expense.category}`)}</span></div><div className="mt-1 text-xs text-slate-500">{formatWorkspaceDateTime(expense.occurred_at, locale === "es" ? "es" : "en", timeZone)}{expense.vendor ? ` · ${expense.vendor}` : ""}</div>{expense.work_order_recipient && <div className="mt-1 text-[10px] text-indigo-700">{t("expenseWorkOrder")}: {expense.work_order_recipient}</div>}{expense.note && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-600">{expense.note}</p>}{expense.receipt_data_url && <a className="mt-2 inline-block text-[10px] font-semibold text-indigo-700 hover:text-indigo-900" href={expense.receipt_data_url} download={expense.receipt_file_name ?? "receipt"}>{t("viewExpenseReceipt")}: {expense.receipt_file_name}</a>}</div><div className="text-sm font-bold text-slate-800">{formatMinorUnits(expense.amount_minor, expense.currency_code, locale === "es" ? "es" : "en")}</div></div></article>)}</div>}
  </div>;
}

function EmployeePaymentsView({ payments, payableCosts, employees, workOrders, workspaceCurrency, timeZone, locale, t, onCreate, onOpenSettings }: {
  payments: EmployeePayment[];
  payableCosts: PayableWorkCost[];
  employees: Employee[];
  workOrders: WorkOrder[];
  workspaceCurrency: string | null;
  timeZone: string;
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  onCreate: (input: Parameters<typeof createEmployeePayment>[0]) => Promise<void>;
  onOpenSettings: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [workOrderId, setWorkOrderId] = useState("");
  const [workTimeEntryId, setWorkTimeEntryId] = useState("");
  const [paidAt, setPaidAt] = useState(() => utcToDateTimeLocal(new Date().toISOString(), timeZone));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedCost = payableCosts.find((cost) => cost.id === workTimeEntryId);
  const paymentCurrency = selectedCost?.currency_code ?? workspaceCurrency;
  const employeeCosts = payableCosts.filter((cost) => cost.employee_id === employeeId && cost.remaining_minor > 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!employeeId || !paidAt || !paymentCurrency) return setError(t("employeePaymentRequired"));
    const amountMinor = decimalToMinorUnits(amount, paymentCurrency);
    if (amountMinor === null || amountMinor <= 0) return setError(t("employeePaymentRequired"));
    if (selectedCost && amountMinor > selectedCost.remaining_minor) return setError(t("employeePaymentExceedsBalance"));
    setSaving(true);
    setError("");
    try {
      await onCreate({
        employeeId,
        workOrderId: (selectedCost?.work_order_id ?? workOrderId) || undefined,
        workTimeEntryId: selectedCost?.id,
        paidAt: dateTimeLocalToUtc(paidAt, timeZone),
        amountMinor,
        note,
      });
      setAmount("");
      setNote("");
      setWorkOrderId("");
      setWorkTimeEntryId("");
      setPaidAt(utcToDateTimeLocal(new Date().toISOString(), timeZone));
      setFormOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("employeePaymentRequired"));
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight text-slate-900">{t("staff_payments")}</h2><p className="mt-1 text-sm text-slate-500">{t("staffPaymentsSubtitle")}</p></div><button type="button" disabled={!workspaceCurrency || employees.length === 0} onClick={() => setFormOpen((open) => !open)} className="primary-button h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{formOpen ? t("cancel") : t("recordStaffPayment")}</button></div>
    {!workspaceCurrency && <button type="button" onClick={onOpenSettings} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs font-semibold text-amber-900">{t("currencyRequired")}</button>}
    {employees.length === 0 && <button type="button" onClick={onOpenSettings} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-left text-xs font-semibold text-indigo-900">{t("addEmployeesFirst")}</button>}
    {formOpen && <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="staff-payment-employee">{t("employeeName")}</label><select id="staff-payment-employee" className="form-input h-10" value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setWorkTimeEntryId(""); }} required>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></div><div className="field-group"><label className="field-label" htmlFor="staff-payment-date">{t("paymentDate")}</label><input id="staff-payment-date" className="form-input h-10" type="datetime-local" required value={paidAt} onChange={(event) => setPaidAt(event.target.value)} /></div><div className="field-group sm:col-span-2"><label className="field-label" htmlFor="staff-payment-cost">{t("applyToWorkCost")}</label><select id="staff-payment-cost" className="form-input h-10" value={workTimeEntryId} onChange={(event) => { setWorkTimeEntryId(event.target.value); if (event.target.value) setWorkOrderId(""); }}><option value="">{t("notAppliedToWorkCost")}</option>{employeeCosts.map((cost) => <option key={cost.id} value={cost.id}>{cost.work_order_recipient} · {cost.work_description} · {t("remainingBalance")}: {formatMinorUnits(cost.remaining_minor, cost.currency_code, locale === "es" ? "es" : "en")}</option>)}</select></div>{!selectedCost && <div className="field-group sm:col-span-2"><label className="field-label" htmlFor="staff-payment-order">{t("expenseWorkOrder")}</label><select id="staff-payment-order" className="form-input h-10" value={workOrderId} onChange={(event) => setWorkOrderId(event.target.value)}><option value="">{t("generalExpense")}</option>{workOrders.map((order) => <option key={order.id} value={order.id}>{order.recipient_name} · {order.address_line1}</option>)}</select></div>}<div className="field-group"><label className="field-label" htmlFor="staff-payment-amount">{t("paymentAmount")} ({paymentCurrency})</label><input id="staff-payment-amount" className="form-input h-10" type="number" min="0" step={paymentCurrency ? 1 / 10 ** currencyFractionDigits(paymentCurrency) : 0.01} value={amount} onChange={(event) => setAmount(event.target.value)} required /></div><div className="field-group"><label className="field-label" htmlFor="staff-payment-note">{t("expenseNote")}</label><input id="staff-payment-note" className="form-input h-10" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></div></div>
      {error && <FormError>{error}</FormError>}<div className="flex justify-end"><button type="submit" disabled={saving} className="primary-button h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? t("loading") : t("recordStaffPayment")}</button></div>
    </form>}
    {payments.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500">{t("noStaffPayments")}</div> : <div className="space-y-3">{payments.map((payment) => <article key={payment.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-800">{payment.employee_name}</div><div className="mt-1 text-xs text-slate-500">{formatWorkspaceDateTime(payment.paid_at, locale === "es" ? "es" : "en", timeZone)}</div>{payment.work_order_recipient && <div className="mt-1 text-[10px] text-indigo-700">{t("expenseWorkOrder")}: {payment.work_order_recipient}</div>}{payment.work_time_entry_id && <div className="mt-1 text-[10px] text-emerald-700">{t("appliedToWorkCost")}</div>}{payment.note && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-600">{payment.note}</p>}</div><div className="text-sm font-bold text-slate-800">{formatMinorUnits(payment.amount_minor, payment.currency_code, locale === "es" ? "es" : "en")}</div></div></article>)}</div>}
  </div>;
}

function BillingView({ invoices: allInvoices, payments, workOrders, workspaceCurrency, workspaceName, emailSettings, timeZone, locale, t, onCreateInvoice, onIssueInvoice, onVoidInvoice, onCreatePayment, onApplyPayment, onPrint, onSendInvoice, onOpenSettings }: {
  invoices: Invoice[];
  payments: CustomerPayment[];
  workOrders: WorkOrder[];
  workspaceCurrency: string | null;
  workspaceName: string;
  emailSettings: WorkspaceEmailSettings;
  timeZone: string;
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  onCreateInvoice: (workOrderId: string) => Promise<void>;
  onIssueInvoice: (invoiceId: string) => Promise<void>;
  onVoidInvoice: (invoiceId: string) => Promise<void>;
  onCreatePayment: (input: { paidAt: string; amountMinor: number; currencyCode: string; note: string; allocations: InvoicePaymentAllocationDraft[] }) => Promise<void>;
  onApplyPayment: (paymentId: string, allocations: InvoicePaymentAllocationDraft[]) => Promise<void>;
  onPrint: (invoice: Invoice) => void;
  onSendInvoice: (invoiceId: string, recipientEmail: string, provider: EmailProvider, pdfBase64: string) => Promise<void>;
  onOpenSettings: () => void;
}) {
  const [paidAt, setPaidAt] = useState(() => utcToDateTimeLocal(new Date().toISOString(), timeZone));
  const [paymentCurrency, setPaymentCurrency] = useState(workspaceCurrency ?? "");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [allocations, setAllocations] = useState<{ invoiceId: string; amount: string }[]>([]);
  const [paymentTargetInvoiceId, setPaymentTargetInvoiceId] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoicePaymentFilter, setInvoicePaymentFilter] = useState<"open" | "paid" | "all">("open");
  const [invoiceClientFilter, setInvoiceClientFilter] = useState<"all" | ClientType>("all");
  const [invoiceToEmail, setInvoiceToEmail] = useState<Invoice | null>(null);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailProvider, setEmailProvider] = useState<EmailProvider>("gmail");
  const [emailError, setEmailError] = useState("");
  const [sendingInvoiceEmail, setSendingInvoiceEmail] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reallocationPaymentId, setReallocationPaymentId] = useState("");
  const [reallocationRows, setReallocationRows] = useState<{ invoiceId: string; amount: string }[]>([]);
  const [reallocationError, setReallocationError] = useState("");
  const [savingReallocation, setSavingReallocation] = useState(false);
  useEffect(() => setPaymentCurrency((current) => current || workspaceCurrency || ""), [workspaceCurrency]);
  const currencyChoices = [...new Set([workspaceCurrency, ...allInvoices.filter((invoice) => invoice.status === "issued" && invoice.balance_minor > 0).map((invoice) => invoice.currency_code)].filter((code): code is string => !!code))];
  const allocatableInvoices = allInvoices.filter((invoice) => invoice.status === "issued" && invoice.balance_minor > 0 && invoice.currency_code === paymentCurrency);
  const connectedEmailProviders: EmailProvider[] = [
    ...(emailSettings.gmail_connected_email ? ["gmail" as const] : []),
    ...(emailSettings.microsoft_connected_email ? ["microsoft" as const] : []),
  ];
  const filteredInvoices = allInvoices.filter((invoice) => {
    const matchesPaymentState = invoicePaymentFilter === "all"
      || (invoicePaymentFilter === "paid" && invoice.status === "issued" && invoice.balance_minor <= 0)
      || (invoicePaymentFilter === "open" && (invoice.status === "draft" || (invoice.status === "issued" && invoice.balance_minor > 0)));
    const matchesClient = invoiceClientFilter === "all" || invoice.client_type === invoiceClientFilter;
    const query = invoiceSearch.trim().toLocaleLowerCase();
    const matchesSearch = !query || [invoice.recipient_name, invoice.reference_code, invoice.address_line1, invoice.address_line2, invoice.city]
      .some((value) => value?.toLocaleLowerCase().includes(query));
    return matchesPaymentState && matchesClient && matchesSearch;
  });
  const invoices = filteredInvoices;
  const invoicedWorkIds = new Set(allInvoices.filter((invoice) => invoice.status === "draft" || invoice.status === "issued").map((invoice) => invoice.work_order_id));
  const eligibleOrders = workOrders.filter((order) => order.status === "completed" && order.price_confirmed === 1 && order.agreed_amount_minor > 0 && (!order.estimate_id || order.estimate_status === "accepted") && !invoicedWorkIds.has(order.id));

  function prepareInvoicePayment(invoice: Invoice) {
    const amount = minorUnitsToDecimal(invoice.balance_minor, invoice.currency_code);
    setPaymentCurrency(invoice.currency_code);
    setPaymentAmount(amount);
    setPaymentNote("");
    setPaidAt(utcToDateTimeLocal(new Date().toISOString(), timeZone));
    setAllocations([{ invoiceId: invoice.id, amount }]);
    setPaymentTargetInvoiceId(invoice.id);
    document.getElementById("customer-payment-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function prepareInvoiceEmail(invoice: Invoice) {
    if (connectedEmailProviders.length === 0) {
      onOpenSettings();
      return;
    }
    setInvoiceToEmail(invoice);
    setEmailRecipient(invoice.recipient_email ?? "");
    setEmailProvider(connectedEmailProviders[0]);
    setEmailError("");
  }

  async function sendInvoiceEmail(event: FormEvent) {
    event.preventDefault();
    if (!invoiceToEmail || !emailRecipient.includes("@")) {
      setEmailError(t("invoiceEmailRecipientInvalid"));
      return;
    }
    if (!connectedEmailProviders.includes(emailProvider)) {
      setEmailError(t("emailProviderNotConnected"));
      return;
    }
    setSendingInvoiceEmail(true);
    setEmailError("");
    try {
      const pdfBase64 = createInvoicePdfBase64(invoiceToEmail, workspaceName, locale, timeZone, t);
      await onSendInvoice(invoiceToEmail.id, emailRecipient.trim(), emailProvider, pdfBase64);
      setInvoiceToEmail(null);
      setEmailRecipient("");
    } catch (cause) {
      const detail = cause instanceof Error
        ? cause.message
        : typeof cause === "string"
          ? cause
          : cause && typeof cause === "object" && "message" in cause
            ? String(cause.message)
            : "";
      setEmailError(detail || t("invoiceEmailSendFailed"));
    } finally {
      setSendingInvoiceEmail(false);
    }
  }

  async function savePayment(event: FormEvent) {
    event.preventDefault();
    if (!paymentCurrency || !paidAt) return setError(t("customerPaymentRequired"));
    const amountMinor = decimalToMinorUnits(paymentAmount, paymentCurrency);
    if (amountMinor === null || amountMinor <= 0) return setError(t("customerPaymentRequired"));
    const normalized: InvoicePaymentAllocationDraft[] = [];
    for (const allocation of allocations.filter((item) => item.invoiceId)) {
      const invoice = allocatableInvoices.find((item) => item.id === allocation.invoiceId);
      const applied = decimalToMinorUnits(allocation.amount, paymentCurrency);
      if (!invoice || applied === null || applied <= 0 || applied > invoice.balance_minor) return setError(t("allocationInvalid"));
      normalized.push({ invoiceId: invoice.id, amountMinor: applied });
    }
    if (normalized.reduce((sum, item) => sum + item.amountMinor, 0) > amountMinor) return setError(t("allocationExceedsPayment"));
    setSaving(true);
    setError("");
    try {
      await onCreatePayment({ paidAt: dateTimeLocalToUtc(paidAt, timeZone), amountMinor, currencyCode: paymentCurrency, note: paymentNote, allocations: normalized });
      setPaymentAmount(""); setPaymentNote(""); setAllocations([]); setPaymentTargetInvoiceId("");
      setPaidAt(utcToDateTimeLocal(new Date().toISOString(), timeZone));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("customerPaymentRequired")); }
    finally { setSaving(false); }
  }

  async function saveReallocation(event: FormEvent, payment: CustomerPayment) {
    event.preventDefault();
    const normalized: InvoicePaymentAllocationDraft[] = [];
    for (const row of reallocationRows.filter((item) => item.invoiceId)) {
      const invoice = allInvoices.find((item) => item.id === row.invoiceId && item.status === "issued");
      const amountMinor = decimalToMinorUnits(row.amount, payment.currency_code);
      if (!invoice || invoice.currency_code !== payment.currency_code || amountMinor === null || amountMinor <= 0 || amountMinor > invoice.balance_minor) {
        return setReallocationError(t("allocationInvalid"));
      }
      normalized.push({ invoiceId: invoice.id, amountMinor });
    }
    if (normalized.reduce((sum, item) => sum + item.amountMinor, 0) > payment.unapplied_minor) {
      return setReallocationError(t("allocationExceedsPayment"));
    }
    setSavingReallocation(true);
    setReallocationError("");
    try {
      await onApplyPayment(payment.id, normalized);
      setReallocationPaymentId("");
      setReallocationRows([]);
    } catch (cause) {
      setReallocationError(cause instanceof Error ? cause.message : t("allocationInvalid"));
    } finally {
      setSavingReallocation(false);
    }
  }

  return <div className="space-y-7">
    <div><h2 className="text-xl font-semibold tracking-tight text-slate-900">{t("billing")}</h2><p className="mt-1 text-sm text-slate-500">{t("billingSubtitle")}</p></div>
     {!workspaceCurrency && <button type="button" onClick={onOpenSettings} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs font-semibold text-amber-900">{t("currencyRequired")}</button>}
     <section className="space-y-3"><div className="flex items-end justify-between"><div><h3 className="text-base font-semibold text-slate-800">{t("invoices")}</h3><p className="mt-1 text-xs text-slate-500">{t("manualTaxNoAutomaticHint")}</p></div></div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
        <input className="form-input h-10" type="search" value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder={t("searchInvoices")} aria-label={t("searchInvoices")} />
        <select className="form-input h-10" value={invoiceClientFilter} onChange={(event) => setInvoiceClientFilter(event.target.value as "all" | ClientType)} aria-label={t("invoiceRecipientType")}>
          <option value="all">{t("allClients")}</option><option value="direct">{t("direct")}</option><option value="property_manager">{t("managerRole")}</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">{(["open", "paid", "all"] as const).map((filter) => <button key={filter} type="button" onClick={() => setInvoicePaymentFilter(filter)} className={`rounded-md px-3 py-2 text-xs font-semibold ${invoicePaymentFilter === filter ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{t(`invoiceFilter_${filter}`)}</button>)}</div>
      {eligibleOrders.length > 0 && <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3"><h4 className="mb-2 text-xs font-semibold text-indigo-900">{t("readyToInvoice")}</h4><div className="space-y-2">{eligibleOrders.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"><div><div className="text-xs font-semibold text-slate-800">{order.recipient_name} · {order.address_line1}</div><div className="mt-0.5 text-[10px] text-slate-500">{formatMinorUnits(order.agreed_amount_minor, order.currency_code, locale === "es" ? "es" : "en")}</div></div><button type="button" onClick={() => { void onCreateInvoice(order.id).catch((cause) => setError(cause instanceof Error ? cause.message : t("required"))); }} className="rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-semibold text-white hover:bg-indigo-700">{t("createInvoiceDraft")}</button></div>)}</div></div>}
      {invoices.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">{t("noInvoices")}</div> : <div className="space-y-3">{invoices.map((invoice) => <article key={invoice.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-slate-800">{invoice.recipient_name} · {invoice.reference_code}</h4><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${invoice.status === "issued" ? "bg-emerald-100 text-emerald-800" : invoice.status === "voided" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{t(`invoiceStatus_${invoice.status}`)}</span></div><div className="mt-1 text-xs text-slate-500">{invoice.address_line1} · {formatWorkspaceDateTime(invoice.created_at, locale === "es" ? "es" : "en", timeZone)}</div></div><div className="text-right text-xs font-bold text-slate-800">{formatMinorUnits(invoice.total_minor, invoice.currency_code, locale === "es" ? "es" : "en")}</div></div>
          {invoice.sent_at && <p className="mt-2 text-[10px] text-slate-500">{t("invoiceFirstSentAt")}: {formatWorkspaceDateTime(invoice.sent_at, locale === "es" ? "es" : "en", timeZone)}</p>}
          {invoice.client_type && <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{invoice.client_type === "property_manager" ? t("managerRole") : t("direct")}</span>}
         <p className="mt-3 whitespace-pre-wrap text-xs text-slate-600">{invoice.description}</p>
        <InvoicePaymentBadge invoice={invoice} t={t} />
         <div className="mt-3 grid gap-2 text-[10px] text-slate-600 sm:grid-cols-4"><div>{t("invoiceSubtotal")}: {formatMinorUnits(invoice.subtotal_minor, invoice.currency_code, locale === "es" ? "es" : "en")}</div><div>{invoiceTaxLabel(invoice, locale, t)}: {formatMinorUnits(invoice.tax_minor, invoice.currency_code, locale === "es" ? "es" : "en")}</div><div>{t("invoicedAmount")}: {invoice.status === "issued" ? formatMinorUnits(invoice.total_minor, invoice.currency_code, locale === "es" ? "es" : "en") : "—"}</div><div>{t("collectedAndBalance")}: {formatMinorUnits(invoice.paid_minor, invoice.currency_code, locale === "es" ? "es" : "en")} / {formatMinorUnits(invoice.balance_minor, invoice.currency_code, locale === "es" ? "es" : "en")}</div></div>
        {invoice.status === "voided" && invoice.reversed_payment_minor > 0 && <p className="mt-2 text-[10px] text-amber-800">{t("reversedPaymentAllocations")}: {formatMinorUnits(invoice.reversed_payment_minor, invoice.currency_code, locale === "es" ? "es" : "en")}</p>}
         {invoice.status === "draft" && <div className="mt-3 flex flex-wrap items-end gap-2"><button type="button" className="h-9 rounded-lg bg-emerald-600 px-3 text-[10px] font-semibold text-white hover:bg-emerald-700" onClick={() => void onIssueInvoice(invoice.id).catch((cause) => setError(cause instanceof Error ? cause.message : t("required")))}>{t("issueInvoice")}</button><button type="button" className="h-9 rounded-lg border border-slate-200 px-3 text-[10px] font-semibold text-slate-600 hover:bg-slate-50" onClick={() => onPrint(invoice)}><Printer size={13} className="inline" /> {t("printInvoice")}</button></div>}
          {invoice.status === "issued" && <div className="mt-3 flex flex-wrap gap-2">{invoice.balance_minor > 0 && <button type="button" className="h-9 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700" onClick={() => prepareInvoicePayment(invoice)}>{t("recordInvoicePayment")}</button>}<button type="button" className="h-9 rounded-lg border border-indigo-200 px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-50" onClick={() => prepareInvoiceEmail(invoice)}>{connectedEmailProviders.length === 0 ? t("connectEmailToSendInvoice") : invoice.sent_at ? t("resendInvoiceEmail") : t("sendInvoiceEmail")}</button><button type="button" className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => onPrint(invoice)}><Printer size={13} className="inline" /> {t("printInvoice")}</button><button type="button" className="h-9 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50" onClick={() => void onVoidInvoice(invoice.id).catch((cause) => setError(cause instanceof Error ? cause.message : t("required")))}>{t("voidInvoice")}</button></div>}
        {invoice.status === "voided" && invoice.void_reason && <p className="mt-2 rounded-md bg-rose-50 px-2 py-1.5 text-[10px] text-rose-800">{t("voidReason")}: {invoice.void_reason}</p>}
      </article>)}</div>}
    </section>
    <section className="space-y-3 border-t border-slate-200 pt-6"><div><h3 className="text-base font-semibold text-slate-800">{t("customerPayments")}</h3><p className="mt-1 text-xs text-slate-500">{t("externalPaymentsOnlyHint")}</p></div>
       <form id="customer-payment-form" onSubmit={(event) => void savePayment(event)} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="field-group"><span className="field-label">{t("paymentDate")}</span><input className="form-input h-10" type="datetime-local" required value={paidAt} onChange={(event) => setPaidAt(event.target.value)} /></label><label className="field-group"><span className="field-label">{t("currency")}</span><select className="form-input h-10" required value={paymentCurrency} onChange={(event) => { setPaymentCurrency(event.target.value); setAllocations([]); setPaymentTargetInvoiceId(""); }}><option value="">—</option>{currencyChoices.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label><label className="field-group"><span className="field-label">{t("paymentAmount")} ({paymentCurrency})</span><input className="form-input h-10" type="number" min="0" required step={paymentCurrency ? 1 / 10 ** currencyFractionDigits(paymentCurrency) : 0.01} value={paymentAmount} onChange={(event) => { const value = event.target.value; setPaymentAmount(value); if (paymentTargetInvoiceId) setAllocations([{ invoiceId: paymentTargetInvoiceId, amount: value }]); }} /></label><label className="field-group"><span className="field-label">{t("expenseNote")}</span><input className="form-input h-10" maxLength={500} value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} /></label></div>
         <div className="space-y-2"><div className="text-xs font-semibold text-slate-700">{t("manualAllocations")}</div>{allocations.map((allocation, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_160px_auto]"><select className="form-input h-9" value={allocation.invoiceId} onChange={(event) => { setPaymentTargetInvoiceId(""); setAllocations(allocations.map((item, row) => row === index ? { ...item, invoiceId: event.target.value } : item)); }}><option value="">{t("selectInvoice")}</option>{allocatableInvoices.filter((invoice) => !allocations.some((item, row) => row !== index && item.invoiceId === invoice.id)).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.recipient_name} · {invoice.reference_code} · {t("balanceDue")}: {formatMinorUnits(invoice.balance_minor, invoice.currency_code, locale === "es" ? "es" : "en")}</option>)}</select><input className="form-input h-9" type="number" min="0" step={paymentCurrency ? 1 / 10 ** currencyFractionDigits(paymentCurrency) : 0.01} placeholder={t("allocationAmount")} value={allocation.amount} onChange={(event) => { setPaymentTargetInvoiceId(""); setAllocations(allocations.map((item, row) => row === index ? { ...item, amount: event.target.value } : item)); }} /><button type="button" className="button-secondary" aria-label={t("removeWorkItem")} onClick={() => { setPaymentTargetInvoiceId(""); setAllocations(allocations.filter((_, row) => row !== index)); }}>−</button></div>)}<button type="button" disabled={allocatableInvoices.length === 0} className="text-xs font-semibold text-indigo-700 disabled:opacity-50" onClick={() => { setPaymentTargetInvoiceId(""); setAllocations([...allocations, { invoiceId: "", amount: "" }]); }}>+ {t("addInvoiceAllocation")}</button></div>
        {error && <FormError>{error}</FormError>}<div className="flex justify-end"><button type="submit" disabled={saving || !paymentCurrency} className="primary-button h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? t("loading") : t("recordCustomerPayment")}</button></div>
      </form>
      {payments.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">{t("noCustomerPayments")}</p> : <div className="space-y-2">{payments.map((payment) => <article key={payment.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-semibold text-slate-800">{formatWorkspaceDateTime(payment.paid_at, locale === "es" ? "es" : "en", timeZone)}</div>{payment.note && <p className="mt-1 text-[10px] text-slate-500">{payment.note}</p>}</div><div className="text-right text-xs"><div className="font-bold text-slate-800">{formatMinorUnits(payment.amount_minor, payment.currency_code, locale === "es" ? "es" : "en")}</div><div className="mt-0.5 text-[10px] text-slate-500">{t("appliedAmount")}: {formatMinorUnits(payment.applied_minor, payment.currency_code, locale === "es" ? "es" : "en")} · {t("unappliedAmount")}: {formatMinorUnits(payment.unapplied_minor, payment.currency_code, locale === "es" ? "es" : "en")}</div></div>{payment.unapplied_minor > 0 && <button type="button" className="h-8 rounded-lg border border-indigo-200 px-3 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50" onClick={() => { setReallocationPaymentId(reallocationPaymentId === payment.id ? "" : payment.id); setReallocationRows([{ invoiceId: "", amount: "" }]); setReallocationError(""); }}>{t("reallocatePayment")}</button>}</div>
        {reallocationPaymentId === payment.id && <form onSubmit={(event) => void saveReallocation(event, payment)} className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-slate-500">{t("unappliedAmount")}: {formatMinorUnits(payment.unapplied_minor, payment.currency_code, locale === "es" ? "es" : "en")}</p>{reallocationRows.map((row, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_160px_auto]"><select className="form-input h-9" value={row.invoiceId} onChange={(event) => setReallocationRows(reallocationRows.map((item, line) => line === index ? { ...item, invoiceId: event.target.value } : item))}><option value="">{t("selectInvoice")}</option>{invoices.filter((invoice) => invoice.status === "issued" && invoice.currency_code === payment.currency_code && invoice.balance_minor > 0 && !reallocationRows.some((item, line) => line !== index && item.invoiceId === invoice.id)).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.recipient_name} · {invoice.reference_code} · {t("balanceDue")}: {formatMinorUnits(invoice.balance_minor, invoice.currency_code, locale === "es" ? "es" : "en")}</option>)}</select><input className="form-input h-9" type="number" min="0" step={1 / 10 ** currencyFractionDigits(payment.currency_code)} placeholder={t("allocationAmount")} value={row.amount} onChange={(event) => setReallocationRows(reallocationRows.map((item, line) => line === index ? { ...item, amount: event.target.value } : item))} /><button type="button" className="button-secondary" aria-label={t("removeWorkItem")} onClick={() => setReallocationRows(reallocationRows.filter((_, line) => line !== index))}>−</button></div>)}<div className="flex items-center justify-between"><button type="button" className="text-[10px] font-semibold text-indigo-700" onClick={() => setReallocationRows([...reallocationRows, { invoiceId: "", amount: "" }])}>+ {t("addInvoiceAllocation")}</button><button type="submit" disabled={savingReallocation} className="h-9 rounded-lg bg-indigo-600 px-3 text-[10px] font-semibold text-white disabled:opacity-50">{t("savePaymentAllocation")}</button></div>{reallocationError && <FormError>{reallocationError}</FormError>}</form>}
      </article>)}</div>}
     </section>
     {invoiceToEmail && <Modal title={invoiceToEmail.sent_at ? t("resendInvoiceEmail") : t("sendInvoiceEmail")} subtitle={`${invoiceToEmail.reference_code} · ${invoiceToEmail.recipient_name}`} onClose={() => { if (!sendingInvoiceEmail) setInvoiceToEmail(null); }}>
       <form onSubmit={(event) => void sendInvoiceEmail(event)} className="space-y-4">
         <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900">{t("invoiceEmailPdfAttachedHint")}</p>
         <label className="field-group"><span className="field-label">{t("invoiceEmailRecipient")}</span><input className="form-input h-10" type="email" required value={emailRecipient} onChange={(event) => setEmailRecipient(event.target.value)} /></label>
         <label className="field-group"><span className="field-label">{t("emailSendingAccount")}</span><select className="form-input h-10" value={emailProvider} disabled={connectedEmailProviders.length < 2} onChange={(event) => setEmailProvider(event.target.value as EmailProvider)}>{connectedEmailProviders.map((provider) => <option key={provider} value={provider}>{provider === "gmail" ? `Gmail · ${emailSettings.gmail_connected_email}` : `Outlook/Hotmail · ${emailSettings.microsoft_connected_email}`}</option>)}</select></label>
         {invoiceToEmail.sent_at && <p className="text-[10px] text-slate-500">{t("invoiceFirstSentAt")}: {formatWorkspaceDateTime(invoiceToEmail.sent_at, locale === "es" ? "es" : "en", timeZone)}</p>}
         {emailError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{emailError}</div>}
         <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" disabled={sendingInvoiceEmail} onClick={() => setInvoiceToEmail(null)} className="h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{t("cancel")}</button><button type="submit" disabled={sendingInvoiceEmail || connectedEmailProviders.length === 0} className="h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{sendingInvoiceEmail ? t("sendingEmail") : t("sendInvoiceEmail")}</button></div>
       </form>
     </Modal>}
   </div>;
}

function InvoicePaymentBadge({ invoice, t }: { invoice: Invoice; t: (key: Parameters<typeof translate>[1]) => string }) {
  const status = getInvoicePaymentStatus(invoice);
  if (!status) return null;
  const tone = status === "paid" ? "bg-emerald-100 text-emerald-800" : status === "partial" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{t(`invoicePaymentStatus_${status}`)}</span>;
}

function invoiceTaxLabel(invoice: Invoice, locale: Locale, t: (key: Parameters<typeof translate>[1]) => string): string {
  if (invoice.tax_rate_basis_points === null) return t("invoiceTax");
  const percentage = new Intl.NumberFormat(locale === "es" ? "es" : "en", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(invoice.tax_rate_basis_points / 10_000);
  return `${t("invoiceTax")} (${percentage})`;
}

type ReportKind = "work_orders" | "estimates" | "invoices" | "customer_payments" | "expenses" | "staff_payments";
interface ReportRow {
  id: string;
  date: string;
  title: string;
  detail: string;
  statusCode?: string;
  statusLabel?: string;
  amountMinor: number;
  currencyCode: string;
}

function ReportsView({ workOrders, estimates, invoices, customerPayments, expenses, staffPayments, timeZone, locale, t }: {
  workOrders: WorkOrder[];
  estimates: Estimate[];
  invoices: Invoice[];
  customerPayments: CustomerPayment[];
  expenses: Expense[];
  staffPayments: EmployeePayment[];
  timeZone: string;
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
}) {
  const [kind, setKind] = useState<ReportKind>("work_orders");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [clientType, setClientType] = useState<"all" | ClientType>("all");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [estimateDateBasis, setEstimateDateBasis] = useState<"created" | "sent">("created");
  const [printing, setPrinting] = useState(false);
  const dateFormatter = (value: string) => formatWorkspaceDateTime(value, locale === "es" ? "es" : "en", timeZone);
  const statusOptions: Record<ReportKind, string[]> = {
    work_orders: ["pending", "pending_approval", "accepted", "scheduled", "in_progress", "completed", "cancelled"],
    estimates: ["draft", "sent", "accepted", "expired", "cancelled"],
    invoices: ["draft", "issued", "voided"],
    customer_payments: [],
    expenses: ["fixed", "recurring", "variable", "travel", "toll", "fuel", "parts", "other"],
    staff_payments: [],
  };
  const orderById = new Map(workOrders.map((order) => [order.id, order]));
  const matchesClient = (type?: ClientType | null) => clientType === "all" || type === clientType;
  const rows: ReportRow[] = [];
  if (kind === "work_orders") {
    for (const order of workOrders) {
      const date = workOrderReportDate(order);
      if (!matchesClient(order.client_type)) continue;
      rows.push({ id: order.id, date, title: order.recipient_name, detail: `${order.address_line1}${order.city ? ` · ${order.city}` : ""} · ${order.description}`, statusCode: order.status, statusLabel: t(order.status), amountMinor: order.agreed_amount_minor, currencyCode: order.currency_code });
    }
  } else if (kind === "estimates") {
    for (const estimate of estimates) {
      const date = estimateDateBasis === "sent" ? estimate.sent_at : estimate.created_at;
      if (!date || !matchesClient(estimate.client_type)) continue;
      rows.push({ id: estimate.id, date, title: estimate.recipient_name, detail: `${estimate.address_line1} · ${estimate.description}`, statusCode: estimate.status, statusLabel: t(estimate.status), amountMinor: estimate.total_minor, currencyCode: estimate.currency_code });
    }
  } else if (kind === "invoices") {
    for (const invoice of invoices) {
      if (!matchesClient(orderById.get(invoice.work_order_id)?.client_type)) continue;
      rows.push({ id: invoice.id, date: invoice.created_at, title: `${invoice.recipient_name} · ${invoice.reference_code}`, detail: `${t("invoicedAmount")}: ${invoice.status === "issued" ? formatMinorUnits(invoice.total_minor, invoice.currency_code, locale === "es" ? "es" : "en") : "—"} · ${t("appliedAmount")}: ${formatMinorUnits(invoice.paid_minor, invoice.currency_code, locale === "es" ? "es" : "en")} · ${t("balanceDue")}: ${formatMinorUnits(invoice.balance_minor, invoice.currency_code, locale === "es" ? "es" : "en")}`, statusCode: invoice.status, statusLabel: t(`invoiceStatus_${invoice.status}`), amountMinor: invoice.total_minor, currencyCode: invoice.currency_code });
    }
  } else if (kind === "customer_payments") {
    for (const payment of customerPayments) {
      if (!matchesClient(payment.client_type)) continue;
      rows.push({ id: payment.id, date: payment.paid_at, title: `${t("customerPayment")}: ${payment.id.slice(0, 8).toUpperCase()}`, detail: `${t("appliedAmount")}: ${formatMinorUnits(payment.applied_minor, payment.currency_code, locale === "es" ? "es" : "en")} · ${t("unappliedAmount")}: ${formatMinorUnits(payment.unapplied_minor, payment.currency_code, locale === "es" ? "es" : "en")}`, amountMinor: payment.amount_minor, currencyCode: payment.currency_code });
    }
  } else if (kind === "expenses") {
    for (const expense of expenses) {
      const type = expense.work_order_id ? orderById.get(expense.work_order_id)?.client_type : null;
      if (!matchesClient(type)) continue;
      rows.push({ id: expense.id, date: expense.occurred_at, title: expense.description, detail: `${t(`expenseCategory_${expense.category}`)}${expense.vendor ? ` · ${expense.vendor}` : ""}${expense.work_order_recipient ? ` · ${expense.work_order_recipient}` : ""}`, statusCode: expense.category, statusLabel: t(`expenseCategory_${expense.category}`), amountMinor: expense.amount_minor, currencyCode: expense.currency_code });
    }
  } else {
    for (const payment of staffPayments) {
      const type = payment.work_order_id ? orderById.get(payment.work_order_id)?.client_type : null;
      if (!matchesClient(type)) continue;
      rows.push({ id: payment.id, date: payment.paid_at, title: payment.employee_name, detail: `${payment.work_order_recipient ?? t("generalExpense")}${payment.note ? ` · ${payment.note}` : ""}`, amountMinor: payment.amount_minor, currencyCode: payment.currency_code });
    }
  }
  const rangeInvalid = !!from && !!to && from > to;
  const filteredRows = rows.filter((row) => (!rangeInvalid && (!from || !to || from <= to))
    && withinWorkspaceDateRange(row.date, from, to, timeZone)
    && (selectedStates.length === 0 || (row.statusCode && selectedStates.includes(row.statusCode))));
  const totals = new Map<string, number>();
  for (const row of filteredRows) totals.set(row.currencyCode, (totals.get(row.currencyCode) ?? 0) + row.amountMinor);
  const updateStateFilter = (state: string, checked: boolean) => {
    const options = statusOptions[kind];
    setSelectedStates((current) => {
      const selected = current.length === 0 ? [...options] : current;
      const next = checked ? [...new Set([...selected, state])] : selected.filter((value) => value !== state);
      return next.length === options.length ? [] : next;
    });
  };
  useEffect(() => {
    if (!printing) return;
    const timeout = window.setTimeout(() => window.print(), 200);
    const afterPrint = () => setPrinting(false);
    window.addEventListener("afterprint", afterPrint);
    return () => { window.clearTimeout(timeout); window.removeEventListener("afterprint", afterPrint); };
  }, [printing]);
  const reportTitle = t(kind === "work_orders" ? "workOrders" : kind === "staff_payments" ? "staff_payments" : kind === "customer_payments" ? "customerPayments" : kind);
  if (printing) return <article className="print-document"><header className="border-b border-slate-300 pb-4"><h1 className="text-2xl font-bold">{reportTitle}</h1><p className="mt-1 text-xs text-slate-500">{t("reportFilters")}: {from || "—"} – {to || "—"} · {clientType === "all" ? t("allClients") : t(clientType === "direct" ? "directClient" : "propertyManager")}</p></header><div className="mt-5 space-y-3">{filteredRows.map((row) => <div key={row.id} className="flex justify-between gap-5 border-b border-slate-200 pb-2 text-sm"><div><div className="font-semibold">{row.title} {row.statusLabel ? `· ${row.statusLabel}` : ""}</div><div className="mt-1 text-xs text-slate-600">{dateFormatter(row.date)} · {row.detail}</div></div><div className="font-semibold">{formatMinorUnits(row.amountMinor, row.currencyCode, locale === "es" ? "es" : "en")}</div></div>)}</div><div className="mt-5 space-y-1 border-t border-slate-300 pt-3 text-sm font-bold">{[...totals].map(([currency, value]) => <div key={currency} className="flex justify-between"><span>{t("reportTotal")} · {currency}</span><span>{formatMinorUnits(value, currency, locale === "es" ? "es" : "en")}</span></div>)}</div></article>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight text-slate-900">{t("reports")}</h2><p className="mt-1 text-sm text-slate-500">{t("reportsSubtitle")}</p></div><button type="button" onClick={() => setPrinting(true)} className="secondary-button h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Printer size={14} className="mr-1 inline" />{t("printReport")}</button></div>
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">{(["work_orders", "estimates", "invoices", "customer_payments", "expenses", "staff_payments"] as const).map((value) => <button type="button" key={value} onClick={() => { setKind(value); setSelectedStates([]); }} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${kind === value ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{t(value === "work_orders" ? "workOrders" : value === "staff_payments" ? "staff_payments" : value === "customer_payments" ? "customerPayments" : value)}</button>)}</div>
     <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="field-group"><span className="field-label">{t("reportFrom")}</span><input className="form-input h-10" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="field-group"><span className="field-label">{t("reportTo")}</span><input className="form-input h-10" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label className="field-group"><span className="field-label">{t("associatedClient")}</span><select className="form-input h-10" value={clientType} onChange={(event) => setClientType(event.target.value as "all" | ClientType)}><option value="all">{t("allClients")}</option><option value="direct">{t("directClient")}</option><option value="property_manager">{t("propertyManager")}</option></select></label>{kind === "estimates" && <label className="field-group"><span className="field-label">{t("reportDateBasis")}</span><select className="form-input h-10" value={estimateDateBasis} onChange={(event) => setEstimateDateBasis(event.target.value as "created" | "sent")}><option value="created">{t("createdDate")}</option><option value="sent">{t("sent")}</option></select></label>}</div>
      {statusOptions[kind].length > 0 && <div><div className="mb-2 flex items-center justify-between"><span className="field-label">{kind === "expenses" ? t("expenseCategory") : t("reportStatuses")}</span><button type="button" className="text-[10px] font-semibold text-indigo-700" onClick={() => setSelectedStates([])}>{t("allStatuses")}</button></div><div className="flex flex-wrap gap-2">{statusOptions[kind].map((option) => <label key={option} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-[10px] text-slate-600"><input type="checkbox" checked={selectedStates.length === 0 || selectedStates.includes(option)} onChange={(event) => updateStateFilter(option, event.target.checked)} />{t((kind === "expenses" ? `expenseCategory_${option}` : kind === "invoices" ? `invoiceStatus_${option}` : option) as Parameters<typeof translate>[1])}</label>)}</div></div>}
      {rangeInvalid && <p role="alert" className="text-xs text-rose-700">{t("reportRangeInvalid")}</p>}<p className="text-[10px] text-slate-400">{t("reportDateBasisHint")} · {timeZone}</p>
    </section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3"><h3 className="text-sm font-semibold text-slate-800">{reportTitle}</h3><span className="text-xs text-slate-500">{filteredRows.length} {t("reportRows")}</span></div>{filteredRows.length === 0 ? <div className="px-5 py-10 text-center text-sm text-slate-500">{t("noReportRows")}</div> : <div className="divide-y divide-slate-100">{filteredRows.map((row) => <article key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-slate-800">{row.title}</span>{row.statusLabel && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{row.statusLabel}</span>}</div><div className="mt-1 text-[10px] text-slate-500">{dateFormatter(row.date)} · {row.detail}</div></div><div className="text-sm font-semibold text-slate-800">{formatMinorUnits(row.amountMinor, row.currencyCode, locale === "es" ? "es" : "en")}</div></article>)}</div>}</section>
    {totals.size > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-semibold text-slate-700">{t("reportTotalsByCurrency")}</h3><div className="mt-2 flex flex-wrap gap-4">{[...totals].map(([currency, value]) => <div key={currency} className="text-sm font-bold text-slate-800">{currency}: {formatMinorUnits(value, currency, locale === "es" ? "es" : "en")}</div>)}</div></section>}
  </div>;
}

function formatWorkDuration(minutes: number, t: (key: Parameters<typeof translate>[1]) => string): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} ${t("minutesShort")}`;
  if (remainingMinutes === 0) return `${hours} ${t("hoursShort")}`;
  return `${hours} ${t("hoursShort")} ${remainingMinutes} ${t("minutesShort")}`;
}

function WorkOrderForm({ clients, properties, employees, workOrder, sessionToken, canViewAccessCodes, workspaceCurrency, timeZone, locale, t, onClose, onCreate, onUpdate, onOpenSettings }: {
  clients: Client[];
  properties: Property[];
  employees: Employee[];
  workOrder?: WorkOrder;
  sessionToken: string;
  canViewAccessCodes: boolean;
  workspaceCurrency: string | null;
  timeZone: string;
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  onClose: () => void;
  onCreate: (input: CreateWorkOrderInput, tasks: WorkOrderTaskDraft[]) => Promise<void>;
  onUpdate: (id: string, input: WorkOrderUpdateInput, tasks: WorkOrderTaskDraft[]) => Promise<void>;
  onOpenSettings: () => void;
}) {
  const [billingMode, setBillingMode] = useState<"fixed" | "time_materials">(workOrder?.billing_mode ?? "fixed");
  const [amount, setAmount] = useState(workOrder && workOrder.agreed_amount_minor > 0 ? minorUnitsToDecimal(workOrder.agreed_amount_minor, workOrder.currency_code) : "");
  const [priceConfirmed, setPriceConfirmed] = useState(workOrder?.price_confirmed === 1 && workOrder.agreed_amount_minor > 0);
  const [currencyCode, setCurrencyCode] = useState(workOrder?.currency_code ?? workspaceCurrency ?? "");
  const [scheduledAt, setScheduledAt] = useState(utcToDateTimeLocal(workOrder?.scheduled_at, timeZone));
  const [scheduledEndAt, setScheduledEndAt] = useState(utcToDateTimeLocal(workOrder?.scheduled_end_at, timeZone));
  const [status, setStatus] = useState<WorkOrderStatus>(workOrder?.status ?? "pending");
  const [cancellationReason, setCancellationReason] = useState(workOrder?.cancellation_reason ?? "");
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [priority, setPriority] = useState<WorkOrderPriority>(workOrder?.priority ?? "normal");
  const [accessInstructions, setAccessInstructions] = useState(workOrder?.access_instructions ?? "");
  const [clientType, setClientType] = useState<ClientType>(workOrder?.client_type ?? "direct");
  const [recipientName, setRecipientName] = useState(workOrder?.recipient_name ?? "");
  const [contactName, setContactName] = useState(workOrder?.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(workOrder?.contact_phone ?? "");
  const [tenantName, setTenantName] = useState(workOrder?.tenant_name ?? "");
  const [tenantPhone, setTenantPhone] = useState(workOrder?.tenant_phone ?? "");
  const [addressLine1, setAddressLine1] = useState(workOrder?.address_line1 ?? "");
  const [addressLine2, setAddressLine2] = useState(workOrder?.address_line2 ?? "");
  const [city, setCity] = useState(workOrder?.city ?? "");
  const [subdivision, setSubdivision] = useState(workOrder?.subdivision ?? "");
  const [postalCode, setPostalCode] = useState(workOrder?.postal_code ?? "");
  const [items, setItems] = useState<string[]>(workOrder?.items ?? [workOrder?.description ?? ""]);
  const [taskDrafts, setTaskDrafts] = useState<WorkOrderTaskDraft[]>([]);
  const [lockboxCode, setLockboxCode] = useState(workOrder?.lockbox_code ?? "");
  const [gateCode, setGateCode] = useState(workOrder?.gate_code ?? "");
  const [employeeIds, setEmployeeIds] = useState<string[]>(workOrder?.employee_ids ?? []);
  const [clientId, setClientId] = useState(workOrder?.client_id ?? "");
  const [propertyId, setPropertyId] = useState(workOrder?.property_id ?? "");
  const [newClientMode, setNewClientMode] = useState(false);
  const [newPropertyMode, setNewPropertyMode] = useState(false);
  const [newClientCompany, setNewClientCompany] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<WorkOrderPhoto[]>([]);
  const [notes, setNotes] = useState<WorkOrderNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [timeEntries, setTimeEntries] = useState<WorkTimeEntry[]>([]);
  const [timeEmployeeId, setTimeEmployeeId] = useState(workOrder?.employee_ids[0] ?? employees[0]?.id ?? "");
  const [timeEntryType, setTimeEntryType] = useState<"hourly" | "per_job">("hourly");
  const [timeEntryDate, setTimeEntryDate] = useState(workspaceDateKey(new Date().toISOString(), timeZone));
  const [timeStartedAt, setTimeStartedAt] = useState("");
  const [timeEndedAt, setTimeEndedAt] = useState("");
  const [timeAmount, setTimeAmount] = useState("");
  const [timeNote, setTimeNote] = useState("");
  const [completedWorkItems, setCompletedWorkItems] = useState<string[]>([]);
  const [materials, setMaterials] = useState<WorkOrderMaterial[]>([]);
  const [workOrderExtras, setWorkOrderExtras] = useState<WorkOrderExtra[]>([]);
  const [extraDescription, setExtraDescription] = useState("");
  const [extraReason, setExtraReason] = useState("");
  const [extraAmount, setExtraAmount] = useState("");
  const [extraApprovalMethod, setExtraApprovalMethod] = useState<NonNullable<WorkOrderExtra["approval_method"]>>("verbal");
  const [extraApprovalNote, setExtraApprovalNote] = useState("");
  const [customerApprovalReceived, setCustomerApprovalReceived] = useState(false);
  const [materialName, setMaterialName] = useState("");
  const [materialQuantity, setMaterialQuantity] = useState("");
  const [materialTotalCost, setMaterialTotalCost] = useState("");
  const [materialUnitPrice, setMaterialUnitPrice] = useState("");
  const fractionDigits = currencyCode ? currencyFractionDigits(currencyCode) : 2;
  const source = workOrder;
  const totalWorkMinutes = timeEntries.reduce((total, entry) => total + (entry.entry_type === "hourly" ? entry.duration_minutes ?? 0 : 0), 0);

  useEffect(() => {
    if (!workOrder && workspaceCurrency) setCurrencyCode(workspaceCurrency);
  }, [workOrder, workspaceCurrency]);

  useEffect(() => {
    if (!workOrder) { setTaskDrafts([]); return; }
    void Promise.all([listWorkOrderPhotos(workOrder.id), listWorkOrderNotes(workOrder.id), listWorkTimeEntries(workOrder.id), listWorkOrderCompletionItems(workOrder.id), listWorkOrderMaterials(workOrder.id), listWorkOrderExtras(workOrder.id), listWorkOrderTasks(sessionToken, workOrder.id)])
      .then(([loadedPhotos, loadedNotes, loadedTimeEntries, loadedCompletionItems, loadedMaterials, loadedExtras, loadedTasks]) => { setPhotos(loadedPhotos); setNotes(loadedNotes); setTimeEntries(loadedTimeEntries); setCompletedWorkItems(loadedCompletionItems); setMaterials(loadedMaterials); setWorkOrderExtras(loadedExtras); setTaskDrafts(loadedTasks); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : t("required")));
  }, [workOrder, sessionToken, t]);

  useEffect(() => {
    if (!timeEmployeeId && employees.length > 0) setTimeEmployeeId(workOrder?.employee_ids[0] ?? employees[0].id);
  }, [employees, timeEmployeeId, workOrder]);

  async function saveNote() {
    if (!workOrder || !newNote.trim()) return;
    try {
      await addWorkOrderNote(workOrder.id, newNote);
      setNewNote("");
      setNotes(await listWorkOrderNotes(workOrder.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("required")); }
  }

  async function savePhoto(file?: File) {
    if (!workOrder || !file) return;
    try {
      await addWorkOrderPhoto(workOrder.id, file);
      setPhotos(await listWorkOrderPhotos(workOrder.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("required")); }
  }

  async function saveTimeEntry() {
    if (!workOrder) return;
    try {
      if (!timeEmployeeId) throw new Error(t("timeEntryRequired"));
      if (timeEntryType === "hourly" && (!timeStartedAt || !timeEndedAt)) throw new Error(t("timeEntryRequired"));
      if (timeEntryType === "per_job" && !timeEntryDate) throw new Error(t("timeEntryRequired"));
      if (timeEntryType === "per_job" && !workspaceCurrency) throw new Error(t("currencyRequired"));
      const amountMinor = timeEntryType === "per_job" && workspaceCurrency
        ? decimalToMinorUnits(timeAmount, workspaceCurrency)
        : null;
      if (timeEntryType === "per_job" && (amountMinor === null || amountMinor <= 0)) throw new Error(t("positiveWorkerCostRequired"));
      const startedAt = timeEntryType === "hourly" ? dateTimeLocalToUtc(timeStartedAt, timeZone) : undefined;
      await addWorkTimeEntry({
        entryType: timeEntryType,
        workOrderId: workOrder.id,
        employeeId: timeEmployeeId,
        startedAt,
        endedAt: timeEntryType === "hourly" ? dateTimeLocalToUtc(timeEndedAt, timeZone) : undefined,
        workOccurredAt: startedAt ?? dateTimeLocalToUtc(`${timeEntryDate}T12:00`, timeZone),
        amountMinor: amountMinor ?? undefined,
        note: timeNote,
      });
      setTimeNote("");
      setTimeStartedAt("");
      setTimeEndedAt("");
      setTimeAmount("");
      setTimeEntries(await listWorkTimeEntries(workOrder.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("timeEntryRequired"));
    }
  }

  async function saveMaterial() {
    if (!workOrder || !workspaceCurrency) return;
    try {
      const quantity = Number(materialQuantity);
      if (!materialName.trim() || !Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(t("materialRequired"));
      }
      const totalCostMinor = decimalToMinorUnits(materialTotalCost || "0", workspaceCurrency);
      const unitPriceMinor = decimalToMinorUnits(materialUnitPrice || "0", workspaceCurrency);
      if (totalCostMinor === null || unitPriceMinor === null) throw new Error(t("invalidWorkPrice"));
      await addWorkOrderMaterial({
        workOrderId: workOrder.id,
        materialName,
        quantity,
        totalCostMinor,
        unitPriceMinor,
      });
      setMaterialName("");
      setMaterialQuantity("");
      setMaterialTotalCost("");
      setMaterialUnitPrice("");
      setMaterials(await listWorkOrderMaterials(workOrder.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("materialRequired"));
    }
  }

  async function saveExtra() {
    if (!workOrder) return;
    const amountMinor = decimalToMinorUnits(extraAmount, workOrder.currency_code);
    if (!extraDescription.trim() || !extraReason.trim() || amountMinor === null || amountMinor <= 0) {
      setError(t("extraWorkRequired"));
      return;
    }
    try {
      await createWorkOrderExtra({ workOrderId: workOrder.id, description: extraDescription, reason: extraReason, amountMinor });
      setExtraDescription(""); setExtraReason(""); setExtraAmount("");
      setWorkOrderExtras(await listWorkOrderExtras(workOrder.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("extraWorkRequired")); }
  }

  async function updateExtra(extra: WorkOrderExtra, action: "approve" | "cancel") {
    if (action === "approve" && !customerApprovalReceived) {
      setError(t("confirmCustomerApprovedExtra"));
      return;
    }
    try {
      await reviewWorkOrderExtra({
        extraId: extra.id,
        action,
        approvalMethod: action === "approve" ? extraApprovalMethod : undefined,
        approvalNote: action === "approve" ? extraApprovalNote : undefined,
      });
      setCustomerApprovalReceived(false); setExtraApprovalNote("");
      setWorkOrderExtras(await listWorkOrderExtras(workOrder!.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("required")); }
  }

  function clearPropertySelection() {
    setPropertyId("");
    setNewPropertyMode(false);
    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setSubdivision("");
    setPostalCode("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const amountMinor = amount.trim() ? decimalToMinorUnits(amount, currencyCode) : null;
      if (amount.trim() && amountMinor === null) throw new Error(t("invalidWorkPrice"));
      if (priceConfirmed && (amountMinor === null || amountMinor <= 0)) throw new Error(t("positiveWorkPriceRequired"));
      if (workOrder) {
        const nextStatus = status === "accepted" && scheduledAt && scheduledEndAt ? "scheduled" : status;
        if (nextStatus === "cancelled" && workOrder.status !== "cancelled" && (!confirmCancellation || !cancellationReason.trim())) {
          throw new Error(t("confirmCancellationRequired"));
        }
        if (nextStatus === "completed" && !workOrder.estimate_id && (!priceConfirmed || amountMinor === null || amountMinor <= 0)) {
          throw new Error(t("confirmPriceBeforeCompletion"));
        }
        await onUpdate(workOrder.id, {
          status: nextStatus,
          priority,
          scheduledAt: scheduledAt ? dateTimeLocalToUtc(scheduledAt, timeZone) : "",
          scheduledEndAt: scheduledEndAt ? dateTimeLocalToUtc(scheduledEndAt, timeZone) : "",
          accessInstructions,
          lockboxCode,
          gateCode,
          clientType,
          recipientName,
          contactName,
          contactPhone,
          tenantName,
          tenantPhone,
          addressLine1,
          addressLine2,
          city,
          description: items.filter((item) => item.trim()).join("\n"),
          items: items.filter((item) => item.trim()),
          amountMinor,
          priceConfirmed,
          completedItems: nextStatus === "completed" ? completedWorkItems : null,
          cancellationReason: nextStatus === "cancelled" ? cancellationReason.trim() : "",
          confirmCancellation,
          employeeIds,
        }, taskDrafts.filter((task) => task.description.trim()));
      } else {
        const currency = currencyCode;
        if (!currency) throw new Error(t("currencyRequired"));
        if (!contactName.trim() || !contactPhone.trim() || !addressLine1.trim() || !items.some((item) => item.trim())) throw new Error(t("required"));
        if (!clientId || !propertyId) throw new Error(t("required"));
        if (newPropertyMode && !city.trim()) throw new Error(t("required"));
        await onCreate({
          clientId: clientId === INLINE_NEW_CLIENT_ID ? null : clientId,
          propertyId: propertyId === INLINE_NEW_PROPERTY_ID ? null : propertyId,
          newClient: newClientMode ? {
            id: crypto.randomUUID(),
            name: recipientName.trim(),
            companyName: newClientCompany.trim() || null,
            phone: contactPhone.trim(),
            email: newClientEmail.trim() || null,
          } : null,
          newProperty: newPropertyMode ? {
            id: crypto.randomUUID(),
            addressLine1: addressLine1.trim(),
            addressLine2: addressLine2.trim() || null,
            city: city.trim(),
            subdivision: subdivision.trim() || null,
            postalCode: postalCode.trim() || null,
            countryCode: "",
          } : null,
          clientType,
          recipientName,
          contactName,
          contactPhone,
          tenantName,
          tenantPhone,
          addressLine1,
          addressLine2,
          city,
          subdivision,
          postalCode,
          description: items.filter((item) => item.trim()).join("\n"),
          items: items.filter((item) => item.trim()),
          billingMode,
          amountMinor: amountMinor ?? undefined,
          priceConfirmed,
          employeeIds,
          currencyCode: currency,
          scheduledAt: scheduledAt ? dateTimeLocalToUtc(scheduledAt, timeZone) : "",
          scheduledEndAt: scheduledEndAt ? dateTimeLocalToUtc(scheduledEndAt, timeZone) : "",
          priority,
          accessInstructions,
          lockboxCode,
          gateCode,
        }, taskDrafts.filter((task) => task.description.trim()));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  const budgetApproved = !workOrder?.estimate_id || workOrder.estimate_status === "accepted";
  const statuses: WorkOrderStatus[] = workOrder?.status === "pending_approval"
    ? ["pending_approval", "cancelled"]
    : workOrder?.status === "accepted"
      ? ["accepted", "scheduled", ...(budgetApproved ? ["completed" as const] : []), "cancelled"]
      : workOrder?.status === "scheduled"
        ? ["scheduled", "in_progress", ...(budgetApproved ? ["completed" as const] : []), "cancelled"]
        : workOrder?.status === "in_progress"
          ? ["in_progress", ...(budgetApproved ? ["completed" as const] : []), "cancelled"]
          : workOrder?.status === "completed" || workOrder?.status === "cancelled"
            ? [workOrder.status]
            : ["pending", ...(budgetApproved ? ["scheduled" as const, "completed" as const] : []), "cancelled"];
  const priorities: WorkOrderPriority[] = ["low", "normal", "high", "urgent"];
  const clientOptions = [
    ...(newClientMode ? [{ value: INLINE_NEW_CLIENT_ID, label: recipientName || contactName || t("newClient"), detail: t("inlineWillSaveWithOrder") }] : []),
    ...clients
      .filter((client) => client.type === clientType)
      .map((client) => ({ value: client.id, label: client.name, detail: [client.company_name, client.phone].filter(Boolean).join(" · ") })),
  ];
  const propertyOptions = [
    ...(newPropertyMode ? [{ value: INLINE_NEW_PROPERTY_ID, label: addressLine1 || t("newProperty"), detail: t("inlineWillSaveWithOrder") }] : []),
    ...properties
      .filter((property) => {
        if (clientId && clientId !== INLINE_NEW_CLIENT_ID) return !property.client_id || property.client_id === clientId;
        const linkedClient = clients.find((client) => client.id === property.client_id);
        return !linkedClient || linkedClient.type === clientType;
      })
      .map((property) => ({ value: property.id, label: property.address_line1, detail: [property.city, property.subdivision, property.client_name].filter(Boolean).join(" · ") })),
  ];

  return <Modal title={workOrder ? t("editWorkOrder") : t("newWorkOrder")} subtitle={t("orderDetails")} onClose={onClose} wide>
    <form onSubmit={submit} className="space-y-5">
      {source && <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-600"><div className="font-semibold text-slate-800">{source.recipient_name}</div><div className="mt-1">{source.address_line1}{source.city ? ` · ${source.city}` : ""}</div><div className="mt-1">{source.description}</div></div>}
      {!workOrder && <div className="grid gap-4 sm:grid-cols-2">
        <div className="field-group"><label className="field-label" htmlFor="order-client-type">{t("type")}</label><select id="order-client-type" className="form-input h-12 text-sm" value={clientType} onChange={(event) => { const nextType = event.target.value as ClientType; setClientType(nextType); if (clientId && clientId !== INLINE_NEW_CLIENT_ID && clients.find((client) => client.id === clientId)?.type !== nextType) { setClientId(""); setRecipientName(""); } const linkedProperty = properties.find((property) => property.id === propertyId); const propertyClient = clients.find((client) => client.id === linkedProperty?.client_id); if (propertyClient && propertyClient.type !== nextType) clearPropertySelection(); }}><option value="direct">{t("directClient")}</option><option value="property_manager">{t("propertyManager")}</option></select></div>
        <SearchablePicker
          label={t("billTo")}
          value={clientId}
          options={clientOptions}
          placeholder={t("searchClient")}
          noResults={t("noMatches")}
          createAction={t("createClientAction")}
          onCreate={(query) => { const linkedProperty = properties.find((property) => property.id === propertyId); if (linkedProperty?.client_id) clearPropertySelection(); setClientId(INLINE_NEW_CLIENT_ID); setNewClientMode(true); setRecipientName(query); if (!contactName.trim()) setContactName(query); }}
          onChange={(id) => {
            setClientId(id);
            if (!id) { setNewClientMode(false); return; }
            if (id === INLINE_NEW_CLIENT_ID) { setNewClientMode(true); return; }
            setNewClientMode(false);
            const selected = clients.find((client) => client.id === id);
            if (selected) {
              setClientType(selected.type);
              setRecipientName(selected.company_name || selected.name);
              setContactName(selected.name);
              setContactPhone(selected.phone);
              const linkedProperty = properties.find((property) => property.id === propertyId);
              if (linkedProperty?.client_id && linkedProperty.client_id !== selected.id) clearPropertySelection();
            }
          }}
        />
        {newClientMode && <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 sm:col-span-2"><p className="mb-3 text-xs leading-relaxed text-indigo-900">{t("inlineWillSaveWithOrder")}</p><div className="grid gap-3 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="order-client-company">{t("company")}</label><input id="order-client-company" className="form-input bg-white" value={newClientCompany} onChange={(event) => setNewClientCompany(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="order-client-email">{t("email")}</label><input id="order-client-email" type="email" className="form-input bg-white" value={newClientEmail} onChange={(event) => setNewClientEmail(event.target.value)} /></div></div></div>}
        <div className="field-group"><label className="field-label" htmlFor="order-contact-name">{t("contactName")} <Required /></label><input id="order-contact-name" className="form-input" value={contactName} onChange={(event) => setContactName(event.target.value)} required /></div>
        <div className="field-group"><label className="field-label" htmlFor="order-contact-phone">{t("phone")} <Required /></label><input id="order-contact-phone" className="form-input" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} required /></div>
        {clientType === "property_manager" && <><div className="field-group"><label className="field-label" htmlFor="order-tenant-name">{t("tenantName")}</label><input id="order-tenant-name" className="form-input" value={tenantName} onChange={(event) => setTenantName(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="order-tenant-phone">{t("tenantPhone")}</label><input id="order-tenant-phone" className="form-input" value={tenantPhone} onChange={(event) => setTenantPhone(event.target.value)} /></div></>}
        <div className="sm:col-span-2">{!workOrder ? <SearchablePicker
          label={`${t("address")} *`}
          value={propertyId}
          options={propertyOptions}
          placeholder={t("searchProperty")}
          noResults={t("noMatches")}
          createAction={t("createPropertyAction")}
          createDisabled={!clientId}
          createDisabledHint={t("selectClientFirst")}
          onCreate={(query) => { setPropertyId(INLINE_NEW_PROPERTY_ID); setNewPropertyMode(true); setAddressLine1(query); }}
          onChange={(id) => {
            setPropertyId(id);
            if (!id) { setNewPropertyMode(false); return; }
            if (id === INLINE_NEW_PROPERTY_ID) { setNewPropertyMode(true); return; }
            setNewPropertyMode(false);
            const selected = properties.find((property) => property.id === id);
            if (selected) {
              setAddressLine1(selected.address_line1);
              setAddressLine2(selected.address_line2 || "");
              setCity(selected.city);
              setSubdivision(selected.subdivision || "");
              setPostalCode(selected.postal_code || "");
              if (selected.client_id) {
                const linkedClient = clients.find((client) => client.id === selected.client_id);
                if (linkedClient) {
                  setClientId(linkedClient.id);
                  setNewClientMode(false);
                  setClientType(linkedClient.type);
                  setRecipientName(linkedClient.company_name || linkedClient.name);
                }
              }
            }
          }}
        /> : <div className="field-group"><label className="field-label" htmlFor="order-address">{t("address")} <Required /></label><input id="order-address" className="form-input" value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} required /></div>}</div>
        {newPropertyMode && <p className="-mt-2 text-[11px] text-indigo-700 sm:col-span-2">{t("inlineWillSaveWithOrder")}</p>}
        <div className="field-group"><label className="field-label" htmlFor="order-address2">{t("addressLine2")}</label><input id="order-address2" className="form-input" value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} /></div>
        <div className="field-group"><label className="field-label" htmlFor="order-city">{t("city")}{newPropertyMode && <Required />}</label><input id="order-city" className="form-input" value={city} onChange={(event) => setCity(event.target.value)} required={newPropertyMode} /></div>
        <div className="field-group"><label className="field-label" htmlFor="order-subdivision">{t("subdivision")}</label><input id="order-subdivision" className="form-input" value={subdivision} onChange={(event) => setSubdivision(event.target.value)} /></div>
        <div className="field-group"><label className="field-label" htmlFor="order-postal">{t("postalCode")}</label><input id="order-postal" className="form-input" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} /></div>
        <div className="field-group sm:col-span-2"><label className="field-label">{t("description")} <Required /></label><div className="space-y-2">{items.map((item, index) => <div className="flex gap-2" key={index}><input className="form-input" value={item} onChange={(event) => setItems(items.map((value, row) => row === index ? event.target.value : value))} required={index === 0} /><button type="button" className="button-secondary" aria-label={t("removeWorkItem")} onClick={() => setItems(items.filter((_, row) => row !== index))} disabled={items.length === 1}>−</button></div>)}<button type="button" className="button-secondary" onClick={() => setItems([...items, ""])}>+ {t("addWorkItem")}</button></div></div>
      </div>}
      {!workOrder && <div className="field-group"><div className="field-label">{t("currency")}</div><div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">{currencyCode || workspaceCurrency || "—"}</div>{!workspaceCurrency && <div className="mt-2 flex items-center justify-between gap-3 text-xs text-amber-800"><span>{t("currencyRequired")}</span><button type="button" className="shrink-0 font-semibold text-indigo-700 hover:text-indigo-900" onClick={onOpenSettings}>{t("openSettings")}</button></div>}</div>}
      {workOrder ? <div className="grid gap-4 sm:grid-cols-2">
        <div className="field-group"><label className="field-label" htmlFor="work-order-status">{t("workOrderStatus")}</label><select id="work-order-status" className="form-input h-12 text-sm" value={status} onChange={(event) => { setStatus(event.target.value as WorkOrderStatus); setConfirmCancellation(false); }}>{statuses.map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></div>
        <div className="field-group"><label className="field-label" htmlFor="work-order-priority">{t("priority")}</label><select id="work-order-priority" className="form-input h-12 text-sm" value={priority} onChange={(event) => setPriority(event.target.value as WorkOrderPriority)}>{priorities.map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></div>
      </div> : <div className="grid gap-4 sm:grid-cols-2">
        <div className="field-group"><label className="field-label" htmlFor="work-order-priority">{t("priority")}</label><select id="work-order-priority" className="form-input h-12 text-sm" value={priority} onChange={(event) => setPriority(event.target.value as WorkOrderPriority)}>{priorities.map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></div>
         <div className="field-group"><label className="field-label">{t("billingMode")}</label><div className="grid grid-cols-2 gap-2"><ChoiceButton active={billingMode === "fixed"} onClick={() => setBillingMode("fixed")} icon={FileText}>{t("fixedPrice")}</ChoiceButton><ChoiceButton active={billingMode === "time_materials"} onClick={() => setBillingMode("time_materials")} icon={Clock3}>{t("timeMaterials")}</ChoiceButton></div></div>
         </div>}
      {workOrder && status === "cancelled" && (workOrder.status === "cancelled" ? <div className="rounded-lg border border-rose-100 bg-rose-50 px-3.5 py-3 text-xs text-rose-900"><div className="font-semibold">{t("cancelWorkOrder")}</div><p className="mt-1">{workOrder.cancellation_reason || t("noCancellationReason")}</p></div> : <section className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/70 p-4"><div><h3 className="text-sm font-semibold text-rose-900">{t("cancelWorkOrder")}</h3><p className="mt-1 text-[11px] text-rose-800">{t("cancellationReasonRequired")}</p></div><label className="field-group"><span className="field-label">{t("cancellationReason")}</span><textarea className="form-input min-h-16 resize-y bg-white" maxLength={500} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} /></label><label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700"><input type="checkbox" className="mt-0.5" checked={confirmCancellation} onChange={(event) => setConfirmCancellation(event.target.checked)} /><span>{t("confirmCancellationText")}</span></label></section>)}
      {(!workOrder || (!workOrder.estimate_id && !(workOrder.price_confirmed === 1 && workOrder.agreed_amount_minor > 0))) && <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4"><div className="field-group"><label className="field-label" htmlFor="work-order-amount">{t("agreedAmount")}</label><input id="work-order-amount" className="form-input bg-white" type="number" min="0" step={1 / 10 ** fractionDigits} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />{workOrder && status === "completed" && !priceConfirmed && <p role="status" className="text-xs font-medium text-amber-800">{t("confirmPriceBeforeCompletion")}</p>}</div><label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700"><input className="mt-0.5" type="checkbox" checked={priceConfirmed} onChange={(event) => setPriceConfirmed(event.target.checked)} /><span>{t("confirmAgreedPrice")}</span></label></div>}
      {workOrder && !workOrder.estimate_id && workOrder.price_confirmed === 1 && workOrder.agreed_amount_minor > 0 && <div className="rounded-lg bg-emerald-50 px-3.5 py-3 text-xs text-emerald-900"><span className="font-semibold">{t("priceConfirmedLabel")}:</span> {formatMinorUnits(workOrder.agreed_amount_minor, workOrder.currency_code, locale === "es" ? "es" : "en")}</div>}
      {workOrder && status === "completed" && <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4"><div><h3 className="text-sm font-semibold text-slate-800">{t("workPerformed")}</h3><p className="mt-1 text-[11px] text-slate-500">{t("workPerformedHint")}</p></div>{completedWorkItems.length === 0 && workOrder.status === "completed" && <p className="text-xs text-slate-500">{t("noCompletedWorkRecorded")}</p>}<div className="space-y-2">{completedWorkItems.map((item, index) => <div key={index} className="flex gap-2"><input className="form-input bg-white" value={item} onChange={(event) => setCompletedWorkItems(completedWorkItems.map((value, row) => row === index ? event.target.value : value))} maxLength={500} placeholder={t("workPerformedPlaceholder")} /><button type="button" className="button-secondary" aria-label={t("removeWorkItem")} onClick={() => setCompletedWorkItems(completedWorkItems.filter((_, row) => row !== index))}>−</button></div>)}<button type="button" className="button-secondary" onClick={() => setCompletedWorkItems([...completedWorkItems, ""])}>+ {t("addWorkItem")}</button></div></section>}
      {workOrder?.status === "accepted" && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs leading-relaxed text-emerald-900">{t("acceptedScheduleHint")}</div>}
      {workOrder?.estimate_id && workOrder.estimate_status !== "accepted" && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900">{t("unapprovedEstimateBlocksOrder")}</div>}
       <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4"><div><h3 className="text-sm font-semibold text-slate-800">{t("assignEmployees")}</h3><p className="mt-1 text-[11px] text-slate-500">{t("assignEmployeesHint")}</p></div>{employees.length === 0 ? <button type="button" onClick={onOpenSettings} className="text-xs font-semibold text-indigo-700 hover:text-indigo-900">{t("addEmployeesFirst")}</button> : <div className="grid gap-2 sm:grid-cols-2">{employees.map((employee) => <label key={employee.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-indigo-200"><input type="checkbox" checked={employeeIds.includes(employee.id)} onChange={(event) => setEmployeeIds(event.target.checked ? [...employeeIds, employee.id] : employeeIds.filter((id) => id !== employee.id))} /><span className="size-3 rounded-full" style={{ backgroundColor: employee.color }} /><span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{employee.name}</span></label>)}</div>}</section>
        <section className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4"><div><h3 className="text-sm font-semibold text-slate-800">{t("workOrderTasks")}</h3><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t("workOrderTasksHint")}</p></div>{taskDrafts.map((task, index) => <div key={task.id ?? `new-task-${index}`} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3"><div className="flex gap-2"><input className="form-input" required aria-label={t("assignedTaskDescription")} placeholder={t("assignedTaskDescription")} maxLength={500} disabled={Boolean(task.assignmentHistory?.length)} title={task.assignmentHistory?.length ? (locale === "es" ? "Crea una tarea nueva para conservar el historial." : "Create a new task to preserve history.") : undefined} value={task.description} onChange={(event) => setTaskDrafts((current) => current.map((item, row) => row === index ? { ...item, description: event.target.value } : item))} />{!task.id && <button type="button" className="button-secondary" aria-label={t("removeWorkItem")} onClick={() => setTaskDrafts((current) => current.filter((_, row) => row !== index))}>−</button>}</div><div><div className="field-label">{t("taskAssignees")}</div>{employees.length === 0 ? <button type="button" onClick={onOpenSettings} className="mt-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900">{t("addEmployeesFirst")}</button> : <div className="mt-2 grid gap-2 sm:grid-cols-2">{employees.map((employee) => <label key={employee.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:border-indigo-200"><input type="checkbox" checked={task.employeeIds.includes(employee.id)} onChange={(event) => setTaskDrafts((current) => current.map((item, row) => row === index ? { ...item, employeeIds: event.target.checked ? [...item.employeeIds, employee.id] : item.employeeIds.filter((id) => id !== employee.id) } : item))} /><span className="size-3 rounded-full" style={{ backgroundColor: employee.color }} /><span className="truncate text-xs text-slate-700">{employee.name}</span></label>)}</div>}</div>{task.assignmentHistory?.some((assignment) => assignment.status !== "assigned") && <div className="space-y-1 border-t border-slate-100 pt-2">{task.assignmentHistory.filter((assignment) => assignment.status !== "assigned").map((assignment, historyIndex) => <p key={`${assignment.employeeId}-${assignment.assignedAt}-${historyIndex}`} className="text-[10px] text-slate-500">{assignment.employeeName} · {assignment.status === "completed" ? (locale === "es" ? "realizada" : "completed") : assignment.status === "cancelled" ? (locale === "es" ? "cancelada" : "cancelled") : (locale === "es" ? "reasignada" : "reassigned")} · {formatWorkspaceDateTime(assignment.completedAt ?? assignment.cancelledAt ?? assignment.assignedAt, locale === "es" ? "es" : "en", timeZone)}{assignment.cancellationReason ? ` · ${assignment.cancellationReason}` : ""}</p>)}</div>}</div>)}<button type="button" className="button-secondary" onClick={() => setTaskDrafts((current) => [...current, { id: null, description: "", employeeIds: [] }])}>+ {t("addAssignedTask")}</button></section>
      <div className="grid gap-4 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="work-order-date">{t("scheduledStart")}</label><div className="relative"><CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="work-order-date" className="form-input pl-9" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></div></div><div className="field-group"><label className="field-label" htmlFor="work-order-end">{t("scheduledEnd")}</label><div className="relative"><CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="work-order-end" className="form-input pl-9" type="datetime-local" value={scheduledEndAt} onChange={(event) => setScheduledEndAt(event.target.value)} /></div></div></div>
      <div className="field-group"><label className="field-label" htmlFor="work-order-access">{t("accessInstructions")}</label><textarea id="work-order-access" className="form-input min-h-[72px] resize-y" value={accessInstructions} onChange={(event) => setAccessInstructions(event.target.value)} /></div>
      {canViewAccessCodes && <div className="grid gap-4 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="work-order-lockbox">Lockbox</label><input id="work-order-lockbox" type="text" autoComplete="off" className="form-input" value={lockboxCode} onChange={(event) => setLockboxCode(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="work-order-gate">Gate code</label><input id="work-order-gate" type="text" autoComplete="off" className="form-input" value={gateCode} onChange={(event) => setGateCode(event.target.value)} /></div></div>}
      {workOrder && <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div><h3 className="text-sm font-semibold text-slate-800">{t("additionalWork")}</h3><p className="mt-1 text-[11px] text-slate-500">{t("additionalWorkHint")}</p></div>
        {workOrder.status !== "cancelled" && <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3"><div className="grid gap-3 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="extra-description">{t("additionalWorkDescription")}</label><input id="extra-description" className="form-input h-10" maxLength={500} value={extraDescription} onChange={(event) => setExtraDescription(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="extra-reason">{t("additionalWorkReason")}</label><input id="extra-reason" className="form-input h-10" maxLength={500} value={extraReason} onChange={(event) => setExtraReason(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="extra-amount">{t("additionalWorkAmount")} ({workOrder.currency_code})</label><input id="extra-amount" className="form-input h-10" type="number" min="0" step={1 / 10 ** currencyFractionDigits(workOrder.currency_code)} value={extraAmount} onChange={(event) => setExtraAmount(event.target.value)} /></div></div><div className="flex justify-end"><button type="button" disabled={!extraDescription.trim() || !extraReason.trim() || !extraAmount.trim()} onClick={() => void saveExtra()} className="primary-button h-9 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white disabled:opacity-50">{t("addPendingExtra")}</button></div></div>}
        {workOrderExtras.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">{t("noAdditionalWork")}</p> : <div className="space-y-2">{workOrderExtras.map((extra) => <article key={extra.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex items-center gap-2 text-xs font-semibold text-slate-800">{extra.description}<span className={`rounded-full px-2 py-0.5 text-[9px] ${extra.status === "approved" ? "bg-emerald-100 text-emerald-800" : extra.status === "cancelled" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-800"}`}>{t(`extraStatus_${extra.status}` as Parameters<typeof translate>[1])}</span></div><p className="mt-1 text-[10px] text-slate-500">{t("additionalWorkReason")}: {extra.reason}</p>{extra.status === "approved" && <p className="mt-1 text-[10px] text-emerald-800">{t("approvalRecorded")}: {t(`approvalMethod_${extra.approval_method ?? "other"}` as Parameters<typeof translate>[1])}{extra.approval_note ? ` · ${extra.approval_note}` : ""}</p>}</div><span className="text-xs font-bold text-slate-800">{formatMinorUnits(extra.amount_minor, extra.currency_code, locale === "es" ? "es" : "en")}</span></div>
          {extra.status === "pending_approval" && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3"><div className="grid gap-2 sm:grid-cols-[180px_1fr]"><label className="field-group"><span className="field-label">{t("customerApprovalMethod")}</span><select className="form-input h-9" value={extraApprovalMethod} onChange={(event) => setExtraApprovalMethod(event.target.value as NonNullable<WorkOrderExtra["approval_method"]>)}><option value="verbal">{t("approvalMethod_verbal")}</option><option value="message">{t("approvalMethod_message")}</option><option value="written">{t("approvalMethod_written")}</option><option value="other">{t("approvalMethod_other")}</option></select></label><label className="field-group"><span className="field-label">{t("approvalNoteOptional")}</span><input className="form-input h-9" maxLength={500} value={extraApprovalNote} onChange={(event) => setExtraApprovalNote(event.target.value)} /></label></div><label className="flex cursor-pointer items-start gap-2 text-[10px] text-slate-600"><input type="checkbox" className="mt-0.5" checked={customerApprovalReceived} onChange={(event) => setCustomerApprovalReceived(event.target.checked)} /><span>{t("confirmCustomerApprovedExtra")}</span></label><div className="flex gap-2"><button type="button" disabled={!customerApprovalReceived} onClick={() => void updateExtra(extra, "approve")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-[10px] font-semibold text-white disabled:opacity-50">{t("approveAdditionalWork")}</button><button type="button" onClick={() => void updateExtra(extra, "cancel")} className="rounded-md border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600">{t("cancelAdditionalWork")}</button></div></div>}
        </article>)}</div>}
      </section>}
      {workOrder && <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div><h3 className="text-sm font-semibold text-slate-800">{t("orderMaterials")}</h3><p className="mt-1 text-[11px] text-slate-500">{t("materialsInternalPricingHint")}</p></div>
        {!workspaceCurrency ? <button type="button" onClick={onOpenSettings} className="text-xs font-semibold text-indigo-700 hover:text-indigo-900">{t("currencyRequired")}</button> : <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="grid gap-3 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="material-name">{t("materialName")}</label><input id="material-name" className="form-input h-10" maxLength={150} value={materialName} onChange={(event) => setMaterialName(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="material-quantity">{t("materialQuantityUsed")}</label><input id="material-quantity" className="form-input h-10" type="number" min="0.001" step="0.001" value={materialQuantity} onChange={(event) => setMaterialQuantity(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="material-total-cost">{t("materialTotalCost")} ({workspaceCurrency})</label><input id="material-total-cost" className="form-input h-10" type="number" min="0" step={1 / 10 ** currencyFractionDigits(workspaceCurrency)} value={materialTotalCost} onChange={(event) => setMaterialTotalCost(event.target.value)} placeholder="0" /></div><div className="field-group"><label className="field-label" htmlFor="material-unit-price">{t("materialUnitPrice")} ({workspaceCurrency})</label><input id="material-unit-price" className="form-input h-10" type="number" min="0" step={1 / 10 ** currencyFractionDigits(workspaceCurrency)} value={materialUnitPrice} onChange={(event) => setMaterialUnitPrice(event.target.value)} placeholder="0" /></div></div>
          <div className="flex justify-end"><button type="button" className="primary-button h-10 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" onClick={() => void saveMaterial()} disabled={!materialName.trim() || !materialQuantity}>{t("saveMaterial")}</button></div>
        </div>}
        {materials.length > 0 ? <div className="max-h-72 space-y-2 overflow-y-auto">{materials.map((material) => <article key={material.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"><div className="flex flex-wrap items-start justify-between gap-2"><div className="text-xs font-semibold text-slate-800">{material.material_name}<p className="mt-1 text-[10px] font-normal text-slate-500">{t("materialQuantityUsed")}: {material.quantity}</p></div><div className="text-right text-[10px] text-slate-600"><div>{t("materialTotalCost")}: {formatMinorUnits(material.total_cost_minor, material.currency_code, locale === "es" ? "es" : "en")}</div><div>{t("materialUnitPrice")}: {formatMinorUnits(material.unit_price_minor, material.currency_code, locale === "es" ? "es" : "en")}</div></div></div></article>)}</div> : <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">{t("noMaterials")}</p>}
      </section>}
      {workOrder && <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-800">{t("workTimeEntries")}</h3><p className="mt-1 text-[11px] text-slate-500">{t("workTimeHint")}</p></div><div className="shrink-0 rounded-lg bg-white px-3 py-2 text-right"><div className="text-[10px] text-slate-400">{t("totalLogged")}</div><div className="text-sm font-bold text-slate-800">{formatWorkDuration(totalWorkMinutes, t)}</div></div></div>
        {employees.length === 0 ? <button type="button" onClick={onOpenSettings} className="text-xs font-semibold text-indigo-700 hover:text-indigo-900">{t("addEmployeesFirst")}</button> : <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="grid gap-3 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="time-entry-type">{t("workPayMode")}</label><select id="time-entry-type" className="form-input h-10" value={timeEntryType} onChange={(event) => setTimeEntryType(event.target.value as "hourly" | "per_job")}><option value="hourly">{t("paidHourly")}</option><option value="per_job">{t("paidPerJob")}</option></select></div><div className="field-group"><label className="field-label" htmlFor="time-employee">{t("employeeName")}</label><select id="time-employee" className="form-input h-10" value={timeEmployeeId} onChange={(event) => setTimeEmployeeId(event.target.value)}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></div></div>
          {timeEntryType === "hourly" ? <div className="grid gap-3 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="time-start">{t("timeStartedAt")}</label><input id="time-start" className="form-input h-10" type="datetime-local" value={timeStartedAt} onChange={(event) => setTimeStartedAt(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="time-end">{t("timeEndedAt")}</label><input id="time-end" className="form-input h-10" type="datetime-local" value={timeEndedAt} onChange={(event) => setTimeEndedAt(event.target.value)} /></div></div> : <div className="grid gap-3 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="work-entry-date">{t("workDate")}</label><input id="work-entry-date" className="form-input h-10" type="date" value={timeEntryDate} onChange={(event) => setTimeEntryDate(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="work-entry-cost">{t("employeeWorkCost")} {workspaceCurrency ? `(${workspaceCurrency})` : ""}</label><input id="work-entry-cost" className="form-input h-10" type="number" min="0" step={workspaceCurrency ? 1 / 10 ** currencyFractionDigits(workspaceCurrency) : 0.01} value={timeAmount} onChange={(event) => setTimeAmount(event.target.value)} placeholder="0" /><p className="text-[10px] text-slate-400">{t("internalEmployeeCostOnly")}</p></div></div>}
          <div className="flex flex-col gap-2 sm:flex-row"><textarea className="form-input min-h-10 flex-1 resize-y" maxLength={500} value={timeNote} onChange={(event) => setTimeNote(event.target.value)} placeholder={t("timeEntryNote")} /><button type="button" className="primary-button h-10 shrink-0 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" onClick={() => void saveTimeEntry()} disabled={!timeEmployeeId || (timeEntryType === "hourly" ? !timeStartedAt || !timeEndedAt : !timeEntryDate || !timeAmount.trim())}>{t(timeEntryType === "hourly" ? "saveHoursEntry" : "saveWorkEntry")}</button></div>
        </div>}
        {timeEntries.length > 0 ? <div className="max-h-56 space-y-2 overflow-y-auto">{timeEntries.map((entry) => <article key={entry.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-semibold text-slate-800"><span className="size-2.5 rounded-full" style={{ backgroundColor: employees.find((employee) => employee.id === entry.employee_id)?.color ?? "#64748b" }} />{entry.employee_name}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-medium text-slate-500">{t(entry.entry_type === "hourly" ? "paidHourly" : "paidPerJob")}</span></div><span className="text-xs font-bold text-indigo-700">{entry.entry_type === "hourly" ? formatWorkDuration(entry.duration_minutes ?? 0, t) : entry.currency_code ? formatMinorUnits(entry.amount_minor ?? 0, entry.currency_code, locale === "es" ? "es" : "en") : "—"}</span></div><div className="mt-1 text-[10px] text-slate-500">{entry.entry_type === "hourly" && entry.started_at && entry.ended_at ? `${formatWorkspaceDateTime(entry.started_at, locale === "es" ? "es" : "en", timeZone)} – ${formatWorkspaceDateTime(entry.ended_at, locale === "es" ? "es" : "en", timeZone)}` : formatWorkspaceDateTime(entry.work_occurred_at, locale === "es" ? "es" : "en", timeZone)}</div>{entry.entry_type === "per_job" && <div className="mt-1 text-[10px] font-medium text-slate-500">{t("internalEmployeeCostOnly")}</div>}{entry.note && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{entry.note}</p>}</article>)}</div> : <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">{t("noTimeEntries")}</p>}
      </section>}
      {workOrder && <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div><h3 className="text-sm font-semibold text-slate-800">{t("orderPhotos")}</h3><p className="mt-1 text-xs text-slate-500">{t("photoLimitHint")}</p>
          <input className="mt-3 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void savePhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          {photos.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{photos.map((photo) => <figure key={photo.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white"><img src={photo.data_url} alt={photo.file_name} className="h-24 w-full object-cover" /><figcaption className="truncate px-2 py-1 text-[10px] text-slate-500">{photo.file_name}</figcaption></figure>)}</div>}
        </div>
        <div><h3 className="text-sm font-semibold text-slate-800">{t("orderNotes")}</h3><div className="mt-2 flex gap-2"><textarea className="form-input min-h-16 resize-y" value={newNote} onChange={(event) => setNewNote(event.target.value)} placeholder={t("writeNote")} /><button type="button" className="button-primary self-end" onClick={() => void saveNote()} disabled={!newNote.trim()}>{t("saveNote")}</button></div>
          {notes.length > 0 && <ul className="mt-3 space-y-2">{notes.map((note) => <li key={note.id} className="rounded-lg bg-white p-3 text-sm text-slate-700"><p className="whitespace-pre-wrap">{note.body}</p><time className="mt-1 block text-[10px] text-slate-400">{new Intl.DateTimeFormat(locale === "es" ? "es" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(note.created_at))}</time></li>)}</ul>}
        </div>
      </section>}
      {error && <FormError>{error}</FormError>}
      <FormActions locale={locale} t={t} saving={saving} onCancel={onClose} disabled={(!workOrder && !currencyCode) || (!!workOrder && status === "cancelled" && workOrder.status !== "cancelled" && (!confirmCancellation || !cancellationReason.trim()))} />
    </form>
  </Modal>;
}

function CorrectionPreview({ orders, selectedOrderIds, onSelectionChange, summary, getChanges, t }: {
  orders: WorkOrder[];
  selectedOrderIds: string[];
  onSelectionChange: (ids: string[]) => void;
  summary: string;
  getChanges: (order: WorkOrder) => string[];
  t: (key: Parameters<typeof translate>[1]) => string;
}) {
  const allSelected = selectedOrderIds.length === orders.length;
  return (
    <section className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4" aria-label={t("correctionPreviewTitle")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{t("correctionPreviewTitle")}</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t("correctionPreviewDescription")}</p>
        </div>
        <button type="button" className="text-xs font-semibold text-indigo-700 hover:text-indigo-900" onClick={() => onSelectionChange(allSelected ? [] : orders.map((order) => order.id))}>
          {allSelected ? t("deselectAllRelated") : t("selectAllRelated")}
        </button>
      </div>
      <p className="rounded-lg bg-white/80 px-3 py-2 text-xs leading-relaxed text-indigo-900">{summary}</p>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {orders.map((order) => {
          const checked = selectedOrderIds.includes(order.id);
          return <label key={order.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 hover:border-indigo-200">
            <input type="checkbox" className="mt-0.5 accent-indigo-600" checked={checked} onChange={(event) => onSelectionChange(event.target.checked ? [...selectedOrderIds, order.id] : selectedOrderIds.filter((id) => id !== order.id))} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-slate-700">{order.contact_name} · {order.contact_phone}</span>
              <span className="mt-1 block truncate text-[11px] text-slate-500">{order.address_line1}{order.city ? `, ${order.city}` : ""}</span>
              <span className="mt-1 block space-y-0.5">{getChanges(order).map((change) => <span key={change} className="block text-[10px] font-medium text-indigo-700">{change}</span>)}</span>
              <span className="mt-1 block text-[10px] text-slate-400">{t(order.status)}</span>
            </span>
          </label>;
        })}
      </div>
    </section>
  );
}

function CorrectionPreviewActions({ locale, t, saving, onBack, onCancel }: { locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; saving: boolean; onBack: () => void; onCancel: () => void }) {
  return <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
    <button type="button" onClick={onCancel} className="secondary-button h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50">{t("cancel")}</button>
    <button type="button" onClick={onBack} className="secondary-button h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50">{t("backToEdit")}</button>
    <button type="submit" disabled={saving} className="primary-button inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <span className="loading-spinner" /> : <Check size={14} />}{saving ? (locale === "es" ? "Guardando..." : "Saving...") : t("confirmCorrection")}</button>
  </div>;
}

function ClientForm({ client, relatedOrders, locale, t, onClose, onSave }: { client?: Client; relatedOrders: WorkOrder[]; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; onClose: () => void; onSave: (input: ClientInput, existingId?: string, relatedWorkOrderIds?: string[]) => Promise<void> }) {
  const [type, setType] = useState<ClientType>(client?.type ?? "direct");
  const [name, setName] = useState(client?.name ?? "");
  const [companyName, setCompanyName] = useState(client?.company_name ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewOrders, setPreviewOrders] = useState<WorkOrder[] | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !phone.trim()) return setError(t("required"));
    const updatedName = name.trim();
    const updatedPhone = phone.trim();
    if (client && !previewOrders) {
      const impacts = relatedOrders.filter((order) =>
        (client.name !== updatedName && order.contact_name !== updatedName)
        || (client.phone !== updatedPhone && order.contact_phone !== updatedPhone),
      );
      if (impacts.length > 0) {
        setPreviewOrders(impacts);
        setSelectedOrderIds(impacts.map((order) => order.id));
        setError("");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ type, name, companyName, phone, email }, client?.id, previewOrders ? selectedOrderIds : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={client ? t("editClient") : t("newClient")} subtitle={t("contactInfo")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        {previewOrders && <CorrectionPreview
          orders={previewOrders}
          selectedOrderIds={selectedOrderIds}
          onSelectionChange={setSelectedOrderIds}
          summary={t("clientCorrectionSummary")}
          getChanges={(order) => [
            ...(client && client.name !== name.trim() && order.contact_name !== name.trim() ? [`${t("name")}: ${order.contact_name} → ${name.trim()}`] : []),
            ...(client && client.phone !== phone.trim() && order.contact_phone !== phone.trim() ? [`${t("phone")}: ${order.contact_phone} → ${phone.trim()}`] : []),
          ]}
          t={t}
        />}
        {!previewOrders && <>
        {client ? <div className="field-group"><div className="field-label">{t("type")}</div><Badge tone={type === "direct" ? "green" : "purple"}>{type === "direct" ? t("directClient") : t("propertyManager")}</Badge><p className="mt-2 text-[10px] text-slate-400">{t("clientTypeImmutableHint")}</p></div> : <div className="field-group"><label className="field-label">{t("type")}</label><div className="grid grid-cols-2 gap-2">
          <ChoiceButton active={type === "direct"} onClick={() => setType("direct")} icon={Users}>{t("directClient")}</ChoiceButton>
          <ChoiceButton active={type === "property_manager"} onClick={() => setType("property_manager")} icon={Building2}>{t("propertyManager")}</ChoiceButton>
        </div></div>}
        <div className="field-group"><label className="field-label" htmlFor="client-name">{t("name")} <Required /></label><input autoFocus id="client-name" className="form-input" value={name} onChange={(event) => setName(event.target.value)} required /></div>
        <div className="field-group"><label className="field-label" htmlFor="client-company">{t("company")}</label><input id="client-company" className="form-input" value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field-group"><label className="field-label" htmlFor="client-phone">{t("phone")} <Required /></label><input id="client-phone" className="form-input" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required /></div>
          <div className="field-group"><label className="field-label" htmlFor="client-email">{t("email")}</label><input id="client-email" className="form-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        </div>
        </>}
        {error && <FormError>{error}</FormError>}
        {previewOrders ? <CorrectionPreviewActions locale={locale} t={t} saving={saving} onBack={() => setPreviewOrders(null)} onCancel={onClose} /> : <FormActions locale={locale} t={t} saving={saving} onCancel={onClose} />}
      </form>
    </Modal>
  );
}

function PropertyForm({ clients, property, relatedOrders, locale, timeZone, t, onClose, onSave }: { clients: Client[]; property?: Property; relatedOrders: WorkOrder[]; locale: Locale; timeZone: string; t: (key: Parameters<typeof translate>[1]) => string; onClose: () => void; onSave: (input: PropertyInput, existingId?: string, relatedWorkOrderIds?: string[], newClientId?: string) => Promise<void> }) {
  const [clientId, setClientId] = useState(property?.client_id ?? "");
  const [reassigning, setReassigning] = useState(false);
  const [reassignmentClientId, setReassignmentClientId] = useState("");
  const [reassignmentConfirmed, setReassignmentConfirmed] = useState(false);
  const [addressLine1, setAddressLine1] = useState(property?.address_line1 ?? "");
  const [addressLine2, setAddressLine2] = useState(property?.address_line2 ?? "");
  const [city, setCity] = useState(property?.city ?? "");
  const [subdivision, setSubdivision] = useState(property?.subdivision ?? "");
  const [postalCode, setPostalCode] = useState(property?.postal_code ?? "");
  const [countryCode, setCountryCode] = useState(property?.country_code ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewOrders, setPreviewOrders] = useState<WorkOrder[] | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<PropertyAssignmentHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(!!property);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    if (!property) return;
    let active = true;
    listPropertyAssignmentHistory(property.id).then((history) => {
      if (active) setAssignmentHistory(history);
    }).catch(() => {
      if (active) setHistoryError(t("propertyHistoryLoadError"));
    }).finally(() => {
      if (active) setHistoryLoading(false);
    });
    return () => { active = false; };
  }, [property?.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!clientId || !addressLine1.trim() || !city.trim()) return setError(t("required"));
    const updatedAddress = addressLine1.trim();
    const updatedAddressLine2 = addressLine2.trim() || null;
    const updatedCity = city.trim();
    const updatedSubdivision = subdivision.trim() || null;
    const updatedPostalCode = postalCode.trim() || null;
    const nextClientId = reassigning ? reassignmentClientId : undefined;
    if (reassigning && (!nextClientId || nextClientId === clientId)) return setError(t("selectNewClient"));
    if (reassigning && !reassignmentConfirmed) return setError(t("propertyReassignmentConfirmationRequired"));
    if (property && !previewOrders) {
      const impacts = relatedOrders.filter((order) =>
        (property.address_line1 !== updatedAddress && order.address_line1 !== updatedAddress)
        || (property.address_line2 !== updatedAddressLine2 && order.address_line2 !== updatedAddressLine2)
        || (property.city !== updatedCity && order.city !== updatedCity)
        || (property.subdivision !== updatedSubdivision && order.subdivision !== updatedSubdivision)
        || (property.postal_code !== updatedPostalCode && order.postal_code !== updatedPostalCode),
      );
      if (impacts.length > 0) {
        setPreviewOrders(impacts);
        setSelectedOrderIds(impacts.map((order) => order.id));
        setError("");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ clientId, addressLine1, addressLine2, city, subdivision, postalCode, countryCode }, property?.id, previewOrders ? selectedOrderIds : [], nextClientId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={property ? t("editProperty") : t("newProperty")} subtitle={t("jobInfo")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {previewOrders && <CorrectionPreview
          orders={previewOrders}
          selectedOrderIds={selectedOrderIds}
          onSelectionChange={setSelectedOrderIds}
          summary={t("propertyCorrectionSummary")}
          getChanges={(order) => [
            ...(property && property.address_line1 !== addressLine1.trim() && order.address_line1 !== addressLine1.trim() ? [`${t("address")}: ${order.address_line1} → ${addressLine1.trim()}`] : []),
            ...(property && property.address_line2 !== (addressLine2.trim() || null) && order.address_line2 !== (addressLine2.trim() || null) ? [`${t("addressLine2")}: ${order.address_line2 || "—"} → ${addressLine2.trim() || "—"}`] : []),
            ...(property && property.city !== city.trim() && order.city !== city.trim() ? [`${t("city")}: ${order.city} → ${city.trim()}`] : []),
            ...(property && property.subdivision !== (subdivision.trim() || null) && order.subdivision !== (subdivision.trim() || null) ? [`${t("subdivision")}: ${order.subdivision || "—"} → ${subdivision.trim() || "—"}`] : []),
            ...(property && property.postal_code !== (postalCode.trim() || null) && order.postal_code !== (postalCode.trim() || null) ? [`${t("postalCode")}: ${order.postal_code || "—"} → ${postalCode.trim() || "—"}`] : []),
          ]}
          t={t}
        />}
        {property && !previewOrders && <section className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="property-assignment-history-title"><div className="flex items-center gap-2"><History size={15} className="text-slate-500" /><h3 id="property-assignment-history-title" className="text-sm font-semibold text-slate-800">{t("propertyAssignmentHistory")}</h3></div><p className="mt-1 text-[11px] text-slate-500">{t("propertyAssignmentHistoryDescription")}</p>{historyLoading ? <p className="mt-3 text-xs text-slate-500">{t("loading")}</p> : historyError ? <p role="alert" className="mt-3 text-xs text-rose-700">{historyError}</p> : assignmentHistory.length === 0 ? <p className="mt-3 text-xs text-slate-500">{t("noPropertyAssignmentHistory")}</p> : <ol className="mt-3 space-y-2">{assignmentHistory.map((entry) => <li key={`${entry.client_id}-${entry.valid_from}`} className="flex flex-col gap-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-xs font-semibold text-slate-800">{entry.client_name}</span><span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-600">{entry.relationship_type === "manager" ? t("managerRole") : t("owner")}</span>{!entry.valid_to && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">{t("currentAssignment")}</span>}</div></div><div className="shrink-0 text-[10px] text-slate-500">{formatWorkspaceDateTime(entry.valid_from, locale === "es" ? "es" : "en", timeZone)} — {entry.valid_to ? formatWorkspaceDateTime(entry.valid_to, locale === "es" ? "es" : "en", timeZone) : t("present")}</div></li>)}</ol>}</section>}
        {!previewOrders && <>
        {property ? <div className="field-group"><div className="field-label">{t("associatedClient")}</div><div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"><div className="text-sm font-medium text-slate-700">{property.client_name || "—"}<span className="ml-2 text-[11px] font-normal text-slate-400">{property.relationship_type === "manager" ? t("managerRole") : t("owner")}</span></div><button type="button" className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50" onClick={() => { setReassigning((value) => !value); setReassignmentClientId(""); setReassignmentConfirmed(false); }}>{reassigning ? t("cancelReassignment") : t("changePropertyAssignment")}</button></div>{reassigning && <div className="mt-3"><SearchablePicker label={`${t("newAssociatedClient")} *`} value={reassignmentClientId} options={clients.filter((client) => client.id !== clientId).map((client) => ({ value: client.id, label: client.name, detail: [client.company_name || (client.type === "direct" ? t("direct") : t("manager")), client.phone].join(" · ") }))} placeholder={t("searchClient")} noResults={t("noMatches")} onChange={(value) => { setReassignmentClientId(value); setReassignmentConfirmed(false); }} /><p className="mt-1.5 text-[10px] leading-relaxed text-amber-700">{t("propertyReassignmentHistoryHint")}</p><label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-slate-700"><input type="checkbox" className="mt-0.5" checked={reassignmentConfirmed} onChange={(event) => setReassignmentConfirmed(event.target.checked)} /><span>{t("confirmPropertyReassignment")}</span></label></div>}<p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">{t("propertyHistoryHint")}</p></div> : <SearchablePicker
          label={`${t("associatedClient")} *`}
          value={clientId}
          options={clients.map((client) => ({ value: client.id, label: client.name, detail: [client.company_name || (client.type === "direct" ? t("direct") : t("manager")), client.phone].join(" · ") }))}
          placeholder={t("searchClient")}
          noResults={t("noMatches")}
          onChange={setClientId}
        />}
        <div className="field-group"><label className="field-label" htmlFor="property-address">{t("address")} <Required /></label><input autoFocus id="property-address" className="form-input" value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} required /></div>
        <div className="field-group"><label className="field-label" htmlFor="property-address2">{t("addressLine2")}</label><input id="property-address2" className="form-input" value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field-group"><label className="field-label" htmlFor="property-city">{t("city")} <Required /></label><input id="property-city" className="form-input" value={city} onChange={(event) => setCity(event.target.value)} required /></div>
          <div className="field-group"><label className="field-label" htmlFor="property-subdivision">{t("subdivision")}</label><input id="property-subdivision" className="form-input" value={subdivision} onChange={(event) => setSubdivision(event.target.value)} /></div>
          <div className="field-group"><label className="field-label" htmlFor="property-postal">{t("postalCode")}</label><input id="property-postal" className="form-input" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} /></div>
          <div className="field-group"><label className="field-label" htmlFor="property-country">{t("countryCode")}</label><input id="property-country" className="form-input" maxLength={2} value={countryCode} onChange={(event) => setCountryCode(event.target.value)} /></div>
        </div>
        </>}
        {error && <FormError>{error}</FormError>}
        {previewOrders ? <CorrectionPreviewActions locale={locale} t={t} saving={saving} onBack={() => setPreviewOrders(null)} onCancel={onClose} /> : <FormActions locale={locale} t={t} saving={saving} onCancel={onClose} disabled={clients.length === 0 || (reassigning && !reassignmentConfirmed)} />}
      </form>
    </Modal>
  );
}

function PageHeading({ title, subtitle, button, onAdd }: { title: string; subtitle: string; button?: string; onAdd?: () => void }) {
  return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>{button && onAdd && <button onClick={onAdd} className="primary-button inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 active:bg-indigo-800"><Plus size={16} />{button}</button>}</div>;
}

function QuickAction({ icon: Icon, title, detail, onClick }: { icon: IconType; title: string; detail: string; onClick: () => void }) {
  return <button onClick={onClick} className="group flex w-full items-center gap-3 rounded-lg border border-slate-100 p-3 text-left transition hover:border-indigo-100 hover:bg-indigo-50/40"><div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 group-hover:bg-white group-hover:text-indigo-600"><Icon size={15} /></div><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-slate-700">{title}</div><div className="mt-0.5 truncate text-[10px] text-slate-400">{detail}</div></div><ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-500" /></button>;
}

function EmptyState({ icon: Icon, title, detail, action, onAction }: { icon: IconType; title: string; detail: string; action?: string; onAction: () => void }) {
  return <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center"><div className="flex size-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400"><Icon size={21} /></div><h3 className="mt-4 text-sm font-semibold text-slate-800">{title}</h3>{detail && <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400">{detail}</p>}{action && <button className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700" onClick={onAction}><Plus size={14} />{action}</button>}</div>;
}

function Badge({ tone, children }: { tone: "green" | "purple" | "blue" | "amber" | "rose"; children: ReactNode }) {
  const tones = { green: "bg-emerald-50 text-emerald-700 ring-emerald-600/10", purple: "bg-violet-50 text-violet-700 ring-violet-600/10", blue: "bg-blue-50 text-blue-700 ring-blue-600/10", amber: "bg-amber-50 text-amber-700 ring-amber-600/10", rose: "bg-rose-50 text-rose-700 ring-rose-600/10" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="modal-title" className={`modal-panel max-h-[94vh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl ${wide ? "max-w-[700px]" : "max-w-[540px]"}`}><header className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 id="modal-title" className="text-base font-semibold text-slate-900">{title}</h2><p className="mt-1 text-[9px] font-bold tracking-[0.12em] text-slate-400">{subtitle}</p></div><button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X size={17} /></button></header><div className="max-h-[calc(94vh-72px)] overflow-y-auto px-5 py-5 sm:max-h-[calc(90vh-72px)] sm:px-6">{children}</div></section></div>;
}

function ChoiceButton({ active, onClick, icon: Icon, children, disabled = false, large = false }: { active: boolean; onClick: () => void; icon: IconType; children: ReactNode; disabled?: boolean; large?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`flex ${large ? "min-h-12 px-3" : "min-h-10 px-2.5"} items-center justify-center gap-2 rounded-lg border text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100" : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"}`}><Icon size={14} />{children}</button>;
}

function FormActions({ locale, t, saving, onCancel, disabled = false }: { locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; saving: boolean; onCancel: () => void; disabled?: boolean }) {
  return <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} className="secondary-button h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50">{t("cancel")}</button><button type="submit" disabled={saving || disabled} className="primary-button inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <span className="loading-spinner" /> : <Check size={14} />}{saving ? (locale === "es" ? "Guardando..." : "Saving...") : t("save")}</button></div>;
}

function FormError({ children }: { children: ReactNode }) {
  return <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{children}</div>;
}

function Required() {
  return <span className="text-rose-500" aria-label="required">*</span>;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export default App;
