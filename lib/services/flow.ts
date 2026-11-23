import type { Db } from "../db";
import {
  QUEUED_STATUSES,
  estimateWaitMinutes,
  isNearTurn,
  queuePosition,
  statusLabel,
  type FlowStage,
  type StageStatus,
  type UnitType,
} from "../domain";

/** Semua tahap aktif pada unit aktif di satu rumah sakit; unit tertua lebih dulu (buildFlow memakai unit aktif pertama per jenis). */
export async function loadFlowCandidates(db: Db, hospitalId: string): Promise<FlowStage[]> {
  const r = await db.query(
    `select ss.id, ss.name, ss.sequence, ss.estimated_service_minutes as minutes, ss.near_turn_threshold as threshold,
            su.id as unit_id, su.name as unit_name, su.type as unit_type
       from service_stages ss
       join service_units su on su.id = ss.service_unit_id
      where su.hospital_id = $1 and su.status = 'active' and ss.status = 'active'
      order by su.created_at, su.id, ss.sequence`,
    [hospitalId],
  );
  return r.rows.map((x: any) => ({
    id: x.id,
    name: x.name,
    sequence: x.sequence,
    unitId: x.unit_id,
    unitName: x.unit_name,
    unitType: x.unit_type as UnitType,
    minutes: x.minutes,
    threshold: x.threshold,
  }));
}

/**
 * Satu query untuk tahap tiket + konfigurasi + jumlah tiket di depan (FR-008):
 * hanya tiket menunggu/dipanggil pada tahap & tanggal yang sama dengan queue_sequence lebih kecil.
 */
export const stageViewSql = (extraCols = "", extraJoins = ""): string => `
  select ts.id, ts.ticket_id, ts.service_stage_id, ts.queue_date, ts.status, ts.queue_sequence,
         ts.called_at, ts.started_at, ts.completed_at, ts.created_at, ts.updated_at,
         ss.name as stage_name, ss.sequence as stage_sequence,
         ss.estimated_service_minutes as minutes, ss.near_turn_threshold as threshold,
         su.id as unit_id, su.name as unit_name, su.type as unit_type,
         case when ts.status in ('menunggu','dipanggil') then
           (select count(*)::int from ticket_stages o
             where o.service_stage_id = ts.service_stage_id
               and o.queue_date = ts.queue_date
               and o.status in ('menunggu','dipanggil')
               and o.queue_sequence < ts.queue_sequence)
         end as ahead${extraCols}
    from ticket_stages ts
    join service_stages ss on ss.id = ts.service_stage_id
    join service_units su on su.id = ss.service_unit_id${extraJoins}`;

export const STAGE_VIEW_SQL = stageViewSql();

export interface StageDto {
  id: string;
  ticket_id: string;
  service_stage_id: string;
  stage_name: string;
  stage_sequence: number;
  unit_id: string;
  unit_name: string;
  unit_type: UnitType;
  queue_date: string;
  status: StageStatus;
  status_label: string;
  queue_sequence: number;
  /** null bila tiket tidak lagi di antrean (sedang dilayani / selesai / dst.) */
  queue_position: number | null;
  /** null = "perkiraan waktu belum tersedia" (durasi tahap belum dikonfigurasi) atau tidak berlaku */
  estimated_wait_minutes: number | null;
  wait_estimate_available: boolean | null;
  near_turn: boolean;
  ready_for_pickup: boolean;
  called_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

export function toStageDto(r: any): StageDto {
  const queued = QUEUED_STATUSES.includes(r.status);
  const ahead: number = r.ahead ?? 0;
  const position = queued ? queuePosition(ahead) : null;
  const wait = queued ? estimateWaitMinutes(ahead, r.minutes) : null;
  return {
    id: r.id,
    ticket_id: r.ticket_id,
    service_stage_id: r.service_stage_id,
    stage_name: r.stage_name,
    stage_sequence: r.stage_sequence,
    unit_id: r.unit_id,
    unit_name: r.unit_name,
    unit_type: r.unit_type,
    queue_date: r.queue_date,
    status: r.status,
    status_label: statusLabel(r.status, r.unit_type),
    queue_sequence: r.queue_sequence,
    queue_position: position,
    estimated_wait_minutes: wait,
    wait_estimate_available: queued ? wait !== null : null,
    near_turn: isNearTurn(position, r.threshold, r.status),
    ready_for_pickup: r.status === "siap_diambil",
    called_at: iso(r.called_at),
    started_at: iso(r.started_at),
    completed_at: iso(r.completed_at),
    updated_at: iso(r.updated_at) as string,
  };
}
