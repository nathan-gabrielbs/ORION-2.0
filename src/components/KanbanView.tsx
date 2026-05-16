import {
  useMemo,
  useState,
  FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  CSSProperties,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { Vehicle } from "../types";
import { KPISection } from "./KPISection";

interface Props {
  vehicles: Vehicle[];
  tvMode?: boolean;
  plateFilter?: string;
}

interface RasterTripDetails {
  plate: string;
  statusViagem: string;
  statusViagemLabel?: string;
  dataHoraPrevIni?: string | null;
  dataHoraPrevFim?: string | null;
  dataHoraRealIni?: string | null;
  dentroPrazo?: string;
  percentualAtraso?: number;
  velocidadeMedia?: number;
  tempoTotalViagem?: number;
  percentualMovimentando?: number;
  tempoMovimentando?: number;
  tempoParado?: number;
  carreta1?: string | null;
  carreta2?: string | null;
  cnpjClienteOrig?: string | null;
  cnpjClienteDest?: string | null;
  clienteOrigemNome?: string;
  clienteDestinoNome?: string;
  progressoPercorrido?: number | null;
  kmPercorridoEntrega?: number;
  kmRestanteEntrega?: number;
  distanciaRota?: number;
  linkTimeLine?: string | null;
  stops: Array<{
    ordem: number;
    tipo: string;
    cidade: string;
    percentualPercorrido?: number | null;
    kmPercorridoEntrega?: number;
    kmRestanteEntrega?: number;
    distanciaRota?: number;
  }>;
}

const COLUMNS = [
  {
    id: "AGUARD./EFET. CARREGAMENTO",
    label: "Carregando",
    color: "bg-amber-500",
    countColor: "bg-amber-500/20 text-amber-500",
  },
  {
    id: "EM TRÂNSITO",
    label: "Em Trânsito",
    color: "bg-primary",
    countColor: "bg-primary/20 text-primary",
  },
  {
    id: "AGUARD./EFET. DESCARREGAMENTO",
    label: "Descarregando",
    color: "bg-[#8b5cf6]",
    countColor: "bg-[#8b5cf6]/20 text-[#8b5cf6]",
  },
  {
    id: "VEÍCULO VAZIO",
    label: "Veículo Vazio",
    color: "bg-cyan-400",
    countColor: "bg-cyan-400/20 text-cyan-400",
  },
  {
    id: "EM MANUTENÇÃO",
    label: "Em Manutenção",
    color: "bg-rose-500",
    countColor: "bg-rose-500/20 text-rose-500",
  },
] as const;

function normalizeStatus(status?: string | null) {
  return String(status || "").trim().toUpperCase();
}

function isLoadingStatus(status?: string | null) {
  const s = normalizeStatus(status);
  return s === "AGUARDANDO CARREGAMENTO" || s === "EFETUANDO CARREGAMENTO";
}

function isUnloadingStatus(status?: string | null) {
  const s = normalizeStatus(status);
  return s === "AGUARDANDO DESCARREGAMENTO" || s === "EFETUANDO DESCARREGAMENTO";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sem horário";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeLocalInput(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}


function shouldShowRouteDetails(status?: string | null) {
  const normalized = normalizeStatus(status);
  return (
    normalized === "EM TRÂNSITO" ||
    normalized === "VEÍCULO VAZIO" ||
    isLoadingStatus(normalized) ||
    isUnloadingStatus(normalized)
  );
}

function getRouteProgress(progress?: number | null) {
  const parsed = Number(progress);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
}

function getRouteDistance(kmPercorrido?: number | null, kmRestante?: number | null, distanciaRota?: number | null) {
  const parsedDistance = Number(distanciaRota);
  if (Number.isFinite(parsedDistance) && parsedDistance > 0) {
    return parsedDistance;
  }

  const traveled = Number(kmPercorrido);
  const remaining = Number(kmRestante);

  const safeTraveled = Number.isFinite(traveled) ? traveled : 0;
  const safeRemaining = Number.isFinite(remaining) ? remaining : 0;

  return safeTraveled + safeRemaining;
}

function formatDriverName(value?: string | null) {
  const normalized = String(value || "")
    .replace(/\s*-\s*\d+\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return normalized || "Motorista não identificado";
}

function getStatusViagemLabel(details?: RasterTripDetails | null) {
  if (!details) return "-";
  if (details.statusViagemLabel) return details.statusViagemLabel;

  const code = String(details.statusViagem || "").trim().toUpperCase();
  if (code === "L") return "Lançada";
  if (code === "I") return "Iniciada";
  if (code === "F") return "Finalizada";
  if (code === "C") return "Cancelada";
  return code || "-";
}

function isRecentlyFinishedMaintenance(
  finishedAt?: string | null,
  maintenanceExpiresAt?: string | null
) {
  if (!finishedAt) return false;

  const now = Date.now();
  const expiresAt = maintenanceExpiresAt ? new Date(maintenanceExpiresAt) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime())) {
    return now < expiresAt.getTime();
  }

  const finishedAtDate = new Date(finishedAt);
  if (Number.isNaN(finishedAtDate.getTime())) return false;

  const diffMs = now - finishedAtDate.getTime();
  return diffMs <= 24 * 60 * 60 * 1000;
}

function isMaintenanceCard(vehicle: Vehicle) {
  return (
    normalizeStatus(vehicle.status) === "EM MANUTENÇÃO" ||
    isRecentlyFinishedMaintenance(vehicle.maintenance_finished_at, vehicle.maintenance_expires_at)
  );
}

function hasRasterTrip(vehicle: Vehicle) {
  if (!vehicle) return false;

  return !!(
    vehicle.route_timeline_link ||
    vehicle.route_origin ||
    vehicle.route_destination ||
    vehicle.route_progress_percent != null
  );
}

function sortColumnVehiclesByRasterTrip(vehicles: Vehicle[]) {
  return [...vehicles].sort((a, b) => {
    const aHasTrip = hasRasterTrip(a);
    const bHasTrip = hasRasterTrip(b);

    if (aHasTrip !== bHasTrip) {
      return aHasTrip ? -1 : 1;
    }

    return String(a.plate || "").localeCompare(String(b.plate || ""), "pt-BR");
  });
}

function getMaintenanceColumnVehicles(vehicles: Vehicle[]) {
  const maintenanceVehicles = vehicles.filter((v) => {
    return (
      normalizeStatus(v.status) === "EM MANUTENÇÃO" ||
      isRecentlyFinishedMaintenance(v.maintenance_finished_at, v.maintenance_expires_at)
    );
  });

  return [...maintenanceVehicles].sort((a, b) => {
    const aIsFinished = !!a.maintenance_finished_at;
    const bIsFinished = !!b.maintenance_finished_at;

    if (aIsFinished !== bIsFinished) {
      return aIsFinished ? 1 : -1;
    }

    const aHasTrip = hasRasterTrip(a);
    const bHasTrip = hasRasterTrip(b);

    if (aHasTrip !== bHasTrip) {
      return aHasTrip ? -1 : 1;
    }

    const aTime = aIsFinished
      ? new Date(a.maintenance_finished_at || 0).getTime()
      : new Date(a.maintenance_prev_date || 0).getTime();
    const bTime = bIsFinished
      ? new Date(b.maintenance_finished_at || 0).getTime()
      : new Date(b.maintenance_prev_date || 0).getTime();

    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return bTime - aTime;
    }

    return String(a.plate || "").localeCompare(String(b.plate || ""), "pt-BR");
  });
}

function getColumnVehicles(vehicles: Vehicle[], columnId: string) {
  if (columnId === "EM MANUTENÇÃO") {
    return getMaintenanceColumnVehicles(vehicles);
  }

  const filteredVehicles = vehicles.filter((v) => {
    if (!v) return false;

    const status = normalizeStatus(v.status);

    if (columnId === "AGUARD./EFET. CARREGAMENTO") {
      return isLoadingStatus(status);
    }

    if (columnId === "AGUARD./EFET. DESCARREGAMENTO") {
      return isUnloadingStatus(status);
    }

    return status === columnId;
  });

  return sortColumnVehiclesByRasterTrip(filteredVehicles);
}

function getVehicleOperationalBadge(status?: string | null) {
  const s = normalizeStatus(status);

  if (s === "EM TRÂNSITO") {
    return {
      label: "EM VIAGEM",
      icon: "navigation",
      className: "text-emerald-400",
    };
  }

  if (s === "AGUARDANDO CARREGAMENTO") {
    return {
      label: "FILA CARGA",
      icon: "schedule",
      className: "text-amber-400",
    };
  }

  if (s === "EFETUANDO CARREGAMENTO") {
    return {
      label: "CARREGANDO",
      icon: "local_shipping",
      className: "text-orange-400",
    };
  }

  if (s === "AGUARDANDO DESCARREGAMENTO") {
    return {
      label: "FILA DESCARGA",
      icon: "schedule",
      className: "text-violet-400",
    };
  }

  if (s === "EFETUANDO DESCARREGAMENTO") {
    return {
      label: "DESCARREGANDO",
      icon: "inventory_2",
      className: "text-fuchsia-400",
    };
  }

  if (s === "VEÍCULO VAZIO") {
    return {
      label: "VAZIO",
      icon: "check_circle",
      className: "text-cyan-400",
    };
  }

  if (s === "EM MANUTENÇÃO") {
    return {
      label: "MANUTENÇÃO",
      icon: "build",
      className: "text-rose-400",
    };
  }

  return null;
}

function getColumnBadge(columnId: string) {
  if (columnId === "EM MANUTENÇÃO") {
    return {
      label: "MANUTENÇÃO",
      icon: "build",
      className: "text-rose-400",
    };
  }

  if (columnId === "EM TRÂNSITO") {
    return {
      label: "EM VIAGEM",
      icon: "navigation",
      className: "text-emerald-400",
    };
  }

  if (columnId === "AGUARD./EFET. CARREGAMENTO") {
    return {
      label: "CARGA",
      icon: "local_shipping",
      className: "text-amber-400",
    };
  }

  if (columnId === "AGUARD./EFET. DESCARREGAMENTO") {
    return {
      label: "DESCARGA",
      icon: "inventory_2",
      className: "text-violet-400",
    };
  }

  return {
    label: "VAZIO",
    icon: "check_circle",
    className: "text-cyan-400",
  };
}

function getCardBorderClass(columnId: string) {
  if (columnId === "EM TRÂNSITO") return "border-t-primary";
  if (columnId === "AGUARD./EFET. CARREGAMENTO") return "border-t-amber-500";
  if (columnId === "AGUARD./EFET. DESCARREGAMENTO") return "border-t-[#8b5cf6]";
  if (columnId === "VEÍCULO VAZIO") return "border-t-cyan-400 border-dashed";
  return "border-t-rose-500";
}

function getTvAutoScrollThreshold() {
  if (typeof window === "undefined") return 3;

  const viewportHeight = window.innerHeight;

  if (viewportHeight <= 800) return 2;
  if (viewportHeight <= 980) return 3;
  return 3;
}

function shouldAutoScroll(cardsCount: number, tvMode?: boolean) {
  if (!tvMode) return false;

  return cardsCount >= getTvAutoScrollThreshold();
}

function AutoScrollColumn({
  children,
  enabled,
  tvMode,
}: {
  children: ReactNode;
  enabled: boolean;
  tvMode: boolean;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [duration, setDuration] = useState(56);
  const [scrollDistance, setScrollDistance] = useState(0);

  useLayoutEffect(() => {
    if (!enabled || !contentRef.current) return;

    const SPEED_PX_PER_SEC = 40;
    const totalHeight = contentRef.current.scrollHeight;
    const singleLoopDistance = totalHeight / 2;

    setScrollDistance(singleLoopDistance);
    setDuration(singleLoopDistance / SPEED_PX_PER_SEC);
  }, [children, enabled]);

  return (
    <div
      className={`relative min-h-0 ${tvMode
        ? `h-auto rounded-2xl ${enabled ? "overflow-hidden tv-scroll-mask" : "overflow-y-auto custom-scrollbar"
        }`
        : "h-auto overflow-y-auto custom-scrollbar pr-1"
        }`}
    >
      <div
        ref={contentRef}
        className={`${enabled ? "tv-kanban-scroll" : ""}`}
        style={
          enabled
            ? ({
              ["--scroll-duration" as any]: `${duration}s`,
              ["--scroll-distance" as any]: `-${scrollDistance}px`,
            } as CSSProperties)
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

export function KanbanView({ vehicles, tvMode = false, plateFilter = "" }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlate, setEditingPlate] = useState<string | null>(null);
  const [newMaintenance, setNewMaintenance] = useState({
    plate: "",
    driver: "",
    reason: "",
    location: "",
    forecast: "",
  });

  const [selectedObservationVehicle, setSelectedObservationVehicle] = useState<Vehicle | null>(null);
  const [observationText, setObservationText] = useState("");
  const [activeCardActionsPlate, setActiveCardActionsPlate] = useState<string | null>(null);
  const [selectedTripVehicle, setSelectedTripVehicle] = useState<Vehicle | null>(null);
  const [tripDetails, setTripDetails] = useState<RasterTripDetails | null>(null);
  const [tripDetailsLoading, setTripDetailsLoading] = useState(false);
  const [tripDetailsError, setTripDetailsError] = useState<string | null>(null);

  const availableVehicles = useMemo(() => {
    return [...vehicles]
      .filter((v) => !editingPlate || v.plate === editingPlate)
      .filter((v) => !plateFilter || v.plate.toUpperCase().includes(plateFilter))
      .sort((a, b) => a.plate.localeCompare(b.plate))
      .map((v) => ({
        plate: v.plate,
        driver: v.driver || "",
        status: v.status || "",
        location: v.location_name || "",
      }));
  }, [vehicles, editingPlate, plateFilter]);

  const grouped = useMemo(() => {
    const filtered = plateFilter
      ? vehicles.filter((v) => v.plate.toUpperCase().includes(plateFilter))
      : vehicles;

    return {
      emTransito: filtered.filter((v) => normalizeStatus(v.status) === "EM TRÂNSITO"),
      carregamento: filtered.filter((v) => isLoadingStatus(v.status)),
      descarregamento: filtered.filter((v) => isUnloadingStatus(v.status)),
      vazio: filtered.filter((v) => normalizeStatus(v.status) === "VEÍCULO VAZIO"),
      manutencao: filtered.filter((v) => normalizeStatus(v.status) === "EM MANUTENÇÃO"),
    };
  }, [vehicles, plateFilter]);

  const groupedAll = useMemo(() => {
    return {
      emTransito: vehicles.filter((v) => normalizeStatus(v.status) === "EM TRÂNSITO"),
      carregamento: vehicles.filter((v) => isLoadingStatus(v.status)),
      descarregamento: vehicles.filter((v) => isUnloadingStatus(v.status)),
      vazio: vehicles.filter((v) => normalizeStatus(v.status) === "VEÍCULO VAZIO"),
      manutencao: vehicles.filter((v) => normalizeStatus(v.status) === "EM MANUTENÇÃO"),
    };
  }, [vehicles]);

  const operationalCount =
    groupedAll.emTransito.length +
    groupedAll.carregamento.length +
    groupedAll.descarregamento.length;

  const localEfficiency = vehicles.length
    ? Math.round((operationalCount / vehicles.length) * 100)
    : 0;

  const [startOfDayEfficiency, setStartOfDayEfficiency] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchStartOfDayEfficiency = async () => {
      try {
        const response = await fetch("/api/efficiency/start-of-day");

        if (!response.ok) {
          throw new Error("Falha ao buscar eficiência do início do dia");
        }

        const startOfDayData = await response.json();

        if (cancelled) return;

        const startOfDayValue = Number(startOfDayData?.efficiency);
        setStartOfDayEfficiency(Number.isFinite(startOfDayValue) ? startOfDayValue : null);
      } catch (error) {
        if (!cancelled) {
          console.error("Erro ao carregar eficiência do início do dia", error);
        }
      }
    };

    fetchStartOfDayEfficiency();
    const timer = window.setInterval(fetchStartOfDayEfficiency, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const efficiency = localEfficiency;
  const baselineEfficiency = startOfDayEfficiency ?? efficiency;
  const efficiencyDelta = +(efficiency - baselineEfficiency).toFixed(1);

  const stats = {
    total: vehicles.length,
    inOperation: operationalCount,
    emptyVehicle: grouped.vazio.length,
    inMaintenance: grouped.manutencao.length,
    transit: grouped.emTransito.length,
    loading: grouped.carregamento.length,
    unloading: grouped.descarregamento.length,
    efficiency,
    efficiencyDelta,
    startOfDayEfficiency: baselineEfficiency,
  };

  const resetMaintenanceForm = () => {
    setEditingPlate(null);
    setNewMaintenance({
      plate: "",
      driver: "",
      reason: "",
      location: "",
      forecast: "",
    });
  };

  const handleOpenNewMaintenance = () => {
    resetMaintenanceForm();
    setIsModalOpen(true);
  };

  const handleSelectPlate = (plate: string) => {
    const selectedVehicle = vehicles.find((v) => v.plate === plate);

    setNewMaintenance((prev) => ({
      ...prev,
      plate,
      driver: selectedVehicle?.driver || "",
      location: selectedVehicle?.location_name || prev.location,
    }));
  };

  const handleAddMaintenance = async (e: FormEvent) => {
    e.preventDefault();

    try {
      const isEditing = !!editingPlate;
      const plate = editingPlate || newMaintenance.plate;

      const response = await fetch(`/api/vehicles/${plate}/maintenance`, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newMaintenance,
          plate,
        }),
      });

      if (response.ok) {
        setIsModalOpen(false);
        resetMaintenanceForm();
      }
    } catch (error) {
      console.error("Error saving maintenance:", error);
    }
  };

  const handleFinishMaintenance = async (vehicle: Vehicle) => {
    try {
      const response = await fetch(`/api/vehicles/${vehicle.plate}/maintenance/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: vehicle.maintenance_reason || null,
          location: vehicle.location_name || null,
          forecast: vehicle.maintenance_prev_date || vehicle.maintenance_expires_at || null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Erro ao finalizar manutenção");
      }
    } catch (error) {
      console.error("Error finishing maintenance:", error);
    }
  };

  const handleDeleteMaintenance = async (plate: string) => {
    try {
      await fetch(`/api/vehicles/${plate}/maintenance`, {
        method: "DELETE",
      });
    } catch (error) {
      console.error("Error deleting maintenance:", error);
    }
  };

  const handleEditMaintenance = (vehicle: Vehicle) => {
    setEditingPlate(vehicle.plate);
    setNewMaintenance({
      plate: vehicle.plate,
      driver: vehicle.driver || "",
      reason: vehicle.maintenance_reason || "",
      location: vehicle.location_name || "",
      forecast: formatDateTimeLocalInput(vehicle.maintenance_prev_date),
    });
    setIsModalOpen(true);
  };

  const handleToggleCardActions = (vehicle: Vehicle) => {
    if (tvMode) return;
    setActiveCardActionsPlate((prev) => (prev === vehicle.plate ? null : vehicle.plate));
  };

  const handleOpenObservationPanel = (vehicle: Vehicle) => {
    if (tvMode) return;
    setActiveCardActionsPlate(null);
    setSelectedObservationVehicle(vehicle);
    setObservationText(vehicle.observation || "");
  };

  const handleOpenTripPanel = async (vehicle: Vehicle) => {
    if (tvMode) return;

    setActiveCardActionsPlate(null);
    setSelectedTripVehicle(vehicle);
    setTripDetails(null);
    setTripDetailsError(null);
    setTripDetailsLoading(true);

    try {
      const response = await fetch(`/api/vehicles/${vehicle.plate}/raster-trip`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível carregar os detalhes da viagem");
      }

      setTripDetails(data);
    } catch (error: any) {
      setTripDetailsError(error?.message || "Erro ao carregar detalhes da viagem");
    } finally {
      setTripDetailsLoading(false);
    }
  };

  const handleOpenRoute = (vehicle: Vehicle) => {
    if (tvMode) return;
    if (!vehicle.route_timeline_link) return;
    window.open(vehicle.route_timeline_link, "_blank", "noopener,noreferrer");
    setActiveCardActionsPlate(null);
  };

  const handleCloseObservationPanel = () => {
    setSelectedObservationVehicle(null);
    setObservationText("");
  };

  const handleCloseTripPanel = () => {
    setSelectedTripVehicle(null);
    setTripDetails(null);
    setTripDetailsError(null);
    setTripDetailsLoading(false);
  };

  const handleSaveObservation = async (e: FormEvent) => {
    e.preventDefault();

    if (!selectedObservationVehicle) return;

    try {
      const response = await fetch(`/api/vehicles/${selectedObservationVehicle.plate}/observation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observation: observationText }),
      });

      if (response.ok) {
        handleCloseObservationPanel();
      }
    } catch (error) {
      console.error("Error saving observation:", error);
    }
  };

  const handleDeleteObservation = async () => {
    if (!selectedObservationVehicle) return;

    try {
      const response = await fetch(`/api/vehicles/${selectedObservationVehicle.plate}/observation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observation: null }),
      });

      if (response.ok) {
        handleCloseObservationPanel();
      }
    } catch (error) {
      console.error("Error deleting observation:", error);
    }
  };

  return (
    <div className={tvMode ? "space-y-[clamp(1rem,2vh,2.5rem)] origin-top" : "space-y-8"}>
      <KPISection stats={stats} />

      <div className="w-full overflow-x-auto pb-2">
        <div
          className={`grid w-full min-w-full ${tvMode
            ? "gap-[clamp(0.75rem,1.4vw,2rem)] auto-cols-[minmax(15rem,1fr)] grid-flow-col lg:grid-flow-row lg:grid-cols-5"
            : "gap-3 sm:gap-4 lg:gap-6 auto-cols-[minmax(12rem,1fr)] grid-flow-col md:grid-flow-row md:grid-cols-2 xl:grid-cols-5"
            }`}
        >
          {COLUMNS.map((col) => {
            const colVehicles = getColumnVehicles(vehicles, col.id);
            const autoScroll = shouldAutoScroll(colVehicles.length, tvMode);
            const renderVehicles = autoScroll ? [...colVehicles, ...colVehicles] : colVehicles;

            return (
              <div key={col.id} className="flex flex-col gap-3 sm:gap-4 min-h-0">
                <div className={`flex items-center justify-between ${tvMode ? "px-3" : "px-2"}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`rounded-full ${col.color} animate-pulse ${tvMode ? "size-3" : "size-2"} shrink-0`}
                    />
                    <h2
                      className={`${tvMode ? "text-sm" : "text-sm"} font-bold uppercase tracking-widest text-white whitespace-normal`}
                    >
                      {col.label}
                    </h2>
                    <span
                      className={`${col.countColor} ${tvMode ? "text-xs px-2.5 py-1" : "text-[15px] px-2 py-0.5"
                        } font-bold rounded-full`}
                    >
                      {col.id === "EM MANUTENÇÃO"
                        ? vehicles.filter((v) => normalizeStatus(v.status) === "EM MANUTENÇÃO").length
                        : colVehicles.length}
                    </span>
                  </div>

                  {!tvMode && (
                    <div className="flex items-center gap-1">
                      {col.id === "EM MANUTENÇÃO" && (
                        <button
                          onClick={handleOpenNewMaintenance}
                          className="size-6 bg-rose-500 rounded flex items-center justify-center text-white hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/20"
                        >
                          <span className="material-symbols-outlined text-sm font-black">add</span>
                        </button>
                      )}

                      <button className="text-slate-500 hover:text-white transition-colors flex items-center justify-center">
                        <span className="material-symbols-outlined text-lg">more_horiz</span>
                      </button>
                    </div>
                  )}
                </div>

                <AutoScrollColumn enabled={autoScroll} tvMode={tvMode}>
                  <div className={`grid grid-cols-1 min-[480px]:grid-cols-2 ${tvMode ? "gap-4" : "gap-3"}`}>
                    {renderVehicles.map((vehicle, index) => {
                      const columnBadge = getColumnBadge(col.id);
                      const realStatusBadge = getVehicleOperationalBadge(vehicle.status);
                      const isMaintenanceColumn = col.id === "EM MANUTENÇÃO";
                      const isFinishedMaintenanceCard = isMaintenanceColumn && !!vehicle.maintenance_finished_at;

                      return (
                        <motion.div
                          key={autoScroll ? `${vehicle.plate}-${index}` : vehicle.plate}
                          layout={!tvMode}
                          onClick={() => handleToggleCardActions(vehicle)}
                          className={`kanban-card relative h-auto min-h-0 bg-card-dark rounded-xl border border-slate-800/50 inner-glow shadow-xl border-t-2 ${tvMode
                            ? "p-5 cursor-default"
                            : "p-4 cursor-pointer"
                            } ${getCardBorderClass(col.id)}`}
                        >
                          {vehicle.fleet_operation_logo_url && (
                            <img
                              src={vehicle.fleet_operation_logo_url}
                              alt={vehicle.fleet_operation_name || "Logo da operação"}
                              className={`absolute top-0 right-2 z-10 z-10 object-contain ${tvMode ? "h-16 w-16" : "h-16 w-16"}`}
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <div className={`kanban-card-content ${activeCardActionsPlate === vehicle.plate ? "blur-[2px] opacity-30" : ""} transition-all`}>
                            <div className="mb-3">
                              <span
                                className={`font-bold flex items-center gap-1 ${columnBadge.className} ${tvMode ? "text-[10px]" : "text-[12px]"
                                  }`}
                              >
                                <span
                                  className={`material-symbols-outlined ${tvMode ? "text-[14px]" : "text-[12px]"
                                    }`}
                                >
                                  {columnBadge.icon}
                                </span>
                                {columnBadge.label}
                              </span>

                              <span
                                className={`mt-2 inline-flex font-black text-white bg-slate-800 rounded-md tracking-[0.08em] leading-none ${tvMode ? "text-lg px-3 py-2" : "text-base px-2.5 py-1.5"
                                  }`}
                              >
                                {vehicle.plate}
                              </span>
                            </div>

                            <p
                              className={`${tvMode ? "text-sm mb-2" : "text-sm mb-1"} font-bold text-slate-100 leading-tight`}
                            >
                              {formatDriverName(vehicle.driver)}
                            </p>

                            {col.id === "EM MANUTENÇÃO" &&
                              realStatusBadge &&
                              normalizeStatus(vehicle.status) !== "EM MANUTENÇÃO" && (
                                <div className="mb-3">
                                  <span
                                    className={`font-bold flex items-center gap-1 ${realStatusBadge.className} ${tvMode ? "text-[10px]" : "text-[9px]"
                                      }`}
                                  >
                                    <span
                                      className={`material-symbols-outlined ${tvMode ? "text-[14px]" : "text-[12px]"
                                        }`}
                                    >
                                      {realStatusBadge.icon}
                                    </span>
                                    STATUS ATUAL: {realStatusBadge.label}
                                  </span>
                                </div>
                              )}

                            <div className={`space-y-2 ${tvMode ? "mt-4" : "mt-3"}`}>
                              <div
                                className={`flex items-center gap-2 text-slate-400 ${tvMode ? "text-xs" : "text-[12px]"
                                  }`}
                              >
                                <span
                                  className={`material-symbols-outlined text-slate-500 shrink-0 ${tvMode ? "text-[16px]" : "text-[14px]"
                                    }`}
                                >
                                  speed
                                </span>
                                <span>{vehicle.speed || 0} km/h</span>
                              </div>

                              <div
                                className={`flex items-start gap-2 text-slate-400 ${tvMode ? "text-xs" : "text-[12px]"}
`}
                              >
                                <span
                                  className={`material-symbols-outlined text-slate-500 shrink-0 ${tvMode ? "text-[16px]" : "text-[14px]"}
    `}
                                >
                                  location_on
                                </span>
                                <span className="leading-relaxed">
                                  {col.id === "EM MANUTENÇÃO" && vehicle.maintenance_finished_at
                                    ? (vehicle.maintenance_history_location || vehicle.location_name || "Não informado")
                                    : (vehicle.location_name || "Não informado")}
                                </span>
                              </div>

                              {shouldShowRouteDetails(vehicle.status) && !isFinishedMaintenanceCard && (vehicle.route_origin || vehicle.route_destination || vehicle.route_progress_percent != null) && (
                                <div className={`rounded-lg border border-slate-800 bg-slate-900/60 ${tvMode ? "mt-3 p-3" : "mt-2 p-2"}`}>
                                  <div className={`space-y-1.5 ${tvMode ? "text-xs" : "text-[12px]"}`}>
                                    <div className="flex flex-col items-center text-center gap-1 min-w-0">
                                      <div className="min-w-0">
                                        <p className="text-slate-500 uppercase font-black tracking-widest text-[10px] flex items-center justify-center gap-1">
                                          Origem
                                        </p>
                                        <p className="text-slate-200 font-bold leading-tight break-words">
                                          {vehicle.route_origin || "Origem não informada"}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="h-px w-full bg-slate-800/80" />

                                    <div className="flex flex-col items-center text-center gap-1 min-w-0">
                                      <div className="min-w-0">
                                        <p className="text-slate-500 uppercase font-black tracking-widest text-[10px] flex items-center justify-center gap-1">
                                          Destino
                                        </p>
                                        <p className="text-slate-200 font-bold leading-tight break-words">
                                          {vehicle.route_destination || "Destino não informado"}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-2">
                                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${col.color}`}
                                        style={{ width: `${getRouteProgress(vehicle.route_progress_percent)}%` }}
                                      />
                                    </div>
                                    <p className={`${tvMode ? "text-[10px]" : "text-[12px]"} text-slate-400 mt-1 text-center`}>
                                      {getRouteProgress(vehicle.route_progress_percent).toFixed(1)}% percorrido
                                    </p>
                                  </div>
                                </div>
                              )}

                              {((!isMaintenanceColumn && vehicle.last_operational_macro) || vehicle.observation) && (
                                <div
                                  className={`rounded-lg bg-slate-900/80 border border-slate-800 ${tvMode ? "mt-4 p-3" : "mt-3 p-2"
                                    }`}
                                >
                                  {!isMaintenanceColumn && (
                                    <>
                                      <p
                                        className={`text-slate-500 uppercase font-black tracking-widest mb-1 ${tvMode ? "text-[10px]" : "text-[10px]"
                                          }`}
                                      >
                                        Última macro operacional
                                      </p>
                                      <p
                                        className={`font-bold ${vehicle.last_operational_macro ? "text-slate-200" : "text-slate-500"} leading-snug ${tvMode ? "text-xs" : "text-[10px]"
                                          }`}
                                      >
                                        {vehicle.last_operational_macro || "Sem macro operacional"}
                                      </p>
                                      {vehicle.last_operational_macro && (
                                        <p
                                          className={`text-slate-400 mt-1 ${tvMode ? "text-[12px]" : "text-[12px]"
                                            }`}
                                        >
                                          {formatDateTime(vehicle.last_operational_macro_time)}
                                        </p>
                                      )}
                                    </>
                                  )}

                                  {vehicle.observation && (
                                    <div className={`mt-2 pt-2 ${!isMaintenanceColumn && vehicle.last_operational_macro ? "border-t border-slate-800" : ""}`}>
                                      <p
                                        className={`text-slate-500 uppercase font-black tracking-widest mb-1 ${tvMode ? "text-[10px]" : "text-[9px]"
                                          }`}
                                      >
                                        Observação
                                      </p>
                                      <p
                                        className={`text-slate-300 leading-snug ${tvMode ? "text-xs" : "text-[10px]"
                                          }`}
                                      >
                                        {vehicle.observation}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {col.id === "EM MANUTENÇÃO" && isMaintenanceCard(vehicle) && (
                                <div className={`${tvMode ? "mt-4 space-y-3" : "mt-3 space-y-2"}`}>
                                  <div className="flex justify-between items-end">
                                    <div>
                                      <p
                                        className={`text-slate-500 uppercase font-black tracking-widest mb-1 ${tvMode ? "text-[10px]" : "text-[10px]"
                                          }`}
                                      >
                                        Motivo
                                      </p>
                                      <p
                                        className={`font-bold text-slate-200 ${tvMode ? "text-xs" : "text-[12px]"
                                          }`}
                                      >
                                        {vehicle.maintenance_reason || vehicle.maintenance_history_reason || "Não informado"}
                                      </p>
                                    </div>

                                    {!tvMode && normalizeStatus(vehicle.status) === "EM MANUTENÇÃO" && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditMaintenance(vehicle);
                                          }}
                                          className="text-slate-500 hover:text-white transition-colors"
                                          title="Editar manutenção"
                                        >
                                          <span className="material-symbols-outlined text-sm">edit</span>
                                        </button>

                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteMaintenance(vehicle.plate);
                                          }}
                                          className="text-slate-500 hover:text-rose-400 transition-colors"
                                          title="Excluir manutenção"
                                        >
                                          <span className="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {vehicle.maintenance_finished_at ? (
                                    <div className="p-1.5 bg-emerald-500/10 rounded border border-emerald-500/20 space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`material-symbols-outlined text-emerald-400 ${tvMode ? "text-sm" : "text-xs"
                                            }`}
                                        >
                                          check_circle
                                        </span>
                                        <p
                                          className={`text-emerald-400 font-bold tabular-nums ${tvMode ? "text-[10px]" : "text-[9px]"
                                            }`}
                                        >
                                          Finalizado em:{" "}
                                          {new Date(vehicle.maintenance_finished_at).toLocaleString("pt-BR", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </p>
                                      </div>
                                      <p
                                        className={`text-emerald-300 font-semibold tabular-nums ${tvMode ? "text-[10px]" : "text-[9px]"
                                          }`}
                                      >
                                        Expira em:{" "}
                                        {vehicle.maintenance_forecast_date
                                          ? new Date(vehicle.maintenance_forecast_date).toLocaleString("pt-BR", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })
                                          : "Não informado"}
                                      </p>

                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 p-1.5 bg-rose-500/5 rounded border border-rose-500/10">
                                      <span
                                        className={`material-symbols-outlined text-rose-400 ${tvMode ? "text-sm" : "text-xs"
                                          }`}
                                      >
                                        event
                                      </span>
                                      <p
                                        className={`text-rose-400 font-bold tabular-nums ${tvMode ? "text-[10px]" : "text-[9px]"
                                          }`}
                                      >
                                        Previsão:{" "}
                                        {vehicle.maintenance_prev_date
                                          ? new Date(vehicle.maintenance_prev_date).toLocaleString("pt-BR", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })
                                          : "Não informada"}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}

                            </div>

                          </div>

                          {
                            activeCardActionsPlate === vehicle.plate && !tvMode && (
                              <div className="absolute inset-0 z-20 rounded-xl bg-background-dark/75 backdrop-blur-[1.5px] p-3 flex flex-col justify-center gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenObservationPanel(vehicle);
                                  }}
                                  className="w-full bg-slate-900/90 border border-slate-700 hover:border-slate-500 text-slate-100 rounded-lg py-2 text-[10px] font-black uppercase tracking-widest transition-colors"
                                >
                                  {vehicle.observation ? "Editar Observação" : "Inserir Observação"}
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenTripPanel(vehicle);
                                  }}
                                  className="w-full bg-slate-900/90 border border-slate-700 hover:border-primary/60 text-slate-100 rounded-lg py-2 text-[10px] font-black uppercase tracking-widest transition-colors"
                                >
                                  Visualizar Viagem
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenRoute(vehicle);
                                  }}
                                  disabled={!vehicle.route_timeline_link}
                                  className={`w-full border rounded-lg py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${vehicle.route_timeline_link
                                    ? "bg-primary/20 border-primary/40 text-primary hover:bg-primary/30"
                                    : "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed"
                                    }`}
                                >
                                  Visualizar Rota
                                </button>
                              </div>
                            )
                          }

                          {
                            !tvMode &&
                            col.id === "EM MANUTENÇÃO" &&
                            normalizeStatus(vehicle.status) === "EM MANUTENÇÃO" && (
                              <div className="mt-4 space-y-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    !vehicle.maintenance_finished_at &&
                                      normalizeStatus(vehicle.status) === "EM MANUTENÇÃO" &&
                                      handleFinishMaintenance(vehicle);
                                  }}
                                  disabled={
                                    !!vehicle.maintenance_finished_at ||
                                    normalizeStatus(vehicle.status) !== "EM MANUTENÇÃO"
                                  }
                                  className={`w-full py-2 rounded-lg text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${vehicle.maintenance_finished_at
                                    ? "bg-slate-700 cursor-not-allowed opacity-50"
                                    : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20"
                                    }`}
                                >
                                  {vehicle.maintenance_finished_at ? "CONCLUÍDO" : "FINALIZAR"}
                                </button>
                              </div>
                            )
                          }
                        </motion.div>
                      );
                    })}
                  </div>
                </AutoScrollColumn>
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {selectedObservationVehicle && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseObservationPanel}
              className="absolute inset-0 bg-background-dark/80 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 18 }}
              transition={{ duration: 0.18 }}
              className={`relative w-full bg-card-dark border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 ${tvMode ? "max-w-2xl" : "max-w-lg"
                }`}
            >
              <div className="p-6 border-b border-slate-800 bg-slate-panel/50">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p
                      className={`font-black uppercase tracking-widest text-slate-500 mb-2 ${tvMode ? "text-xs" : "text-[10px]"
                        }`}
                    >
                      Observação do veículo
                    </p>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-black text-white bg-slate-800 rounded-lg ${tvMode ? "text-base px-4 py-1.5" : "text-sm px-3 py-1"
                          }`}
                      >
                        {selectedObservationVehicle.plate}
                      </span>
                      <span className={`${tvMode ? "text-sm" : "text-xs"} text-slate-400`}>
                        {formatDriverName(selectedObservationVehicle.driver)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleCloseObservationPanel}
                    className="text-slate-500 hover:text-white transition-colors"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveObservation} className={`${tvMode ? "p-8 space-y-6" : "p-6 space-y-4"}`}>
                <div className={`rounded-xl border border-slate-800 bg-slate-900/60 ${tvMode ? "p-5" : "p-4"}`}>
                  <p
                    className={`text-slate-500 uppercase font-black tracking-widest mb-1 ${tvMode ? "text-[10px]" : "text-[9px]"
                      }`}
                  >
                    Última macro operacional
                  </p>
                  <p className={`${tvMode ? "text-sm" : "text-[11px]"} font-bold text-slate-200`}>
                    {selectedObservationVehicle.last_operational_macro || "Sem macro operacional"}
                  </p>
                  <p className={`${tvMode ? "text-xs" : "text-[10px]"} text-slate-400 mt-1`}>
                    {formatDateTime(selectedObservationVehicle.last_operational_macro_time)}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    className={`font-black text-slate-500 uppercase tracking-widest ${tvMode ? "text-xs" : "text-[10px]"
                      }`}
                  >
                    Observação
                  </label>
                  <textarea
                    rows={tvMode ? 6 : 4}
                    placeholder="Digite uma observação para este veículo"
                    className={`w-full bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-slate-500/50 transition-colors resize-none ${tvMode ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"
                      }`}
                    value={observationText}
                    onChange={(e) => setObservationText(e.target.value)}
                  />
                </div>

                <div className="pt-3 border-t border-slate-800 flex gap-3">
                  <button
                    type="submit"
                    className={`flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-black uppercase tracking-widest transition-all shadow-lg ${tvMode ? "py-4 text-xs" : "py-3 text-[11px]"
                      }`}
                  >
                    Inserir
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteObservation}
                    className={`flex-1 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl font-black uppercase tracking-widest transition-all border border-slate-700 ${tvMode ? "py-4 text-xs" : "py-3 text-[11px]"
                      }`}
                  >
                    Excluir
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedTripVehicle && (
          <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseTripPanel}
              className="absolute inset-0 bg-background-dark/80 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 18 }}
              transition={{ duration: 0.18 }}
              className={`relative w-full bg-card-dark border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 ${tvMode ? "max-w-3xl" : "max-w-2xl"}`}
            >
              <div className="p-6 border-b border-slate-800 bg-slate-panel/50 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Detalhes da viagem</p>
                  <p className="text-sm text-slate-200 font-bold">{selectedTripVehicle.plate} • {formatDriverName(selectedTripVehicle.driver)}</p>
                </div>
                <button onClick={handleCloseTripPanel} className="text-slate-500 hover:text-white transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[72vh] overflow-y-auto custom-scrollbar">
                {tripDetailsLoading && <p className="text-slate-400 text-sm">Carregando dados da Raster...</p>}
                {tripDetailsError && <p className="text-rose-400 text-sm font-bold">{tripDetailsError}</p>}

                {!tripDetailsLoading && !tripDetailsError && tripDetails && (
                  <>
                    <div className="space-y-3 text-xs">
                      <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3"><p className="text-slate-500 uppercase text-[9px] font-black tracking-widest">Status da viagem</p><p className="text-slate-200 font-bold mt-1">{`${getStatusViagemLabel(tripDetails)}${tripDetails.statusViagem ? ` (${tripDetails.statusViagem})` : ""}`}</p></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3"><p className="text-slate-500 uppercase text-[9px] font-black tracking-widest">Prev. Início</p><p className="text-slate-200 font-bold mt-1">{formatDateTime(tripDetails.dataHoraPrevIni)}</p></div>
                        <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3"><p className="text-slate-500 uppercase text-[9px] font-black tracking-widest">Prev. Fim</p><p className="text-slate-200 font-bold mt-1">{formatDateTime(tripDetails.dataHoraPrevFim)}</p></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3"><p className="text-slate-500 uppercase text-[9px] font-black tracking-widest">Carreta 1</p><p className="text-slate-200 font-bold mt-1">{tripDetails.carreta1 || "Não informada"}</p></div>
                      <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3"><p className="text-slate-500 uppercase text-[9px] font-black tracking-widest">Carreta 2</p><p className="text-slate-200 font-bold mt-1">{tripDetails.carreta2 || "Não informada"}</p></div>
                    </div>

                    <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3 space-y-2 text-xs">
                      <p className="text-slate-500 uppercase text-[9px] font-black tracking-widest">Clientes</p>
                      <div>
                        <p className="text-slate-500 uppercase text-[8px] font-black tracking-widest">Origem</p>
                        <p className="text-slate-200 font-bold">{tripDetails.clienteOrigemNome || "Não identificado"}</p>
                        <p className="text-slate-400">CNPJ: {tripDetails.cnpjClienteOrig || "-"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 uppercase text-[8px] font-black tracking-widest">Destino</p>
                        <p className="text-slate-200 font-bold">{tripDetails.clienteDestinoNome || "Não identificado"}</p>
                        <p className="text-slate-400">CNPJ: {tripDetails.cnpjClienteDest || "-"}</p>
                      </div>
                    </div>

                    <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3 space-y-2 text-xs">
                      <p className="text-slate-500 uppercase text-[9px] font-black tracking-widest">Progresso da rota</p>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Number(tripDetails.progressoPercorrido || 0)}%` }} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-slate-300">
                        <p><span className="text-slate-500">Percorrido:</span> {Number(tripDetails.progressoPercorrido || 0).toFixed(1)}%</p>
                        <p><span className="text-slate-500">Km percorrido:</span> {Number(tripDetails.kmPercorridoEntrega || 0).toFixed(1)} km</p>
                        <p><span className="text-slate-500">Km restante:</span> {Number(tripDetails.kmRestanteEntrega || 0).toFixed(1)} km</p>
                        <p><span className="text-slate-500">Distância rota:</span> {getRouteDistance(tripDetails.kmPercorridoEntrega, tripDetails.kmRestanteEntrega, tripDetails.distanciaRota).toFixed(1)} km</p>
                      </div>
                    </div>

                    <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3">
                      <p className="text-slate-500 uppercase text-[9px] font-black tracking-widest mb-2">Paradas da viagem</p>
                      <div className="space-y-2">
                        {tripDetails.stops?.map((stop) => (
                          <div key={`${stop.ordem}-${stop.tipo}`} className="flex items-start justify-between gap-3 text-xs border-b border-slate-800/70 last:border-b-0 pb-2 last:pb-0">
                            <div>
                              <p className="text-slate-200 font-bold">#{stop.ordem} • {stop.tipo === "C" ? "Coleta" : stop.tipo === "E" ? "Entrega" : stop.tipo}</p>
                              <p className="text-slate-400">{stop.cidade}</p>
                            </div>
                            {stop.tipo !== "C" && (
                              <div className="text-right text-slate-400">
                                <p>{Number(stop.percentualPercorrido || 0).toFixed(1)}%</p>
                                <p>{Number(stop.kmRestanteEntrega || 0).toFixed(1)} km rest.</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsModalOpen(false);
                resetMaintenanceForm();
              }}
              className="absolute inset-0 bg-background-dark/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`relative w-full bg-card-dark border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 ${tvMode ? "max-w-2xl" : "max-w-lg"
                }`}
            >
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-panel/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-500/10 rounded-lg text-rose-500">
                    <span className="material-symbols-outlined">build</span>
                  </div>
                  <h3 className={`${tvMode ? "text-xl" : "text-lg"} font-black text-white uppercase tracking-tight`}>
                    {editingPlate ? "Editar Manutenção" : "Inserir em Manutenção"}
                  </h3>
                </div>

                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    resetMaintenanceForm();
                  }}
                  className="text-slate-500 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleAddMaintenance} className={`${tvMode ? "p-8 space-y-6" : "p-6 space-y-4"}`}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      className={`font-black text-slate-500 uppercase tracking-widest ${tvMode ? "text-xs" : "text-[10px]"
                        }`}
                    >
                      Placa do Veículo
                    </label>

                    <select
                      required
                      disabled={!!editingPlate}
                      className={`w-full bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-rose-500/50 transition-colors ${editingPlate ? "opacity-60 cursor-not-allowed" : ""
                        } ${tvMode ? "px-5 py-3.5 text-base" : "px-4 py-2.5 text-sm"}`}
                      value={newMaintenance.plate}
                      onChange={(e) => handleSelectPlate(e.target.value)}
                    >
                      <option value="">Selecione uma placa</option>
                      {availableVehicles.map((vehicle) => (
                        <option key={vehicle.plate} value={vehicle.plate}>
                          {vehicle.plate} — {formatDriverName(vehicle.driver)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      className={`font-black text-slate-500 uppercase tracking-widest ${tvMode ? "text-xs" : "text-[10px]"
                        }`}
                    >
                      Motorista
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Nome completo"
                      className={`w-full bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-rose-500/50 transition-colors ${tvMode ? "px-5 py-3.5 text-base" : "px-4 py-2.5 text-sm"
                        }`}
                      value={newMaintenance.driver}
                      onChange={(e) => setNewMaintenance({ ...newMaintenance, driver: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    className={`font-black text-slate-500 uppercase tracking-widest ${tvMode ? "text-xs" : "text-[10px]"
                      }`}
                  >
                    Motivo da Manutenção
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Troca de Pneus, Revisão ABS"
                    className={`w-full bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-rose-500/50 transition-colors ${tvMode ? "px-5 py-3.5 text-base" : "px-4 py-2.5 text-sm"
                      }`}
                    value={newMaintenance.reason}
                    onChange={(e) => setNewMaintenance({ ...newMaintenance, reason: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      className={`font-black text-slate-500 uppercase tracking-widest ${tvMode ? "text-xs" : "text-[10px]"
                        }`}
                    >
                      Local
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="OFICINA"
                      className={`w-full bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-rose-500/50 transition-colors ${tvMode ? "px-5 py-3.5 text-base" : "px-4 py-2.5 text-sm"
                        }`}
                      value={newMaintenance.location}
                      onChange={(e) => setNewMaintenance({ ...newMaintenance, location: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      className={`font-black text-slate-500 uppercase tracking-widest ${tvMode ? "text-xs" : "text-[10px]"
                        }`}
                    >
                      Previsão de Saída
                    </label>
                    <input
                      type="datetime-local"
                      required
                      className={`w-full bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-rose-500/50 transition-colors ${tvMode ? "px-5 py-3.5 text-base" : "px-4 py-2.5 text-sm"
                        }`}
                      value={newMaintenance.forecast}
                      onChange={(e) => setNewMaintenance({ ...newMaintenance, forecast: e.target.value })}
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      resetMaintenanceForm();
                    }}
                    className={`flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-black uppercase tracking-widest transition-all ${tvMode ? "py-4 text-xs" : "py-3 text-[11px]"
                      }`}
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    className={`flex-1 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-black uppercase tracking-widest transition-all shadow-lg shadow-rose-500/20 ${tvMode ? "py-4 text-xs" : "py-3 text-[11px]"
                      }`}
                  >
                    {editingPlate ? "Salvar Alterações" : "Confirmar Entrada"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div >
  );
}
