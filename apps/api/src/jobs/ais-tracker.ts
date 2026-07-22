import { env } from '../config/env.js';
import { startAisTracking, upsertVesselPosition } from '../services/customs.service.js';

let cleanupFn: (() => void) | null = null;

export async function initAisTracker() {
  if (!env.AIS_API_KEY) {
    console.log('[AIS] No AIS_API_KEY provided. Vessel tracking disabled.');
    return;
  }

  // Dar es Salaam port approaches roughly:
  // [-7.0, 39.2] to [-6.7, 39.7]
  const darEsSalaamArea = [[-7.0, 39.2], [-6.7, 39.7]];

  try {
    cleanupFn = await startAisTracking(
      env.AIS_API_KEY,
      [], // no specific MMSI filter
      async (data) => {
        if (data.MessageType === 'PositionReport') {
          const report = data.Message.PositionReport;
          const meta = data.MetaData;
          
          await upsertVesselPosition({
            mmsi: String(meta.MMSI),
            vessel_name: meta.ShipName?.trim(),
            latitude: report.Latitude,
            longitude: report.Longitude,
            speed: report.Sog,
            course: report.Cog,
            heading: report.TrueHeading,
            nav_status: report.NavigationalStatus,
          });
        } else if (data.MessageType === 'ShipStaticData') {
          const report = data.Message.ShipStaticData;
          const meta = data.MetaData;
          
          await upsertVesselPosition({
            mmsi: String(meta.MMSI),
            imo: report.ImoNumber ? String(report.ImoNumber) : undefined,
            vessel_name: report.Name?.trim() || meta.ShipName?.trim(),
            vessel_type: report.Type ? String(report.Type) : undefined,
            destination: report.Destination?.trim(),
            eta_raw: `${report.EtaMonth}-${report.EtaDay} ${report.EtaHour}:${report.EtaMinute}`,
            draught: report.MaximumStaticDraught,
            latitude: meta.latitude,
            longitude: meta.longitude,
          });
        }
      },
      [darEsSalaamArea]
    );
  } catch (err: any) {
    console.error('[AIS] Failed to start tracking:', err.message);
  }
}

export function stopAisTracker() {
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }
}
