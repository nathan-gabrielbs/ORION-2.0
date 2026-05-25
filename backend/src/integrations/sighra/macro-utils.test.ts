import { describe, expect, it } from "vitest";
import {
  isMaintenanceStatus,
  isOperationalMacro,
  mapMacroToKanbanStatus,
  mapTrackerLocation,
  normalizeDriverName,
  resolveDriverValue,
  resolveVehicleStatusWithoutOperationalMacro,
} from "./macro-utils.js";

describe("macro-utils", () => {
  describe("mapMacroToKanbanStatus", () => {
    it("maps operational macros to kanban statuses", () => {
      expect(mapMacroToKanbanStatus("AGUARD. CARREGA")).toBe("AGUARDANDO CARREGAMENTO");
      expect(mapMacroToKanbanStatus("EFET. DESCARREGA")).toBe("EFETUANDO DESCARREGAMENTO");
      expect(mapMacroToKanbanStatus("IN. VIAGEM CARREGADO")).toBe("EM TRÂNSITO");
      expect(mapMacroToKanbanStatus("REIN. VIAGEM VAZIO")).toBe("VEÍCULO VAZIO");
    });

    it("returns null for unknown macros", () => {
      expect(mapMacroToKanbanStatus("PARADA PARA ABASTECIMENTO")).toBeNull();
    });
  });

  describe("isOperationalMacro", () => {
    it("detects operational macro names", () => {
      expect(isOperationalMacro("EFET. CARREGA")).toBe(true);
      expect(isOperationalMacro("PARADA PARA ABASTECIMENTO")).toBe(false);
    });
  });

  describe("isMaintenanceStatus", () => {
    it("accepts maintenance status with or without accents", () => {
      expect(isMaintenanceStatus("EM MANUTENÇÃO")).toBe(true);
      expect(isMaintenanceStatus("EM MANUTENCAO")).toBe(true);
      expect(isMaintenanceStatus("EM TRÂNSITO")).toBe(false);
    });
  });

  describe("mapTrackerLocation", () => {
    it("normalizes known problematic tracker locations", () => {
      const mapped = mapTrackerLocation(
        "Contorno Sao Paulo Curitiba Florianopolis - Nao foi possivel definir",
      );

      expect(mapped).toContain("DAF Barigüi Caminhões");
    });

    it("returns original location when no rule matches", () => {
      expect(mapTrackerLocation("Curitiba, PR")).toBe("Curitiba, PR");
    });
  });

  describe("resolveVehicleStatusWithoutOperationalMacro", () => {
    it("uses last operational macro when present", () => {
      const status = resolveVehicleStatusWithoutOperationalMacro({
        last_operational_macro: "AGUARD. CARREGA",
      });

      expect(status).toBe("AGUARDANDO CARREGAMENTO");
    });

    it("returns EM TRÂNSITO when vehicle has active raster route", () => {
      const status = resolveVehicleStatusWithoutOperationalMacro({
        route_origin: "Curitiba, PR",
      });

      expect(status).toBe("EM TRÂNSITO");
    });

    it("falls back to VEÍCULO VAZIO", () => {
      expect(resolveVehicleStatusWithoutOperationalMacro({})).toBe("VEÍCULO VAZIO");
    });
  });

  describe("driver helpers", () => {
    it("normalizes driver suffix codes", () => {
      expect(normalizeDriverName("João Silva - 123")).toBe("João Silva");
    });

    it("resolves driver with fallback chain", () => {
      expect(resolveDriverValue("Maria Souza", "Old Driver")).toBe("Maria Souza");
      expect(resolveDriverValue("", "Old Driver")).toBe("Old Driver");
      expect(resolveDriverValue("", null)).toBe("SEM MOTORISTA");
    });
  });
});
