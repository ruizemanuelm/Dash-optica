import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const BASE_URL = 'https://api.ocularyb.com.ar/api/v1';
const TOKEN    = process.env.NEXT_PUBLIC_OCULARYB_TOKEN ?? '';

const BRANCH_NAME_TO_ID: Record<string, string> = {
  'YERBA BUENA':  '9a3a6329-5c4e-4019-8b31-032ff4554caa',
  'ANEXO':        '6fd4921e-dba2-4447-ad7d-44ed57d59afe',
  'BARRIO NORTE': 'e9487193-3b74-4a5a-92ac-83518d67f66c',
  'BARRIO SUR':   'e8e1395f-31ca-4091-900c-2ad1b7af42b3',
};

const BRANCH_NAME_TO_CODE: Record<string, string> = {
  'YERBA BUENA': 'YB', 'ANEXO': 'AN', 'BARRIO NORTE': 'BN', 'BARRIO SUR': 'BS',
};

const STATUS_MAP: Record<string, string> = {
  'FINALIZADA': 'FINISHED',
  'NUEVO':      'NEW',
  'CANCELADA':  'CANCELLED',
};

function excelSerialToDateISO(serial: number): string {
  const d = new Date((Math.floor(serial) - 25569) * 86400 * 1000);
  return d.toISOString();
}

function excelSerialToTimeISO(serial: number): string {
  const totalSec = Math.round((serial % 1) * 86400);
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  return `1970-01-01T${hh}:${mm}:00.000Z`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate   = searchParams.get('endDate');

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 });
  }

  const params = new URLSearchParams({ startDate, endDate });
  const res = await fetch(
    `${BASE_URL}/general/admissions/report/download?${params}`,
    { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } }
  );

  if (!res.ok) {
    return NextResponse.json({ error: `API error ${res.status}` }, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  const wb    = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const ws    = wb.Sheets[wb.SheetNames[0]];
  // header:1 returns raw arrays; skip the header row (index 0)
  const rows  = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  const admissions = rows.slice(1)
    .filter(row => Array.isArray(row) && row[0])
    .map(row => {
      const r = row as unknown[];
      const branchName = String(r[0] ?? '');
      const branchId   = BRANCH_NAME_TO_ID[branchName] ?? '';
      const branchCode = BRANCH_NAME_TO_CODE[branchName] ?? '??';

      // Col 2 = Fecha Creación (datetime serial) → used as scheduledTime
      // Col 3 = Fecha Programada (date serial)   → used as scheduledDate
      const fechaCreacion   = Number(r[2]);
      const fechaProgramada = Number(r[3]);

      const scheduledDate = excelSerialToDateISO(fechaProgramada);
      const scheduledTime = excelSerialToTimeISO(fechaCreacion);

      const statusName = String(r[12] ?? '');
      const statusCode = STATUS_MAP[statusName] ?? statusName;

      const tipoName = String(r[13] ?? '');
      const typeCode = (tipoName.toUpperCase().includes('ESPONTÁN') || tipoName.toUpperCase().includes('ESPONTАН'))
        ? 'NO_APPOINTMENT'
        : 'APPOINTMENT';

      const paciente    = String(r[6]  ?? '');
      const derivante   = String(r[15] ?? 'NINGUNO');
      // Columnas extra — ajustar índices si los datos no son correctos
      const dni         = String(r[5]  ?? '');  // col 5: probable DNI/documento
      const obraSocial  = String(r[7]  ?? '');  // col 7: obra social/prepaga

      return {
        generalAdmissionId: String(r[1] ?? ''),
        visitReason: String(r[11] ?? ''),
        admission: {
          admissionId:      String(r[1] ?? ''),
          patientId:        String(r[4]  ?? ''),
          branchId,
          scheduledDate,
          scheduledTime,
          admissionStatus:     { code: statusCode, name: statusName },
          admissionType:       { code: typeCode,   name: tipoName },
          admissionIssuer:     { code: 'INTERNAL' },
          performingResource:  { name: String(r[14] ?? '—') },
          referringResource:   { name: derivante },
          branch: { branchId, name: branchName, code: branchCode },
          patient: {
            patientId: String(r[4] ?? ''),
            actor: { nameOne: paciente, nameTwo: '', dni, obraSocial },
          },
        },
      };
    });

  return NextResponse.json(admissions);
}
