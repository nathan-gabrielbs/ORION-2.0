import { FormEvent, useEffect, useMemo, useState } from "react";
import { ViewType } from "../types";
import { SyncStatus } from "../App";
import { motion, AnimatePresence } from "motion/react";
import { AuthUser, ManagedUser } from "../authTypes";

type FleetPlate = {
  plate: string;
  model: string;
  year: number;
  operation_name: string;
  operation_logo_url?: string | null;
};

type FleetOperation = {
  name: string;
  logo_url?: string | null;
};

type PlateFormState = {
  plate: string;
  model: string;
  year: string;
  operation_name: string;
  operation_logo_url: string;
};

const INITIAL_PLATE_FORM: PlateFormState = {
  plate: "",
  model: "",
  year: String(new Date().getFullYear()),
  operation_name: "",
  operation_logo_url: "",
};

interface Props {
  view: ViewType;
  setView: (view: ViewType) => void;
  syncStatus: SyncStatus;
  tvMode: boolean;
  setTvMode: (value: boolean) => void;
  authUser: AuthUser;
}

export function DashboardHeader({ view, setView, syncStatus, tvMode, setTvMode, authUser }: Props) {
  const [now, setNow] = useState(new Date());
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [isPlateModalOpen, setIsPlateModalOpen] = useState(false);
  const [plates, setPlates] = useState<FleetPlate[]>([]);
  const [plateForm, setPlateForm] = useState<PlateFormState>(INITIAL_PLATE_FORM);
  const [editingPlate, setEditingPlate] = useState<string | null>(null);
  const [isSavingPlate, setIsSavingPlate] = useState(false);
  const [plateFormError, setPlateFormError] = useState("");
  const [isPlateFormModalOpen, setIsPlateFormModalOpen] = useState(false);
  const [plateSearch, setPlateSearch] = useState("");
  const [deletePlateTarget, setDeletePlateTarget] = useState<FleetPlate | null>(null);
  const [isDeletingPlate, setIsDeletingPlate] = useState(false);
  const [operations, setOperations] = useState<FleetOperation[]>([]);
  const [isOperationDropdownOpen, setIsOperationDropdownOpen] = useState(false);
  const [isRemoveOperationMode, setIsRemoveOperationMode] = useState(false);
  const [selectedPlatesForRemoval, setSelectedPlatesForRemoval] = useState<Set<string>>(new Set());
  const [isRemovingOperations, setIsRemovingOperations] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    // Orbital users go through the SSO end-session, which also revokes the
    // native Orion session server-side before redirecting back to /login.
    if (authUser.auth_provider === "ORBITAL") {
      window.location.href = "/auth/orbital/logout";
      return;
    }
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login";
  };

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const response = await fetch("/api/users", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Falha ao carregar usuários");
      }
      const data = await response.json();
      setManagedUsers(data.users || []);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const openUsersModal = async () => {
    setIsUserModalOpen(true);
    setUsersError("");
    try {
      await loadUsers();
    } catch {
      setUsersError("Não foi possível carregar usuários.");
    }
  };

  const closeUsersModal = () => {
    setIsUserModalOpen(false);
    setUsersError("");
  };

  const updateManagedUser = async (
    user: ManagedUser,
    changes: { role?: "ADMIN" | "USER"; active?: boolean },
  ) => {
    setUsersError("");
    setUpdatingUserId(user.id);
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: user.name,
          role: changes.role ?? user.role,
          active: changes.active ?? Boolean(user.active),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Erro ao atualizar usuário." }));
        setUsersError(data.error || "Erro ao atualizar usuário.");
        return;
      }

      await loadUsers();
    } finally {
      setUpdatingUserId(null);
    }
  };

  const toggleUserRole = (user: ManagedUser) =>
    updateManagedUser(user, { role: user.role === "ADMIN" ? "USER" : "ADMIN" });

  const toggleUserActive = (user: ManagedUser) => updateManagedUser(user, { active: !user.active });

  const loadPlates = async () => {
    const response = await fetch("/api/admin/plates", { credentials: "include" });
    if (!response.ok) {
      throw new Error("Falha ao carregar placas");
    }
    const data = await response.json();
    setPlates(data.plates || []);
  };

  const loadOperations = async () => {
    const response = await fetch("/api/admin/operations", { credentials: "include" });
    if (!response.ok) {
      throw new Error("Falha ao carregar operações");
    }
    const data = await response.json();
    setOperations(data.operations || []);
  };

  const openPlateModal = async () => {
    setIsPlateModalOpen(true);
    setEditingPlate(null);
    setPlateForm(INITIAL_PLATE_FORM);
    setPlateFormError("");
    setIsPlateFormModalOpen(false);
    setPlateSearch("");
    setDeletePlateTarget(null);
    try {
      await Promise.all([loadPlates(), loadOperations()]);
    } catch {
      setPlateFormError("Não foi possível carregar o cadastro de placas/operações.");
    }
  };

  const closePlateModal = () => {
    setIsPlateModalOpen(false);
    setEditingPlate(null);
    setPlateForm(INITIAL_PLATE_FORM);
    setPlateFormError("");
    setIsPlateFormModalOpen(false);
    setPlateSearch("");
    setDeletePlateTarget(null);
    setIsRemoveOperationMode(false);
    setSelectedPlatesForRemoval(new Set());
  };

  const openCreatePlateModal = () => {
    setEditingPlate(null);
    setPlateForm(INITIAL_PLATE_FORM);
    setPlateFormError("");
    setIsPlateFormModalOpen(true);
  };

  const startEditPlate = (plate: FleetPlate) => {
    setEditingPlate(plate.plate);
    setPlateForm({
      plate: plate.plate,
      model: plate.model,
      year: String(plate.year),
      operation_name: plate.operation_name,
      operation_logo_url: plate.operation_logo_url || "",
    });
    setPlateFormError("");
    setIsPlateFormModalOpen(true);
  };

  const closePlateFormModal = () => {
    setIsPlateFormModalOpen(false);
    setEditingPlate(null);
    setPlateForm(INITIAL_PLATE_FORM);
    setPlateFormError("");
  };

  const applyOperationSelection = (operationName: string) => {
    const normalizedName = operationName.trim();
    const existingOperation = operations.find(
      (operation) => operation.name.toLowerCase() === normalizedName.toLowerCase(),
    );

    setPlateForm((prev) => ({
      ...prev,
      operation_name: operationName,
      operation_logo_url: existingOperation ? String(existingOperation.logo_url || "") : "",
    }));
  };

  const submitPlate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPlateFormError("");

    const payload = {
      plate: plateForm.plate.trim().toUpperCase(),
      model: plateForm.model.trim(),
      year: Number(plateForm.year),
      operation_name: plateForm.operation_name.trim(),
      operation_logo_url: plateForm.operation_logo_url.trim() || null,
    };

    if (!payload.model || !Number.isFinite(payload.year)) {
      setPlateFormError("Preencha modelo e ano.");
      return;
    }

    if (!editingPlate && !payload.operation_name) {
      setPlateFormError("Preencha a operação.");
      return;
    }

    if (!editingPlate && payload.plate.length < 7) {
      setPlateFormError("Informe uma placa válida.");
      return;
    }

    setIsSavingPlate(true);
    try {
      const endpoint = editingPlate ? `/api/admin/plates/${editingPlate}` : "/api/admin/plates";
      const method = editingPlate ? "PUT" : "POST";
      const body = editingPlate
        ? JSON.stringify({
            model: payload.model,
            year: payload.year,
            operation_name: payload.operation_name,
            operation_logo_url: payload.operation_logo_url,
          })
        : JSON.stringify(payload);

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Erro ao salvar placa." }));
        setPlateFormError(data.error || "Erro ao salvar placa.");
        return;
      }

      setEditingPlate(null);
      setPlateForm(INITIAL_PLATE_FORM);
      setIsPlateFormModalOpen(false);
      await loadPlates();
    } finally {
      setIsSavingPlate(false);
    }
  };

  const confirmDeletePlate = async () => {
    if (!deletePlateTarget) return;
    setIsDeletingPlate(true);
    try {
      const response = await fetch(`/api/admin/plates/${deletePlateTarget.plate}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Erro ao excluir placa." }));
        setPlateFormError(data.error || "Erro ao excluir placa.");
        return;
      }

      setDeletePlateTarget(null);
      await loadPlates();
    } finally {
      setIsDeletingPlate(false);
    }
  };

  const removeOperationsFromPlates = async () => {
    if (selectedPlatesForRemoval.size === 0) return;

    setIsRemovingOperations(true);
    try {
      const platesArray = Array.from(selectedPlatesForRemoval);

      const responses = await Promise.all(
        platesArray.map((plateNumber) => {
          const plateData = plates.find((p) => p.plate === plateNumber);

          return fetch(`/api/admin/plates/${plateNumber}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              model: plateData?.model,
              year: plateData?.year,
              operation_name: "SEM OPERACAO",
              operation_logo_url: "",
            }),
          });
        }),
      );

      const allOk = responses.every((res) => res.ok);
      if (!allOk) {
        const errorResponses = await Promise.all(
          responses.map((res) =>
            res.ok
              ? Promise.resolve(null)
              : res.json().catch(() => ({ error: "Erro desconhecido" })),
          ),
        );
        const errorMessage =
          errorResponses.find((err) => err)?.error ||
          "Erro ao remover operações de algumas placas.";
        setPlateFormError(errorMessage);
        return;
      }

      setSelectedPlatesForRemoval(new Set());
      setIsRemoveOperationMode(false);
      await loadPlates();
    } catch (error) {
      setPlateFormError("Erro ao remover operações.");
    } finally {
      setIsRemovingOperations(false);
    }
  };

  const filteredPlates = useMemo(() => {
    const query = plateSearch.trim().toLowerCase();
    if (!query) return plates;

    return plates.filter((plate) =>
      `${plate.plate} ${plate.model} ${plate.operation_name} ${plate.year}`
        .toLowerCase()
        .includes(query),
    );
  }, [plateSearch, plates]);

  const operationNames = useMemo(() => operations.map((operation) => operation.name), [operations]);

  const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

  const formattedDate = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const formattedTime = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const headerDateTime = `${capitalize(formattedDate).replace(
    / de ([a-zç]+)/,
    (_, month) => ` de ${capitalize(month)}`,
  )} | ${formattedTime}`;

  const toggleTvMode = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setTvMode(true);
      } else {
        await document.exitFullscreen();
        setTvMode(false);
      }
    } catch (error) {
      console.error("Erro ao alternar modo TV:", error);
    }
  };

  return (
    <>
      <header
        className={`relative w-full border-b border-slate-800 bg-background-dark/95 backdrop-blur-md sticky top-0 z-50 transition-all ${
          tvMode ? "shadow-2xl" : ""
        }`}
      >
        <div className="absolute inset-0 grid-pattern opacity-10 pointer-events-none"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none"></div>

        <div
          className={`relative z-10 w-full flex items-center justify-between transition-all ${
            tvMode ? "px-8 py-5" : "px-6 py-4"
          }`}
        >
          <div className={`flex items-center ${tvMode ? "gap-8" : "gap-6"}`}>
            <img
              alt="BWT Transporte Logo"
              className={tvMode ? "h-24 w-auto" : "h-24 w-auto"}
              src="images/logobwt.png"
              referrerPolicy="no-referrer"
            />

            <div className={tvMode ? "h-10 w-px bg-slate-700" : "h-8 w-px bg-slate-700"}></div>

            <div>
              <h1
                className={`tracking-tight text-white uppercase ${
                  tvMode ? "text-2xl font-black" : "text-xl font-bold"
                }`}
              >
                DASHBOARD OPERACIONAL - BWT
              </h1>
              <p
                className={`font-medium text-slate-400 tabular-nums uppercase tracking-widest ${
                  tvMode ? "text-sm" : "text-xs"
                }`}
              >
                {headerDateTime}
              </p>
            </div>
          </div>

          <div className={`flex items-center ${tvMode ? "gap-5" : "gap-4"}`}>
            <div
              role="status"
              aria-live="polite"
              title={
                syncStatus.success ? "Sincronização SIGHRA ativa" : "Sincronização SIGHRA com erro"
              }
              className={`flex items-center gap-2 rounded-lg border ${
                tvMode ? "px-4 py-2" : "px-3 py-1.5"
              } ${
                syncStatus.success
                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                  : "bg-rose-500/5 border-rose-500/20 text-rose-400"
              }`}
            >
              <div
                className={`rounded-full ${tvMode ? "size-2" : "size-1.5"} ${
                  syncStatus.success ? "bg-emerald-400 animate-pulse" : "bg-rose-400"
                }`}
              ></div>

              <div className="flex flex-col text-left">
                <span
                  className={`font-black uppercase tracking-widest leading-none mb-0.5 ${
                    tvMode ? "text-[10px]" : "text-[9px]"
                  }`}
                >
                  SIGHRA SYNC
                </span>
                <span
                  className={`font-bold opacity-70 leading-none ${
                    tvMode ? "text-[9px]" : "text-[8px]"
                  }`}
                >
                  {syncStatus.success
                    ? `ONLINE • ${syncStatus.vehicleCount} VEÍCULOS`
                    : `OFFLINE • Servidor indisponível`}
                </span>
              </div>
            </div>

            <div
              className={`flex items-center bg-slate-900/80 border border-slate-700/50 rounded-lg ${
                tvMode ? "p-1.5 mr-3" : "p-1 mr-2"
              }`}
            >
              <button
                onClick={() => setView("KANBAN")}
                className={`transition-colors font-black tracking-widest uppercase rounded-md ${
                  tvMode ? "px-5 py-2 text-xs" : "px-4 py-1.5 text-[10px]"
                } ${
                  view === "KANBAN"
                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                KANBAN
              </button>

              <button
                onClick={() => setView("MAPA")}
                className={`transition-colors font-black tracking-widest uppercase rounded-md ${
                  tvMode ? "px-5 py-2 text-xs" : "px-4 py-1.5 text-[10px]"
                } ${
                  view === "MAPA"
                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                MAPA
              </button>
            </div>

            <button
              onClick={toggleTvMode}
              className={`rounded-lg transition-colors text-white shadow-lg ${
                tvMode
                  ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
                  : "bg-primary hover:bg-primary/90 shadow-primary/20"
              } ${tvMode ? "p-3" : "p-2"}`}
              title={tvMode ? "Sair do modo TV" : "Ativar modo TV"}
            >
              <span className={`material-symbols-outlined ${tvMode ? "text-[26px]" : ""}`}>
                {tvMode ? "tv_off" : "tv"}
              </span>
            </button>

            {!tvMode && (
              <>
                {authUser.role === "ADMIN" && (
                  <>
                    <button
                      onClick={openPlateModal}
                      className="px-3 py-2 rounded-lg bg-cyan-600/80 hover:bg-cyan-600 text-xs font-bold uppercase"
                    >
                      Placas
                    </button>
                    <button
                      onClick={openUsersModal}
                      className="px-3 py-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-xs font-bold uppercase"
                    >
                      Usuários
                    </button>
                  </>
                )}

                <button
                  onClick={handleLogout}
                  className="px-3 py-2 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-xs font-bold uppercase"
                >
                  Logout
                </button>

                <div className="flex items-center gap-3 ml-4 border-l border-slate-700 pl-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-bold text-white">{authUser.name}</p>
                    <p className="text-[10px] text-slate-500 uppercase">{authUser.role}</p>
                  </div>

                  <div
                    className="size-10 rounded-full bg-slate-800 border border-slate-700 overflow-hidden bg-cover bg-center"
                    style={{
                      backgroundImage:
                        'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDWUGaaXV-eUYaWjPmpgWGdLAR4-GubcGbJNItw5JkBYklOmJahef50UKLi2wAX6JlhMQITj94X5YZu_ytXdChiXkpLCTKnRuoctWBIs1YqkhGbtdppAH_7dfgR_aWxGxQPw6M1E0i4yrcyMHCW1ZqHtfWtl-8zA3MjA1HGXQ67J9tClSM5eaRPshWgwONIBLKgyytS17HOoQPcAWAMYFjbSwSgD5j6EB5U6Sd4aDDy_jvSXo2eIs1wEbeWd1F1q80tnDg3qv66V0WY")',
                    }}
                  ></div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isUserModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeUsersModal}
            />

            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              className="relative w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                <h3 className="font-bold text-lg">Gestão de usuários</h3>
                <button onClick={closeUsersModal} className="p-2 rounded-lg hover:bg-slate-800">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="p-6 max-h-[70vh] overflow-y-auto space-y-3">
                <p className="text-xs text-slate-400">
                  O acesso é exclusivamente via SSO Orbital. Os usuários aparecem aqui após o
                  primeiro login. Use os botões para definir quem é administrador.
                </p>

                {usersError && <p className="text-sm text-rose-400">{usersError}</p>}

                <div className="space-y-2">
                  {isLoadingUsers ? (
                    <p className="text-slate-400 text-sm">Carregando usuários...</p>
                  ) : managedUsers.length === 0 ? (
                    <p className="text-slate-400 text-sm">Nenhum usuário cadastrado.</p>
                  ) : (
                    managedUsers.map((user) => {
                      const isSelf = user.id === authUser.id;
                      const isUpdating = updatingUserId === user.id;
                      const isAdmin = user.role === "ADMIN";
                      return (
                        <div
                          key={user.id}
                          className="border border-slate-700 rounded-lg p-3 flex items-center justify-between gap-3"
                        >
                          <div>
                            <p className="font-semibold">
                              {user.name}{" "}
                              <span
                                className={`text-xs font-bold uppercase ${
                                  isAdmin ? "text-cyan-300" : "text-slate-400"
                                }`}
                              >
                                ({user.role})
                              </span>
                            </p>
                            <p className="text-xs text-slate-400">
                              {user.email} • {user.active ? "Ativo" : "Inativo"}
                              {isSelf && " • você"}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="px-2 py-1 text-xs rounded bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => toggleUserRole(user)}
                              disabled={isSelf || isUpdating}
                              title={
                                isSelf ? "Você não pode alterar o seu próprio perfil" : undefined
                              }
                            >
                              {isAdmin ? "Rebaixar a usuário" : "Tornar admin"}
                            </button>
                            <button
                              className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => toggleUserActive(user)}
                              disabled={isSelf || isUpdating}
                              title={
                                isSelf ? "Você não pode desativar a sua própria conta" : undefined
                              }
                            >
                              {user.active ? "Desativar" : "Ativar"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPlateModalOpen && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePlateModal}
            />

            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              className="relative w-full max-w-7xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-700/90 bg-gradient-to-r from-cyan-500/10 via-slate-900 to-slate-900 flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-lg">Painel administrativo de placas</h3>
                  <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">
                    Gestão de frota por operação • pronto para filtro no Kanban
                  </p>
                </div>
                <button onClick={closePlateModal} className="p-2 rounded-lg hover:bg-slate-800">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                  <div className="relative w-full sm:max-w-md">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]">
                      search
                    </span>
                    <input
                      value={plateSearch}
                      onChange={(e) => setPlateSearch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-sm"
                      placeholder="Buscar placa, modelo ou operação..."
                    />
                  </div>

                  <div className="flex gap-2">
                    {isRemoveOperationMode ? (
                      <>
                        <button
                          onClick={() => {
                            setIsRemoveOperationMode(false);
                            setSelectedPlatesForRemoval(new Set());
                          }}
                          className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-sm font-bold uppercase tracking-wide"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={removeOperationsFromPlates}
                          disabled={selectedPlatesForRemoval.size === 0 || isRemovingOperations}
                          className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                          Remover ({selectedPlatesForRemoval.size})
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setIsRemoveOperationMode(true)}
                          className="px-4 py-2.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                          Remover operação
                        </button>
                        <button
                          onClick={openCreatePlateModal}
                          className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-sm font-bold uppercase tracking-wide flex items-center justify-center gap-2"
                        >
                          <span className="material-symbols-outlined text-[18px]">add</span>
                          Nova placa
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {plateFormError && <p className="text-sm text-rose-400">{plateFormError}</p>}

                <div className="border border-slate-700 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[50px_140px_1.3fr_90px_1fr_120px] gap-3 px-4 py-3 bg-slate-800/70 text-[11px] font-bold uppercase tracking-widest text-slate-300 text-center">
                    {isRemoveOperationMode && (
                      <div className="flex justify-center items-center">
                        <input
                          type="checkbox"
                          checked={
                            selectedPlatesForRemoval.size === filteredPlates.length &&
                            filteredPlates.length > 0
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPlatesForRemoval(
                                new Set(filteredPlates.map((p) => p.plate)),
                              );
                            } else {
                              setSelectedPlatesForRemoval(new Set());
                            }
                          }}
                          className="w-4 h-4 cursor-pointer"
                          title="Selecionar todas as placas"
                        />
                      </div>
                    )}
                    <span>Placa</span>
                    <span>Modelo</span>
                    <span>Ano</span>
                    <span>Operação</span>
                    {!isRemoveOperationMode && <span className="text-right">Ações</span>}
                  </div>

                  <div className="max-h-[56vh] overflow-y-auto custom-scrollbar bg-slate-900/70">
                    {filteredPlates.length === 0 ? (
                      <p className="px-4 py-8 text-center text-slate-400 text-sm">
                        Nenhuma placa encontrada para o filtro informado.
                      </p>
                    ) : (
                      filteredPlates.map((plate) => (
                        <div
                          key={plate.plate}
                          className={`grid gap-3 px-4 py-3 border-t border-slate-800 items-center justify-items-center text-center transition-colors ${
                            isRemoveOperationMode
                              ? "grid-cols-[50px_140px_1.3fr_90px_1fr_120px]"
                              : "grid-cols-[140px_1.3fr_90px_1fr_120px]"
                          } ${
                            isRemoveOperationMode && selectedPlatesForRemoval.has(plate.plate)
                              ? "bg-rose-500/10"
                              : "hover:bg-slate-800/40"
                          }`}
                        >
                          {isRemoveOperationMode && (
                            <input
                              type="checkbox"
                              checked={selectedPlatesForRemoval.has(plate.plate)}
                              onChange={(e) => {
                                const newSet = new Set(selectedPlatesForRemoval);
                                if (e.target.checked) {
                                  newSet.add(plate.plate);
                                } else {
                                  newSet.delete(plate.plate);
                                }
                                setSelectedPlatesForRemoval(newSet);
                              }}
                              className="w-4 h-4 cursor-pointer justify-self-center"
                            />
                          )}
                          <p className="font-black tracking-wider text-white">{plate.plate}</p>
                          <p className="text-sm text-slate-200 truncate">{plate.model}</p>
                          <p className="text-sm text-slate-300">{plate.year}</p>
                          <div className="flex items-center justify-center gap-2 min-w-0">
                            {plate.operation_logo_url ? (
                              <img
                                src={plate.operation_logo_url}
                                alt={`Logo ${plate.operation_name}`}
                                className="h-20 w-20 object-contain"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span className="h-7 w-7 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-500">
                                —
                              </span>
                            )}
                            <p className="text-sm text-slate-200 truncate">
                              {plate.operation_name}
                            </p>
                          </div>
                          {!isRemoveOperationMode && (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                                onClick={() => startEditPlate(plate)}
                                title="Editar placa"
                              >
                                <span className="material-symbols-outlined text-[17px]">edit</span>
                              </button>
                              <button
                                className="p-2 rounded-lg bg-rose-700/80 hover:bg-rose-700"
                                onClick={() => setDeletePlateTarget(plate)}
                                title="Excluir placa"
                              >
                                <span className="material-symbols-outlined text-[17px]">
                                  delete
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isPlateFormModalOpen && (
                  <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
                    <motion.div
                      className="absolute inset-0 bg-black/70"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={closePlateFormModal}
                    />
                    <motion.form
                      onSubmit={submitPlate}
                      initial={{ opacity: 0, scale: 0.96, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: 12 }}
                      className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4"
                    >
                      <h4 className="font-semibold text-white">
                        {editingPlate ? `Editar placa ${editingPlate}` : "Inserir nova placa"}
                      </h4>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <label className="text-sm text-slate-300 flex flex-col gap-1">
                          Placa
                          <input
                            disabled={!!editingPlate}
                            value={plateForm.plate}
                            onChange={(e) =>
                              setPlateForm((prev) => ({ ...prev, plate: e.target.value }))
                            }
                            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 disabled:opacity-60"
                            placeholder="ABC1D23"
                          />
                        </label>
                        <label className="text-sm text-slate-300 flex flex-col gap-1">
                          Ano
                          <input
                            type="number"
                            value={plateForm.year}
                            onChange={(e) =>
                              setPlateForm((prev) => ({ ...prev, year: e.target.value }))
                            }
                            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                          />
                        </label>
                        <label className="text-sm text-slate-300 flex flex-col gap-1 sm:col-span-2">
                          Modelo
                          <input
                            value={plateForm.model}
                            onChange={(e) =>
                              setPlateForm((prev) => ({ ...prev, model: e.target.value }))
                            }
                            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                            placeholder="DAF/XF FTT 530"
                          />
                        </label>
                        <label className="text-sm text-slate-300 flex flex-col gap-1 sm:col-span-2">
                          Operação dedicada
                          <div className="relative">
                            <input
                              type="text"
                              value={plateForm.operation_name}
                              onChange={(e) => {
                                setPlateForm((prev) => ({
                                  ...prev,
                                  operation_name: e.target.value,
                                }));
                                setIsOperationDropdownOpen(true);
                              }}
                              onFocus={() => setIsOperationDropdownOpen(true)}
                              onBlur={() =>
                                setTimeout(() => setIsOperationDropdownOpen(false), 200)
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                              placeholder="IPIRANGA - SANPLN"
                            />
                            {isOperationDropdownOpen && operationNames.length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-950 border border-slate-700 rounded-lg shadow-lg z-[300] max-h-64 overflow-y-auto">
                                {operationNames
                                  .filter((name) =>
                                    name
                                      .toLowerCase()
                                      .includes(plateForm.operation_name.toLowerCase()),
                                  )
                                  .map((operationName) => (
                                    <button
                                      key={operationName}
                                      type="button"
                                      onClick={() => {
                                        applyOperationSelection(operationName);
                                        setIsOperationDropdownOpen(false);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors text-sm text-slate-200 border-b border-slate-800 last:border-b-0"
                                    >
                                      {operationName}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500">
                            Clique ou digite para selecionar uma operação.
                          </span>
                        </label>
                        <label className="text-sm text-slate-300 flex flex-col gap-1 sm:col-span-2">
                          URL da logo da operação
                          <input
                            value={plateForm.operation_logo_url}
                            onChange={(e) =>
                              setPlateForm((prev) => ({
                                ...prev,
                                operation_logo_url: e.target.value,
                              }))
                            }
                            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2"
                            placeholder="https://..."
                          />
                        </label>
                      </div>

                      {plateFormError && <p className="text-sm text-rose-400">{plateFormError}</p>}

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={closePlateFormModal}
                          className="px-3 py-2 rounded-lg bg-slate-700 text-sm"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={isSavingPlate}
                          className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-sm font-semibold disabled:opacity-60"
                        >
                          {isSavingPlate
                            ? "Salvando..."
                            : editingPlate
                              ? "Salvar alterações"
                              : "Adicionar placa"}
                        </button>
                      </div>
                    </motion.form>
                  </div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {deletePlateTarget && (
                  <div className="fixed inset-0 z-[225] flex items-center justify-center p-4">
                    <motion.div
                      className="absolute inset-0 bg-black/75"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setDeletePlateTarget(null)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96, y: 12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: 12 }}
                      className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4"
                    >
                      <h4 className="font-semibold text-white">
                        Excluir placa {deletePlateTarget.plate}?
                      </h4>
                      <p className="text-sm text-slate-300">
                        Essa ação remove o vínculo da placa com a operação. Deseja continuar?
                      </p>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setDeletePlateTarget(null)}
                          className="px-3 py-2 rounded-lg bg-slate-700 text-sm"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={confirmDeletePlate}
                          disabled={isDeletingPlate}
                          className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm font-semibold disabled:opacity-60"
                        >
                          {isDeletingPlate ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
