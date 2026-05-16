import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Vehicle } from "../types";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useScreenSize } from "../hooks/useScreenSize";
import "leaflet/dist/leaflet.css";

interface Props {
  vehicles: Vehicle[];
  tvMode?: boolean;
}

// Fix for default marker icons in Leaflet with React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const STATUS_COLORS: Record<string, string> = {
  "EM TRÂNSITO": "#005bbb",
  "AGUARD./EFET. CARREGAMENTO": "#f59e0b",
  "AGUARD./EFET. DESCARREGAMENTO": "#8b5cf6",
  "VEÍCULO VAZIO": "#0ea5e9",
  "EM MANUTENÇÃO": "#ef4444",
};

const MAP_LAYERS = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  streets: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  satellite:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

const BRAZIL_BOUNDS: [[number, number], [number, number]] = [
  [-33.75, -73.99],
  [5.27, -34.79],
];

type TvFocusInfo = {
  title: string;
  subtitle: string;
} | null;

function normalizeStatus(status?: string | null) {
  return String(status || "").trim().toUpperCase();
}

function getStatusGroup(status?: string | null) {
  const s = normalizeStatus(status);

  if (s === "AGUARDANDO CARREGAMENTO" || s === "EFETUANDO CARREGAMENTO") {
    return "AGUARD./EFET. CARREGAMENTO";
  }

  if (s === "AGUARDANDO DESCARREGAMENTO" || s === "EFETUANDO DESCARREGAMENTO") {
    return "AGUARD./EFET. DESCARREGAMENTO";
  }

  if (s === "EM TRÂNSITO" || s === "VEÍCULO VAZIO" || s === "EM MANUTENÇÃO") {
    return s;
  }

  return "VEÍCULO VAZIO";
}

function getStatusColor(status?: string | null) {
  return STATUS_COLORS[getStatusGroup(status)] || "#ffffff";
}

function hasRouteDetails(vehicle: Vehicle) {
  return !!(
    vehicle.route_origin ||
    vehicle.route_destination ||
    vehicle.route_progress_percent != null
  );
}

function getRouteProgress(progress?: number | null) {
  const parsed = Number(progress);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
}

function isEmptyStatus(status?: string | null) {
  return getStatusGroup(status) === "VEÍCULO VAZIO";
}

function getVehicleCourse(vehicle: Vehicle) {
  const rawCourse =
    (vehicle as any).course ?? (vehicle as any).curso ?? (vehicle as any).heading ?? 0;

  const parsed = Number(rawCourse);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasValidCoordinates(vehicle: Vehicle) {
  const lat = Number(vehicle.lat);
  const lng = Number(vehicle.lng);

  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
}

function getBoundsForVehicles(list: Vehicle[]): [[number, number], [number, number]] | null {
  const valid = list.filter(hasValidCoordinates);
  if (!valid.length) return null;

  let minLat = valid[0].lat;
  let maxLat = valid[0].lat;
  let minLng = valid[0].lng;
  let maxLng = valid[0].lng;

  for (const vehicle of valid) {
    if (vehicle.lat < minLat) minLat = vehicle.lat;
    if (vehicle.lat > maxLat) maxLat = vehicle.lat;
    if (vehicle.lng < minLng) minLng = vehicle.lng;
    if (vehicle.lng > maxLng) maxLng = vehicle.lng;
  }

  const latPadding = Math.max((maxLat - minLat) * 0.12, 0.18);
  const lngPadding = Math.max((maxLng - minLng) * 0.12, 0.18);

  return [
    [minLat - latPadding, minLng - lngPadding],
    [maxLat + latPadding, maxLng + lngPadding],
  ];
}

function createVehicleIcon(
  vehicle: Vehicle,
  tvMode = false,
  isHighlighted = true,
  isDimmed = false
) {
  const color = getStatusColor(vehicle.status);
  const course = getVehicleCourse(vehicle);
  const groupedStatus = getStatusGroup(vehicle.status);

  const arrowBox = tvMode ? 42 : 34;
  const arrowIcon = tvMode ? 36 : 30;
  const pointBox = tvMode ? 36 : 30;
  const outerDot = tvMode ? 20 : 16;
  const haloDot = tvMode ? 26 : 22;
  const centerDot = tvMode ? 10 : 8;
  const wrenchBox = tvMode ? 36 : 30;
  const wrenchIcon = tvMode ? 28 : 24;

  const opacity = isDimmed ? 0.2 : isHighlighted ? 1 : 0.75;
  const scale = isDimmed ? 0.82 : isHighlighted ? 1.12 : 1;
  const strongShadow = isHighlighted
    ? `drop-shadow(0 0 10px ${color}) drop-shadow(0 2px 5px rgba(0,0,0,0.55))`
    : `drop-shadow(0 1px 2px rgba(0,0,0,0.35))`;

  if (groupedStatus === "EM TRÂNSITO") {
    return L.divIcon({
      html: `
        <div style="
          width: ${arrowBox}px;
          height: ${arrowBox}px;
          display:flex;
          align-items:center;
          justify-content:center;
          opacity:${opacity};
          transform: scale(${scale});
          transition: all .35s ease;
        ">
          <div style="
            transform: rotate(${course}deg);
            transform-origin: center center;
            width: ${arrowIcon}px;
            height: ${arrowIcon}px;
            display:flex;
            align-items:center;
            justify-content:center;
            color:${color};
            font-size:${arrowIcon}px;
            filter:${strongShadow};
          ">
            <i class="fa-solid fa-location-arrow"></i>
          </div>
        </div>
      `,
      className: "vehicle-arrow-marker",
      iconSize: [arrowBox, arrowBox],
      iconAnchor: [arrowBox / 2, arrowBox / 2],
    });
  }

  if (groupedStatus === "AGUARD./EFET. CARREGAMENTO") {
    return L.divIcon({
      html: `
        <div style="
          position: relative;
          width: ${pointBox}px;
          height: ${pointBox}px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity:${opacity};
          transform: scale(${scale});
          transition: all .35s ease;
        ">
          <div style="
            position: absolute;
            width: ${haloDot}px;
            height: ${haloDot}px;
            border-radius: 999px;
            background: rgba(245,158,11,${isHighlighted ? "0.30" : "0.18"});
          "></div>

          <div style="
            position: absolute;
            width: ${outerDot}px;
            height: ${outerDot}px;
            border-radius: 999px;
            background: ${color};
            box-shadow: ${isHighlighted
          ? `0 0 0 2px rgba(0,0,0,0.65), 0 0 12px ${color}`
          : "0 0 0 1.5px rgba(0,0,0,0.55)"
        };
          "></div>

          <div style="
            position: absolute;
            width: ${centerDot}px;
            height: ${centerDot}px;
            border-radius: 999px;
            background: #ffffff;
          "></div>
        </div>
      `,
      className: "vehicle-loading-marker",
      iconSize: [pointBox, pointBox],
      iconAnchor: [pointBox / 2, pointBox / 2],
    });
  }

  if (groupedStatus === "AGUARD./EFET. DESCARREGAMENTO") {
    return L.divIcon({
      html: `
        <div style="
          position: relative;
          width: ${pointBox}px;
          height: ${pointBox}px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity:${opacity};
          transform: scale(${scale});
          transition: all .35s ease;
        ">
          <div style="
            position: absolute;
            width: ${haloDot}px;
            height: ${haloDot}px;
            border-radius: 999px;
            background: rgba(139,92,246,${isHighlighted ? "0.30" : "0.18"});
          "></div>

          <div style="
            position: absolute;
            width: ${outerDot}px;
            height: ${outerDot}px;
            border-radius: 999px;
            background: ${color};
            box-shadow: ${isHighlighted
          ? `0 0 0 2px rgba(0,0,0,0.65), 0 0 12px ${color}`
          : "0 0 0 1.5px rgba(0,0,0,0.55)"
        };
          "></div>

          <div style="
            position: absolute;
            width: ${centerDot}px;
            height: ${centerDot}px;
            border-radius: 999px;
            background: #ffffff;
          "></div>
        </div>
      `,
      className: "vehicle-unloading-marker",
      iconSize: [pointBox, pointBox],
      iconAnchor: [pointBox / 2, pointBox / 2],
    });
  }

  if (isEmptyStatus(groupedStatus)) {
    return L.divIcon({
      html: `
        <div style="
          position: relative;
          width: ${pointBox}px;
          height: ${pointBox}px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${color};
          opacity:${opacity};
          transform: scale(${scale});
          transition: all .35s ease;
        ">
          <div style="
            position: absolute;
            width: ${outerDot + 2}px;
            height: ${outerDot + 2}px;
            border-radius: 999px;
            background: ${color};
            box-shadow:
              0 0 0 3px rgba(15,23,42,0.95),
              0 0 ${isHighlighted ? "12px" : "8px"} ${color};
            animation: pulseEmpty 1.8s infinite ease-out;
          "></div>

          <div style="
            position: absolute;
            width: ${centerDot}px;
            height: ${centerDot}px;
            border-radius: 999px;
            background: #ffffff;
            box-shadow: 0 0 6px rgba(255,255,255,0.6);
          "></div>
        </div>
      `,
      className: "vehicle-empty-marker",
      iconSize: [pointBox, pointBox],
      iconAnchor: [pointBox / 2, pointBox / 2],
    });
  }

  if (groupedStatus === "EM MANUTENÇÃO") {
    return L.divIcon({
      html: `
        <div style="
          width: ${wrenchBox}px;
          height: ${wrenchBox}px;
          display:flex;
          align-items:center;
          justify-content:center;
          color:${color};
          font-size:${wrenchIcon}px;
          opacity:${opacity};
          transform: scale(${scale});
          transition: all .35s ease;
          filter:${isHighlighted
          ? `drop-shadow(0 0 10px ${color}) drop-shadow(0 2px 4px rgba(0,0,0,0.55))`
          : "drop-shadow(0 1px 2px rgba(0,0,0,0.45))"
        };
        ">
          <i class="fa-solid fa-wrench"></i>
        </div>
      `,
      className: "vehicle-maintenance-marker",
      iconSize: [wrenchBox, wrenchBox],
      iconAnchor: [wrenchBox / 2, wrenchBox / 2],
    });
  }

  return L.divIcon({
    html: `
      <div style="
        position: relative;
        width: ${pointBox - 4}px;
        height: ${pointBox - 4}px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity:${opacity};
        transform: scale(${scale});
        transition: all .35s ease;
      ">
        <div style="
          width: ${outerDot}px;
          height: ${outerDot}px;
          border-radius: 999px;
          background: ${color};
          box-shadow:
            0 0 0 2px rgba(15,23,42,0.85),
            0 1px 4px rgba(0,0,0,0.35);
        "></div>
      </div>
    `,
    className: "vehicle-default-marker",
    iconSize: [pointBox - 4, pointBox - 4],
    iconAnchor: [(pointBox - 4) / 2, (pointBox - 4) / 2],
  });
}

function MapResizer({ resizeKey }: { resizeKey: string | number }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [map, resizeKey]);

  return null;
}

function MapViewportController({
  vehicle,
  resetSignal,
  viewportPadding,
}: {
  vehicle: Vehicle | null;
  resetSignal: number;
  viewportPadding: [number, number];
}) {
  const map = useMap();

  useEffect(() => {
    if (vehicle) {
      map.flyTo([vehicle.lat, vehicle.lng], 15, {
        animate: true,
        duration: 2.2,
      });
    }
  }, [vehicle, map]);

  useEffect(() => {
    if (!vehicle) {
      map.fitBounds(BRAZIL_BOUNDS, {
        animate: true,
        padding: viewportPadding,
      });
    }
  }, [resetSignal, vehicle, map, viewportPadding]);

  return null;
}

function MapTvDirector({
  vehicles,
  tvMode,
  selectedVehicle,
  onFocusChange,
  onFocusedPlatesChange,
}: {
  vehicles: Vehicle[];
  tvMode: boolean;
  selectedVehicle: Vehicle | null;
  onFocusChange: (info: TvFocusInfo) => void;
  onFocusedPlatesChange: (plates: string[]) => void;
}) {
  const map = useMap();
  const [phaseIndex, setPhaseIndex] = useState(0);

  const validVehicles = useMemo(() => {
    return vehicles.filter(hasValidCoordinates);
  }, [vehicles]);

  const phases = useMemo(() => {
    const inTransit = validVehicles.filter((v) => getStatusGroup(v.status) === "EM TRÂNSITO");
    const loading = validVehicles.filter(
      (v) => getStatusGroup(v.status) === "AGUARD./EFET. CARREGAMENTO"
    );
    const unloading = validVehicles.filter(
      (v) => getStatusGroup(v.status) === "AGUARD./EFET. DESCARREGAMENTO"
    );
    const empty = validVehicles.filter((v) => getStatusGroup(v.status) === "VEÍCULO VAZIO");
    const maintenance = validVehicles.filter((v) => getStatusGroup(v.status) === "EM MANUTENÇÃO");

    const operational = validVehicles.filter((v) => {
      const status = getStatusGroup(v.status);
      return (
        status === "EM TRÂNSITO" ||
        status === "AGUARD./EFET. CARREGAMENTO" ||
        status === "AGUARD./EFET. DESCARREGAMENTO"
      );
    });

    const faster = [...inTransit]
      .sort((a, b) => (Number(b.speed) || 0) - (Number(a.speed) || 0))
      .slice(0, 10);

    const phaseList: Array<{
      type: "overview" | "group";
      title: string;
      subtitle: string;
      vehicles: Vehicle[];
      duration: number;
      maxZoom?: number;
    }> = [];

    phaseList.push({
      type: "overview",
      title: "Visão Nacional",
      subtitle: "Brasil inteiro",
      vehicles: [],
      duration: 7000,
    });

    if (operational.length) {
      phaseList.push({
        type: "group",
        title: "Operação Ativa",
        subtitle: `${operational.length} veículos em operação`,
        vehicles: operational,
        duration: 8000,
        maxZoom: 11,
      });
    }

    if (inTransit.length) {
      phaseList.push({
        type: "group",
        title: "Em Trânsito",
        subtitle: `${inTransit.length} veículos em deslocamento`,
        vehicles: inTransit,
        duration: 7500,
        maxZoom: 11,
      });
    }

    if (faster.length >= 2) {
      phaseList.push({
        type: "group",
        title: "Maiores Velocidades",
        subtitle: `Top ${faster.length} veículos em movimento`,
        vehicles: faster,
        duration: 7000,
        maxZoom: 11,
      });
    }

    if (loading.length) {
      phaseList.push({
        type: "group",
        title: "Carregamento",
        subtitle: `${loading.length} veículo(s) em carregamento`,
        vehicles: loading,
        duration: 6500,
        maxZoom: 12,
      });
    }

    if (unloading.length) {
      phaseList.push({
        type: "group",
        title: "Descarregamento",
        subtitle: `${unloading.length} veículo(s) em descarregamento`,
        vehicles: unloading,
        duration: 6500,
        maxZoom: 12,
      });
    }

    if (empty.length) {
      phaseList.push({
        type: "group",
        title: "Veículos Vazios",
        subtitle: `${empty.length} veículo(s) disponíveis`,
        vehicles: empty.slice(0, Math.min(empty.length, 14)),
        duration: 6500,
        maxZoom: 11,
      });
    }

    if (maintenance.length) {
      phaseList.push({
        type: "group",
        title: "Manutenção",
        subtitle: `${maintenance.length} veículo(s) em manutenção`,
        vehicles: maintenance,
        duration: 6500,
        maxZoom: 12,
      });
    }

    phaseList.push({
      type: "overview",
      title: "Visão Nacional",
      subtitle: "Retorno à visão geral",
      vehicles: [],
      duration: 7000,
    });

    return phaseList;
  }, [validVehicles]);

  useEffect(() => {
    if (!tvMode) {
      onFocusChange(null);
      onFocusedPlatesChange([]);
      return;
    }

    if (selectedVehicle) {
      onFocusChange({
        title: selectedVehicle.plate,
        subtitle: `${getStatusGroup(selectedVehicle.status)} • ${selectedVehicle.driver || "SEM MOTORISTA"
          }`,
      });
      onFocusedPlatesChange([selectedVehicle.plate]);
      return;
    }

    if (!phases.length) {
      onFocusChange({
        title: "Sem dados geográficos",
        subtitle: "Nenhum veículo com coordenadas válidas",
      });
      onFocusedPlatesChange([]);
      return;
    }

    const phase = phases[phaseIndex % phases.length];

    onFocusChange({
      title: phase.title,
      subtitle: phase.subtitle,
    });

    onFocusedPlatesChange(phase.vehicles.map((v) => v.plate));

    if (phase.type === "overview") {
      map.flyToBounds(BRAZIL_BOUNDS, {
        padding: [80, 80],
        duration: 3.2,
      });
    } else {
      const bounds = getBoundsForVehicles(phase.vehicles);
      if (bounds) {
        map.flyToBounds(bounds, {
          padding: [90, 90],
          duration: 3.2,
          maxZoom: phase.maxZoom ?? 12,
        });
      }
    }

    const timer = setTimeout(() => {
      setPhaseIndex((prev) => (prev + 1) % phases.length);
    }, phase.duration);

    return () => clearTimeout(timer);
  }, [
    tvMode,
    selectedVehicle,
    phaseIndex,
    phases,
    map,
    onFocusChange,
    onFocusedPlatesChange,
  ]);

  return null;
}

export function MapView({ vehicles, tvMode = false }: Props) {
  const screen = useScreenSize();
  const isMobile = screen.isMobile;
  const isTablet = screen.isTablet;
  const shouldUseOverlaySidebar = isMobile || isTablet;
  const [mapType, setMapType] = useState<keyof typeof MAP_LAYERS>("streets");
  const [statusFilter, setStatusFilter] = useState("Todos os Status");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [resetMapSignal, setResetMapSignal] = useState(0);
  const [tvFocusInfo, setTvFocusInfo] = useState<TvFocusInfo>(null);
  const [focusedPlates, setFocusedPlates] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(!shouldUseOverlaySidebar);

  useEffect(() => {
    setSidebarOpen(!shouldUseOverlaySidebar);
  }, [shouldUseOverlaySidebar]);

  useEffect(() => {
    if (tvMode) {
      setSelectedVehicle(null);
    }
  }, [tvMode]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const mapResizeKey = `${screen.width}-${sidebarOpen}-${tvMode}`;
    const viewportPadding = useMemo<[number, number]>(() => {
    if (isMobile) return [24, 24];
    if (isTablet) return [36, 36];
    return [50, 50];
  }, [isMobile, isTablet]);

  const markerAnimations = `
    @keyframes pulseEmpty {
      0% {
        transform: scale(0.9);
        opacity: 0.95;
        box-shadow:
          0 0 0 3px rgba(15,23,42,0.95),
          0 0 8px currentColor;
      }
      70% {
        transform: scale(1.45);
        opacity: 0.18;
        box-shadow:
          0 0 0 1px rgba(15,23,42,0.4),
          0 0 18px currentColor;
      }
      100% {
        transform: scale(1.6);
        opacity: 0;
        box-shadow:
          0 0 0 0 rgba(15,23,42,0),
          0 0 22px currentColor;
      }
    }
  `;

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (!v) return false;

      const groupedStatus = getStatusGroup(v.status);

      const matchesStatus =
        statusFilter === "Todos os Status" || groupedStatus === statusFilter;

      const matchesSearch =
        v.plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.driver || "").toLowerCase().includes(searchQuery.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [vehicles, statusFilter, searchQuery]);

  const focusPlateSet = useMemo(() => new Set(focusedPlates), [focusedPlates]);

  const vehiclesWithIcons = useMemo(() => {
    const shouldDim = tvMode && focusedPlates.length > 0;

    return filteredVehicles.map((vehicle) => {
      const isFocused = focusPlateSet.has(vehicle.plate);
      const isDimmed = shouldDim && !isFocused;

      return {
        vehicle,
        icon: createVehicleIcon(vehicle, tvMode, !isDimmed, isDimmed),
        isDimmed,
      };
    });
  }, [filteredVehicles, tvMode, focusedPlates, focusPlateSet]);

  const maintenanceCount = vehicles.filter(
    (v) => normalizeStatus(v.status) === "EM MANUTENÇÃO"
  ).length;

  const movingVehicles = vehicles.filter((v) => Number(v.speed) > 0);

  const averageSpeed = movingVehicles.length
    ? Math.round(
      movingVehicles.reduce((acc, v) => acc + (Number(v.speed) || 0), 0) /
      movingVehicles.length
    )
    : 0;

  const groupedCounters = useMemo(() => {
    return {
      transit: vehicles.filter((v) => getStatusGroup(v.status) === "EM TRÂNSITO").length,
      loading: vehicles.filter(
        (v) => getStatusGroup(v.status) === "AGUARD./EFET. CARREGAMENTO"
      ).length,
      unloading: vehicles.filter(
        (v) => getStatusGroup(v.status) === "AGUARD./EFET. DESCARREGAMENTO"
      ).length,
      empty: vehicles.filter((v) => getStatusGroup(v.status) === "VEÍCULO VAZIO").length,
      maintenance: vehicles.filter((v) => getStatusGroup(v.status) === "EM MANUTENÇÃO").length,
    };
  }, [vehicles]);

  const operationCount =
    groupedCounters.transit + groupedCounters.loading + groupedCounters.unloading;

  const handleClearFilters = () => {
    setStatusFilter("Todos os Status");
    setSearchQuery("");
    setSelectedVehicle(null);
    setResetMapSignal((prev) => prev + 1);
  };

  return (
    <>
      <style>{markerAnimations}</style>

      <div className="relative flex h-full w-full overflow-hidden">
        {!tvMode && (
          <>
            <button
              onClick={handleToggleSidebar}
              className="absolute left-3 top-3 z-[1200] inline-flex items-center gap-1 rounded-lg border border-border-slate bg-background-dark/90 px-2.5 py-1.5 text-[0.75rem] font-black uppercase tracking-wide text-slate-200 shadow-lg backdrop-blur transition hover:bg-slate-800"
            >
              <span className="material-symbols-outlined text-sm">tune</span>
              {sidebarOpen ? "Ocultar" : "Filtros"}
            </button>

            {isMobile && sidebarOpen && (
              <button
                type="button"
                aria-label="Fechar filtros"
                onClick={handleToggleSidebar}
                className="absolute inset-0 z-[1040] bg-black/40"
              />
            )}

            <aside
              className={`bg-background-dark border-border-slate flex flex-col z-[1100] h-full overflow-hidden transition-transform duration-300
              ${shouldUseOverlaySidebar
                  ? "absolute left-0 top-0 w-full max-w-[min(90vw,24rem)] border-r shadow-2xl"
                  : "relative w-full max-w-sm border-r"
                }
              ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            `}
            >
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">filter_list</span>
                    Filtros
                  </h3>
                  <span className="bg-primary/20 text-primary text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {filteredVehicles.length} VEÍCULOS
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">
                      Status
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full bg-slate-panel border-border-slate rounded-lg text-xs text-white focus:ring-primary"
                    >
                      <option>Todos os Status</option>
                      <option>EM TRÂNSITO</option>
                      <option>AGUARD./EFET. CARREGAMENTO</option>
                      <option>AGUARD./EFET. DESCARREGAMENTO</option>
                      <option>VEÍCULO VAZIO</option>
                      <option>EM MANUTENÇÃO</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">
                      Pesquisar Frota
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-2 top-1.5 text-slate-500 text-lg">
                        search
                      </span>
                      <input
                        className="w-full bg-slate-panel border-border-slate rounded-lg pl-9 text-xs text-white focus:ring-primary"
                        placeholder="Placa ou Motorista"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {filteredVehicles.map((vehicle) => {
                  const groupedStatus = getStatusGroup(vehicle.status);
                  const statusColor = getStatusColor(vehicle.status);
                  const routeProgress = getRouteProgress(vehicle.route_progress_percent);
                  const showRouteDetails = hasRouteDetails(vehicle);

                  return (
                    <div
                      key={vehicle.plate}
                      onClick={() => setSelectedVehicle(vehicle)}
                      className={`p-4 border-b border-border-slate hover:bg-[#1a1a1a] transition-colors cursor-pointer ${selectedVehicle?.plate === vehicle.plate
                        ? "bg-primary/10 border-l-4 border-l-primary"
                        : ""
                        }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-white font-bold text-sm">{vehicle.plate}</p>
                          <p className="text-slate-400 text-[12px] font-medium leading-tight">
                            {vehicle.driver}
                          </p>
                        </div>

                        <span
                          className="text-[9px] px-2 py-0.5 rounded-full font-black border uppercase tracking-tighter shrink-0 ml-2"
                          style={{
                            color: statusColor,
                            backgroundColor: `${statusColor}15`,
                            borderColor: `${statusColor}30`,
                          }}
                        >
                          {groupedStatus}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 text-[10px] text-slate-400 font-bold">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-slate-500">
                            speed
                          </span>
                          {vehicle.speed} km/h
                        </span>

                        <span className="flex items-start gap-1">
                          <span className="material-symbols-outlined text-xs text-slate-500 shrink-0">
                            location_on
                          </span>
                          <span className="leading-tight">{vehicle.location_name}</span>
                        </span>

                        {showRouteDetails && (
                          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                            <div className="grid grid-cols-2 gap-2 text-[12px]">
                              <div className="min-w-0">
                                <p className="text-slate-500 uppercase font-black tracking-widest">
                                  Origem
                                </p>
                                <p className="text-slate-200 font-bold leading-tight break-words">
                                  {vehicle.route_origin || "Origem não informada"}
                                </p>
                              </div>

                              <div className="min-w-0 text-right">
                                <p className="text-slate-500 uppercase font-black tracking-widest">
                                  Destino
                                </p>
                                <p className="text-slate-200 font-bold leading-tight break-words">
                                  {vehicle.route_destination || "Destino não informado"}
                                </p>
                              </div>
                            </div>

                            <div className="mt-2">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${routeProgress}%` }}
                                />
                              </div>
                              <p className="mt-1 text-center text-[9px] text-slate-400">
                                {routeProgress.toFixed(1)}% percorrido
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 border-t border-border-slate">
                <button
                  onClick={handleClearFilters}
                  className="w-full bg-slate-panel text-white py-2 rounded-lg text-xs font-bold border border-border-slate flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">refresh</span>
                  Limpar Filtros
                </button>
              </div>
            </aside>
          </>
        )}

        <section className="relative z-0 flex-1 overflow-hidden bg-[#0a0a0a]">
          <MapContainer
            bounds={BRAZIL_BOUNDS}
            boundsOptions={{ padding: viewportPadding }}
            style={{ height: "100%", width: "100%", zIndex: 0 }}
            zoomControl={false}
            preferCanvas={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url={MAP_LAYERS[mapType]}
            />

            <MapResizer resizeKey={mapResizeKey} />
            <MapViewportController
              vehicle={selectedVehicle}
              resetSignal={resetMapSignal}
              viewportPadding={viewportPadding}
            />

            {tvMode && (
              <MapTvDirector
                vehicles={filteredVehicles}
                tvMode={tvMode}
                selectedVehicle={selectedVehicle}
                onFocusChange={setTvFocusInfo}
                onFocusedPlatesChange={setFocusedPlates}
              />
            )}

            {!tvMode && (
              <MapControls
                onTypeChange={setMapType}
                currentType={mapType}
                compact={isMobile}
              />
            )}

            {vehiclesWithIcons
              .filter(({ isDimmed }) => !tvMode || !isDimmed)
              .map(({ vehicle, icon, isDimmed }) => {
                const statusColor = getStatusColor(vehicle.status);
                const groupedStatus = getStatusGroup(vehicle.status);
                const routeProgress = getRouteProgress(vehicle.route_progress_percent);
                const showRouteDetails = hasRouteDetails(vehicle);

                return (
                  <Marker key={vehicle.plate} position={[vehicle.lat, vehicle.lng]} icon={icon}>
                    <Popup className="vehicle-popup" minWidth={220} maxWidth={380}>
                      <div className="w-full max-w-full sm:max-w-md rounded-xl border border-slate-800 bg-background-dark/95 p-3 sm:p-4 text-slate-100 shadow-xl">
                        <div className="flex items-start justify-between gap-2 sm:gap-4 pr-2 sm:pr-6">
                          <div className="min-w-0 flex-1">
                            <p className="font-black text-sm tracking-wide text-white leading-none">
                              {vehicle.plate}
                            </p>
                            <p className="mt-1 text-xs sm:text-sm text-slate-400 leading-tight break-words">
                              {vehicle.driver || "Sem motorista"}
                            </p>
                          </div>

                          <span
                            className="max-w-full sm:max-w-[10.5rem] text-right text-[0.625rem] sm:text-[0.6875rem] px-2.5 sm:px-4 py-1.5 rounded-full font-black border uppercase tracking-tight shrink-0 leading-tight whitespace-normal break-words"
                            title={groupedStatus}
                            style={{
                              color: statusColor,
                              backgroundColor: `${statusColor}15`,
                              borderColor: `${statusColor}30`,
                            }}
                          >
                            {groupedStatus}
                          </span>
                        </div>

                        <div className="mt-3 space-y-1.5 text-xs sm:text-sm text-slate-300 font-bold break-words">
                          <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-xs text-slate-500">
                              speed
                            </span>
                            {vehicle.speed || 0} km/h
                          </span>

                          <span className="flex items-start gap-1.5">
                            <span className="material-symbols-outlined text-xs text-slate-500 shrink-0">
                              location_on
                            </span>
                            <span className="leading-tight">
                              {vehicle.location_name || "Localização não informada"}
                            </span>
                          </span>
                        </div>

                        {showRouteDetails && (
                          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[0.75rem]">
                              <div className="min-w-0">
                                <p className="text-slate-500 uppercase font-black tracking-widest">
                                  Origem
                                </p>
                                <p className="text-slate-200 font-bold leading-tight break-words">
                                  {vehicle.route_origin || "Origem não informada"}
                                </p>
                              </div>

                              <div className="min-w-0 text-right">
                                <p className="text-slate-500 uppercase font-black tracking-widest">
                                  Destino
                                </p>
                                <p className="text-slate-200 font-bold leading-tight break-words">
                                  {vehicle.route_destination || "Destino não informado"}
                                </p>
                              </div>
                            </div>

                            <div className="mt-2">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${routeProgress}%` }}
                                />
                              </div>
                              <p className="mt-1 text-center text-xs sm:text-sm text-slate-400">
                                <span className="font-bold">
                                  {routeProgress.toFixed(1)}%
                                </span>{" "}
                                Concluído
                              </p>
                            </div>
                          </div>
                        )}

                        {vehicle.route_timeline_link && (
                          <a
                            href={vehicle.route_timeline_link}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-primary transition-colors hover:bg-primary/20"
                          >
                            <span className="material-symbols-outlined text-xs">
                              open_in_new
                            </span>
                            Visualizar rota
                          </a>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
          </MapContainer>

          <div
            className={`absolute z-10 pointer-events-none flex flex-wrap max-w-[calc(100%-1rem)] sm:max-w-[calc(100%-2rem)] ${isMobile ? "top-14 left-2 gap-2" : "top-6 left-4 sm:left-6 gap-3 sm:gap-4"} ${tvMode ? "lg:gap-6" : ""}`}
          >
            <div
              className={`bg-background-dark/90 backdrop-blur border border-border-slate rounded-xl shadow-2xl flex items-center gap-2 sm:gap-4 ${tvMode ? "p-4 min-w-[220px]" : "p-2.5 sm:p-3 min-w-[9rem] sm:min-w-[10rem]"
                }`}
            >
              <div className={`rounded-lg text-primary bg-primary/20 ${tvMode ? "p-3" : "p-2"}`}>
                <span className={`material-symbols-outlined ${tvMode ? "text-[28px]" : ""}`}>
                  analytics
                </span>
              </div>
              <div>
                <p
                  className={`${tvMode ? "text-xs" : "text-[10px]"
                    } text-slate-400 font-bold uppercase`}
                >
                  Total Ativos
                </p>
                <p className={`${tvMode ? "text-3xl" : "text-xl"} text-white font-bold`}>
                  {vehicles.length}
                </p>
              </div>
            </div>

            <div
              className={`bg-background-dark/90 backdrop-blur border border-border-slate rounded-xl shadow-2xl flex items-center gap-2 sm:gap-4 ${tvMode ? "p-4 min-w-[220px]" : "p-2.5 sm:p-3 min-w-[9rem] sm:min-w-[10rem]"
                }`}
            >
              <div className={`rounded-lg text-green-500 bg-green-500/20 ${tvMode ? "p-3" : "p-2"}`}>
                <span className={`material-symbols-outlined ${tvMode ? "text-[28px]" : ""}`}>
                  speed
                </span>
              </div>
              <div>
                <p
                  className={`${tvMode ? "text-xs" : "text-[10px]"
                    } text-slate-400 font-bold uppercase`}
                >
                  Vel. Média
                </p>
                <p className={`${tvMode ? "text-3xl" : "text-xl"} text-white font-bold`}>
                  {averageSpeed}{" "}
                  <span className={tvMode ? "text-base" : "text-xs"}>km/h</span>
                </p>
              </div>
            </div>

            <div
              className={`bg-background-dark/90 backdrop-blur border border-border-slate rounded-xl shadow-2xl flex items-center gap-2 sm:gap-4 ${tvMode ? "p-4 min-w-[220px]" : "p-2.5 sm:p-3 min-w-[9rem] sm:min-w-[10rem]"
                }`}
            >
              <div className={`rounded-lg text-red-500 bg-red-500/20 ${tvMode ? "p-3" : "p-2"}`}>
                <span className={`material-symbols-outlined ${tvMode ? "text-[28px]" : ""}`}>
                  warning
                </span>
              </div>
              <div>
                <p
                  className={`${tvMode ? "text-xs" : "text-[10px]"
                    } text-slate-400 font-bold uppercase`}
                >
                  Manutenção
                </p>
                <p className={`${tvMode ? "text-3xl" : "text-xl"} text-white font-bold`}>
                  {maintenanceCount}
                </p>
              </div>
            </div>
          </div>

          {tvMode && tvFocusInfo && (
            <div className="absolute top-6 right-2 sm:right-6 z-10 pointer-events-none max-w-[calc(100%-1rem)] sm:max-w-md">
              <div className="bg-background-dark/92 backdrop-blur-xl border border-border-slate rounded-2xl shadow-2xl px-3 sm:px-5 py-3 sm:py-4 w-full">
                <p className="text-[11px] text-slate-500 font-black uppercase tracking-[0.22em] mb-2">
                  Modo TV • Foco Automático
                </p>
                <p className="text-2xl font-black text-white tracking-tight leading-none">
                  {tvFocusInfo.title}
                </p>
                <p className="text-sm text-slate-300 font-semibold mt-2 leading-snug">
                  {tvFocusInfo.subtitle}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                      Em operação
                    </p>
                    <p className="text-xl font-black text-white mt-1">{operationCount}</p>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                      Visíveis
                    </p>
                    <p className="text-xl font-black text-white mt-1">
                      {filteredVehicles.length}
                    </p>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                      Em trânsito
                    </p>
                    <p className="text-lg font-black text-white mt-1">
                      {groupedCounters.transit}
                    </p>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                      Carregamento
                    </p>
                    <p className="text-lg font-black text-white mt-1">
                      {groupedCounters.loading}
                    </p>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                      Descarregamento
                    </p>
                    <p className="text-lg font-black text-white mt-1">
                      {groupedCounters.unloading}
                    </p>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                      Vazio
                    </p>
                    <p className="text-lg font-black text-white mt-1">
                      {groupedCounters.empty}
                    </p>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 col-span-2">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                      Manutenção
                    </p>
                    <p className="text-lg font-black text-white mt-1">
                      {groupedCounters.maintenance}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            className={`absolute z-10 bg-background-dark/80 backdrop-blur border border-border-slate rounded-lg shadow-2xl ${isMobile ? "bottom-24 left-2 right-2" : "bottom-6 left-4 sm:left-6"} ${tvMode ? "p-4" : "p-2.5 sm:p-3"
              }`}
          >
            <h4
              className={`${tvMode ? "text-xs mb-3" : "text-[14px] mb-2"
                } text-white font-bold uppercase`}
            >
              Legenda
            </h4>

            <div className={tvMode ? "space-y-3" : "space-y-2"}>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center justify-center ${tvMode ? "w-6 h-6" : "w-5 h-5"
                    }`}
                  style={{ color: STATUS_COLORS["EM TRÂNSITO"] }}
                >
                  <span
                    style={{
                      transform: "rotate(45deg)",
                      display: "inline-flex",
                      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))",
                      fontSize: tvMode ? "20px" : "16px",
                    }}
                  >
                    <i className="fa-solid fa-location-arrow"></i>
                  </span>
                </span>
                <span className={`${tvMode ? "text-sm" : "text-[12px]"} text-slate-300 uppercase`}>
                  em trânsito
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`relative inline-flex items-center justify-center ${tvMode ? "w-6 h-6" : "w-5 h-5"
                    }`}
                >
                  <span
                    className="absolute rounded-full"
                    style={{
                      width: tvMode ? "22px" : "18px",
                      height: tvMode ? "22px" : "18px",
                      background: "rgba(245,158,11,0.18)",
                    }}
                  ></span>
                  <span
                    className="absolute rounded-full"
                    style={{
                      width: tvMode ? "16px" : "13px",
                      height: tvMode ? "16px" : "13px",
                      background: STATUS_COLORS["AGUARD./EFET. CARREGAMENTO"],
                      boxShadow: "0 0 0 1.5px rgba(0,0,0,0.55)",
                    }}
                  ></span>
                  <span
                    className="absolute rounded-full bg-white"
                    style={{
                      width: tvMode ? "8px" : "6px",
                      height: tvMode ? "8px" : "6px",
                    }}
                  ></span>
                </span>
                <span className={`${tvMode ? "text-sm" : "text-[12px]"} text-slate-300 uppercase`}>
                  carregamento
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`relative inline-flex items-center justify-center ${tvMode ? "w-6 h-6" : "w-5 h-5"
                    }`}
                >
                  <span
                    className="absolute rounded-full"
                    style={{
                      width: tvMode ? "22px" : "18px",
                      height: tvMode ? "22px" : "18px",
                      background: "rgba(139,92,246,0.18)",
                    }}
                  ></span>
                  <span
                    className="absolute rounded-full"
                    style={{
                      width: tvMode ? "16px" : "13px",
                      height: tvMode ? "16px" : "13px",
                      background: STATUS_COLORS["AGUARD./EFET. DESCARREGAMENTO"],
                      boxShadow: "0 0 0 1.5px rgba(0,0,0,0.55)",
                    }}
                  ></span>
                  <span
                    className="absolute rounded-full bg-white"
                    style={{
                      width: tvMode ? "8px" : "6px",
                      height: tvMode ? "8px" : "6px",
                    }}
                  ></span>
                </span>
                <span className={`${tvMode ? "text-sm" : "text-[12px]"} text-slate-300 uppercase`}>
                  descarregamento
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`relative inline-flex items-center justify-center ${tvMode ? "w-6 h-6" : "w-5 h-5"
                    }`}
                >
                  <span
                    className="absolute rounded-full"
                    style={{
                      width: tvMode ? "16px" : "13px",
                      height: tvMode ? "16px" : "13px",
                      background: STATUS_COLORS["VEÍCULO VAZIO"],
                      boxShadow: `0 0 8px ${STATUS_COLORS["VEÍCULO VAZIO"]}`,
                      animation: "pulseEmpty 1.8s infinite ease-out",
                    }}
                  ></span>
                  <span
                    className="absolute rounded-full bg-white"
                    style={{
                      width: tvMode ? "8px" : "6px",
                      height: tvMode ? "8px" : "6px",
                    }}
                  ></span>
                </span>
                <span className={`${tvMode ? "text-sm" : "text-[12px]"} text-slate-300 uppercase`}>
                  veículo vazio
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center justify-center ${tvMode ? "w-6 h-6" : "w-5 h-5"
                    }`}
                  style={{
                    color: STATUS_COLORS["EM MANUTENÇÃO"],
                    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))",
                    fontSize: tvMode ? "19px" : "15px",
                  }}
                >
                  <i className="fa-solid fa-wrench"></i>
                </span>
                <span className={`${tvMode ? "text-sm" : "text-[12px]"} text-slate-300 uppercase`}>
                  em manutenção
                </span>
              </div>
            </div>
          </div>

          {!tvMode && (
            <div className="absolute top-14 sm:top-6 right-2 sm:right-6 z-10 bg-background-dark/80 backdrop-blur border border-border-slate rounded-lg p-2.5 sm:p-3 shadow-2xl">
              <div className="flex flex-col gap-2 min-w-[11rem] sm:min-w-[13rem]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">
                    Frota visível
                  </span>
                  <span className="text-xs font-black text-white">
                    {filteredVehicles.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">
                    Filtro atual
                  </span>
                  <span className="text-xs font-black text-slate-300 uppercase">
                    {statusFilter}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function MapControls({
  onTypeChange,
  currentType,
  tvMode = false,
  compact = false,
}: {
  onTypeChange: (type: keyof typeof MAP_LAYERS) => void;
  currentType: keyof typeof MAP_LAYERS;
  tvMode?: boolean;
  compact?: boolean;
}) {
  const map = useMap();
  const [showLayers, setShowLayers] = useState(false);

  return (
    <div
      className={`absolute z-[1000] flex flex-col items-end ${compact ? "bottom-3 right-2 gap-1.5" : "bottom-6 right-4 sm:right-6"} ${tvMode ? "gap-3" : "gap-2"
        }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-1 bg-background-dark/90 backdrop-blur border border-border-slate rounded-lg shadow-xl transition-all ${tvMode ? "p-1.5" : "p-1"
            } ${showLayers ? "opacity-100" : "opacity-0 pointer-events-none translate-x-2"}`}
        >
          {(Object.keys(MAP_LAYERS) as Array<keyof typeof MAP_LAYERS>).map((type) => (
            <button
              key={type}
              onClick={() => {
                onTypeChange(type);
                setShowLayers(false);
              }}
              className={`rounded font-black uppercase tracking-tighter transition-all ${tvMode ? "px-3 py-2 text-[10px]" : "px-2 py-1 text-[9px]"
                } ${currentType === type
                  ? "bg-primary text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
            >
              {type === "dark" ? "Dark" : type === "streets" ? "Rua" : "Sat"}
            </button>
          ))}
        </div>

        <div
          className={`bg-background-dark/90 backdrop-blur border border-border-slate rounded-lg shadow-xl ${tvMode ? "p-1.5" : "p-1"
            }`}
        >
          <button
            onClick={() => setShowLayers(!showLayers)}
            className={`flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all ${tvMode ? "size-11" : "size-9"
              } ${showLayers ? "bg-slate-800 text-white" : ""}`}
            title="Mudar Camada"
          >
            <span className={`material-symbols-outlined ${tvMode ? "text-2xl" : "text-xl"}`}>
              layers
            </span>
          </button>
        </div>
      </div>

      <div
        className={`bg-background-dark/90 backdrop-blur border border-border-slate rounded-lg shadow-xl flex flex-col ${tvMode ? "p-1.5 gap-1" : "p-1 gap-0.5"
          }`}
      >
        <button
          onClick={() => map.zoomIn()}
          className={`flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all ${tvMode ? "size-11" : "size-9"
            }`}
          title="Aumentar Zoom"
        >
          <span className={`material-symbols-outlined ${tvMode ? "text-2xl" : "text-xl"}`}>
            add
          </span>
        </button>

        <button
          onClick={() => map.zoomOut()}
          className={`flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all ${tvMode ? "size-11" : "size-9"
            }`}
          title="Diminuir Zoom"
        >
          <span className={`material-symbols-outlined ${tvMode ? "text-2xl" : "text-xl"}`}>
            remove
          </span>
        </button>

        <div className={`h-px bg-border-slate ${tvMode ? "mx-2 my-1" : "mx-1.5 my-0.5"}`}></div>

        <button
          onClick={() =>
            map.fitBounds(BRAZIL_BOUNDS, {
              animate: true,
              padding: [50, 50],
            })
          }
          className={`flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all ${tvMode ? "size-11" : "size-9"
            }`}
          title="Centralizar Mapa"
        >
          <span className={`material-symbols-outlined ${tvMode ? "text-2xl" : "text-lg"}`}>
            my_location
          </span>
        </button>
      </div>
    </div>
  );
}
