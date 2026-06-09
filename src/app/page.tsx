'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { createClient } from '@/lib/supabase/client';
import '../app/globals.css';
import {
  fetchAdmissions, fetchSlots, downloadExcel,
  computeKPIs, buildAgenda, buildWeeklyChart,
  buildGlobalWeeklyChart, buildGlobalAgenda,
  computeSlotsByBranch, computeDoctorStats,
  type BranchKPIs, type AdmissionResponse, type DoctorStats,
} from '@/lib/api';
import { branches, branchOrder, activeBranches, type BranchKey } from '@/lib/data';
import {
  IconUsers, IconUserPlus, IconCalendarOff,
  IconMinus, IconCalendarCheck, IconDownload, IconRefresh,
  IconArrowUpRight, IconChevronUp, IconChevronDown, IconSelector,
} from '@tabler/icons-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  BarChart, Bar,
} from 'recharts';

function todayStr() { return new Date().toISOString().split('T')[0]; }
function monthStartStr() { const t = todayStr(); return t.slice(0, 8) + '01'; }

const ACTIVE_IDS = activeBranches.map(k => branches[k].apiId);

const EMPTY_KPI: BranchKPIs = {
  branchId: '', branchName: '',
  pacientesNuevos: 0, pacientesAtendidos: 0,
  turnosRechazados: 0, ausentes: 0, derivaciones: 0,
};

type View = 'dashboard' | 'medicos';
type AgendaSortCol = 'hora' | 'paciente' | 'medico' | 'tipo' | 'estado' | 'sucursal' | 'dni' | 'obraSocial';
type DocSortCol = Exclude<keyof DoctorStats, 'obrasSociales'>;
interface SortState<C extends string> { col: C | null; dir: 'asc' | 'desc'; }

export default function Dashboard() {
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setSession(!!data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(!!s);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (session === null) return null;
  if (!session) return <LoginScreen onLogin={() => setSession(true)} />;
  return <DashboardContent />;
}

function DashboardContent() {
  const [selected,    setSelected]   = useState<BranchKey>('general');
  const [dateFrom,    setDateFrom]   = useState(monthStartStr);
  const [dateTo,      setDateTo]     = useState(todayStr);
  const [pendingFrom, setPendingFrom] = useState(monthStartStr);
  const [pendingTo,   setPendingTo]   = useState(todayStr);
  const [kpiMap,      setKpiMap]     = useState<Record<string, BranchKPIs>>({});
  const [slotsMap,    setSlotsMap]   = useState<Record<string, number>>({});
  const [allAdms,     setAllAdms]    = useState<AdmissionResponse[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [error,       setError]      = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [view,        setView]       = useState<View>('dashboard');
  const [agendaSort,  setAgendaSort] = useState<SortState<AgendaSortCol>>({ col: null, dir: 'asc' });
  const [docSort,       setDocSort]       = useState<SortState<DocSortCol>>({ col: 'atendidos', dir: 'desc' });
  const [expandedDoctor, setExpandedDoctor] = useState<string | null>(null);

  const loadAll = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const [adms, slots] = await Promise.all([
        fetchAdmissions(from, to),
        fetchSlots(to, to),
      ]);
      setKpiMap(computeKPIs(adms));
      setSlotsMap(computeSlotsByBranch(slots));
      setAllAdms(adms);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(dateFrom, dateTo); }, [loadAll, dateFrom, dateTo]);

  const handleDownload = async () => {
    setDownloading(true);
    try { await downloadExcel(dateFrom, dateTo); }
    catch (e) { console.error('Error al descargar reporte:', e); }
    finally   { setDownloading(false); }
  };

  const toggleAgendaSort = (col: AgendaSortCol) =>
    setAgendaSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'asc' });

  const toggleDocSort = (col: DocSortCol) =>
    setDocSort(prev => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: col === 'nombre' ? 'asc' : 'desc' });

  const isGeneral = selected === 'general';
  const meta      = branches[selected];

  const globalKpi = useMemo<BranchKPIs>(() =>
    activeBranches.reduce((acc, key) => {
      const k = kpiMap[branches[key].apiId] ?? EMPTY_KPI;
      return {
        branchId: 'global', branchName: 'General',
        pacientesNuevos:    acc.pacientesNuevos    + k.pacientesNuevos,
        pacientesAtendidos: acc.pacientesAtendidos + k.pacientesAtendidos,
        turnosRechazados:   acc.turnosRechazados   + k.turnosRechazados,
        ausentes:           acc.ausentes           + k.ausentes,
        derivaciones:       acc.derivaciones       + k.derivaciones,
      };
    }, { ...EMPTY_KPI })
  , [kpiMap]);

  const globalSlots = useMemo(() =>
    activeBranches.reduce((s, key) => s + (slotsMap[branches[key].apiId] ?? 0), 0)
  , [slotsMap]);

  const totalAtendidos = useMemo(() =>
    activeBranches.reduce((s, k) => s + (kpiMap[branches[k].apiId]?.pacientesAtendidos ?? 0), 0)
  , [kpiMap]);

  const kpi        = isGeneral ? globalKpi : (kpiMap[meta.apiId] ?? EMPTY_KPI);
  const disponibles = isGeneral ? globalSlots : (slotsMap[meta.apiId] ?? 0);
  const total      = kpi.pacientesAtendidos + disponibles + kpi.ausentes + kpi.turnosRechazados;
  const ocupacion  = total > 0 ? Math.round((kpi.pacientesAtendidos / total) * 100) : 0;

  const agenda = useMemo(() => {
    if (allAdms.length === 0) return [];
    if (selected === 'general') return buildGlobalAgenda(allAdms, ACTIVE_IDS);
    return buildAgenda(allAdms, branches[selected].apiId);
  }, [selected, allAdms]);

  const sortedAgenda = useMemo(() => {
    if (!agendaSort.col) return agenda;
    return [...agenda].sort((a, b) => {
      const va = String(a[agendaSort.col!] ?? '');
      const vb = String(b[agendaSort.col!] ?? '');
      const cmp = va.localeCompare(vb, 'es', { numeric: true });
      return agendaSort.dir === 'asc' ? cmp : -cmp;
    });
  }, [agenda, agendaSort]);

  const weekly = useMemo(() => {
    if (allAdms.length === 0) return [];
    if (selected === 'general') return buildGlobalWeeklyChart(allAdms, ACTIVE_IDS);
    return buildWeeklyChart(allAdms, branches[selected].apiId);
  }, [selected, allAdms]);

  const doctorStats = useMemo(() =>
    computeDoctorStats(allAdms, isGeneral ? ACTIVE_IDS : [meta.apiId])
  , [allAdms, isGeneral, meta]);

  const sortedDoctors = useMemo(() => {
    if (!docSort.col) return doctorStats;
    return [...doctorStats].sort((a, b) => {
      const va = a[docSort.col!];
      const vb = b[docSort.col!];
      const cmp = typeof va === 'number'
        ? (va as number) - (vb as number)
        : String(va).localeCompare(String(vb), 'es');
      return docSort.dir === 'asc' ? cmp : -cmp;
    });
  }, [doctorStats, docSort]);

  const chartDoctors = useMemo(() =>
    doctorStats.slice(0, 12).map(d => ({ name: d.nombre, atendidos: d.atendidos }))
  , [doctorStats]);

  const pieData = isGeneral
    ? activeBranches.map(key => ({
        name:  branches[key].shortName,
        value: kpiMap[branches[key].apiId]?.pacientesAtendidos ?? 0,
        color: branches[key].color,
      }))
    : [
        { name: 'Atendidos',  value: kpi.pacientesAtendidos, color: '#B8BD45' },
        { name: 'Nuevos',     value: kpi.pacientesNuevos,    color: '#147D78' },
        { name: 'Rechazados', value: kpi.turnosRechazados,   color: '#f43f5e' },
        { name: 'Ausentes',   value: kpi.ausentes,           color: '#fb923c' },
        { name: 'Derivados',  value: kpi.derivaciones,       color: '#005450' },
      ];

  const obraSocialData = useMemo(() => {
    const branchIds = isGeneral ? new Set(ACTIVE_IDS) : new Set([meta.apiId]);
    const counts: Record<string, number> = {};
    for (const item of allAdms) {
      if (!branchIds.has(item.admission.branchId)) continue;
      const os = item.admission.patient?.actor?.obraSocial?.trim() || '—';
      counts[os] = (counts[os] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allAdms, isGeneral, meta]);

  const chartColor = isGeneral ? '#147D78' : meta.color;

  if (loading && allAdms.length === 0) return <LoadingScreen />;

  return (
    <div className="layout-root">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="logo-area">
          <div className="sidebar-logo-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-ocularyb.png"
              alt="OcularYB"
              className="sidebar-logo"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          {/* <div className="logo-sub">Panel de Gestión</div> */}
        </div>

        <div className="nav-section-label">Sucursales</div>
        {branchOrder.map(key => {
          const b = branches[key];
          const count = loading ? '…'
            : key === 'general'
              ? totalAtendidos
              : (kpiMap[b.apiId]?.pacientesAtendidos ?? '—');
          return (
            <button
              key={key}
              className={`branch-btn ${selected === key ? 'active' : ''}`}
              onClick={() => setSelected(key)}
            >
              <div
                className="branch-indicator"
                style={{
                  background: key === 'general'
                    ? 'linear-gradient(135deg, #147D78, #B8BD45)'
                    : b.color,
                  boxShadow: selected === key ? `0 0 0 3px ${b.color}33` : 'none',
                }}
              />
              <span className="branch-name">{b.name}</span>
              <span className="branch-count">{count}</span>
            </button>
          );
        })}

        <div style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
          <div className="nav-section-label">Resumen global</div>
          <div style={{ padding: '0.65rem', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
            {branchOrder.filter(k => k !== 'general').map(key => {
              const b    = branches[key];
              const val  = kpiMap[b.apiId]?.pacientesAtendidos ?? 0;
              const maxV = Math.max(...branchOrder.filter(k => k !== 'general').map(k => kpiMap[branches[k].apiId]?.pacientesAtendidos ?? 0), 1);
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.82rem', color: 'rgba(223,239,238,0.6)', width: 60 }}>{b.shortName}</span>
                  <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(val / maxV) * 100}%`, background: b.color, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'rgba(223,239,238,0.45)', minWidth: 22, textAlign: 'right' }}>{loading ? '…' : val}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => loadAll(dateFrom, dateTo)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', color: 'rgba(223,239,238,0.7)', cursor: 'pointer', fontSize: '0.85rem', width: '100%' }}
          >
            <IconRefresh size={15} /> Actualizar datos
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(184,189,69,0.1)', border: '1px solid rgba(184,189,69,0.2)', borderRadius: 8, padding: '8px 12px', color: '#B8BD45', cursor: downloading ? 'not-allowed' : 'pointer', fontSize: '0.85rem', width: '100%', opacity: downloading ? 0.7 : 1 }}
          >
            <IconDownload size={15} /> {downloading ? 'Descargando...' : 'Exportar Excel'}
          </button>
          <button
            onClick={async () => { const supabase = createClient(); await supabase.auth.signOut(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 8, padding: '8px 12px', color: '#f87191', cursor: 'pointer', fontSize: '0.85rem', width: '100%' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main-content">
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <div className="page-eyebrow">Panel de gestión</div>
              <h1 className="page-title">
                {isGeneral ? 'Dashboard ' : 'Sucursal '}
                <span>{isGeneral ? 'General' : meta.name}</span>
              </h1>
            </div>
            <div className="date-range-row">
              <span className="date-range-label">Desde</span>
              <input type="date" className="date-input" value={pendingFrom} max={pendingTo}
                onChange={e => setPendingFrom(e.target.value)} />
              <span className="date-range-label">Hasta</span>
              <input type="date" className="date-input" value={pendingTo} min={pendingFrom} max={todayStr()}
                onChange={e => setPendingTo(e.target.value)} />
              <button className="date-apply-btn"
                onClick={() => { setDateFrom(pendingFrom); setDateTo(pendingTo); }}>
                Aceptar
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
            <div className="period-badge">
              <span className="period-dot" style={{ background: error ? '#f43f5e' : '#B8BD45' }} />
              {loading ? 'Cargando...' : error ? 'Error de conexión' : 'Datos en tiempo real'}
            </div>
            <div className="view-tabs">
              <button className={`view-tab ${view === 'dashboard' ? 'active' : ''}`}
                onClick={() => setView('dashboard')}>Dashboard</button>
              <button className={`view-tab ${view === 'medicos' ? 'active' : ''}`}
                onClick={() => setView('medicos')}>Médicos</button>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 12, padding: '0.65rem 1rem', color: '#991b1b', fontSize: '0.82rem', flexShrink: 0 }}>
            ⚠ {error}
          </div>
        )}

        {/* ── DASHBOARD VIEW ── */}
        {view === 'dashboard' && <>
          <div className="kpi-grid">
            <KpiCard accent="linear-gradient(90deg,#147D78,#2e987d)" icon={<IconUserPlus size={44} />}>
              <div className="kpi-label">Pacientes nuevos</div>
              <div className="kpi-value">{loading ? '—' : kpi.pacientesNuevos}</div>
              <div className="kpi-trend neutral"><IconMinus size={13} />demanda espontánea</div>
            </KpiCard>
            <KpiCard accent="linear-gradient(90deg,#B8BD45,#aacd70)" icon={<IconUsers size={44} />}>
              <div className="kpi-label">Pacientes atendidos</div>
              <div className="kpi-value">{loading ? '—' : kpi.pacientesAtendidos}</div>
              <div className="kpi-trend up"><IconArrowUpRight size={13} />finalizados</div>
            </KpiCard>
            <KpiCard accent="linear-gradient(90deg,#f43f5e,#e11d48)" icon={<IconCalendarOff size={44} />}>
              <div className="kpi-label">Rechazados / Ausentes</div>
              <div className="kpi-value">{loading ? '—' : kpi.turnosRechazados + kpi.ausentes}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 3, position: 'relative' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}><span style={{ color: '#f43f5e', fontWeight: 600 }}>{kpi.turnosRechazados}</span> rech.</span>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}><span style={{ color: '#fb923c', fontWeight: 600 }}>{kpi.ausentes}</span> aus.</span>
              </div>
            </KpiCard>
            <KpiCard accent="linear-gradient(90deg,#005450,#147D78)" icon={<IconArrowUpRight size={44} />}>
              <div className="kpi-label">Derivaciones</div>
              <div className="kpi-value">{loading ? '—' : kpi.derivaciones}</div>
              <div className="kpi-trend neutral"><IconMinus size={13} />del período</div>
            </KpiCard>
            <KpiCard accent="linear-gradient(90deg,#2e987d,#B8BD45)" icon={<IconCalendarCheck size={44} />}>
              <div className="kpi-label">Turnos disponibles</div>
              <div className="kpi-value">{loading ? '—' : disponibles}</div>
              <div className="kpi-trend neutral"><IconMinus size={13} />Ocup. {ocupacion}%</div>
            </KpiCard>
          </div>

          <div className="bottom-grid">
            <div className="chart-card">
              <div className="chart-title">Actividad del período</div>
              <div className="chart-sub">{isGeneral ? 'Todas las sucursales por día' : 'Atendidos y nuevos por día'}</div>
              {weekly.length > 0 ? (
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={weekly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={chartColor} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0eded" />
                    <XAxis dataKey="dia" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#002725', border: 'none', borderRadius: 10, fontSize: 13 }} itemStyle={{ color: '#dfefee' }} />
                    <Area type="monotone" dataKey="atendidos" name="Atendidos" stroke={chartColor} strokeWidth={2} fill="url(#ga)" />
                    <Area type="monotone" dataKey="nuevos" name="Nuevos" stroke="#B8BD45" strokeWidth={2} fill="none" strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <Empty loading={loading} />}
            </div>
            <div className="chart-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="chart-title">Admisiones por obra social</div>
              <div className="chart-sub">{isGeneral ? 'Todas las sucursales' : meta.name} · {obraSocialData.length} obras sociales</div>
              {loading ? <Empty loading={loading} /> : obraSocialData.length === 0 ? <Empty loading={false} /> : (
                <div style={{ overflowY: 'auto', flex: 1, marginTop: '0.4rem', maxHeight: 150 }}>
                  <BreakdownList
                    title=""
                    items={obraSocialData}
                    barColor="#147D78"
                    countColor="#147D78"
                    barBg="#c8ebe8"
                  />
                </div>
              )}
            </div>
            <div className="chart-card">
              <div className="chart-title">{isGeneral ? 'Atendidos por sucursal' : 'Distribución de turnos'}</div>
              <div className="chart-sub">{isGeneral ? 'Comparación del período' : 'Composición del período'}</div>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={3} dataKey="value">
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.8rem', color: '#64748b' }} />
                  <Tooltip contentStyle={{ background: '#002725', border: 'none', borderRadius: 10, fontSize: 13 }} itemStyle={{ color: '#dfefee' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AGENDA */}
          <div className="chart-card agenda-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexShrink: 0 }}>
              <div>
                <div className="chart-title">Admisiones — {isGeneral ? 'Todas las sucursales' : meta.name}</div>
                <div className="chart-sub">{loading ? 'Cargando...' : `${agenda.length} registros en el período`}</div>
              </div>
            </div>
            <div className="table-scroll">
              <table className="turnos-table">
                <thead>
                  <tr>
                    {isGeneral && <SortTh col="sucursal" sort={agendaSort} onSort={toggleAgendaSort}>Sucursal</SortTh>}
                    <SortTh col="hora" sort={agendaSort} onSort={toggleAgendaSort}>Fecha / Hora</SortTh>
                    <SortTh col="paciente" sort={agendaSort} onSort={toggleAgendaSort}>Paciente</SortTh>
                    <SortTh col="dni" sort={agendaSort} onSort={toggleAgendaSort}>DNI</SortTh>
                    <SortTh col="obraSocial" sort={agendaSort} onSort={toggleAgendaSort}>Obra Social</SortTh>
                    {!isGeneral && <SortTh col="medico" sort={agendaSort} onSort={toggleAgendaSort}>Médico</SortTh>}
                    {!isGeneral && <SortTh col="tipo" sort={agendaSort} onSort={toggleAgendaSort}>Motivo</SortTh>}
                    <SortTh col="estado" sort={agendaSort} onSort={toggleAgendaSort}>Estado</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', fontSize: '0.8rem' }}>Cargando datos de la API...</td></tr>
                  ) : sortedAgenda.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', fontSize: '0.8rem' }}>Sin registros para este período</td></tr>
                  ) : sortedAgenda.map((a, i) => (
                    <tr key={i}>
                      {isGeneral && <td style={{ fontWeight: 600, fontSize: '0.9rem', color: '#002725' }}>{a.sucursal}</td>}
                      <td><span style={{ fontWeight: 600, color: '#002725', fontVariantNumeric: 'tabular-nums' }}>{a.hora}</span></td>
                      <td>{a.paciente}</td>
                      <td style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{a.dni}</td>
                      <td style={{ color: '#64748b' }}>{a.obraSocial}</td>
                      {!isGeneral && <td style={{ color: '#64748b' }}>{a.medico}</td>}
                      {!isGeneral && <td style={{ color: '#64748b' }}>{a.tipo}</td>}
                      <td>
                        <span className={`status-pill ${
                          a.estado === 'atendido'  ? 'atendido'  :
                          a.estado === 'cancelado' ? 'cancelado' :
                          a.estado === 'nuevo'     ? 'nuevo'     : 'pendiente'
                        }`}>● {a.statusLabel}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {/* ── MÉDICOS VIEW ── */}
        {view === 'medicos' && (
          <div className="doctors-layout">
            <div className="doctors-top">
              {/* Bar chart */}
              <div className="chart-card" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div className="chart-title" style={{ fontSize: '0.82rem' }}>Top médicos por atenciones</div>
                <div className="chart-sub" style={{ marginBottom: '0.4rem' }}>{isGeneral ? 'Todas las sucursales' : meta.name} · {dateFrom} → {dateTo}</div>
                {chartDoctors.length > 0 ? (
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    <ResponsiveContainer width="100%" height={Math.max(150, chartDoctors.length * 21)}>
                      <BarChart data={chartDoctors} layout="vertical" margin={{ top: 2, right: 16, left: 4, bottom: 2 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0eded" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#334155' }} axisLine={false} tickLine={false} width={100} />
                        <Tooltip contentStyle={{ background: '#002725', border: 'none', borderRadius: 10, fontSize: 12 }} itemStyle={{ color: '#dfefee' }} />
                        <Bar dataKey="atendidos" name="Atendidos" fill="#147D78" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <Empty loading={loading} />}
              </div>

              {/* KPI mini cards */}
              <div className="chart-card" style={{ flexShrink: 0 }}>
                <div className="chart-title" style={{ fontSize: '0.82rem' }}>Resumen del período</div>
                <div className="chart-sub">{isGeneral ? 'Todas las sucursales' : meta.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.4rem' }}>
                  <DocMiniStat label="Médicos activos" value={doctorStats.length} color="#147D78" />
                  <DocMiniStat label="Total atendidos" value={doctorStats.reduce((s, d) => s + d.atendidos, 0)} color="#B8BD45" />
                  <DocMiniStat label="Total nuevos" value={doctorStats.reduce((s, d) => s + d.nuevos, 0)} color="#2e987d" />
                  <DocMiniStat label="Total derivados" value={doctorStats.reduce((s, d) => s + d.derivados, 0)} color="#005450" />
                </div>
              </div>
            </div>

            {/* Doctors table */}
            <div className="chart-card doctors-table-wrap">
              <div className="chart-title" style={{ marginBottom: '0.2rem' }}>Detalle por médico</div>
              <div className="chart-sub" style={{ marginBottom: '0.5rem' }}>
                {loading ? 'Cargando...' : `${sortedDoctors.length} médicos en el período`}
              </div>
              <div className="table-scroll">
                <table className="turnos-table">
                  <thead>
                    <tr>
                      <DocSortTh col="nombre" sort={docSort} onSort={toggleDocSort}>Médico</DocSortTh>
                      <DocSortTh col="atendidos" sort={docSort} onSort={toggleDocSort}>Atendidos</DocSortTh>
                      <DocSortTh col="nuevos" sort={docSort} onSort={toggleDocSort}>Nuevos</DocSortTh>
                      <DocSortTh col="ausentes" sort={docSort} onSort={toggleDocSort}>Ausentes</DocSortTh>
                      <DocSortTh col="derivados" sort={docSort} onSort={toggleDocSort}>Derivados</DocSortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', fontSize: '0.8rem' }}>Cargando...</td></tr>
                    ) : sortedDoctors.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', fontSize: '0.8rem' }}>Sin datos para el período</td></tr>
                    ) : sortedDoctors.map((d, i) => {
                      const isExpanded = expandedDoctor === d.nombre;
                      const osList = Object.entries(d.obrasSociales).sort((a, b) => b[1] - a[1]);
                      const estudiosList = Object.entries(d.estudios).sort((a, b) => b[1] - a[1]);
                      return (
                        <Fragment key={i}>
                          <tr
                            onClick={() => setExpandedDoctor(isExpanded ? null : d.nombre)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td style={{ fontWeight: 600, color: '#002725' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                {isExpanded
                                  ? <IconChevronUp size={13} style={{ color: '#147D78', flexShrink: 0 }} />
                                  : <IconChevronDown size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />}
                                {d.nombre}
                              </span>
                            </td>
                            <td><span style={{ fontWeight: 700, color: '#B8BD45' }}>{d.atendidos}</span></td>
                            <td><span style={{ color: '#147D78' }}>{d.nuevos}</span></td>
                            <td><span style={{ color: '#fb923c' }}>{d.ausentes}</span></td>
                            <td><span style={{ color: '#005450' }}>{d.derivados}</span></td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={5} style={{ background: '#f0faf9', padding: '0.6rem 1rem 0.8rem 2.2rem', borderBottom: '1px solid #e0f0ef' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                  <BreakdownList
                                    title="Por obra social"
                                    items={osList}
                                    barColor="#147D78"
                                    countColor="#147D78"
                                    barBg="#c8ebe8"
                                  />
                                  <BreakdownList
                                    title="Por tipo de estudio"
                                    items={estudiosList}
                                    barColor="#B8BD45"
                                    countColor="#727d10"
                                    barBg="#e8ecb8"
                                  />
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Mini components ──────────────────────────────────────────────────────────

function KpiCard({ accent, icon, children }: { accent: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="kpi-card" style={{ '--card-accent': accent, '--card-accent-bg': accent } as React.CSSProperties}>
      <div className="kpi-card-bg" />
      {children}
      <div className="kpi-icon">{icon}</div>
    </div>
  );
}

function SortTh<C extends string>({
  col, sort, onSort, children,
}: { col: C; sort: SortState<C>; onSort: (c: C) => void; children: React.ReactNode }) {
  const active = sort.col === col;
  return (
    <th className="th-sortable" onClick={() => onSort(col)}>
      {children}
      {active
        ? sort.dir === 'asc'
          ? <IconChevronUp size={12} className="sort-icon active" />
          : <IconChevronDown size={12} className="sort-icon active" />
        : <IconSelector size={12} className="sort-icon" />}
    </th>
  );
}

function DocSortTh({ col, sort, onSort, children }: {
  col: DocSortCol; sort: SortState<DocSortCol>; onSort: (c: DocSortCol) => void; children: React.ReactNode;
}) {
  return <SortTh col={col} sort={sort} onSort={onSort}>{children}</SortTh>;
}

function DocMiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#f8fffe', borderRadius: 8, padding: '0.45rem 0.6rem', border: '1px solid #e0f0ef' }}>
      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color, fontWeight: 400, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function BreakdownList({ title, items, barColor, countColor, barBg }: {
  title: string;
  items: [string, number][];
  barColor: string;
  countColor: string;
  barBg: string;
}) {
  const max = items[0]?.[1] ?? 1;
  return (
    <div>
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', fontWeight: 600, marginBottom: '0.45rem' }}>
        {title}
      </div>
      {items.length === 0 ? (
        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Sin datos</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
          {items.map(([label, count]) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative', height: 20, background: barBg, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${Math.round((count / max) * 100)}%`, background: barColor, borderRadius: 4, opacity: 0.55 }} />
                <span style={{ position: 'relative', fontSize: '0.72rem', color: '#002725', paddingLeft: '0.4rem', lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                  {label}
                </span>
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: countColor, minWidth: 18, textAlign: 'right' }}>{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ loading }: { loading: boolean }) {
  return (
    <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
      {loading ? 'Cargando...' : 'Sin datos para el período'}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #001a19 0%, #002725 60%, #003330 100%)',
      gap: '1.5rem',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-ocularyb.png"
        alt="OcularYB"
        style={{ height: 52, opacity: 0.85 }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '3px solid rgba(255,255,255,0.08)',
        borderTopColor: '#147D78',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: '0.82rem', color: 'rgba(223,239,238,0.45)', letterSpacing: '0.04em' }}>
        Cargando datos...
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario.trim()) { setError('El email es obligatorio'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usuario)) { setError('Ingresá un email válido'); return; }
    if (!password) { setError('La contraseña es obligatoria'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: usuario,
      password,
    });
    setLoading(false);
    if (authError) {
      setError('Usuario o contraseña incorrectos');
    } else {
      onLogin();
    }
  };

  const [showPassword, setShowPassword] = useState(false);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #001a19 0%, #002725 60%, #003330 100%)',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: '2.5rem 2rem',
        width: '100%',
        maxWidth: 360,
        display: 'flex',
        flexDirection: 'column',
        gap: '1.2rem',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-ocularyb.png"
            alt="OcularYB"
            style={{ height: 52, marginBottom: '1rem' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#dfefee', letterSpacing: '-0.02em' }}>Panel de gestión</div>
          <div style={{ fontSize: '0.82rem', color: 'rgba(223,239,238,0.45)', marginTop: 4 }}>Ingresá tus credenciales para continuar</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(223,239,238,0.5)', fontWeight: 600 }}>
            Email
          </label>
          <input
            type="email"
            value={usuario}
            onChange={e => { setUsuario(e.target.value); setError(''); }}
            autoComplete="email"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: error ? '1px solid #f43f5e' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              padding: '0.65rem 0.9rem',
              color: '#dfefee',
              fontSize: '0.95rem',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(223,239,238,0.5)', fontWeight: 600 }}>
            Contraseña
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              autoComplete="current-password"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: error ? '1px solid #f43f5e' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '0.65rem 2.5rem 0.65rem 0.9rem',
                color: '#dfefee',
                fontSize: '0.95rem',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: showPassword ? 'rgba(20,125,120,0.25)' : 'rgba(255,255,255,0.08)',
                border: showPassword ? '1px solid rgba(20,125,120,0.5)' : '1px solid rgba(255,255,255,0.15)',
                borderRadius: 6, cursor: 'pointer',
                color: showPassword ? '#009c92' : 'rgb(0, 133, 124)',
                padding: '4px 6px', lineHeight: 1, display: 'flex', alignItems: 'center',
              }}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ fontSize: '0.82rem', color: '#f43f5e', textAlign: 'center', background: 'rgba(244,63,94,0.08)', borderRadius: 8, padding: '0.5rem' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            background: 'linear-gradient(90deg, #147D78, #B8BD45)',
            border: 'none',
            borderRadius: 10,
            padding: '0.75rem',
            color: '#fff',
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            letterSpacing: '0.02em',
            marginTop: '0.2rem',
          }}
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
