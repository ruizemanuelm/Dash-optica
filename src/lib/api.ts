const BASE_URL = 'https://api.ocularyb.com.ar/api/v1';
const TOKEN = process.env.NEXT_PUBLIC_OCULARYB_TOKEN ?? '';

const authHeaders = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

// ─── IDs REALES DE SUCURSALES ─────────────────────────────────────────────────
export const BRANCH_IDS = {
  norte:      'e9487193-3b74-4a5a-92ac-83518d67f66c',  // BARRIO NORTE  (code: BN)
  sur:        'e8e1395f-31ca-4091-900c-2ad1b7af42b3',  // BARRIO SUR    (code: BS)
  anexo:      '6fd4921e-dba2-4447-ad7d-44ed57d59afe',  // ANEXO         (code: AN)
  yerbaBuena: '9a3a6329-5c4e-4019-8b31-032ff4554caa',  // YERBA BUENA   (code: YB)
} as const;

export type BranchApiKey = keyof typeof BRANCH_IDS;

// ─── TIPOS REALES DE LA API ───────────────────────────────────────────────────

export interface AdmissionResponse {
  generalAdmissionId: string;
  visitReason: string;
  admission: {
    admissionId: string;
    patientId: string;
    branchId: string;
    scheduledDate: string;
    scheduledTime: string;
    admissionStatus: {
      code: string;
      name: string;
    };
    admissionType: {
      code: string;
      name: string;
    };
    admissionIssuer: {
      code: string;
    };
    performingResource: {
      name: string;
    };
    referringResource: {
      name: string;
    };
    branch: {
      branchId: string;
      name: string;
      code: string;
    };
    patient: {
      patientId: string;
      actor: {
        nameOne: string;
        nameTwo: string;
        dni?: string;
        obraSocial?: string;
      };
    };
  };
}

export interface AppointmentSlotResponse {
  appointmentSlotId: string;
  appointmentDate: string;
  appointmentTime: string;
  isAbsent: boolean;
  patient: null | { patientId: string; actor: { nameOne: string; nameTwo: string } };
  appointmentStatus: {
    code: string;
    name: string;
  };
  appointmentReason: {
    name: string;
  } | null;
  schedule: {
    agenda: {
      name: string;
      branchId: string;
      branch: {
        branchId: string;
        name: string;
        code: string;
      };
      resource: {
        name: string;
      };
    };
  };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** "1970-01-01T15:32:00.000Z" → "15:32" */
export function parseTime(isoTime: string): string {
  const d = new Date(isoTime);
  return d.toISOString().slice(11, 16);
}

/** "2026-05-02T03:00:00.000Z" → "02/05" */
export function parseDate(isoDate: string): string {
  return isoDate.slice(8, 10) + '/' + isoDate.slice(5, 7);
}

// ─── STATUS CODES REALES ──────────────────────────────────────────────────────
export const ADMISSION_STATUS = {
  FINISHED:  'FINISHED',   // FINALIZADA
  NEW:       'NEW',        // NUEVO (en curso / pendiente)
  CANCELLED: 'CANCELLED',  // CANCELADA (ausente / rechazado)
} as const;

export const SLOT_STATUS = {
  FREE:   'FREE',
  BUSY:   'BUSY',
  ABSENT: 'ABSENT',
} as const;

export function isReferral(adm: AdmissionResponse['admission']): boolean {
  return adm.referringResource?.name !== 'NINGUNO';
}

export function isNewPatient(adm: AdmissionResponse['admission']): boolean {
  return adm.admissionType?.code === 'NO_APPOINTMENT';
}

// ─── FETCH ADMISIONES (proxy via /api/admissions que parsea el Excel completo) ─
export async function fetchAdmissions(startDate: string, endDate: string): Promise<AdmissionResponse[]> {
  const params = new URLSearchParams({ startDate, endDate });
  const res = await fetch(`/api/admissions?${params}`);
  if (!res.ok) throw new Error(`Error ${res.status} al cargar admisiones`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ─── FETCH SLOTS ──────────────────────────────────────────────────────────────
export async function fetchSlots(startDate: string, endDate: string): Promise<AppointmentSlotResponse[]> {
  const params = new URLSearchParams({ startDate, endDate });
  const res = await fetch(`${BASE_URL}/appointments/appointmentSlots?${params}`, { headers: authHeaders });
  if (!res.ok) throw new Error(`Error ${res.status} al cargar turnos`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data ?? data.slots ?? []);
}

// ─── EXCEL DOWNLOAD con Authorization header ──────────────────────────────────
export async function downloadExcel(startDate: string, endDate: string): Promise<void> {
  const params = new URLSearchParams({ startDate, endDate });
  const res = await fetch(`${BASE_URL}/general/admissions/report/download?${params}`, {
    headers: authHeaders,
  });
  if (!res.ok) throw new Error(`Error ${res.status} al descargar reporte`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `admisiones-${startDate}-${endDate}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── KPIs CALCULADOS ──────────────────────────────────────────────────────────
export interface BranchKPIs {
  branchId: string;
  branchName: string;
  pacientesNuevos: number;
  pacientesAtendidos: number;
  turnosRechazados: number;
  ausentes: number;
  derivaciones: number;
}

export function computeKPIs(admissions: AdmissionResponse[]): Record<string, BranchKPIs> {
  const map: Record<string, BranchKPIs> = {};
  for (const item of admissions) {
    const adm = item.admission;
    const bid = adm.branchId;
    if (!map[bid]) {
      map[bid] = {
        branchId: bid,
        branchName: adm.branch?.name ?? bid,
        pacientesNuevos: 0,
        pacientesAtendidos: 0,
        turnosRechazados: 0,
        ausentes: 0,
        derivaciones: 0,
      };
    }
    const k = map[bid];
    const status = adm.admissionStatus?.code;
    if (status === ADMISSION_STATUS.FINISHED)  k.pacientesAtendidos++;
    if (status === ADMISSION_STATUS.CANCELLED) k.turnosRechazados++;
    if (isNewPatient(adm))                     k.pacientesNuevos++;
    if (isReferral(adm))                       k.derivaciones++;
  }
  return map;
}

export interface AgendaItem {
  hora: string;
  fecha?: string;
  paciente: string;
  medico: string;
  tipo: string;
  estado: 'atendido' | 'cancelado' | 'nuevo' | 'pendiente';
  statusLabel: string;
  sucursal?: string;
  dni?: string;
  obraSocial?: string;
}

function mapStatus(code: string): AgendaItem['estado'] {
  if (code === ADMISSION_STATUS.FINISHED)  return 'atendido';
  if (code === ADMISSION_STATUS.CANCELLED) return 'cancelado';
  if (code === ADMISSION_STATUS.NEW)       return 'nuevo';
  return 'pendiente';
}

export function buildAgenda(admissions: AdmissionResponse[], branchId: string): AgendaItem[] {
  return admissions
    .filter(item => item.admission.branchId === branchId)
    .sort((a, b) => {
      const da = a.admission.scheduledDate + a.admission.scheduledTime;
      const db = b.admission.scheduledDate + b.admission.scheduledTime;
      return db.localeCompare(da); // más reciente primero
    })
    .map(item => {
      const adm = item.admission;
      return {
        hora:        parseDate(adm.scheduledDate) + ' ' + parseTime(adm.scheduledTime),
        paciente:    adm.patient?.actor?.nameOne?.trim() || '—',
        medico:      adm.performingResource?.name ?? '—',
        tipo:        item.visitReason || adm.admissionType?.name || '—',
        estado:      mapStatus(adm.admissionStatus?.code ?? ''),
        statusLabel: adm.admissionStatus?.name ?? adm.admissionStatus?.code ?? '—',
        dni:         adm.patient?.actor?.dni || '—',
        obraSocial:  adm.patient?.actor?.obraSocial || '—',
      };
    });
}

export function buildGlobalAgenda(admissions: AdmissionResponse[], branchIds: string[]): AgendaItem[] {
  const idSet = new Set(branchIds.filter(Boolean));
  return admissions
    .filter(item => idSet.has(item.admission.branchId))
    .sort((a, b) => {
      const da = a.admission.scheduledDate + a.admission.scheduledTime;
      const db = b.admission.scheduledDate + b.admission.scheduledTime;
      return db.localeCompare(da); // más reciente primero
    })
    .map(item => {
      const adm = item.admission;
      return {
        hora:        parseDate(adm.scheduledDate) + ' ' + parseTime(adm.scheduledTime),
        fecha:       parseDate(adm.scheduledDate),
        paciente:    adm.patient?.actor?.nameOne?.trim() || '—',
        medico:      adm.performingResource?.name ?? '—',
        tipo:        item.visitReason || adm.admissionType?.name || '—',
        estado:      mapStatus(adm.admissionStatus?.code ?? ''),
        statusLabel: adm.admissionStatus?.name ?? adm.admissionStatus?.code ?? '—',
        sucursal:    adm.branch?.name ?? '—',
        dni:         adm.patient?.actor?.dni || '—',
        obraSocial:  adm.patient?.actor?.obraSocial || '—',
      };
    });
}

export function computeSlotsByBranch(slots: AppointmentSlotResponse[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const slot of slots) {
    const bid = slot.schedule?.agenda?.branchId;
    if (!bid) continue;
    if (slot.appointmentStatus?.code === SLOT_STATUS.FREE) {
      map[bid] = (map[bid] ?? 0) + 1;
    }
  }
  return map;
}

export interface DayData {
  dia: string;
  atendidos: number;
  nuevos: number;
  ausentes: number;
}

export function buildGlobalWeeklyChart(admissions: AdmissionResponse[], branchIds: string[]): DayData[] {
  const idSet = new Set(branchIds.filter(Boolean));
  const map = new Map<string, DayData>();
  admissions
    .filter(item => idSet.has(item.admission.branchId))
    .forEach(item => {
      const adm = item.admission;
      const dia = parseDate(adm.scheduledDate);
      if (!map.has(dia)) map.set(dia, { dia, atendidos: 0, nuevos: 0, ausentes: 0 });
      const d = map.get(dia)!;
      if (adm.admissionStatus?.code === ADMISSION_STATUS.FINISHED) d.atendidos++;
      if (isNewPatient(adm)) d.nuevos++;
      if (adm.admissionStatus?.code === ADMISSION_STATUS.CANCELLED) d.ausentes++;
    });
  return Array.from(map.values()).sort((a, b) => a.dia.localeCompare(b.dia));
}

export function buildWeeklyChart(admissions: AdmissionResponse[], branchId: string): DayData[] {
  return buildGlobalWeeklyChart(admissions, [branchId]);
}

// ─── ESTADÍSTICAS POR MÉDICO ──────────────────────────────────────────────────

export interface DoctorStats {
  nombre: string;
  atendidos: number;
  nuevos: number;
  ausentes: number;
  derivados: number;
  obrasSociales: Record<string, number>;
  estudios: Record<string, number>;
}

export function computeDoctorStats(
  admissions: AdmissionResponse[],
  branchIds?: string[],
): DoctorStats[] {
  const idSet = branchIds ? new Set(branchIds.filter(Boolean)) : null;
  const map = new Map<string, DoctorStats>();

  for (const item of admissions) {
    if (idSet && !idSet.has(item.admission.branchId)) continue;
    const nombre = item.admission.performingResource?.name?.trim() ?? '';
    if (!nombre || nombre === 'NINGUNO' || nombre === '—') continue;
    if (!map.has(nombre)) {
      map.set(nombre, { nombre, atendidos: 0, nuevos: 0, ausentes: 0, derivados: 0, obrasSociales: {}, estudios: {} });
    }
    const d = map.get(nombre)!;
    const status = item.admission.admissionStatus?.code;
    if (status === ADMISSION_STATUS.FINISHED) {
      d.atendidos++;
      const os = item.admission.patient?.actor?.obraSocial?.trim() || '—';
      d.obrasSociales[os] = (d.obrasSociales[os] ?? 0) + 1;
      const estudio = item.visitReason?.trim() || '—';
      d.estudios[estudio] = (d.estudios[estudio] ?? 0) + 1;
    }
    if (status === ADMISSION_STATUS.CANCELLED) d.ausentes++;
    if (isNewPatient(item.admission)) d.nuevos++;
    if (isReferral(item.admission))  d.derivados++;
  }

  return Array.from(map.values()).sort((a, b) => b.atendidos - a.atendidos);
}
