import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
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
} from "lucide-react";
import {
  createClient,
  createProperty,
  createEstimateFromOrder,
  changeEstimateStatus,
  createWorkOrder,
  getWorkspaceCurrency,
  getWorkspaceLanguage,
  getWorkspaceName,
  isDesktopRuntime,
  listClients,
  listEstimates,
  listEstimateVersions,
  listProperties,
  listWorkOrders,
  reviseEstimate,
  setWorkspaceCurrency,
  setWorkspaceLanguage,
  updateClient,
  updateProperty,
  updateWorkOrder,
} from "./lib/database";
import type {
  Client,
  ClientInput,
  ClientType,
  Estimate,
  EstimateDraftInput,
  EstimateVersion,
  CreateWorkOrderInput,
  Property,
  PropertyInput,
  View,
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderUpdateInput,
} from "./lib/types";
import { translate, type Locale } from "./i18n";
import { SearchablePicker } from "./components/SearchablePicker";
import { currencyFractionDigits, decimalToMinorUnits, formatMinorUnits, minorUnitsToDecimal, percentToBasisPoints, supportedCurrencyCodes } from "./lib/money";
import "./App.css";

type IconType = typeof Home;
type ModalKind = "client" | "property" | "estimate" | "estimate-history" | "work-order" | null;
const INLINE_NEW_CLIENT_ID = "__inline_new_client__";
const INLINE_NEW_PROPERTY_ID = "__inline_new_property__";

const navItems: { id: View; icon: IconType; label: "dashboard" | "clients" | "properties" | "estimates" | "work_orders" }[] = [
  { id: "dashboard", icon: Home, label: "dashboard" },
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
  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [workspaceCurrency, setWorkspaceCurrencyState] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("Mi negocio");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(isDesktopRuntime());
  const [dbError, setDbError] = useState("");
  const [toast, setToast] = useState("");

  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  async function refreshData() {
    const [nextClients, nextProperties, nextEstimates, nextWorkOrders, nextCurrency, nextWorkspaceName, nextLanguage] = await Promise.all([
      listClients(),
      listProperties(),
      listEstimates(),
      listWorkOrders(),
      getWorkspaceCurrency(),
      getWorkspaceName(),
      getWorkspaceLanguage(),
    ]);
    setClients(nextClients);
    setProperties(nextProperties);
    setEstimates(nextEstimates);
    setWorkOrders(nextWorkOrders);
    setWorkspaceCurrencyState(nextCurrency);
    setWorkspaceName(nextWorkspaceName);
    setLocale(nextLanguage);
  }

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    void refreshData()
      .catch((error: unknown) => {
        setDbError(error instanceof Error ? error.message : "No se pudo abrir la base de datos local.");
      })
      .finally(() => setLoading(false));
  }, []);

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
    return properties.filter((property) =>
      !normalized ||
      [property.address_line1, property.city, property.client_name]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(normalized)),
    );
  }, [properties, search]);

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

  function editWorkOrder(order: WorkOrder) {
    setOrderToEdit(order);
    setModal("work-order");
  }

  async function handleSaveClient(input: ClientInput, existingId?: string, relatedWorkOrderIds: string[] = []) {
    if (existingId) await updateClient(existingId, input, relatedWorkOrderIds);
    else await createClient(input);
    await refreshData();
    closeForm();
    setToast(t("created"));
  }

  async function handleSaveProperty(input: PropertyInput, existingId?: string, relatedWorkOrderIds: string[] = []) {
    if (existingId) {
      await updateProperty(existingId, input, relatedWorkOrderIds);
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

  async function handleSetWorkspaceLanguage(language: Locale) {
    await setWorkspaceLanguage(language);
    setLocale(language);
  }

  async function handleSaveEstimate(input: EstimateDraftInput) {
    if (estimateToRevise) {
      await reviseEstimate(estimateToRevise.id, input);
      setToast(t("estimateRevised"));
    } else if (estimateWorkOrder) {
      await createEstimateFromOrder(estimateWorkOrder.id, input);
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

  async function handleCreateWorkOrder(input: CreateWorkOrderInput) {
    await createWorkOrder(input);
    await refreshData();
    closeForm();
    setToast(t("orderCreated"));
  }

  async function handleUpdateWorkOrder(orderId: string, input: WorkOrderUpdateInput) {
    if (input.status === "cancelled" && !window.confirm(`${t("cancelWorkOrder")}?`)) return;
    await updateWorkOrder(orderId, input);
    await refreshData();
    closeForm();
    setToast(t("created"));
  }

  const titles: Record<View, string> = {
    dashboard: t("overview"),
    clients: t("clients"),
    properties: t("properties"),
    estimates: t("estimates"),
    work_orders: t("workOrders"),
  };

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
            {navItems.map(({ id, icon: Icon, label }) => {
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
            <button onClick={() => setSettingsOpen(true)} className="icon-button flex size-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label={t("settings")} title={t("settings")}><Settings2 size={16} /></button>
            <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 sm:flex">
              <div className="flex size-8 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">DM</div>
              <div className="hidden xl:block">
                <div className="text-xs font-semibold text-slate-700">Demo Manager</div>
                <div className="text-[10px] text-slate-400">Admin</div>
              </div>
              <ChevronDown size={13} className="text-slate-400" />
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
            <ClientsView clients={filteredClients} filter={clientFilter} search={search} locale={locale} t={t} onFilter={setClientFilter} onAdd={() => openForm("client")} onEdit={editClient} />
          )}
          {view === "properties" && (
            <PropertiesView properties={filteredProperties} clients={clients} search={search} locale={locale} t={t} onAdd={() => openForm("property")} onEdit={editProperty} />
          )}
          {view === "estimates" && (
            <EstimatesView estimates={estimates} locale={locale} t={t} onAdd={() => setView("work_orders")} onRevise={startRevision} onHistory={showEstimateHistory} onStatusChange={handleEstimateStatus} onPrint={setPrintEstimate} />
          )}
          {view === "work_orders" && (
            <WorkOrdersView workOrders={workOrders} estimates={estimates} locale={locale} t={t} onEdit={editWorkOrder} onAdd={() => { setOrderToEdit(null); setModal("work-order"); }} onCreateEstimate={startEstimateFromWorkOrder} onReviseEstimate={startRevision} />
          )}
        </main>
      </div>

      <div className="mobile-nav fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-slate-200 bg-white px-2 py-2 lg:hidden">
        {navItems.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setView(id)} className={`flex flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] font-medium ${view === id ? "text-indigo-700" : "text-slate-400"}`}>
            <Icon size={18} /><span>{t(label)}</span>
          </button>
        ))}
      </div>

      {modal === "client" && <ClientForm key={clientToEdit?.id ?? "new-client"} client={clientToEdit ?? undefined} relatedOrders={clientToEdit ? workOrders.filter((order) => order.client_id === clientToEdit.id) : []} locale={locale} t={t} onClose={closeForm} onSave={handleSaveClient} />}
      {modal === "property" && <PropertyForm key={propertyToEdit?.id ?? "new-property"} clients={clients} property={propertyToEdit ?? undefined} relatedOrders={propertyToEdit ? workOrders.filter((order) => order.property_id === propertyToEdit.id) : []} locale={locale} t={t} onClose={closeForm} onSave={handleSaveProperty} />}
      {modal === "estimate" && <EstimateForm key={estimateToRevise?.id ?? estimateWorkOrder?.id ?? "new-estimate"} workOrder={estimateWorkOrder ?? undefined} estimate={estimateToRevise ?? undefined} workspaceCurrency={workspaceCurrency} locale={locale} t={t} onClose={closeForm} onOpenSettings={() => setSettingsOpen(true)} onSave={handleSaveEstimate} />}
      {modal === "estimate-history" && estimateHistoryTarget && <EstimateHistoryModal estimate={estimateHistoryTarget} versions={estimateVersions} locale={locale} t={t} onClose={closeForm} onPrint={(version) => setPrintEstimate(estimateVersionForPrint(estimateHistoryTarget, version))} />}
      {modal === "work-order" && <WorkOrderForm key={orderToEdit?.id ?? "new-work-order"} clients={clients} properties={properties} workOrder={orderToEdit ?? undefined} workspaceCurrency={workspaceCurrency} locale={locale} t={t} onClose={closeForm} onCreate={handleCreateWorkOrder} onUpdate={handleUpdateWorkOrder} onOpenSettings={() => setSettingsOpen(true)} />}
      {settingsOpen && <SettingsModal locale={locale} t={t} currencyCode={workspaceCurrency} onCurrencyChange={handleSetWorkspaceCurrency} onLocaleChange={handleSetWorkspaceLanguage} onClose={() => setSettingsOpen(false)} />}
      {printEstimate && <EstimatePrintView estimate={printEstimate} workspaceName={workspaceName} locale={locale} t={t} />}
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
  locale,
  t,
  onFilter,
  onAdd,
  onEdit,
}: {
  clients: Client[];
  filter: "all" | ClientType;
  search: string;
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  onFilter: (filter: "all" | ClientType) => void;
  onAdd: () => void;
  onEdit: (client: Client) => void;
}) {
  const filters = [
    { id: "all" as const, label: t("allClients") },
    { id: "direct" as const, label: t("directClient") },
    { id: "property_manager" as const, label: t("propertyManager") },
  ];
  return (
    <div className="space-y-6">
      <PageHeading title={t("clients")} subtitle={t("clientsSubtitle")} button={t("newClient")} onAdd={onAdd} />
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {filters.map((item) => <button key={item.id} onClick={() => onFilter(item.id)} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${filter === item.id ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>{item.label}</button>)}
        </div>
        <div className="text-xs text-slate-400">{clients.length} {locale === "es" ? "contactos" : "contacts"}</div>
      </div>
      {clients.length === 0 ? (
        <EmptyState icon={Users} title={search ? t("noMatches") : t("noClients")} detail={search ? "" : t("clientHint")} action={search ? undefined : t("newClient")} onAction={onAdd} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02]">
          <div className="hidden grid-cols-[minmax(200px,1.4fr)_minmax(120px,0.7fr)_minmax(150px,0.9fr)_minmax(180px,1fr)_40px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400 md:grid">
            <span>{t("contact")}</span><span>{t("type")}</span><span>{t("phone")}</span><span>{t("email")}</span><span aria-hidden="true" />
          </div>
          {clients.map((client) => <ClientRow key={client.id} client={client} locale={locale} t={t} onEdit={() => onEdit(client)} />)}
        </div>
      )}
    </div>
  );
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

function PropertiesView({ properties, clients, search, locale, t, onAdd, onEdit }: { properties: Property[]; clients: Client[]; search: string; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; onAdd: () => void; onEdit: (property: Property) => void }) {
  return (
    <div className="space-y-6">
      <PageHeading title={t("properties")} subtitle={t("propertiesSubtitle")} button={t("newProperty")} onAdd={onAdd} />
      {clients.length === 0 && <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs text-indigo-800">{t("emptyClientsHint")}</div>}
      {properties.length === 0 ? (
        <EmptyState icon={Building2} title={search ? t("noMatches") : t("noProperties")} detail={search ? "" : t("propertyHint")} action={clients.length ? t("newProperty") : undefined} onAction={onAdd} />
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

function EstimatesView({ estimates, locale, t, onAdd, onRevise, onHistory, onStatusChange, onPrint }: {
  estimates: Estimate[];
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
    {estimates.length === 0 ? <EmptyState icon={FileText} title={t("noEstimates")} detail={t("createQuoteFirst")} action={t("createEstimate")} onAction={onAdd} /> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02]">
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

function EstimateForm({ workOrder, estimate, workspaceCurrency, locale, t, onClose, onOpenSettings, onSave }: {
  workOrder?: WorkOrder;
  estimate?: Estimate;
  workspaceCurrency: string | null;
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  onClose: () => void;
  onOpenSettings: () => void;
  onSave: (input: EstimateDraftInput) => Promise<void>;
}) {
  const [currencyCode, setCurrencyCode] = useState(estimate?.currency_code ?? workspaceCurrency ?? "");
  const [description, setDescription] = useState(estimate?.description ?? workOrder?.description ?? "");
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
  const fractionDigits = currencyCode ? currencyFractionDigits(currencyCode) : 2;

  useEffect(() => {
    if (!estimate && workspaceCurrency) setCurrencyCode(workspaceCurrency);
  }, [estimate, workspaceCurrency]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!currencyCode) return setError(t("currencyRequired"));
    if (!description.trim() || !amount.trim()) return setError(t("required"));
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
      await onSave({
        description: description.trim(),
        billingMode,
        amountMinor,
        discountKind,
        discountValue: discount,
        currencyCode,
      });
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

  return <Modal title={estimate ? t("editEstimate") : t("newEstimate")} subtitle={workOrder ? `${t("workOrders")} · ${workOrder.contact_name}` : t("versionHistory")} onClose={onClose} wide>
    <form onSubmit={submit} className="space-y-5">
      {estimate && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{locale === "es" ? `Se guardará como versión ${estimate.current_version + 1}; la versión anterior se conservará.` : `This will be saved as version ${estimate.current_version + 1}; the previous version will be preserved.`}</div>}
      <div className="field-group"><div className="field-label">{t("currency")}</div><div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">{currencyCode || workspaceCurrency || "—"}</div>{!workspaceCurrency && !estimate && <div className="mt-2 flex items-center justify-between gap-3 text-xs text-amber-800"><span>{t("currencyRequired")}</span><button type="button" className="shrink-0 font-semibold text-indigo-700 hover:text-indigo-900" onClick={onOpenSettings}>{t("openSettings")}</button></div>}</div>
      {workOrder && <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600"><strong>{workOrder.recipient_name}</strong> · {workOrder.address_line1}, {workOrder.city}</div>}
      {workOrder && (workOrder.lockbox_code || workOrder.gate_code) && <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3"><div className="grid gap-3 sm:grid-cols-2">{workOrder.lockbox_code && <div className="field-group"><label className="field-label">Lockbox</label><input className="form-input" type="password" value={workOrder.lockbox_code} readOnly /></div>}{workOrder.gate_code && <div className="field-group"><label className="field-label">Gate code</label><input className="form-input" type="password" value={workOrder.gate_code} readOnly /></div>}</div><p className="mt-2 text-[11px] text-amber-900">{t("accessCodesOnOrder")}</p></div>}
      <div className="field-group"><label className="field-label">{t("billingMode")}</label><div className="grid grid-cols-2 gap-2">
        <ChoiceButton active={billingMode === "fixed"} onClick={() => setBillingMode("fixed")} icon={FileText}>{t("fixedPrice")}</ChoiceButton>
        <ChoiceButton active={billingMode === "time_materials"} onClick={() => setBillingMode("time_materials")} icon={Clock3}>{t("timeMaterials")}</ChoiceButton>
      </div></div>
      <div className="field-group"><label className="field-label" htmlFor="estimate-description">{t("description")} <Required /></label><textarea id="estimate-description" className="form-input min-h-[90px] resize-y" value={description} onChange={(event) => setDescription(event.target.value)} required /></div>
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

function SettingsModal({ locale, t, currencyCode, onCurrencyChange, onLocaleChange, onClose }: {
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  currencyCode: string | null;
  onCurrencyChange: (currency: string) => Promise<void>;
  onLocaleChange: (locale: Locale) => Promise<void>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const currencies = supportedCurrencyCodes().map((code) => ({
    value: code,
    label: `${code} · ${new Intl.NumberFormat(locale === "es" ? "es" : "en", { style: "currency", currency: code }).format(1)}`,
  }));

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

  return <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="modal-panel max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4"><div><h2 id="settings-title" className="text-base font-semibold text-slate-900">{t("settings")}</h2><p className="mt-1 text-xs text-slate-500">{locale === "es" ? "Preferencias de este negocio" : "Business preferences"}</p></div><button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={t("close")}><X size={17} /></button></header>
      <div className="space-y-5 px-5 py-5">
        <div className="field-group"><label className="field-label" htmlFor="settings-language"><span className="inline-flex items-center gap-1.5"><Languages size={13} />{t("language")}</span></label><select id="settings-language" className="form-input h-12 text-sm" value={locale} onChange={(event) => void changeLanguage(event.target.value as Locale)} disabled={saving}><option value="es">Español</option><option value="en">English</option></select></div>
        <SearchablePicker label={t("currency")} value={currencyCode ?? ""} options={currencies} placeholder={t("searchCurrency")} noResults={t("noMatches")} onChange={(code) => void changeCurrency(code)} />
        <div className="rounded-lg bg-indigo-50/70 px-3.5 py-3 text-[11px] leading-relaxed text-indigo-900/80">{t("currencyChangeNote")}</div>
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

function EstimateHistoryModal({ estimate, versions, locale, t, onClose, onPrint }: { estimate: Estimate; versions: EstimateVersion[]; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; onClose: () => void; onPrint: (version: EstimateVersion) => void }) {
  return <Modal title={t("versionHistory")} subtitle={`${estimate.recipient_name} · ${estimate.address_line1}`} onClose={onClose} wide>
    <div className="space-y-3">
      {versions.map((version) => <article key={version.id} className="rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="text-sm font-semibold text-slate-800">{t("quoteVersion")} {version.version_number}</span><Badge tone={version.status === "accepted" ? "green" : version.status === "cancelled" ? "rose" : "amber"}>{version.status === "accepted" ? t("approved") : version.status === "cancelled" ? t("estimateCancelled") : t(version.status)}</Badge></div><span className="text-sm font-bold text-slate-900">{formatMinorUnits(version.total_minor, version.currency_code, locale === "es" ? "es" : "en")}</span></div>
        <p className="mt-2 text-xs text-slate-600">{version.description}</p>
        <div className="mt-2 flex items-center justify-between"><div className="text-[10px] text-slate-400">{new Date(version.created_at).toLocaleString(locale === "es" ? "es" : "en")}</div><button type="button" className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100" onClick={() => onPrint(version)}><Printer size={12} />{t("printEstimate")}</button></div>
      </article>)}
    </div>
  </Modal>;
}

function EstimatePrintView({ estimate, workspaceName, locale, t }: { estimate: Estimate; workspaceName: string; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string }) {
  return <article className="print-document">
    <header className="flex items-start justify-between border-b border-slate-300 pb-5"><div><h1 className="text-2xl font-bold">{workspaceName}</h1><p className="mt-1 text-sm">{t("estimates")}</p></div><div className="text-right"><div className="text-lg font-semibold">{t("quoteVersion")} {estimate.version_number}</div><div className="text-sm">{estimate.status === "accepted" ? t("approved") : estimate.status === "cancelled" ? t("estimateCancelled") : t(estimate.status)}</div><div className="text-xs text-slate-500">{new Date(estimate.created_at).toLocaleDateString(locale === "es" ? "es" : "en")}</div></div></header>
    <section className="grid grid-cols-2 gap-8 py-6"><div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("contact")}</div><div className="mt-1 font-semibold">{estimate.recipient_name}</div><div className="text-sm">{estimate.contact_name}</div><div className="text-sm">{estimate.contact_phone}</div></div><div><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("property")}</div><div className="mt-1 font-semibold">{estimate.address_line1}</div><div className="text-sm">{[estimate.address_line2, estimate.city, estimate.subdivision, estimate.postal_code].filter(Boolean).join(", ")}</div></div></section>
    <section className="border-y border-slate-200 py-5"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t("description")}</div><p className="mt-2 whitespace-pre-wrap text-sm">{estimate.description}</p><p className="mt-3 text-xs text-slate-500">{t("billingMode")}: {t(estimate.billing_mode === "fixed" ? "fixedPrice" : "timeMaterials")}</p></section>
    <section className="ml-auto mt-6 max-w-xs space-y-2 text-sm"><div className="flex justify-between"><span>{t("baseAmount")}</span><span>{formatMinorUnits(estimate.amount_minor, estimate.currency_code, locale === "es" ? "es" : "en")}</span></div><div className="flex justify-between"><span>{t("discount")}{estimate.discount_kind === "percent" ? ` (${(estimate.discount_value / 100).toFixed(2)}%)` : ""}</span><span>−{formatMinorUnits(estimate.discount_minor, estimate.currency_code, locale === "es" ? "es" : "en")}</span></div><div className="flex justify-between border-t border-slate-300 pt-2 text-base font-bold"><span>{t("total")}</span><span>{formatMinorUnits(estimate.total_minor, estimate.currency_code, locale === "es" ? "es" : "en")}</span></div></section>
  </article>;
}

function WorkOrdersView({ workOrders, estimates, locale, t, onEdit, onAdd, onCreateEstimate, onReviseEstimate }: { workOrders: WorkOrder[]; estimates: Estimate[]; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; onEdit: (order: WorkOrder) => void; onAdd: () => void; onCreateEstimate: (order: WorkOrder) => void; onReviseEstimate: (estimate: Estimate) => void }) {
  return <div className="space-y-6">
    <PageHeading title={t("workOrders")} subtitle={t("workOrdersSubtitle")} button={t("createWorkOrder")} onAdd={onAdd} />
    {workOrders.length === 0 ? <EmptyState icon={Wrench} title={t("noWorkOrders")} detail={t("workOrdersSubtitle")} action={t("createWorkOrder")} onAction={onAdd} /> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {workOrders.map((order) => <article key={order.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.02]">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-900">{order.recipient_name}</div><div className="mt-0.5 truncate text-[11px] text-slate-400">{order.address_line1} · {order.city}</div></div><Badge tone={order.status === "completed" ? "green" : order.status === "cancelled" ? "rose" : order.status === "in_progress" ? "blue" : "amber"}>{t(order.status)}</Badge></div>
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-600">{order.description}</p>
        {(() => { const quote = estimates.find((item) => item.id === order.estimate_id); return quote?.status === "expired" ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><div className="font-semibold">{t("quoteExpiredDecision")}</div><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => onReviseEstimate(quote)} className="rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-amber-100">{t("editEstimate")}</button><button type="button" onClick={() => onEdit(order)} className="rounded-md border border-rose-200 bg-white px-2.5 py-1.5 font-semibold text-rose-700 hover:bg-rose-50">{t("cancelWorkOrder")}</button></div></div> : null; })()}
        <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
          <div className="flex justify-between"><span>{t("priority")}</span><span className="font-medium text-slate-700">{t(order.priority)}</span></div>
          <div className="flex justify-between"><span>{t("billingMode")}</span><span className="font-medium text-slate-700">{t(order.billing_mode === "fixed" ? "fixedPrice" : "timeMaterials")}</span></div>
          <div className="flex justify-between"><span>{t("agreedAmount")}</span><span className="font-semibold text-slate-800">{formatMinorUnits(order.agreed_amount_minor, order.currency_code, locale === "es" ? "es" : "en")}</span></div>
          {order.scheduled_at && <div className="flex justify-between"><span>{t("scheduledAt")}</span><span className="font-medium text-slate-700">{new Date(order.scheduled_at).toLocaleString(locale === "es" ? "es" : "en")}{order.scheduled_end_at ? ` – ${new Date(order.scheduled_end_at).toLocaleTimeString(locale === "es" ? "es" : "en", { hour: "numeric", minute: "2-digit" })}` : ""}</span></div>}
        </div>
        {(order.status === "pending" || order.status === "pending_approval") && !order.estimate_id && <button type="button" onClick={() => onCreateEstimate(order)} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"><FilePlus size={13} />{t("createEstimate")}</button>}
        <button type="button" onClick={() => onEdit(order)} className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Pencil size={13} />{t("editWorkOrder")}</button>
      </article>)}
    </div>}
  </div>;
}

function WorkOrderForm({ clients, properties, workOrder, workspaceCurrency, locale, t, onClose, onCreate, onUpdate, onOpenSettings }: {
  clients: Client[];
  properties: Property[];
  workOrder?: WorkOrder;
  workspaceCurrency: string | null;
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  onClose: () => void;
  onCreate: (input: CreateWorkOrderInput) => Promise<void>;
  onUpdate: (id: string, input: WorkOrderUpdateInput) => Promise<void>;
  onOpenSettings: () => void;
}) {
  const [billingMode, setBillingMode] = useState<"fixed" | "time_materials">(workOrder?.billing_mode ?? "fixed");
  const [amount, setAmount] = useState(workOrder ? minorUnitsToDecimal(workOrder.agreed_amount_minor, workOrder.currency_code) : "");
  const [currencyCode, setCurrencyCode] = useState(workOrder?.currency_code ?? workspaceCurrency ?? "");
  const [scheduledAt, setScheduledAt] = useState(toDateTimeLocal(workOrder?.scheduled_at));
  const [scheduledEndAt, setScheduledEndAt] = useState(toDateTimeLocal(workOrder?.scheduled_end_at));
  const [status, setStatus] = useState<WorkOrderStatus>(workOrder?.status ?? "pending");
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
  const [description, setDescription] = useState(workOrder?.description ?? "");
  const [lockboxCode, setLockboxCode] = useState(workOrder?.lockbox_code ?? "");
  const [gateCode, setGateCode] = useState(workOrder?.gate_code ?? "");
  const [clientId, setClientId] = useState(workOrder?.client_id ?? "");
  const [propertyId, setPropertyId] = useState(workOrder?.property_id ?? "");
  const [newClientMode, setNewClientMode] = useState(false);
  const [newPropertyMode, setNewPropertyMode] = useState(false);
  const [newClientCompany, setNewClientCompany] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fractionDigits = currencyCode ? currencyFractionDigits(currencyCode) : 2;
  const source = workOrder;

  useEffect(() => {
    if (!workOrder && workspaceCurrency) setCurrencyCode(workspaceCurrency);
  }, [workOrder, workspaceCurrency]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (workOrder) {
        const nextStatus = status === "accepted" && scheduledAt && scheduledEndAt ? "scheduled" : status;
        await onUpdate(workOrder.id, {
          status: nextStatus,
          priority,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : "",
          scheduledEndAt: scheduledEndAt ? new Date(scheduledEndAt).toISOString() : "",
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
          description,
        });
      } else {
        const amountMinor = decimalToMinorUnits(amount || "0", currencyCode) ?? 0;
        const currency = currencyCode;
        if (!currency) throw new Error(t("currencyRequired"));
        if (!contactName.trim() || !contactPhone.trim() || !addressLine1.trim() || !description.trim()) throw new Error(t("required"));
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
          description,
          billingMode,
          amountMinor,
          currencyCode: currency,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : "",
          scheduledEndAt: scheduledEndAt ? new Date(scheduledEndAt).toISOString() : "",
          priority,
          accessInstructions,
          lockboxCode,
          gateCode,
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  const statuses: WorkOrderStatus[] = workOrder?.status === "pending_approval"
    ? ["pending_approval", "cancelled"]
    : workOrder?.status === "accepted"
      ? ["accepted", "scheduled", "cancelled"]
      : workOrder?.status === "scheduled"
        ? ["scheduled", "in_progress", "cancelled"]
        : workOrder?.status === "in_progress"
          ? ["in_progress", "completed", "cancelled"]
          : workOrder?.status === "completed" || workOrder?.status === "cancelled"
            ? [workOrder.status]
            : ["pending", "scheduled", "cancelled"];
  const priorities: WorkOrderPriority[] = ["low", "normal", "high", "urgent"];
  const clientOptions = [
    ...(newClientMode ? [{ value: INLINE_NEW_CLIENT_ID, label: recipientName || contactName || t("newClient"), detail: t("inlineWillSaveWithOrder") }] : []),
    ...clients
      .filter((client) => client.type === clientType)
      .map((client) => ({ value: client.id, label: client.name, detail: [client.company_name, client.phone].filter(Boolean).join(" · ") })),
  ];
  const propertyOptions = [
    ...(newPropertyMode ? [{ value: INLINE_NEW_PROPERTY_ID, label: addressLine1 || t("newProperty"), detail: t("inlineWillSaveWithOrder") }] : []),
    ...properties.map((property) => ({ value: property.id, label: property.address_line1, detail: [property.city, property.subdivision, property.client_name].filter(Boolean).join(" · ") })),
  ];

  return <Modal title={workOrder ? t("editWorkOrder") : t("newWorkOrder")} subtitle={t("orderDetails")} onClose={onClose} wide>
    <form onSubmit={submit} className="space-y-5">
      {source && <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-600"><div className="font-semibold text-slate-800">{source.recipient_name}</div><div className="mt-1">{source.address_line1}{source.city ? ` · ${source.city}` : ""}</div><div className="mt-1">{source.description}</div></div>}
      {!workOrder && <div className="grid gap-4 sm:grid-cols-2">
        <div className="field-group"><label className="field-label" htmlFor="order-client-type">{t("type")}</label><select id="order-client-type" className="form-input h-12 text-sm" value={clientType} onChange={(event) => { const nextType = event.target.value as ClientType; setClientType(nextType); if (clientId && clientId !== INLINE_NEW_CLIENT_ID && clients.find((client) => client.id === clientId)?.type !== nextType) { setClientId(""); setRecipientName(""); } }}><option value="direct">{t("directClient")}</option><option value="property_manager">{t("propertyManager")}</option></select></div>
        <SearchablePicker
          label={t("billTo")}
          value={clientId}
          options={clientOptions}
          placeholder={t("searchClient")}
          noResults={t("noMatches")}
          createAction={t("createClientAction")}
          onCreate={(query) => { setClientId(INLINE_NEW_CLIENT_ID); setNewClientMode(true); setRecipientName(query); if (!contactName.trim()) setContactName(query); }}
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
        <div className="field-group sm:col-span-2"><label className="field-label" htmlFor="order-description">{t("description")} <Required /></label><textarea id="order-description" className="form-input min-h-[80px]" value={description} onChange={(event) => setDescription(event.target.value)} required /></div>
      </div>}
      {!workOrder && <div className="field-group"><div className="field-label">{t("currency")}</div><div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">{currencyCode || workspaceCurrency || "—"}</div>{!workspaceCurrency && <div className="mt-2 flex items-center justify-between gap-3 text-xs text-amber-800"><span>{t("currencyRequired")}</span><button type="button" className="shrink-0 font-semibold text-indigo-700 hover:text-indigo-900" onClick={onOpenSettings}>{t("openSettings")}</button></div>}</div>}
      {workOrder ? <div className="grid gap-4 sm:grid-cols-2">
        <div className="field-group"><label className="field-label" htmlFor="work-order-status">{t("workOrderStatus")}</label><select id="work-order-status" className="form-input h-12 text-sm" value={status} onChange={(event) => setStatus(event.target.value as WorkOrderStatus)}>{statuses.map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></div>
        <div className="field-group"><label className="field-label" htmlFor="work-order-priority">{t("priority")}</label><select id="work-order-priority" className="form-input h-12 text-sm" value={priority} onChange={(event) => setPriority(event.target.value as WorkOrderPriority)}>{priorities.map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></div>
      </div> : <div className="grid gap-4 sm:grid-cols-2">
        <div className="field-group"><label className="field-label" htmlFor="work-order-priority">{t("priority")}</label><select id="work-order-priority" className="form-input h-12 text-sm" value={priority} onChange={(event) => setPriority(event.target.value as WorkOrderPriority)}>{priorities.map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></div>
         <div className="field-group"><label className="field-label">{t("billingMode")}</label><div className="grid grid-cols-2 gap-2"><ChoiceButton active={billingMode === "fixed"} onClick={() => setBillingMode("fixed")} icon={FileText}>{t("fixedPrice")}</ChoiceButton><ChoiceButton active={billingMode === "time_materials"} onClick={() => setBillingMode("time_materials")} icon={Clock3}>{t("timeMaterials")}</ChoiceButton></div></div>
        </div>}
      {!workOrder && <div className="field-group"><label className="field-label" htmlFor="work-order-amount">{t("agreedAmount")}</label><input id="work-order-amount" className="form-input" type="number" min="0" step={1 / 10 ** fractionDigits} value={amount} onChange={(event) => setAmount(event.target.value)} /></div>}
      {workOrder?.status === "accepted" && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs leading-relaxed text-emerald-900">{t("acceptedScheduleHint")}</div>}
      <div className="grid gap-4 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="work-order-date">{t("scheduledStart")}</label><div className="relative"><CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="work-order-date" className="form-input pl-9" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></div></div><div className="field-group"><label className="field-label" htmlFor="work-order-end">{t("scheduledEnd")}</label><div className="relative"><CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="work-order-end" className="form-input pl-9" type="datetime-local" value={scheduledEndAt} onChange={(event) => setScheduledEndAt(event.target.value)} /></div></div></div>
      <div className="field-group"><label className="field-label" htmlFor="work-order-access">{t("accessInstructions")}</label><textarea id="work-order-access" className="form-input min-h-[72px] resize-y" value={accessInstructions} onChange={(event) => setAccessInstructions(event.target.value)} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="field-group"><label className="field-label" htmlFor="work-order-lockbox">Lockbox</label><input id="work-order-lockbox" type="password" autoComplete="off" className="form-input" value={lockboxCode} onChange={(event) => setLockboxCode(event.target.value)} /></div><div className="field-group"><label className="field-label" htmlFor="work-order-gate">Gate code</label><input id="work-order-gate" type="password" autoComplete="off" className="form-input" value={gateCode} onChange={(event) => setGateCode(event.target.value)} /></div></div>
      {error && <FormError>{error}</FormError>}
      <FormActions locale={locale} t={t} saving={saving} onCancel={onClose} disabled={!workOrder && !currencyCode} />
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

function PropertyForm({ clients, property, relatedOrders, locale, t, onClose, onSave }: { clients: Client[]; property?: Property; relatedOrders: WorkOrder[]; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; onClose: () => void; onSave: (input: PropertyInput, existingId?: string, relatedWorkOrderIds?: string[]) => Promise<void> }) {
  const [clientId, setClientId] = useState(property?.client_id ?? "");
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!clientId || !addressLine1.trim() || !city.trim()) return setError(t("required"));
    const updatedAddress = addressLine1.trim();
    const updatedAddressLine2 = addressLine2.trim() || null;
    const updatedCity = city.trim();
    const updatedSubdivision = subdivision.trim() || null;
    const updatedPostalCode = postalCode.trim() || null;
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
      await onSave({ clientId, addressLine1, addressLine2, city, subdivision, postalCode, countryCode }, property?.id, previewOrders ? selectedOrderIds : []);
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
        {!previewOrders && <>
        {property ? <div className="field-group"><div className="field-label">{t("associatedClient")}</div><div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700">{property.client_name || "—"}<span className="ml-2 text-[11px] font-normal text-slate-400">{property.relationship_type === "manager" ? t("managerRole") : t("owner")}</span></div><p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">{t("propertyHistoryHint")}</p></div> : <SearchablePicker
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
        {previewOrders ? <CorrectionPreviewActions locale={locale} t={t} saving={saving} onBack={() => setPreviewOrders(null)} onCancel={onClose} /> : <FormActions locale={locale} t={t} saving={saving} onCancel={onClose} disabled={clients.length === 0} />}
      </form>
    </Modal>
  );
}

function PageHeading({ title, subtitle, button, onAdd }: { title: string; subtitle: string; button: string; onAdd: () => void }) {
  return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div><button onClick={onAdd} className="primary-button inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 active:bg-indigo-800"><Plus size={16} />{button}</button></div>;
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

function toDateTimeLocal(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export default App;
