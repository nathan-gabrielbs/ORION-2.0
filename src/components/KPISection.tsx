interface Props {
  stats: {
    total: number;
    inOperation: number;
    emptyVehicle: number;
    inMaintenance: number;
    efficiency: number;
    efficiencyDelta: number;
    startOfDayEfficiency: number;
    transit: number;
    loading: number;
    unloading: number;
  };
}

export function KPISection({ stats }: Props) {
  return (
    <>
      <style>
        {`
          @keyframes operationBorderRGB {
            0% {
              border-left-color: rgb(16, 185, 129);
            }
            33% {
              border-left-color: rgb(245, 158, 11);
            }
            66% {
              border-left-color: rgb(139, 92, 246);
            }
            100% {
              border-left-color: rgb(16, 185, 129);
            }
          }

          .operation-rgb-border {
            animation: operationBorderRGB 4s linear infinite;
          }
        `}
      </style>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
        {/* Total Frota */}
        <div className="bg-card-dark rounded-xl p-4 sm:p-5 lg:p-6 border-l-4 border-primary inner-glow shadow-2xl h-full flex flex-col">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-2">
                Total Frota
              </p>
              <h3 className="font-black text-white tabular-nums text-[clamp(1.5rem,2.2vw,1.95rem)] tracking-tighter">
                {stats.total}
              </h3>
            </div>
            <div className="p-3 bg-primary/10 rounded-xl text-primary">
              <span className="material-symbols-outlined text-2xl">local_shipping</span>
            </div>
          </div>

          <div className="mt-auto pt-5 flex items-center gap-2">
            <span className="text-cyan-400 text-xs font-black flex items-center bg-cyan-500/10 px-2 py-0.5 rounded-full">
              <span className="material-symbols-outlined text-sm">fleet</span> ATIVA
            </span>
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
              base operacional
            </span>
          </div>
        </div>

                {/* Em Operação */}
        <div className="bg-card-dark rounded-xl p-4 sm:p-5 lg:p-6 border-l-4 inner-glow shadow-2xl h-full flex flex-col operation-rgb-border">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-2">
                Em Operação
              </p>
              <h3 className="font-black text-white tabular-nums text-[clamp(1.5rem,2.2vw,1.95rem)] tracking-tighter">
                {stats.inOperation}
              </h3>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
              <span className="material-symbols-outlined text-2xl">route</span>
            </div>
          </div>

          <div className="mt-auto pt-5 flex items-center gap-3 flex-wrap text-[10px] font-black uppercase tracking-wider">
            <span className="text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <span className="material-symbols-outlined text-sm">arrow_upward</span>
              {stats.total ? Math.round(((stats.transit ?? 0) / stats.total) * 100) : 0}% TRÂNSITO
            </span>

            <span className="text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-full">
              <span className="material-symbols-outlined text-sm">arrow_upward</span>
              {stats.total ? Math.round(((stats.loading ?? 0) / stats.total) * 100) : 0}% CARREGAMENTO
            </span>

            <span className="text-violet-400 flex items-center gap-1 bg-violet-500/10 px-2 py-0.5 rounded-full">
              <span className="material-symbols-outlined text-sm">arrow_upward</span>
              {stats.total ? Math.round(((stats.unloading ?? 0) / stats.total) * 100) : 0}% DESCARREGAMENTO
            </span>
          </div>
        </div>

        {/* Eficiência */}
        <div className="bg-card-dark rounded-xl p-4 sm:p-5 lg:p-6 border-l-4 border-emerald-500 inner-glow shadow-2xl h-full flex flex-col">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-2">
                Eficiência
              </p>
              <h3 className="font-black text-white tabular-nums text-[clamp(1.5rem,2.2vw,1.95rem)] tracking-tighter">
                {stats.efficiency}%
              </h3>
            </div>

            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500">
              <span className="material-symbols-outlined text-2xl">bolt</span>
            </div>
          </div>

          <div className="mt-auto pt-5">
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${stats.efficiency}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
              <span
                className={`text-sm sm:text-base font-black px-2 py-0.5 rounded-full break-words ${
                  stats.efficiencyDelta >= 0
                    ? "text-emerald-400 bg-emerald-500/10"
                    : "text-rose-400 bg-rose-500/10"
                }`}
              >
                {stats.efficiencyDelta >= 0 ? "+" : ""}
                {stats.efficiencyDelta}% vs início do dia
              </span>

              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              </span>
            </div>
          </div>
        </div>

        {/* Veículo Vazio */}
        <div className="bg-card-dark rounded-xl p-4 sm:p-5 lg:p-6 border-l-4 border-cyan-400 inner-glow shadow-2xl h-full flex flex-col">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-2">
                Veículo Vazio
              </p>
              <h3 className="font-black text-white tabular-nums text-[clamp(1.5rem,2.2vw,1.95rem)] tracking-tighter">
                {stats.emptyVehicle}
              </h3>
            </div>
            <div className="p-3 bg-cyan-400/10 rounded-xl text-cyan-400">
              <span className="material-symbols-outlined text-2xl">local_shipping</span>
            </div>
          </div>

          <div className="mt-auto pt-5 flex items-center gap-3 flex-wrap text-[14px] font-black uppercase tracking-wider">
            <span className="text-cyan-400 flex items-center gap-1 bg-cyan-400/10 px-2 py-0.5 rounded-full">
              <span className="material-symbols-outlined text-sm">percent</span>
              {stats.total ? Math.round((stats.emptyVehicle / stats.total) * 100) : 0}% DA FROTA
            </span>
          </div>
        </div>

        {/* Em Manutenção */}
        <div className="bg-card-dark rounded-xl p-4 sm:p-5 lg:p-6 border-l-4 border-rose-500 inner-glow shadow-2xl relative group h-full flex flex-col">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-2">
                Em Manutenção
              </p>
              <h3 className="font-black text-white tabular-nums text-[clamp(1.5rem,2.2vw,1.95rem)] tracking-tighter">
                {stats.inMaintenance}
              </h3>
            </div>
            <div className="p-3 bg-rose-500/10 rounded-xl text-rose-500">
              <span className="material-symbols-outlined text-2xl">build</span>
            </div>
          </div>

          <div className="mt-auto pt-5 flex items-center justify-between gap-3 flex-wrap text-[14px] font-black uppercase tracking-wider">
            <span className="text-rose-400 flex items-center gap-1 bg-rose-500/10 px-2 py-0.5 rounded-full">
              <span className="material-symbols-outlined text-sm">percent</span>
              {stats.total ? Math.round((stats.inMaintenance / stats.total) * 100) : 0}% DA FROTA
            </span>
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">info</span>
              Entrada manual
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
