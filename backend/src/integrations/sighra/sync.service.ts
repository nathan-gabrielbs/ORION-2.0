import type Database from "better-sqlite3";
import type { Server } from "socket.io";
import type { SighraClient } from "./client.js";
import {
  buildLocationFromPosition,
  isMaintenanceStatus,
  isOperationalMacro,
  mapMacroToKanbanStatus,
  resolveDriverValue,
  resolveVehicleStatusWithoutOperationalMacro,
} from "./macro-utils.js";
import { cleanupOldMacrosHistory, getLastOperationalMacroFromHistory } from "./macro-history.js";
import {
  buildTimeWindows,
  getRecentRangeLocal,
  getTodayStartLocal,
  parseSighraDate,
} from "../shared/datetime.js";
import { safeFloat, safeInt } from "../shared/values.js";
import type { VehicleModule } from "../../modules/vehicles/index.js";
import { normalizePlate } from "../../shared/utils/plate.js";

export type SighraSyncStatus = {
  success: boolean;
  lastUpdate: string | null;
  error: string | null;
  vehicleCount?: number;
  macroCount?: number;
};

export type SighraSyncService = ReturnType<typeof createSighraSyncService>;

export function createSighraSyncService(deps: {
  db: Database.Database;
  io: Server;
  sighraClient: SighraClient;
  vehicleRepo: VehicleModule;
  soapBaseUrl: string;
}) {
  const { db, io, sighraClient, vehicleRepo, soapBaseUrl } = deps;

  let lastSyncStatus: SighraSyncStatus = {
    success: false,
    lastUpdate: null,
    error: null,
    vehicleCount: 0,
  };

  let lastMacrosStatus: SighraSyncStatus = {
    success: false,
    lastUpdate: null,
    error: null,
    macroCount: 0,
  };

  const processMacrosBatch = async (macrosData: any[]) => {
    if (!macrosData.length) {
      return { insertedCount: 0, kanbanUpdatedCount: 0 };
    }

    const insertMacro = db.prepare(`
      INSERT INTO macros_history (
        plate,
        driver,
        macro_id,
        macro_description,
        macro_group,
        created_at,
        latitude,
        longitude,
        city,
        state,
        raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const existsMacro = db.prepare(`
      SELECT id
      FROM macros_history
      WHERE plate = ?
        AND macro_id = ?
        AND created_at = ?
      LIMIT 1
    `);

    const getVehicleStmt = db.prepare(`
      SELECT *
      FROM vehicles
      WHERE plate = ?
    `);

    const updateLastMacroStmt = db.prepare(`
      UPDATE vehicles
      SET last_macro = ?,
          last_macro_time = ?,
          driver = ?,
          course = COALESCE(?, course),
          last_update = CURRENT_TIMESTAMP
      WHERE plate = ?
    `);

    const updateOperationalStatusStmt = db.prepare(`
      UPDATE vehicles
      SET status = CASE
            WHEN status IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN status
            ELSE ?
          END,
          last_operational_macro = ?,
          last_operational_macro_time = ?,
          driver = ?,
          last_operational_driver = ?,
          last_operational_location = ?,
          trip_start_time = CASE
            WHEN status IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN trip_start_time
            ELSE ?
          END,
          last_update = CURRENT_TIMESTAMP
      WHERE plate = ?
    `);

    let insertedCount = 0;
    let kanbanUpdatedCount = 0;

    const latestMacroByPlate = new Map<string, any>();
    const latestOperationalByPlate = new Map<string, any>();

    for (const macro of macrosData) {
      const plate = normalizePlate(macro?.placa || macro?.veiculo?.placa);
      if (!plate) continue;

      const driverRaw =
        macro?.motorista?.nome || (typeof macro?.motorista === "string" ? macro.motorista : "");

      const driver = resolveDriverValue(driverRaw, null);

      const macroId = String(macro?.id ?? macro?.idMacro ?? "").trim();
      const macroDescription = String(macro?.macro ?? macro?.descricao ?? "").trim();
      const macroGroup = String(macro?.tipoMacro ?? macro?.grupo ?? "").trim();
      const createdAt = String(macro?.dataMacro ?? macro?.dataRecepcao ?? "").trim();

      const latitude = safeFloat(macro?.latitude ?? macro?.lat, 0);
      const longitude = safeFloat(macro?.longitude ?? macro?.lng, 0);
      const city = String(macro?.cidade ?? "").trim();
      const state = String(macro?.estado ?? "").trim();

      if (!createdAt) continue;

      const alreadyExists = existsMacro.get(plate, macroId, createdAt) as any;
      if (!alreadyExists) {
        insertMacro.run(
          plate,
          driver,
          macroId,
          macroDescription,
          macroGroup,
          createdAt,
          latitude,
          longitude,
          city,
          state,
          JSON.stringify(macro),
        );
        insertedCount++;
      }

      const currentLatest = latestMacroByPlate.get(plate);
      if (!currentLatest) {
        latestMacroByPlate.set(plate, macro);
      } else {
        const currentDate = parseSighraDate(
          currentLatest?.dataMacro ?? currentLatest?.dataRecepcao,
        );
        const newDate = parseSighraDate(createdAt);
        if (newDate >= currentDate) {
          latestMacroByPlate.set(plate, macro);
        }
      }

      if (isOperationalMacro(macroDescription)) {
        const currentOperational = latestOperationalByPlate.get(plate);
        if (!currentOperational) {
          latestOperationalByPlate.set(plate, macro);
        } else {
          const currentDate = parseSighraDate(
            currentOperational?.dataMacro ?? currentOperational?.dataRecepcao,
          );
          const newDate = parseSighraDate(createdAt);
          if (newDate >= currentDate) {
            latestOperationalByPlate.set(plate, macro);
          }
        }
      }
    }

    for (const [plate, macro] of latestMacroByPlate.entries()) {
      const macroDescription = String(macro?.macro ?? macro?.descricao ?? "").trim();
      const macroTime = String(macro?.dataMacro ?? macro?.dataRecepcao ?? "").trim();
      const driverRaw = macro?.motorista?.nome || macro?.motorista || null;

      const course = safeFloat(macro?.curso ?? macro?.course ?? macro?.heading, 0);

      const vehicle = getVehicleStmt.get(plate) as any;
      if (!vehicle) continue;

      const finalDriver = String(driverRaw || "").trim() || "SEM MOTORISTA";

      const currentLastMacroTime = parseSighraDate(vehicle.last_macro_time);
      const newLastMacroTime = parseSighraDate(macroTime);

      if (newLastMacroTime >= currentLastMacroTime) {
        updateLastMacroStmt.run(macroDescription, macroTime, finalDriver, course, plate);
      }
    }

    for (const [plate, macro] of latestOperationalByPlate.entries()) {
      const macroDescription = String(macro?.macro ?? macro?.descricao ?? "").trim();
      const macroTime = String(macro?.dataMacro ?? macro?.dataRecepcao ?? "").trim();
      const driverRaw = macro?.motorista?.nome || macro?.motorista || null;

      const newStatus = mapMacroToKanbanStatus(macroDescription);
      if (!newStatus) continue;

      const vehicle = getVehicleStmt.get(plate) as any;
      if (!vehicle) continue;

      const finalDriver = String(driverRaw || "").trim() || "SEM MOTORISTA";

      const currentOperationalTime = parseSighraDate(vehicle.last_operational_macro_time);
      const newOperationalTime = parseSighraDate(macroTime);

      if (newOperationalTime < currentOperationalTime) {
        continue;
      }

      const tripStartTime =
        newStatus === "EM TRÂNSITO" ? vehicle.trip_start_time || new Date().toISOString() : null;

      updateOperationalStatusStmt.run(
        newStatus,
        macroDescription,
        macroTime,
        finalDriver,
        finalDriver,
        vehicle.location_name,
        tripStartTime,
        plate,
      );

      const updated = vehicleRepo.getVehicleByPlate(plate);
      if (updated) {
        kanbanUpdatedCount++;
        io.emit("vehicle:updated", updated);
      }
    }

    return { insertedCount, kanbanUpdatedCount };
  };

  const reconcileVehiclesWithoutActiveMacro = () => {
    const vehicles = db.prepare(`SELECT * FROM vehicles`).all() as any[];

    const updateStmt = db.prepare(`
      UPDATE vehicles
      SET status = ?,
          last_operational_macro = ?,
          last_operational_macro_time = ?,
          trip_start_time = ?,
          last_update = CURRENT_TIMESTAMP
      WHERE plate = ?
    `);

    for (const vehicle of vehicles) {
      if (isMaintenanceStatus(vehicle.status)) {
        continue;
      }

      const historyMacro = getLastOperationalMacroFromHistory(db, vehicle.plate);

      if (!historyMacro) {
        const fallbackStatus = resolveVehicleStatusWithoutOperationalMacro(vehicle);
        const tripStartTime =
          fallbackStatus === "EM TRÂNSITO"
            ? vehicle.trip_start_time || new Date().toISOString()
            : null;

        updateStmt.run(fallbackStatus, null, null, tripStartTime, vehicle.plate);

        const updated = vehicleRepo.getVehicleByPlate(vehicle.plate);
        if (updated) io.emit("vehicle:updated", updated);
        continue;
      }

      const mappedStatus =
        mapMacroToKanbanStatus(historyMacro.macro_description) || "VEÍCULO VAZIO";
      const tripStartTime =
        mappedStatus === "EM TRÂNSITO" ? vehicle.trip_start_time || new Date().toISOString() : null;

      updateStmt.run(
        mappedStatus,
        historyMacro.macro_description,
        historyMacro.created_at,
        tripStartTime,
        vehicle.plate,
      );

      const updated = vehicleRepo.getVehicleByPlate(vehicle.plate);
      if (updated) io.emit("vehicle:updated", updated);
    }
  };

  const pollSighraPositions = async () => {
    try {
      console.log(`Polling SIGHRA Positions at ${soapBaseUrl}...`);

      const positions = await sighraClient.fetchLastPositions();

      if (!positions.length) {
        console.log("No positions returned from SIGHRA");

        lastSyncStatus = {
          success: false,
          lastUpdate: new Date().toISOString(),
          error: "Nenhuma posição retornada",
          vehicleCount: 0,
        };

        io.emit("sync:status", lastSyncStatus);
        return;
      }

      console.log(`Received ${positions.length} positions from SIGHRA`);

      let updatedCount = 0;

      const getVehicleStmt = db.prepare(`
        SELECT *
        FROM vehicles
        WHERE plate = ?
      `);

      const updateVehicleStmt = db.prepare(`
        UPDATE vehicles
        SET lat = ?,
            lng = ?,
            speed = ?,
            course = ?,
            location_name = CASE
              WHEN status IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN location_name
              ELSE ?
            END,
            status = CASE
              WHEN status IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN status
              ELSE ?
            END,
            driver = ?,
            trip_start_time = CASE
              WHEN status IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN trip_start_time
              ELSE ?
            END,
            last_operational_driver = CASE
              WHEN status NOT IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN ?
              ELSE last_operational_driver
            END,
            last_operational_location = CASE
              WHEN status NOT IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN ?
              ELSE last_operational_location
            END,
            last_operational_speed = CASE
              WHEN status NOT IN ('EM MANUTENÇÃO', 'EM MANUTENCAO') THEN ?
              ELSE last_operational_speed
            END,
            last_update = CURRENT_TIMESTAMP
        WHERE plate = ?
      `);

      for (const data of positions as any[]) {
        const plate = normalizePlate(data?.placa);
        if (!plate) continue;

        const lat = safeFloat(data?.latitude, 0);
        const lng = safeFloat(data?.longitude, 0);
        const speed = safeInt(data?.velocidade, 0);
        const course = safeFloat(data?.curso ?? data?.course ?? data?.heading, 0);

        const current = getVehicleStmt.get(plate) as any;
        if (!current) continue;

        const driverNameRaw =
          data?.motorista?.nome ||
          data?.motorista?.nomeMotorista ||
          data?.driver ||
          data?.nomeMotorista ||
          (typeof data?.motorista === "string" ? data.motorista : "");

        const finalDriver = resolveDriverValue(driverNameRaw, current.driver);

        const operationalLocation = buildLocationFromPosition(data as Record<string, unknown>);

        let newStatus = current.status;
        let tripStartTime = current.trip_start_time;

        const lastOperationalStatus = current.last_operational_macro
          ? mapMacroToKanbanStatus(current.last_operational_macro)
          : null;

        if (lastOperationalStatus) {
          newStatus = lastOperationalStatus;

          if (newStatus === "EM TRÂNSITO" && !tripStartTime) {
            tripStartTime = new Date().toISOString();
          }

          if (newStatus !== "EM TRÂNSITO") {
            tripStartTime = null;
          }
        } else {
          newStatus = resolveVehicleStatusWithoutOperationalMacro(current);
          tripStartTime =
            newStatus === "EM TRÂNSITO"
              ? current.trip_start_time || new Date().toISOString()
              : null;
        }

        updateVehicleStmt.run(
          lat,
          lng,
          speed,
          course,
          operationalLocation,
          newStatus,
          finalDriver,
          tripStartTime,
          finalDriver,
          operationalLocation,
          speed,
          plate,
        );

        const updated = vehicleRepo.getVehicleByPlate(plate);
        if (updated) {
          updatedCount++;
          io.emit("vehicle:updated", updated);
        }
      }

      lastSyncStatus = {
        success: true,
        lastUpdate: new Date().toISOString(),
        error: null,
        vehicleCount: updatedCount,
      };
    } catch (error: any) {
      console.error("Error polling SIGHRA positions:", error.message);

      lastSyncStatus = {
        success: false,
        lastUpdate: new Date().toISOString(),
        error: error.message,
        vehicleCount: 0,
      };
    }

    io.emit("sync:status", lastSyncStatus);
  };

  const pollSighraMacros = async (fullLoad = false) => {
    try {
      let totalInserted = 0;
      let totalKanbanUpdated = 0;

      cleanupOldMacrosHistory(db);

      if (fullLoad) {
        const start = getTodayStartLocal();
        const end = new Date();
        const windows = buildTimeWindows(start, end, 30);

        console.log(`Polling SIGHRA Macros in ${windows.length} window(s) for full day load...`);

        for (const window of windows) {
          console.log(`Macros window: ${window.dataIni} -> ${window.dataFim}`);

          const macrosData = await sighraClient.fetchMacrosByRange(window.dataIni, window.dataFim);

          if (macrosData.length >= 1000) {
            console.warn(
              `A janela ${window.dataIni} -> ${window.dataFim} retornou ${macrosData.length} macros. Reduza para 15 min se necessário.`,
            );
          }

          const result = await processMacrosBatch(macrosData);
          totalInserted += result.insertedCount;
          totalKanbanUpdated += result.kanbanUpdatedCount;
        }
      } else {
        const { dataIni, dataFim } = getRecentRangeLocal(15);

        console.log(`Polling SIGHRA Macros incremental: ${dataIni} -> ${dataFim}`);

        const macrosData = await sighraClient.fetchMacrosByRange(dataIni, dataFim);

        if (macrosData.length >= 1000) {
          console.warn(
            `A janela incremental ${dataIni} -> ${dataFim} retornou ${macrosData.length} macros. Reduza o intervalo.`,
          );
        }

        const result = await processMacrosBatch(macrosData);
        totalInserted += result.insertedCount;
        totalKanbanUpdated += result.kanbanUpdatedCount;
      }

      reconcileVehiclesWithoutActiveMacro();

      lastMacrosStatus = {
        success: true,
        lastUpdate: new Date().toISOString(),
        error: null,
        macroCount: totalInserted,
      };

      console.log(`Updated ${totalKanbanUpdated} kanban status(es) from macros`);
      io.emit("macros:status", lastMacrosStatus);
    } catch (error: any) {
      console.error("Error polling SIGHRA macros:", error.message);

      lastMacrosStatus = {
        success: false,
        lastUpdate: new Date().toISOString(),
        error: error.message,
        macroCount: 0,
      };

      io.emit("macros:status", lastMacrosStatus);
    }
  };
  return {
    pollPositions: pollSighraPositions,
    pollMacros: pollSighraMacros,
    getSyncStatus: () => lastSyncStatus,
    getMacrosStatus: () => lastMacrosStatus,
  };
}
