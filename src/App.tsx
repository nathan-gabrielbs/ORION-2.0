import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Vehicle, ViewType } from "./types";
import { AuthUser } from "./authTypes";
import { KanbanView } from "./components/KanbanView";
import { MapView } from "./components/MapView";
import { DashboardHeader } from "./components/DashboardHeader";
import { motion, AnimatePresence } from "motion/react";
import { useScreenSize } from "./hooks/useScreenSize";

export interface SyncStatus {
  success: boolean;
  lastUpdate: string | null;
  error: string | null;
  vehicleCount: number;
}

export default function App() {
  const screen = useScreenSize();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [view, setView] = useState<ViewType>("KANBAN");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [tvMode, setTvMode] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    success: false,
    lastUpdate: null,
    error: null,
    vehicleCount: 0,
  });
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const KANBAN_TIME = 60000;
  const MAP_TIME = 60000;

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const response = await fetch("/api/auth/me", { credentials: "include" });
        if (!response.ok) {
          window.location.href = "/login";
          return;
        }
        const data = await response.json();
        setAuthUser(data.user);
      } catch {
        window.location.href = "/login";
      } finally {
        setAuthLoading(false);
      }
    };

    loadAuth();
  }, []);

  useEffect(() => {
    if (!authUser) return;

    const newSocket = io(window.location.origin, { withCredentials: true });
    setSocket(newSocket);

    newSocket.on("init:vehicles", (data: Vehicle[]) => {
      setVehicles(data);
    });

    newSocket.on("vehicle:updated", (updatedVehicle: Vehicle) => {
      if (!updatedVehicle) return;

      setVehicles((prev) => {
        const exists = prev.some((v) => v?.plate === updatedVehicle.plate);
        if (!exists) return [...prev, updatedVehicle];

        return prev.map((v) =>
          v && v.plate === updatedVehicle.plate ? updatedVehicle : v
        );
      });
    });

    newSocket.on("sync:status", (status: SyncStatus) => {
      setSyncStatus(status);
    });

    fetch("/api/sync/status")
      .then((res) => res.json())
      .then((data) => setSyncStatus(data))
      .catch((err) => console.error("Error fetching sync status:", err));

    return () => {
      newSocket.close();
    };
  }, [authUser]);

  useEffect(() => {
    if (!tvMode) return;

    const delay = view === "KANBAN" ? KANBAN_TIME : MAP_TIME;
    const timer = window.setTimeout(() => {
      setView(view === "KANBAN" ? "MAPA" : "KANBAN");
    }, delay);

    return () => window.clearTimeout(timer);
  }, [tvMode, view]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = !!document.fullscreenElement;
      setTvMode(isFullscreen);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  if (authLoading || !authUser) {
    return <div className="h-screen w-screen bg-background-dark" />;
  }

  return (
    <div
      className={`flex flex-col h-screen overflow-x-hidden overflow-y-hidden bg-background-dark text-white transition-all duration-300 ${tvMode ? "tv-mode" : ""
        }`}
    >
      <DashboardHeader
        view={view}
        setView={setView}
        syncStatus={syncStatus}
        tvMode={tvMode}
        setTvMode={setTvMode}
        authUser={authUser}
      />

      <AnimatePresence mode="wait">
        {view === "KANBAN" ? (
          <motion.main
            key="kanban"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`w-full overflow-y-auto custom-scrollbar transition-all duration-300 ${tvMode
              ? "px-[clamp(0.75rem,1.8vw,2rem)] py-[clamp(0.5rem,1.3vh,1.5rem)]"
              : screen.isMobile
                ? "px-3 py-4"
                : "px-4 sm:px-5 lg:px-6 py-5 sm:py-6 lg:py-8"
              }`}
          >
            <KanbanView vehicles={vehicles} tvMode={tvMode} />
          </motion.main>
        ) : (
          <motion.main
            key="map"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex overflow-hidden relative"
          >
            <MapView vehicles={vehicles} tvMode={tvMode} />
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  );
}
