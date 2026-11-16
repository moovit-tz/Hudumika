import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/button.js';
import { Icon } from '../../../components/Icon.js';
import { apiFetch } from '../../../lib/api.js';
import { BookingsList } from './EquipmentRegister.js';
import { BookingDialog } from './BookingDialog.js';

/** The project workspace's Equipment tab: this project's bookings, and booking more if the caller may. */
export function ProjectEquipmentPanel({ projectId }: { projectId: string }) {
  const [canRequest, setCanRequest] = useState(false);
  const [booking, setBooking] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    apiFetch(`/v1/project-equipment/projects/${projectId}/access`).then((r: any) => setCanRequest(!!r.can_request)).catch(() => setCanRequest(false));
  }, [projectId]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: 'var(--ink3)' }}>Plant, vehicles and tools booked for this project. <Link to="/projects/equipment" className="underline">Open the register</Link></p>
        {canRequest && <Button onClick={() => setBooking(true)}><Icon name="plus" size={14} /> Book equipment</Button>}
      </div>
      <BookingsList projectId={projectId} refreshKey={refresh} />
      {booking && <BookingDialog projectId={projectId} onClose={() => setBooking(false)} onBooked={() => setRefresh(x => x + 1)} />}
    </div>
  );
}
