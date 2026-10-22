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
  ClipboardList,
  Clock3,
  Home,
  Languages,
  MapPin,
  Plus,
  Search,
  Users,
  Wrench,
  X,
} from "lucide-react";
import {
  createClient,
  createProperty,
  createRequest,
  isDesktopRuntime,
  listClients,
  listProperties,
  listRequests,
} from "./lib/database";
import type {
  Client,
  ClientInput,
  ClientType,
  Property,
  PropertyInput,
  RequestInput,
  View,
  WorkRequest,
} from "./lib/types";
import { translate, type Locale } from "./i18n";
import { missingQuickRequestFields } from "./lib/validation";
import "./App.css";

type IconType = typeof Home;
type ModalKind = "request" | "client" | "property" | null;

const navItems: { id: View; icon: IconType; label: "dashboard" | "requests" | "clients" | "properties" }[] = [
  { id: "dashboard", icon: Home, label: "dashboard" },
  { id: "requests", icon: ClipboardList, label: "requests" },
  { id: "clients", icon: Users, label: "clients" },
  { id: "properties", icon: Building2, label: "properties" },
];

function App() {
  const [locale, setLocale] = useState<Locale>("es");
  const [view, setView] = useState<View>("dashboard");
  const [modal, setModal] = useState<ModalKind>(null);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<"all" | ClientType>("all");
  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [requests, setRequests] = useState<WorkRequest[]>([]);
  const [loading, setLoading] = useState(isDesktopRuntime());
  const [dbError, setDbError] = useState("");
  const [toast, setToast] = useState("");

  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  async function refreshData() {
    const [nextClients, nextProperties, nextRequests] = await Promise.all([
      listClients(),
      listProperties(),
      listRequests(),
    ]);
    setClients(nextClients);
    setProperties(nextProperties);
    setRequests(nextRequests);
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

  const filteredRequests = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return requests.filter((request) =>
      !normalized ||
      [request.contact_name, request.contact_phone, request.address_line1, request.description]
        .some((value) => value.toLocaleLowerCase().includes(normalized)),
    );
  }, [requests, search]);

  async function handleCreateClient(input: ClientInput) {
    await createClient(input);
    await refreshData();
    setModal(null);
    setToast(t("created"));
  }

  async function handleCreateProperty(input: PropertyInput) {
    const linkedClient = clients.find((client) => client.id === input.clientId);
    if (!linkedClient) throw new Error(t("selectClient"));
    await createProperty(input, linkedClient.type);
    await refreshData();
    setModal(null);
    setToast(t("created"));
  }

  async function handleCreateRequest(input: RequestInput) {
    await createRequest(input);
    await refreshData();
    setModal(null);
    setToast(t("requestCreated"));
  }

  const titles: Record<View, string> = {
    dashboard: t("overview"),
    requests: t("requests"),
    clients: t("clients"),
    properties: t("properties"),
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
                  {id === "requests" && requests.length > 0 && (
                    <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{requests.length}</span>
                  )}
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
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800" onClick={() => setLocale(locale === "es" ? "en" : "es")}>
            <Languages size={15} />
            <span>{t("language")}</span>
            <span className="ml-auto text-[11px] font-semibold text-slate-400">{locale === "es" ? t("spanish") : t("english")}</span>
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
              requests={requests}
              loading={loading}
              onNavigate={setView}
              onCreate={setModal}
            />
          )}
          {view === "clients" && (
            <ClientsView clients={filteredClients} filter={clientFilter} search={search} locale={locale} t={t} onFilter={setClientFilter} onAdd={() => setModal("client")} />
          )}
          {view === "properties" && (
            <PropertiesView properties={filteredProperties} clients={clients} search={search} locale={locale} t={t} onAdd={() => setModal("property")} />
          )}
          {view === "requests" && (
            <RequestsView requests={filteredRequests} search={search} locale={locale} t={t} onAdd={() => setModal("request")} />
          )}
        </main>
      </div>

      <div className="mobile-nav fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-200 bg-white px-2 py-2 lg:hidden">
        {navItems.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setView(id)} className={`flex flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] font-medium ${view === id ? "text-indigo-700" : "text-slate-400"}`}>
            <Icon size={18} /><span>{t(label)}</span>
          </button>
        ))}
      </div>

      {modal === "client" && <ClientForm locale={locale} t={t} onClose={() => setModal(null)} onSave={handleCreateClient} />}
      {modal === "property" && <PropertyForm clients={clients} locale={locale} t={t} onClose={() => setModal(null)} onSave={handleCreateProperty} />}
      {modal === "request" && <RequestForm clients={clients} properties={properties} locale={locale} t={t} onClose={() => setModal(null)} onSave={handleCreateRequest} />}
      {toast && <div role="status" className="toast fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-xl"><Check size={16} className="text-emerald-300" />{toast}</div>}
    </div>
  );
}

function Dashboard({
  locale,
  t,
  clients,
  properties,
  requests,
  loading,
  onNavigate,
  onCreate,
}: {
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  clients: Client[];
  properties: Property[];
  requests: WorkRequest[];
  loading: boolean;
  onNavigate: (view: View) => void;
  onCreate: (kind: ModalKind) => void;
}) {
  const pending = requests.filter((request) => request.status === "received" || request.status === "reviewing").length;
  const cards = [
    { label: t("totalRequests"), value: requests.length, change: `${pending} ${t("open").toLocaleLowerCase()}`, icon: ClipboardList, iconClass: "bg-indigo-50 text-indigo-600", trend: "up" },
    { label: t("totalClients"), value: clients.length, change: `${clients.filter((client) => client.type === "direct").length} ${t("direct").toLocaleLowerCase()}`, icon: Users, iconClass: "bg-emerald-50 text-emerald-600", trend: "up" },
    { label: t("totalProperties"), value: properties.length, change: locale === "es" ? "Registradas" : "On file", icon: Building2, iconClass: "bg-violet-50 text-violet-600", trend: "up" },
    { label: t("needsAttention"), value: pending, change: locale === "es" ? "Solicitudes por revisar" : "Requests to review", icon: Clock3, iconClass: "bg-amber-50 text-amber-600", trend: "down" },
  ];

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400"><span className="size-1.5 rounded-full bg-emerald-500" />{t("today")}</div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{t("overview")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("overviewSubtitle")}</p>
        </div>
        <button onClick={() => onCreate("request")} className="primary-button inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 active:bg-indigo-800"><Plus size={16} />{t("newRequest")}</button>
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
              <h3 className="text-sm font-semibold text-slate-900">{t("recentRequests")}</h3>
              <p className="mt-0.5 text-[11px] text-slate-400">{locale === "es" ? "Últimos trabajos registrados" : "Latest jobs logged"}</p>
            </div>
            <button onClick={() => onNavigate("requests")} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">{t("seeAll")}<ChevronRight size={14} /></button>
          </div>
          {requests.length === 0 ? (
            <EmptyState icon={ClipboardList} title={t("noRequests")} detail={locale === "es" ? "Las solicitudes nuevas aparecerán aquí." : "New requests will show up here."} action={t("newRequest")} onAction={() => onCreate("request")} />
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.slice(0, 5).map((request) => <RequestRow key={request.id} request={request} locale={locale} t={t} />)}
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
            <QuickAction icon={ClipboardList} title={t("newRequest")} detail={t("requestHint")} onClick={() => onCreate("request")} />
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
}: {
  clients: Client[];
  filter: "all" | ClientType;
  search: string;
  locale: Locale;
  t: (key: Parameters<typeof translate>[1]) => string;
  onFilter: (filter: "all" | ClientType) => void;
  onAdd: () => void;
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
          <div className="hidden grid-cols-[minmax(200px,1.4fr)_minmax(120px,0.7fr)_minmax(150px,0.9fr)_minmax(180px,1fr)] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400 md:grid">
            <span>{t("contact")}</span><span>{t("type")}</span><span>{t("phone")}</span><span>{t("email")}</span>
          </div>
          {clients.map((client) => <ClientRow key={client.id} client={client} locale={locale} t={t} />)}
        </div>
      )}
    </div>
  );
}

function ClientRow({ client, locale, t }: { client: Client; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string }) {
  const direct = client.type === "direct";
  return (
    <article className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-0 hover:bg-slate-50/50 sm:px-5 md:grid-cols-[minmax(200px,1.4fr)_minmax(120px,0.7fr)_minmax(150px,0.9fr)_minmax(180px,1fr)] md:items-center md:gap-4 md:py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${direct ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700"}`}>{initials(client.name)}</div>
        <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{client.name}</div><div className="truncate text-[11px] text-slate-400">{client.company_name || (direct ? t("directClient") : t("propertyManager"))}</div></div>
      </div>
      <div><Badge tone={direct ? "green" : "purple"}>{direct ? t("directClient") : t("propertyManager")}</Badge></div>
      <div className="text-xs text-slate-600"><span className="mr-2 text-[10px] text-slate-400 md:hidden">{t("phone")}</span>{client.phone}</div>
      <div className="truncate text-xs text-slate-500"><span className="mr-2 text-[10px] text-slate-400 md:hidden">{t("email")}</span>{client.email || <span className="text-slate-300">—</span>}</div>
      <span className="sr-only">{locale}</span>
    </article>
  );
}

function PropertiesView({ properties, clients, search, locale, t, onAdd }: { properties: Property[]; clients: Client[]; search: string; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; onAdd: () => void }) {
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
                <Badge tone={property.relationship_type === "manager" ? "purple" : "blue"}>{property.relationship_type === "manager" ? t("managerRole") : t("owner")}</Badge>
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

function RequestsView({ requests, search, locale, t, onAdd }: { requests: WorkRequest[]; search: string; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; onAdd: () => void }) {
  return (
    <div className="space-y-6">
      <PageHeading title={t("requests")} subtitle={t("requestsSubtitle")} button={t("newRequest")} onAdd={onAdd} />
      {requests.length === 0 ? (
        <EmptyState icon={ClipboardList} title={search ? t("noMatches") : t("noRequests")} detail={search ? "" : t("requestHint")} action={search ? undefined : t("newRequest")} onAction={onAdd} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02]">
          <div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_minmax(180px,1.1fr)_120px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.09em] text-slate-400 md:grid">
            <span>{t("contact")}</span><span>{t("property")}</span><span>{t("description")}</span><span>{t("type")}</span>
          </div>
          {requests.map((request) => <RequestRow key={request.id} request={request} locale={locale} t={t} />)}
        </div>
      )}
    </div>
  );
}

function RequestRow({ request, locale, t }: { request: WorkRequest; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string }) {
  const statusKey = request.status;
  return (
    <article className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-0 hover:bg-slate-50/50 sm:px-5 md:grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_minmax(180px,1.1fr)_120px] md:items-center md:gap-4 md:py-3.5">
      <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{request.contact_name}</div><div className="mt-0.5 text-[11px] text-slate-400">{request.contact_phone}</div></div>
      <div className="min-w-0 text-xs text-slate-600"><div className="truncate">{request.address_line1}</div><div className="mt-0.5 truncate text-[11px] text-slate-400">{[request.city, request.subdivision].filter(Boolean).join(", ")}</div></div>
      <div className="line-clamp-2 text-xs leading-relaxed text-slate-500">{request.description}</div>
      <div className="flex items-center justify-between gap-2 md:block"><Badge tone={statusKey === "received" ? "amber" : statusKey === "cancelled" ? "rose" : "blue"}>{t(statusKey)}</Badge><span className="text-[10px] text-slate-400 md:hidden">{request.client_type === "direct" ? t("direct") : t("manager")}</span></div>
      <span className="sr-only">{locale}</span>
    </article>
  );
}

function ClientForm({ locale, t, onClose, onSave }: { locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; onClose: () => void; onSave: (input: ClientInput) => Promise<void> }) {
  const [type, setType] = useState<ClientType>("direct");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !phone.trim()) return setError(t("required"));
    setSaving(true);
    setError("");
    try {
      await onSave({ type, name, companyName, phone, email });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t("newClient")} subtitle={t("contactInfo")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div className="field-group"><label className="field-label">{t("type")}</label><div className="grid grid-cols-2 gap-2">
          <ChoiceButton active={type === "direct"} onClick={() => setType("direct")} icon={Users}>{t("directClient")}</ChoiceButton>
          <ChoiceButton active={type === "property_manager"} onClick={() => setType("property_manager")} icon={Building2}>{t("propertyManager")}</ChoiceButton>
        </div></div>
        <div className="field-group"><label className="field-label" htmlFor="client-name">{t("name")} <Required /></label><input autoFocus id="client-name" className="form-input" value={name} onChange={(event) => setName(event.target.value)} required /></div>
        <div className="field-group"><label className="field-label" htmlFor="client-company">{t("company")}</label><input id="client-company" className="form-input" value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field-group"><label className="field-label" htmlFor="client-phone">{t("phone")} <Required /></label><input id="client-phone" className="form-input" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required /></div>
          <div className="field-group"><label className="field-label" htmlFor="client-email">{t("email")}</label><input id="client-email" className="form-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        </div>
        {error && <FormError>{error}</FormError>}
        <FormActions locale={locale} t={t} saving={saving} onCancel={onClose} />
      </form>
    </Modal>
  );
}

function PropertyForm({ clients, locale, t, onClose, onSave }: { clients: Client[]; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; onClose: () => void; onSave: (input: PropertyInput) => Promise<void> }) {
  const [clientId, setClientId] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [subdivision, setSubdivision] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!clientId || !addressLine1.trim() || !city.trim()) return setError(t("required"));
    setSaving(true);
    setError("");
    try {
      await onSave({ clientId, addressLine1, addressLine2, city, subdivision, postalCode, countryCode });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t("newProperty")} subtitle={t("jobInfo")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="field-group"><label className="field-label" htmlFor="property-client">{t("associatedClient")} <Required /></label><select id="property-client" className="form-input" value={clientId} onChange={(event) => setClientId(event.target.value)} required><option value="">{t("selectClient")}</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name} · {client.type === "direct" ? t("direct") : t("manager")}</option>)}</select></div>
        <div className="field-group"><label className="field-label" htmlFor="property-address">{t("address")} <Required /></label><input autoFocus id="property-address" className="form-input" value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} required /></div>
        <div className="field-group"><label className="field-label" htmlFor="property-address2">{t("addressLine2")}</label><input id="property-address2" className="form-input" value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="field-group"><label className="field-label" htmlFor="property-city">{t("city")} <Required /></label><input id="property-city" className="form-input" value={city} onChange={(event) => setCity(event.target.value)} required /></div>
          <div className="field-group"><label className="field-label" htmlFor="property-subdivision">{t("subdivision")}</label><input id="property-subdivision" className="form-input" value={subdivision} onChange={(event) => setSubdivision(event.target.value)} /></div>
          <div className="field-group"><label className="field-label" htmlFor="property-postal">{t("postalCode")}</label><input id="property-postal" className="form-input" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} /></div>
          <div className="field-group"><label className="field-label" htmlFor="property-country">{t("countryCode")}</label><input id="property-country" className="form-input" maxLength={2} value={countryCode} onChange={(event) => setCountryCode(event.target.value)} /></div>
        </div>
        {error && <FormError>{error}</FormError>}
        <FormActions locale={locale} t={t} saving={saving} onCancel={onClose} disabled={clients.length === 0} />
      </form>
    </Modal>
  );
}

function RequestForm({ clients, properties, locale, t, onClose, onSave }: { clients: Client[]; properties: Property[]; locale: Locale; t: (key: Parameters<typeof translate>[1]) => string; onClose: () => void; onSave: (input: RequestInput) => Promise<void> }) {
  const [clientType, setClientType] = useState<ClientType>("direct");
  const [clientId, setClientId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [subdivision, setSubdivision] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [description, setDescription] = useState("");
  const [preferredAt, setPreferredAt] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (missingQuickRequestFields({ clientId, propertyId, clientType, contactName, contactPhone, tenantName, tenantPhone, addressLine1, addressLine2, city, subdivision, postalCode, description, preferredAt }).length > 0) return setError(t("required"));
    setSaving(true);
    setError("");
    try {
      await onSave({ clientId, propertyId, clientType, contactName, contactPhone, tenantName, tenantPhone, addressLine1, addressLine2, city, subdivision, postalCode, description, preferredAt });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("required"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t("newRequest")} subtitle={locale === "es" ? "CAPTURA RÁPIDA · LOS CAMPOS CON * SON OBLIGATORIOS" : "QUICK INTAKE · FIELDS WITH * ARE REQUIRED"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5">
        {(clients.length > 0 || properties.length > 0) && <div className="field-group"><div className="field-label">{t("linkExisting")}</div><div className="grid gap-3 sm:grid-cols-2">
          <div className="field-group"><label className="field-label" htmlFor="request-client">{t("linkedClient")}</label><select id="request-client" className="form-input" value={clientId} onChange={(event) => { const selected = clients.find((client) => client.id === event.target.value); setClientId(event.target.value); if (selected) { setClientType(selected.type); setContactName(selected.name); setContactPhone(selected.phone); } }}><option value="">{locale === "es" ? "Sin vincular" : "No link"}</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div>
          <div className="field-group"><label className="field-label" htmlFor="request-property">{t("linkedProperty")}</label><select id="request-property" className="form-input" value={propertyId} onChange={(event) => { const selected = properties.find((property) => property.id === event.target.value); setPropertyId(event.target.value); if (selected) { setAddressLine1(selected.address_line1); setAddressLine2(selected.address_line2 || ""); setCity(selected.city); setSubdivision(selected.subdivision || ""); setPostalCode(selected.postal_code || ""); } }}><option value="">{locale === "es" ? "Sin vincular" : "No link"}</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.address_line1} · {property.city}</option>)}</select></div>
        </div></div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field-group"><label className="field-label">{t("type")} <Required /></label><div className="grid grid-cols-2 gap-2"><ChoiceButton active={clientType === "direct"} onClick={() => setClientType("direct")} icon={Users}>{t("directClient")}</ChoiceButton><ChoiceButton active={clientType === "property_manager"} onClick={() => setClientType("property_manager")} icon={Building2}>{t("propertyManager")}</ChoiceButton></div></div>
          <div className="field-group"><label className="field-label" htmlFor="request-date">{t("preferredAt")}</label><div className="relative"><CalendarDays size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="request-date" className="form-input pl-9" type="datetime-local" value={preferredAt} onChange={(event) => setPreferredAt(event.target.value)} /></div></div>
        </div>
        <div className="field-group"><div className="field-label mb-3">{t("contactInfo")}</div><div className="grid gap-3 sm:grid-cols-2">
          <div className="field-group"><label className="field-label" htmlFor="request-name">{t("name")} <Required /></label><input autoFocus id="request-name" className="form-input" value={contactName} onChange={(event) => setContactName(event.target.value)} required /></div>
          <div className="field-group"><label className="field-label" htmlFor="request-phone">{t("phone")} <Required /></label><input id="request-phone" className="form-input" type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} required /></div>
          {clientType === "property_manager" && <>
            <div className="field-group"><label className="field-label" htmlFor="tenant-name">{t("tenantName")}</label><input id="tenant-name" className="form-input" value={tenantName} onChange={(event) => setTenantName(event.target.value)} /></div>
            <div className="field-group"><label className="field-label" htmlFor="tenant-phone">{t("tenantPhone")}</label><input id="tenant-phone" className="form-input" type="tel" value={tenantPhone} onChange={(event) => setTenantPhone(event.target.value)} /></div>
          </>}
        </div></div>
        <div className="field-group"><div className="field-label mb-3">{t("jobInfo")}</div><div className="grid gap-3 sm:grid-cols-2">
          <div className="field-group sm:col-span-2"><label className="field-label" htmlFor="request-address">{t("address")} <Required /></label><input id="request-address" className="form-input" value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} required /></div>
          <div className="field-group"><label className="field-label" htmlFor="request-address2">{t("addressLine2")}</label><input id="request-address2" className="form-input" value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} /></div>
          <div className="field-group"><label className="field-label" htmlFor="request-city">{t("city")}</label><input id="request-city" className="form-input" value={city} onChange={(event) => setCity(event.target.value)} /></div>
          <div className="field-group"><label className="field-label" htmlFor="request-region">{t("subdivision")}</label><input id="request-region" className="form-input" value={subdivision} onChange={(event) => setSubdivision(event.target.value)} /></div>
          <div className="field-group"><label className="field-label" htmlFor="request-postal">{t("postalCode")}</label><input id="request-postal" className="form-input" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} /></div>
          <div className="field-group sm:col-span-2"><label className="field-label" htmlFor="request-description">{t("description")} <Required /></label><textarea id="request-description" className="form-input min-h-[88px] resize-y" value={description} onChange={(event) => setDescription(event.target.value)} required /></div>
        </div></div>
        {error && <FormError>{error}</FormError>}
        <FormActions locale={locale} t={t} saving={saving} onCancel={onClose} />
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

function ChoiceButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: IconType; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition ${active ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100" : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"}`}><Icon size={14} />{children}</button>;
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
