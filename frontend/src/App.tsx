import React, { useState, useEffect } from "react";
import {
  Factory,
  Users,
  Scissors,
  History,
  ShieldCheck,
  KeyRound,
  LogOut,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Server,
  Building2,
  Lock,
  Palette,
  ShieldAlert,
  ShoppingBag,
  Kanban,
  Layers,
  Printer,
  Flame,
  Boxes,
  FileCheck,
  Truck,
  TrendingUp,
} from "lucide-react";
import { api, getToken, removeToken, setToken } from "./services/api.js";
import { Sector, User, SewingPartner, AuditLog } from "./types.js";
import { AdminDashboard } from "./components/AdminDashboard.tsx";
import { PreVendaKanban } from "./components/PreVendaKanban.tsx";
import { DesignerPanel } from "./components/DesignerPanel.tsx";
import { VendasPanel } from "./components/VendasPanel.tsx";
import { SacInternoPanel } from "./components/SacInternoPanel.tsx";
import { ProductionSectorPanel } from "./components/ProductionSectorPanel.tsx";
import { Sector11DispatchPanel } from "./components/Sector11DispatchPanel.tsx";
import { Sector12CosturaPanel } from "./components/Sector12CosturaPanel.tsx";
import { Sector13QualidadePanel } from "./components/Sector13QualidadePanel.tsx";
import { Sector14ExpedicaoPanel } from "./components/Sector14ExpedicaoPanel.tsx";

export type TabType =
  | "dashboard"
  | "prevenda"
  | "design"
  | "vendas"
  | "sac"
  | "pre_diagramacao"
  | "diagramacao"
  | "impressao"
  | "infesto"
  | "calandra"
  | "separacao"
  | "despache"
  | "costura"
  | "qualidade"
  | "expedicao"
  | "sectors"
  | "users"
  | "sewing"
  | "audit"
  | "pin";

export function getDefaultTabForUser(user: User): TabType {
  if (user.role === "DESIGNER") return "design";
  if (user.role === "VENDEDOR") return "prevenda";

  const code = (user.sectorCode || user.sector?.code || "").toUpperCase();
  if (code === "SAC_INTERNO") return "sac";
  if (code === "PRE_DIAGRAMACAO") return "pre_diagramacao";
  if (code === "DIAGRAMACAO") return "diagramacao";
  if (code === "IMPRESSAO") return "impressao";
  if (code === "INFESTO") return "infesto";
  if (code === "CALANDRA") return "calandra";
  if (code === "SEPARACAO") return "separacao";
  if (code === "DESPACHE_OFICINA" || code === "DESPACHE") return "despache";
  if (code === "COSTURA") return "costura";
  if (code === "QUALIDADE" || code === "EMBALAGEM") return "qualidade";
  if (code === "EXPEDICAO" || code === "ENTREGA") return "expedicao";
  if (code === "DESIGN") return "design";
  if (code === "VENDAS" || code === "PRE_VENDA") return "prevenda";

  const name = (user.sectorName || user.sector?.name || "").toLowerCase();
  if (name.includes("sac")) return "sac";
  if (name.includes("pré-diag") || name.includes("pre-diag")) return "pre_diagramacao";
  if (name.includes("diagrama")) return "diagramacao";
  if (name.includes("impress")) return "impressao";
  if (name.includes("infesto")) return "infesto";
  if (name.includes("calandra")) return "calandra";
  if (name.includes("separa")) return "separacao";
  if (name.includes("despache") || name.includes("oficina")) return "despache";
  if (name.includes("costura")) return "costura";
  if (name.includes("qualidade")) return "qualidade";
  if (name.includes("expedição") || name.includes("expedicao") || name.includes("entrega")) return "expedicao";
  if (name.includes("design") || name.includes("arte")) return "design";
  if (name.includes("venda")) return "prevenda";

  if (user.role === "ADMIN" || user.role === "GESTOR") {
    return "dashboard";
  }

  return "pin";
}

export function canAccessTab(tab: TabType, user: User | null): boolean {
  if (!user) return false;
  if (tab === "pin") return true;

  if (user.role === "ADMIN") return true;

  if (user.role === "GESTOR") {
    // Gestor NÃO tem acesso ao gerenciamento de usuários (apenas Administrador)
    if (tab === "users") return false;
    return true;
  }

  if (tab === "dashboard") return false;

  if (user.role === "DESIGNER") {
    return tab === "design";
  }

  if (user.role === "VENDEDOR") {
    return tab === "prevenda" || tab === "vendas";
  }

  if (user.role === "OPERADOR") {
    const code = (user.sectorCode || user.sector?.code || "").toUpperCase();
    if (code === "SAC_INTERNO") return tab === "sac";
    if (code === "PRE_DIAGRAMACAO") return tab === "pre_diagramacao";
    if (code === "DIAGRAMACAO") return tab === "diagramacao";
    if (code === "IMPRESSAO") return tab === "impressao";
    if (code === "INFESTO") return tab === "infesto";
    if (code === "CALANDRA") return tab === "calandra";
    if (code === "SEPARACAO") return tab === "separacao";
    if (code === "DESPACHE_OFICINA" || code === "DESPACHE") return tab === "despache";
    if (code === "COSTURA") return tab === "costura";
    if (code === "QUALIDADE" || code === "EMBALAGEM") return tab === "qualidade";
    if (code === "EXPEDICAO" || code === "ENTREGA") return tab === "expedicao";

    const name = (user.sectorName || user.sector?.name || "").toLowerCase();
    if (name.includes("sac") && tab === "sac") return true;
    if ((name.includes("pré-diag") || name.includes("pre-diag")) && tab === "pre_diagramacao") return true;
    if (name.includes("diagrama") && tab === "diagramacao") return true;
    if (name.includes("impress") && tab === "impressao") return true;
    if (name.includes("infesto") && tab === "infesto") return true;
    if (name.includes("calandra") && tab === "calandra") return true;
    if (name.includes("separa") && tab === "separacao") return true;
    if ((name.includes("despache") || name.includes("oficina")) && tab === "despache") return true;
    if (name.includes("costura") && tab === "costura") return true;
    if (name.includes("qualidade") && tab === "qualidade") return true;
    if ((name.includes("expedição") || name.includes("expedicao") || name.includes("entrega")) && tab === "expedicao") return true;
  }

  return false;
}

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("prevenda");

  // Estado dos formulários e dados
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [sewingPartners, setSewingPartners] = useState<SewingPartner[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [serverHealth, setServerHealth] = useState<any>(null);

  // Login form
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  // Modal novo usuário
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("OPERADOR");
  const [newUserSectorId, setNewUserSectorId] = useState("");
  const [newUserPin, setNewUserPin] = useState("");
  const [userModalError, setUserModalError] = useState("");

  // Modal nova oficina
  const [isSewingModalOpen, setIsSewingModalOpen] = useState(false);
  const [newPartnerName, setNewPartnerName] = useState("");
  const [newPartnerType, setNewPartnerType] = useState<"INTERNAL" | "EXTERNAL">("EXTERNAL");
  const [newPartnerPerson, setNewPartnerPerson] = useState("");
  const [newPartnerPhone, setNewPartnerPhone] = useState("");
  const [newPartnerPrice, setNewPartnerPrice] = useState("4.50");
  const [sewingModalError, setSewingModalError] = useState("");

  // Teste de PIN
  const [testPinInput, setTestPinInput] = useState("");
  const [pinResult, setPinResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // Edição de usuário
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("OPERADOR");
  const [editSectorId, setEditSectorId] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPin, setEditPin] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editModalError, setEditModalError] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState("");

  // Checar autenticação inicial
  useEffect(() => {
    async function checkAuth() {
      const token = getToken();
      if (!token) {
        setIsLoadingAuth(false);
        return;
      }
      try {
        const res = await api.getMe();
        setCurrentUser(res.user);
        setActiveTab(getDefaultTabForUser(res.user));
      } catch (err) {
        removeToken();
        setCurrentUser(null);
      } finally {
        setIsLoadingAuth(false);
      }
    }
    checkAuth();
  }, []);

  // Carregar dados quando autenticado
  const loadData = async () => {
    try {
      const [sectorsData, healthData] = await Promise.all([
        api.getSectors(),
        api.checkHealth(),
      ]);
      setSectors(sectorsData);
      setServerHealth(healthData);

      if (currentUser?.role === "ADMIN") {
        const [usersData, sewingData, auditData] = await Promise.all([
          api.getUsers().catch(() => []),
          api.getSewingPartners().catch(() => []),
          api.getAuditLogs(50).catch(() => []),
        ]);
        setUsersList(usersData);
        setSewingPartners(sewingData);
        setAuditLogs(auditData);
      } else if (currentUser?.role === "GESTOR") {
        const [sewingData, auditData] = await Promise.all([
          api.getSewingPartners().catch(() => []),
          api.getAuditLogs(50).catch(() => []),
        ]);
        setUsersList([]);
        setSewingPartners(sewingData);
        setAuditLogs(auditData);
      }
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      if (!canAccessTab(activeTab, currentUser)) {
        setActiveTab(getDefaultTabForUser(currentUser));
      }
      loadData();
    }
  }, [currentUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsSubmittingLogin(true);
    try {
      const res = await api.login({ email: emailInput, password: passwordInput });
      setToken(res.token);
      setCurrentUser(res.user);
      setActiveTab(getDefaultTabForUser(res.user));
    } catch (err: any) {
      setLoginError(err.message || "Falha ao realizar login.");
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleLogout = () => {
    removeToken();
    setCurrentUser(null);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserModalError("");
    try {
      await api.createUser({
        name: newUserName,
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
        sectorId: newUserSectorId || null,
        signaturePin: newUserPin.trim() ? newUserPin.trim() : undefined,
      });
      setIsUserModalOpen(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserPin("");
      await loadData();
    } catch (err: any) {
      setUserModalError(err.message || "Erro ao cadastrar usuário.");
    }
  };

  const handleOpenEditUser = (user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditRole(user.role);
    setEditSectorId(user.sectorId || "");
    setEditPassword("");
    setEditPin("");
    setEditIsActive(user.isActive);
    setEditModalError("");
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditModalError("");
    try {
      await api.updateUser(editingUser.id, {
        name: editName,
        role: editRole,
        sectorId: editSectorId || null,
        isActive: editIsActive,
        password: editPassword || undefined,
        signaturePin: editPin || undefined,
      });
      setEditingUser(null);
      await loadData();
    } catch (err: any) {
      setEditModalError(err.message || "Erro ao atualizar usuário.");
    }
  };

  const handleCreateSewingPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setSewingModalError("");
    try {
      await api.createSewingPartner({
        name: newPartnerName,
        type: newPartnerType,
        contactPerson: newPartnerPerson,
        phone: newPartnerPhone,
        basePricePerPc: parseFloat(newPartnerPrice) || 0,
      });
      setIsSewingModalOpen(false);
      setNewPartnerName("");
      setNewPartnerPerson("");
      setNewPartnerPhone("");
      await loadData();
    } catch (err: any) {
      setSewingModalError(err.message || "Erro ao cadastrar oficina.");
    }
  };

  const handleTestPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinResult(null);
    try {
      const res = await api.verifyPin(testPinInput);
      setPinResult({ success: true, message: res.message });
    } catch (err: any) {
      setPinResult({ success: false, message: err.message });
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-300">
        <RefreshCw className="h-8 w-8 animate-spin text-sky-500" />
        <span className="ml-3 font-semibold text-lg">Iniciando Sistema PCP Industrial...</span>
      </div>
    );
  }

  // TELA DE LOGIN
  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl bg-slate-800/90 p-8 shadow-2xl border border-slate-700/60 backdrop-blur-md">
          <div className="text-center mb-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Factory className="h-8 w-8" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">PCP Industrial</h1>
            <p className="mt-1 text-sm text-slate-400">Sistema de Gestão & Rastreabilidade de Uniformes</p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Servidor Central LAN Operante
            </div>
          </div>

          {loginError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-rose-500/15 p-3 text-sm text-rose-300 border border-rose-500/30">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">E-mail Corporativo</label>
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm"
                placeholder="seu.email@empresa.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">Senha de Acesso</label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2.5 text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingLogin}
              className="w-full rounded-lg bg-sky-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/30 hover:bg-sky-500 active:scale-[0.99] transition disabled:opacity-50"
            >
              {isSubmittingLogin ? "Autenticando..." : "Entrar no Sistema"}
            </button>
          </form>

          {import.meta.env.DEV && (
            <div className="mt-6 border-t border-slate-700/60 pt-4">
              <p className="text-xs font-semibold text-slate-300 mb-2.5 text-center uppercase tracking-wider">
                Acesso Rápido por Perfil / Setor (Modo Desenvolvimento):
              </p>
              <div className="grid grid-cols-2 gap-1.5 text-xs max-h-60 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => setEmailInput("admin@fabrica.com")}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-left border border-slate-700/70 flex flex-col transition"
                >
                  <span className="font-bold text-purple-400">👑 Administrador</span>
                  <span className="text-[10px] text-slate-400 truncate">admin@fabrica.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailInput("gestor@fabrica.com")}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-left border border-slate-700/70 flex flex-col transition"
                >
                  <span className="font-bold text-amber-400">👔 Gestor Geral</span>
                  <span className="text-[10px] text-slate-400 truncate">gestor@fabrica.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailInput("vendedor@fabrica.com")}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-left border border-slate-700/70 flex flex-col transition"
                >
                  <span className="font-bold text-emerald-400">💼 Vendedor (01/03)</span>
                  <span className="text-[10px] text-slate-400 truncate">vendedor@fabrica.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailInput("designer@fabrica.com")}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-left border border-slate-700/70 flex flex-col transition"
                >
                  <span className="font-bold text-pink-400">🎨 Designer (02)</span>
                  <span className="text-[10px] text-slate-400 truncate">designer@fabrica.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailInput("sac@fabrica.com")}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-left border border-slate-700/70 flex flex-col transition"
                >
                  <span className="font-bold text-amber-400">🛡️ SAC Interno (04)</span>
                  <span className="text-[10px] text-slate-400 truncate">sac@fabrica.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailInput("prediag@fabrica.com")}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-left border border-slate-700/70 flex flex-col transition"
                >
                  <span className="font-bold text-sky-400">📐 Pré-Diag (05)</span>
                  <span className="text-[10px] text-slate-400 truncate">prediag@fabrica.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailInput("diagramacao@fabrica.com")}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-left border border-slate-700/70 flex flex-col transition"
                >
                  <span className="font-bold text-indigo-400">📄 Diagramação (06)</span>
                  <span className="text-[10px] text-slate-400 truncate">diagramacao@fabrica.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailInput("impressao@fabrica.com")}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-left border border-slate-700/70 flex flex-col transition"
                >
                  <span className="font-bold text-blue-400">🖨️ Impressão (07)</span>
                  <span className="text-[10px] text-slate-400 truncate">impressao@fabrica.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailInput("infesto@fabrica.com")}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-left border border-slate-700/70 flex flex-col transition"
                >
                  <span className="font-bold text-teal-400">✂️ Infesto (08)</span>
                  <span className="text-[10px] text-slate-400 truncate">infesto@fabrica.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailInput("calandra@fabrica.com")}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-left border border-slate-700/70 flex flex-col transition"
                >
                  <span className="font-bold text-amber-500">🔥 Calandra (09)</span>
                  <span className="text-[10px] text-slate-400 truncate">calandra@fabrica.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailInput("separacao@fabrica.com")}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-left border border-slate-700/70 flex flex-col transition"
                >
                  <span className="font-bold text-emerald-400">📦 Separação (10)</span>
                  <span className="text-[10px] text-slate-400 truncate">separacao@fabrica.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailInput("despache@fabrica.com")}
                  className="p-2 rounded-lg bg-slate-900/80 hover:bg-slate-700/80 text-left border border-slate-700/70 flex flex-col transition"
                >
                  <span className="font-bold text-purple-400">🚚 Despache (11)</span>
                  <span className="text-[10px] text-slate-400 truncate">despache@fabrica.com</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 text-center mt-3">
                Informe a senha pessoal cadastrada para acessar o sistema.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // TELA LOGADA COM NAVEGAÇÃO E PAINÉIS
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* NAVBAR SUPERIOR */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
            <Factory className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
              PCP Industrial
              <span className="rounded bg-sky-500/20 px-2 py-0.5 text-xs font-medium text-sky-400 border border-sky-500/30">
                Fábrica de Uniformes
              </span>
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">Gestão de Produção, Rastreabilidade & Operação por Setor</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status do Servidor Local */}
          <div className="hidden md:flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 border border-slate-700">
            <Server className="h-4 w-4 text-emerald-400" />
            <span>Servidor LAN: <strong>Online</strong> (0.0.0.0:4000)</span>
          </div>

          {/* Usuário Logado */}
          <div className="flex items-center gap-2 rounded-lg bg-slate-800/80 px-3 py-1.5 text-xs text-slate-200 border border-slate-700">
            <div className="h-2 w-2 rounded-full bg-emerald-400"></div>
            <span className="font-semibold">{currentUser.name}</span>
            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] uppercase font-bold text-slate-300">
              {currentUser.role}
            </span>
            {(currentUser.sectorName || currentUser.sector?.name) && (
              <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] uppercase font-bold text-sky-400 border border-sky-500/30">
                Setor: {currentUser.sectorName || currentUser.sector?.name}
              </span>
            )}
          </div>

          <button
            onClick={handleLogout}
            title="Sair da Sessão"
            className="flex items-center gap-1 rounded-lg bg-rose-600/20 p-2 text-rose-400 hover:bg-rose-600 hover:text-white transition border border-rose-500/30"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ABAS DE NAVEGAÇÃO CONDICIONAIS POR RBAC */}
      <div className="border-b border-slate-800 bg-slate-900 px-4 sm:px-8 flex overflow-x-auto gap-2">
        {canAccessTab("dashboard", currentUser) && (
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "dashboard"
                ? "border-amber-400 text-amber-400 bg-amber-400/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="h-4 w-4 text-amber-400" />
            📊 Dashboard Geral
          </button>
        )}

        {canAccessTab("prevenda", currentUser) && (
          <button
            onClick={() => setActiveTab("prevenda")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "prevenda"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Kanban className="h-4 w-4 text-sky-400" />
            01. Pré-Venda (Kanban)
          </button>
        )}

        {canAccessTab("design", currentUser) && (
          <button
            onClick={() => setActiveTab("design")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "design"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Palette className="h-4 w-4 text-pink-400" />
            02. Designer / Arte
          </button>
        )}

        {canAccessTab("vendas", currentUser) && (
          <button
            onClick={() => setActiveTab("vendas")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "vendas"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShoppingBag className="h-4 w-4 text-emerald-400" />
            03. Vendas & OP
          </button>
        )}

        {canAccessTab("sac", currentUser) && (
          <button
            onClick={() => setActiveTab("sac")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "sac"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            04. SAC Interno
          </button>
        )}

        {/* SETORES INDUSTRIAIS (ETAPA 3: 05 A 10) */}
        {canAccessTab("pre_diagramacao", currentUser) && (
          <button
            onClick={() => setActiveTab("pre_diagramacao")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "pre_diagramacao"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="h-4 w-4 text-sky-400" />
            05. Pré-Diag
          </button>
        )}

        {canAccessTab("diagramacao", currentUser) && (
          <button
            onClick={() => setActiveTab("diagramacao")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "diagramacao"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileCheck className="h-4 w-4 text-indigo-400" />
            06. Diagramação
          </button>
        )}

        {canAccessTab("impressao", currentUser) && (
          <button
            onClick={() => setActiveTab("impressao")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "impressao"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Printer className="h-4 w-4 text-blue-400" />
            07. Impressão
          </button>
        )}

        {canAccessTab("infesto", currentUser) && (
          <button
            onClick={() => setActiveTab("infesto")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "infesto"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Scissors className="h-4 w-4 text-teal-400" />
            08. Infesto
          </button>
        )}

        {canAccessTab("calandra", currentUser) && (
          <button
            onClick={() => setActiveTab("calandra")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "calandra"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Flame className="h-4 w-4 text-amber-400" />
            09. Calandra
          </button>
        )}

        {canAccessTab("separacao", currentUser) && (
          <button
            onClick={() => setActiveTab("separacao")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "separacao"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Boxes className="h-4 w-4 text-emerald-400" />
            10. Separação
          </button>
        )}

        {canAccessTab("despache", currentUser) && (
          <button
            onClick={() => setActiveTab("despache")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "despache"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Truck className="h-4 w-4 text-purple-400" />
            11. Despache Oficina
          </button>
        )}

        {canAccessTab("costura", currentUser) && (
          <button
            onClick={() => setActiveTab("costura")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "costura"
                ? "border-pink-500 text-pink-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Scissors className="h-4 w-4 text-pink-400" />
            12. Costura
          </button>
        )}

        {canAccessTab("qualidade", currentUser) && (
          <button
            onClick={() => setActiveTab("qualidade")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "qualidade"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            13. Qualidade
          </button>
        )}

        {canAccessTab("expedicao", currentUser) && (
          <button
            onClick={() => setActiveTab("expedicao")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "expedicao"
                ? "border-purple-500 text-purple-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Truck className="h-4 w-4 text-purple-400" />
            14. Expedição
          </button>
        )}

        {canAccessTab("sectors", currentUser) && (
          <button
            onClick={() => setActiveTab("sectors")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "sectors"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Building2 className="h-4 w-4" />
            14 Setores Fabris ({sectors.length})
          </button>
        )}

        {canAccessTab("users", currentUser) && (
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "users"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="h-4 w-4" />
            Usuários & RBAC ({usersList.length})
          </button>
        )}

        {canAccessTab("sewing", currentUser) && (
          <button
            onClick={() => setActiveTab("sewing")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "sewing"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Scissors className="h-4 w-4" />
            Oficinas de Costura ({sewingPartners.length})
          </button>
        )}

        {canAccessTab("audit", currentUser) && (
          <button
            onClick={() => setActiveTab("audit")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "audit"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <History className="h-4 w-4" />
            Auditoria ({auditLogs.length})
          </button>
        )}

        {canAccessTab("pin", currentUser) && (
          <button
            onClick={() => setActiveTab("pin")}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition whitespace-nowrap ${
              activeTab === "pin"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <KeyRound className="h-4 w-4" />
            Validação do PIN
          </button>
        )}
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <main className={`flex-1 p-4 sm:p-8 ${activeTab === "dashboard" ? "max-w-[1700px]" : "max-w-7xl"} mx-auto w-full`}>
        {/* DASHBOARD ANALÍTICO EXECUTIVO (ADMIN GERAL & GESTOR) */}
        {activeTab === "dashboard" && (
          <AdminDashboard
            onNavigateToSector={(sectorCode) => {
              const code = sectorCode.toUpperCase();
              if (code === "PRE_VENDA") setActiveTab("prevenda");
              else if (code === "DESIGNER" || code === "DESIGN") setActiveTab("design");
              else if (code === "VENDAS") setActiveTab("vendas");
              else if (code === "SAC_INTERNO") setActiveTab("sac");
              else if (code === "PRE_DIAGRAMACAO") setActiveTab("pre_diagramacao");
              else if (code === "DIAGRAMACAO") setActiveTab("diagramacao");
              else if (code === "IMPRESSAO") setActiveTab("impressao");
              else if (code === "INFESTO") setActiveTab("infesto");
              else if (code === "CALANDRA") setActiveTab("calandra");
              else if (code === "SEPARACAO") setActiveTab("separacao");
              else if (code === "DESPACHE_OFICINA" || code === "DESPACHE") setActiveTab("despache");
              else if (code === "COSTURA") setActiveTab("costura");
              else if (code === "QUALIDADE") setActiveTab("qualidade");
              else if (code === "EXPEDICAO") setActiveTab("expedicao");
            }}
          />
        )}

        {/* MÓDULO COMERCIAL (ETAPA 2) */}
        {activeTab === "prevenda" && <PreVendaKanban currentUser={currentUser} />}
        {activeTab === "design" && <DesignerPanel currentUser={currentUser} />}
        {activeTab === "vendas" && <VendasPanel currentUser={currentUser} />}
        {activeTab === "sac" && <SacInternoPanel currentUser={currentUser} />}

        {/* FLUXO INDUSTRIAL DE PRODUÇÃO (ETAPA 3: SETORES 05 A 10) */}
        {activeTab === "pre_diagramacao" && (
          <ProductionSectorPanel
            sectorCode="PRE_DIAGRAMACAO"
            sectorName="Pré-Diagramação"
            sectorNumber="05"
            currentUser={currentUser}
          />
        )}
        {activeTab === "diagramacao" && (
          <ProductionSectorPanel
            sectorCode="DIAGRAMACAO"
            sectorName="Diagramação & Encaixe"
            sectorNumber="06"
            currentUser={currentUser}
          />
        )}
        {activeTab === "impressao" && (
          <ProductionSectorPanel
            sectorCode="IMPRESSAO"
            sectorName="Impressão Sublimática"
            sectorNumber="07"
            currentUser={currentUser}
          />
        )}
        {activeTab === "infesto" && (
          <ProductionSectorPanel
            sectorCode="INFESTO"
            sectorName="Infesto & Corte"
            sectorNumber="08"
            currentUser={currentUser}
          />
        )}
        {activeTab === "calandra" && (
          <ProductionSectorPanel
            sectorCode="CALANDRA"
            sectorName="Calandra (Termotransferência)"
            sectorNumber="09"
            currentUser={currentUser}
          />
        )}
        {activeTab === "separacao" && (
          <ProductionSectorPanel
            sectorCode="SEPARACAO"
            sectorName="Separação & Conferência"
            sectorNumber="10"
            currentUser={currentUser}
          />
        )}
        {activeTab === "despache" && (
          <Sector11DispatchPanel currentUser={currentUser} />
        )}
        {activeTab === "costura" && (
          <Sector12CosturaPanel currentUser={currentUser} />
        )}
        {activeTab === "qualidade" && (
          <Sector13QualidadePanel currentUser={currentUser} />
        )}
        {activeTab === "expedicao" && (
          <Sector14ExpedicaoPanel currentUser={currentUser} />
        )}

        {/* ABA 1: SETORES */}
        {activeTab === "sectors" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  Estrutura Industrial dos 14 Setores
                </h2>
                <p className="text-sm text-slate-400">
                  Fluxo linear sequenciado de produção com persistência relacional e rastreabilidade total.
                </p>
              </div>
              <button
                onClick={loadData}
                className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 transition border border-slate-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Atualizar Setores
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sectors.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl bg-slate-900 border border-slate-800 p-5 hover:border-slate-700 transition relative overflow-hidden group shadow-lg"
                >
                  <div className="flex items-start justify-between">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 font-mono font-bold text-sm border border-sky-500/30">
                      {s.sequenceOrder.toString().padStart(2, "0")}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {s.allowsExternalDispatch && (
                        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/30">
                          Despache Costura
                        </span>
                      )}
                      {s.allowsReworkOrigin && (
                        <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-400 border border-rose-500/30">
                          Origem Retrabalho
                        </span>
                      )}
                      <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                        Ativo
                      </span>
                    </div>
                  </div>

                  <h3 className="mt-3 text-base font-bold text-white group-hover:text-sky-400 transition">
                    {s.name}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400 line-clamp-2">{s.description}</p>

                  <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span>Código: <strong className="font-mono text-slate-300">{s.code}</strong></span>
                    <span>Operadores: <strong className="text-white">{s.activeUsersCount}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABA 2: USUÁRIOS & RBAC (EXCLUSIVO ADMINISTRADOR) */}
        {activeTab === "users" && currentUser?.role === "ADMIN" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Controle de Usuários e Permissões (RBAC)</h2>
                <p className="text-sm text-slate-400">
                  Gerenciamento de Administradores, Gestores, Operadores, Vendedores e Designers.
                </p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Buscar colaborador..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none w-full sm:w-64"
                />
                <button
                  onClick={() => setIsUserModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-sky-600/30 hover:bg-sky-500 transition shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Novo Usuário
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/60 uppercase tracking-wider text-slate-400 border-b border-slate-800 font-semibold">
                    <tr>
                      <th className="px-4 py-3">Colaborador</th>
                      <th className="px-4 py-3">E-mail</th>
                      <th className="px-4 py-3">Perfil (Role)</th>
                      <th className="px-4 py-3">Setor Vinculado</th>
                      <th className="px-4 py-3">PIN Assinatura</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {usersList
                      .filter(
                        (u) =>
                          u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                          u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                          u.role.toLowerCase().includes(userSearchTerm.toLowerCase())
                      )
                      .map((u) => (
                        <tr key={u.id} className="hover:bg-slate-800/30 transition">
                          <td className="px-4 py-3 font-semibold text-white">{u.name}</td>
                          <td className="px-4 py-3 font-mono text-slate-400">{u.email}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                u.role === "ADMIN"
                                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                  : u.role === "GESTOR"
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                  : u.role === "OPERADOR"
                                  ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                                  : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {u.sector ? (
                              <span className="text-slate-300">
                                {u.sector.sequenceOrder}. {u.sector.name}
                              </span>
                            ) : (
                              <span className="text-slate-500 italic">Geral / Sem setor</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {u.hasPin ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Cadastrado
                              </span>
                            ) : (
                              <span className="text-slate-500">Pendente</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {u.isActive ? (
                              <span className="rounded bg-emerald-500/10 text-emerald-400 px-2 py-0.5 font-semibold text-[10px]">
                                Ativo
                              </span>
                            ) : (
                              <span className="rounded bg-rose-500/10 text-rose-400 px-2 py-0.5 font-semibold text-[10px]">
                                Inativo
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleOpenEditUser(u)}
                              className="rounded bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[11px] font-medium text-sky-400 hover:text-sky-300 border border-slate-700 transition"
                            >
                              Editar
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ABA 3: OFICINAS DE COSTURA */}
        {activeTab === "sewing" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Cadastro de Oficinas de Costura</h2>
                <p className="text-sm text-slate-400">
                  Gerenciamento de células internas e parceiros terceirizados com valor por peça e rastreio.
                </p>
              </div>
              <button
                onClick={() => setIsSewingModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-sky-600/30 hover:bg-sky-500 transition"
              >
                <Plus className="h-4 w-4" />
                Nova Oficina
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sewingPartners.map((p) => (
                <div key={p.id} className="rounded-xl bg-slate-900 border border-slate-800 p-5 shadow-lg">
                  <div className="flex items-start justify-between">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        p.type === "INTERNAL"
                          ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                          : "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                      }`}
                    >
                      {p.type === "INTERNAL" ? "Célula Interna" : "Oficina Terceirizada"}
                    </span>
                    <span className="text-emerald-400 font-bold text-sm">
                      R$ {p.basePricePerPc.toFixed(2)} / pc
                    </span>
                  </div>

                  <h3 className="mt-3 text-base font-bold text-white">{p.name}</h3>
                  <div className="mt-2 space-y-1 text-xs text-slate-400">
                    {p.contactPerson && <p>Contato: <span className="text-slate-300">{p.contactPerson}</span></p>}
                    {p.phone && <p>Telefone: <span className="text-slate-300">{p.phone}</span></p>}
                    {p.address && <p>Endereço: <span className="text-slate-300">{p.address}</span></p>}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-xs text-slate-400">
                    <span>Remessas Realizadas:</span>
                    <strong className="text-white">{p._count?.dispatches || 0}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABA 4: TRILHA DE AUDITORIA */}
        {activeTab === "audit" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Trilha de Auditoria Imutável</h2>
              <p className="text-sm text-slate-400">
                Registro criptográfico e sequencial de logins, alterações cadastrais e movimentações.
              </p>
            </div>

            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/60 uppercase tracking-wider text-slate-400 border-b border-slate-800 font-semibold">
                    <tr>
                      <th className="px-4 py-3">Data / Hora</th>
                      <th className="px-4 py-3">Ação Registrada</th>
                      <th className="px-4 py-3">Entidade</th>
                      <th className="px-4 py-3">Usuário</th>
                      <th className="px-4 py-3">Endereço IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {auditLogs.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3 font-mono text-slate-400">
                          {new Date(l.createdAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-sky-400">{l.action}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-300">{l.entityName}</td>
                        <td className="px-4 py-3 font-semibold text-white">
                          {l.user ? l.user.name : "Sistema"}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-400">{l.ipAddress || "LAN"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ABA 5: VALIDAÇÃO DE PIN */}
        {activeTab === "pin" && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  <KeyRound className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Simulador de Assinatura por PIN</h3>
                  <p className="text-xs text-slate-400">
                    Validação do PIN individual do operador autenticado ({currentUser.name})
                  </p>
                </div>
              </div>

              <form onSubmit={handleTestPin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Digite seu PIN de 4 a 6 dígitos:
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={testPinInput}
                    onChange={(e) => setTestPinInput(e.target.value.replace(/\D/g, ""))}
                    className="mt-1 w-full text-center tracking-[0.5em] font-mono text-2xl rounded-xl bg-slate-950 border border-slate-700 py-3 text-white focus:border-sky-500 focus:outline-none"
                    placeholder="••••••"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Insira o PIN de assinatura do seu usuário cadastrado.
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white hover:bg-sky-500 transition shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="h-5 w-5" />
                  Verificar Assinatura Operacional
                </button>
              </form>

              {pinResult && (
                <div
                  className={`mt-4 p-4 rounded-xl border flex items-center gap-3 text-sm ${
                    pinResult.success
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : "bg-rose-500/15 border-rose-500/30 text-rose-300"
                  }`}
                >
                  {pinResult.success ? (
                    <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 shrink-0 text-rose-400" />
                  )}
                  <div>
                    <strong className="block font-semibold">
                      {pinResult.success ? "Assinatura Autorizada!" : "Assinatura Bloqueada!"}
                    </strong>
                    <span>{pinResult.message}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL CRIAR USUÁRIO */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Cadastrar Novo Usuário & Operador</h3>
            {userModalError && (
              <div className="mb-4 rounded-lg bg-rose-500/15 p-3 text-xs text-rose-300 border border-rose-500/30">
                {userModalError}
              </div>
            )}
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 font-medium">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">E-mail</label>
                  <input
                    type="email"
                    required
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">Senha</label>
                  <input
                    type="password"
                    required
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    placeholder="Mínimo 6 dígitos"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">Perfil (Role)</label>
                  <select
                    value={newUserRole}
                    onChange={(e) => {
                      const newRole = e.target.value;
                      setNewUserRole(newRole);
                      if (newRole === "VENDEDOR") {
                        const vSec = sectors.find((s) => s.code === "VENDAS" || s.code === "PRE_VENDA");
                        if (vSec) setNewUserSectorId(vSec.id);
                      } else if (newRole === "DESIGNER") {
                        const dSec = sectors.find((s) => s.code === "DESIGN");
                        if (dSec) setNewUserSectorId(dSec.id);
                      }
                    }}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  >
                    <option value="OPERADOR">OPERADOR</option>
                    <option value="GESTOR">GESTOR</option>
                    <option value="VENDEDOR">VENDEDOR</option>
                    <option value="DESIGNER">DESIGNER</option>
                    <option value="ADMIN">ADMINISTRADOR</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">PIN de Assinatura (4-6 dígitos)</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={newUserPin}
                    onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, ""))}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    placeholder="Ex: 4 a 6 dígitos"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">Setor de Atuação</label>
                <select
                  value={newUserSectorId}
                  onChange={(e) => setNewUserSectorId(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                >
                  <option value="">Geral / Sem setor fixo</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sequenceOrder}. {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition shadow-lg shadow-sky-600/30"
                >
                  Salvar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CRIAR OFICINA DE COSTURA */}
      {isSewingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">Cadastrar Oficina de Costura</h3>
            {sewingModalError && (
              <div className="mb-4 rounded-lg bg-rose-500/15 p-3 text-xs text-rose-300 border border-rose-500/30">
                {sewingModalError}
              </div>
            )}
            <form onSubmit={handleCreateSewingPartner} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 font-medium">Nome da Oficina / Célula</label>
                <input
                  type="text"
                  required
                  value={newPartnerName}
                  onChange={(e) => setNewPartnerName(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  placeholder="Ex: Confecções Estrela ou Célula Interna B"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">Tipo</label>
                  <select
                    value={newPartnerType}
                    onChange={(e) => setNewPartnerType(e.target.value as any)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  >
                    <option value="EXTERNAL">Oficina Terceirizada</option>
                    <option value="INTERNAL">Célula Interna</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">Preço Base por Peça (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newPartnerPrice}
                    onChange={(e) => setNewPartnerPrice(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">Responsável / Contato</label>
                  <input
                    type="text"
                    value={newPartnerPerson}
                    onChange={(e) => setNewPartnerPerson(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">Telefone</label>
                  <input
                    type="text"
                    value={newPartnerPhone}
                    onChange={(e) => setNewPartnerPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSewingModalOpen(false)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition shadow-lg shadow-sky-600/30"
                >
                  Salvar Oficina
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR USUÁRIO */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Editar Colaborador</h3>
              <span className="text-xs font-mono text-slate-400">{editingUser.email}</span>
            </div>
            {editModalError && (
              <div className="mb-4 rounded-lg bg-rose-500/15 p-3 text-xs text-rose-300 border border-rose-500/30">
                {editModalError}
              </div>
            )}
            <form onSubmit={handleUpdateUser} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 font-medium">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">Perfil (Role)</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  >
                    <option value="OPERADOR">OPERADOR</option>
                    <option value="GESTOR">GESTOR</option>
                    <option value="VENDEDOR">VENDEDOR</option>
                    <option value="DESIGNER">DESIGNER</option>
                    <option value="ADMIN">ADMINISTRADOR</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">Status da Conta</label>
                  <select
                    value={editIsActive ? "active" : "inactive"}
                    onChange={(e) => setEditIsActive(e.target.value === "active")}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  >
                    <option value="active">Ativo (Permitir Acesso)</option>
                    <option value="inactive">Inativo (Bloquear Acesso)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">Setor de Atuação</label>
                <select
                  value={editSectorId}
                  onChange={(e) => setEditSectorId(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                >
                  <option value="">Geral / Sem setor fixo</option>
                  {sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sequenceOrder}. {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <p className="text-[11px] text-slate-400 mb-2 italic">
                  Preencha os campos abaixo apenas se desejar redefinir as credenciais:
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-300 font-medium">Nova Senha (Opcional)</label>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                      placeholder="Deixe em branco p/ manter"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 font-medium">Novo PIN (Opcional)</label>
                    <input
                      type="password"
                      maxLength={6}
                      value={editPin}
                      onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ""))}
                      className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                      placeholder="4-6 dígitos"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition shadow-lg shadow-sky-600/30"
                >
                  Atualizar Colaborador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
